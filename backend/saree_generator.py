import os
import io
import time
import json
import base64
from io import BytesIO
from PIL import Image
import cv2
import numpy as np
from dotenv import load_dotenv

load_dotenv()

class GenerateSaree:
    """
    Builds the flat handloom weaving template (Output 2), landscape, CAD layout:
    - Border track along the top and bottom edges across 100% of the length
      (body AND pallu), in the swatch's natural 0 degree orientation
    - Body fabric tiled across the body field
    - Pallu panel at the right end (pallu_side="left" to mirror)

    Two modes:
    - refine=False (default, initial assembly): a faithful mapping of the raw
      uploads. No rotation, flip, skew, colour correction, feathering or sheen;
      every image is only scaled uniformly (aspect ratio preserved) to fit its
      track. Adjustments belong to the interactive simulation studio.
    - refine=True: CLAHE colour tuning, alpha-ramp cross-fades at every
      junction and a silk sheen, for an explicitly requested polished render.
    """
    BORDER_FRAC = 0.12   # border track height as a fraction of template height
    FEATHER_PX = 18      # linear transparency ramp at every junction
    PALLU_BLEND_PX = 48  # wider cross-fade where pallu meets body

    def __init__(self):
        pass

    def apply_clahe(self, img_pil, clip_limit=1.2):
        img_cv = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
        lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)
        lab_clahe = cv2.merge((l_clahe, a, b))
        enhanced = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2RGB)
        return Image.fromarray(enhanced)

    def tempelete(self, border, pallu, body, saree_length=2160, saree_height=480,
                  pallu_frac=45.6 / 216, pallu_side="right", refine=False):
        """
        Landscape template at true saree proportions (default 216" x 48" at 10 px/in).

        Geometry:
          border_h = BORDER_FRAC * saree_height, top and bottom, full length
          pallu    = at one end; body fills the rest
        Raw mode (default):
          - images are used in their uploaded orientation (EXIF is not applied,
            nothing is rotated or flipped) and only scaled uniformly
          - pallu keeps its own aspect ratio: scaled to the field height, its
            width follows (capped at half the length, then fitted inside)
          - tiles butt together exactly; no blending of any kind
        Refine mode adds:
          - body/pallu extend FEATHER_PX under each border; the border's inner
            FEATHER_PX rows ramp 1 -> 0 alpha over them
          - body and border tiles overlap by FEATHER_PX with complementary weights
          - pallu stretched to pallu_frac and cross-fades into the body
        """
        border, pallu, body = border.convert("RGB"), pallu.convert("RGB"), body.convert("RGB")
        if refine:
            border = self.apply_clahe(border, 1.0)
            pallu  = self.apply_clahe(pallu,  1.2)
            body   = self.apply_clahe(body,   1.5)

        L, H = int(saree_length), int(saree_height)
        F = self.FEATHER_PX if refine else 0
        border_h = max(F + 2, int(round(H * self.BORDER_FRAC)))
        field_y0 = border_h - F            # refine: body/pallu run under the borders by F px
        field_h  = H - 2 * border_h + 2 * F
        if refine:
            pallu_w = int(round(L * pallu_frac))
        else:
            pallu_w = min(L // 2, int(round(field_h * pallu.width / max(1, pallu.height))))
        blend    = min(self.PALLU_BLEND_PX, pallu_w // 2) if refine else 0

        # --- Border track: natural 0 degree orientation, scaled to exactly border_h ---
        b_aspect = border.width / max(1, border.height)
        btile_w  = max(2 * F + 1, int(round(border_h * b_aspect)))
        border_tile = np.asarray(border.resize((btile_w, border_h), Image.Resampling.LANCZOS),
                                 dtype=np.float32)
        border_track = self._tile_overlap(border_tile, L, border_h, ov_x=F, ov_y=0)

        # --- Body tile: one tile spans the visible field height ---
        visible_h = H - 2 * border_h
        n_rows = 1  # one motif row across the width; repeats only along the length
        tile_h = max(2 * F + 20, visible_h // n_rows + F)
        tile_w = max(2 * F + 20, int(round(tile_h * body.width / max(1, body.height))))
        body_tile = np.asarray(body.resize((tile_w, tile_h), Image.Resampling.LANCZOS),
                               dtype=np.float32)
        # Raw mode runs the body the full length so any space beside a fitted
        # pallu shows body fabric, not an empty box
        body_w = L - pallu_w + blend if refine else L
        body_field = self._tile_overlap(body_tile, body_w, field_h, ov_x=F, ov_y=F)

        # --- Assemble (float) ---
        canvas = np.zeros((H, L, 3), dtype=np.float32)
        body_x0 = pallu_w - blend if (refine and pallu_side == "left") else 0
        pallu_x0 = 0 if pallu_side == "left" else L - pallu_w - blend
        fy = slice(field_y0, field_y0 + field_h)
        canvas[fy, body_x0:body_x0 + body_w] = body_field

        if refine:
            # Pallu stretched to its slot, cross-fading into the body
            pallu_panel = np.asarray(pallu.resize((pallu_w + blend, field_h), Image.Resampling.LANCZOS),
                                     dtype=np.float32)
            pa = np.ones((1, pallu_w + blend, 1), dtype=np.float32)
            if pallu_side == "left":
                pa[0, -blend:, 0] = self._ramp(blend)[::-1]
            else:
                pa[0, :blend, 0] = self._ramp(blend)
            px = slice(pallu_x0, pallu_x0 + pallu_w + blend)
            canvas[fy, px] = pallu_panel * pa + canvas[fy, px] * (1.0 - pa)
        else:
            # Pallu as uploaded: uniform scale to fit its slot, centred vertically
            k = min(pallu_w / max(1, pallu.width), field_h / max(1, pallu.height))
            pw, ph = max(1, round(pallu.width * k)), max(1, round(pallu.height * k))
            pallu_panel = np.asarray(pallu.resize((pw, ph), Image.Resampling.LANCZOS), dtype=np.float32)
            px0 = 0 if pallu_side == "left" else L - pw
            py0 = field_y0 + (field_h - ph) // 2
            canvas[py0:py0 + ph, px0:px0 + pw] = pallu_panel

        # Borders: the same unrotated, unflipped track at top and bottom.
        # Refine mode fades the inner F rows over the field.
        top_a = np.ones((border_h, 1, 1), dtype=np.float32)
        if F:
            top_a[-F:, 0, 0] = self._ramp(F)[::-1]
        bot_a = top_a[::-1]
        canvas[:border_h] = border_track * top_a + canvas[:border_h] * (1.0 - top_a)
        canvas[H - border_h:] = border_track * bot_a + canvas[H - border_h:] * (1.0 - bot_a)

        if refine:
            canvas = self._silk_sheen(canvas)
        return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))

    @staticmethod
    def _ramp(n):
        """Linear 0 -> 1 ramp of n samples (half-pixel centred, no hard endpoints)."""
        return (np.arange(n, dtype=np.float32) + 0.5) / max(1, n)

    def _tile_overlap(self, tile, target_w, target_h, ov_x, ov_y):
        """
        Tiles `tile` (h, w, 3 float) over target_w x target_h with neighbouring
        tiles overlapping by ov_x / ov_y px. Each tile carries a weight window
        that ramps linearly over its overlap edges, so neighbours cross-fade
        with complementary weights (sum = 1): no visible tile boundaries.
        The tile is never rotated or flipped.
        """
        th, tw = tile.shape[:2]
        ov_x = min(ov_x, tw // 3)
        ov_y = min(ov_y, th // 3)
        wx = np.ones(tw, dtype=np.float32)
        wy = np.ones(th, dtype=np.float32)
        if ov_x:
            wx[:ov_x] = self._ramp(ov_x)
            wx[-ov_x:] = self._ramp(ov_x)[::-1]
        if ov_y:
            wy[:ov_y] = self._ramp(ov_y)
            wy[-ov_y:] = self._ramp(ov_y)[::-1]
        weight = (wy[:, None] * wx[None, :])[..., None]

        acc  = np.zeros((target_h, target_w, 3), dtype=np.float32)
        wsum = np.zeros((target_h, target_w, 1), dtype=np.float32)
        step_x, step_y = tw - ov_x, th - ov_y
        # Start one overlap before the origin so the canvas edge is fully weighted
        for y in range(-ov_y, target_h, step_y):
            for x in range(-ov_x, target_w, step_x):
                sy0, sx0 = max(0, -y), max(0, -x)
                dy0, dx0 = max(0, y), max(0, x)
                dy1, dx1 = min(target_h, y + th), min(target_w, x + tw)
                if dy1 <= dy0 or dx1 <= dx0:
                    continue
                sy1, sx1 = sy0 + (dy1 - dy0), sx0 + (dx1 - dx0)
                w = weight[sy0:sy1, sx0:sx1]
                acc[dy0:dy1, dx0:dx1]  += tile[sy0:sy1, sx0:sx1] * w
                wsum[dy0:dy1, dx0:dx1] += w
        return acc / np.maximum(wsum, 1e-6)

    def _silk_sheen(self, canvas):
        """Adds a subtle cosine luminosity wave to simulate silk fabric sheen."""
        h, w = canvas.shape[:2]
        x_wave = np.cos(np.linspace(0, 4 * np.pi, w, dtype=np.float32)) * 0.035 + 1.0
        y_wave = np.cos(np.linspace(0, 2 * np.pi, h, dtype=np.float32)) * 0.020 + 1.0
        sheen  = x_wave.reshape(1, w, 1) * y_wave.reshape(h, 1, 1)
        return np.clip(canvas * sheen, 0, 255)


class GenerateComplete:
    """
    AI Saree Generator:
    Takes 3 raw component images (Border, Pallu, Body) and asks Google Gemini
    to generate the complete realistic saree draped on a mannequin, and optionally
    a photorealistic flat-lay template.
    No masked images or cutout composites are used as input.
    """
    def __init__(self):
        self.client = None
        self.mode = None  # "vertex" | "api_key"
        self._init_client()

    def _init_client(self):
        try:
            from google import genai
            project = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-0040f2f2-3458-4658-848").strip()
            location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1").strip()
            try:
                self.client = genai.Client(vertexai=True, project=project, location=location)
                self.mode = "vertex"
                print(f"GenerateComplete: Initialized Vertex AI Client (project='{project}', location='{location}').")
                return
            except Exception as ve:
                print(f"GenerateComplete: Vertex AI init failed ({ve}), trying API key mode...")

            if not self._switch_to_api_key():
                print("GenerateComplete: No credentials available.")
        except Exception as e:
            print(f"GenerateComplete: Failed to initialize: {e}")
            self.client = None

    def _switch_to_api_key(self):
        """Use the AI Studio API key client. Returns False if no key is configured."""
        api_key = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            return False
        from google import genai
        self.client = genai.Client(api_key=api_key.strip())
        self.mode = "api_key"
        print("GenerateComplete: Initialized Google GenAI Client (AI Studio API key).")
        return True

    def _generate(self, model_name, contents):
        """generate_content with a one-time fallback from Vertex AI to the API key.

        Vertex client creation never checks IAM, so a missing
        'aiplatform.endpoints.predict' permission only surfaces as a 403 on the
        first call. In that case switch to the API key (if any) and retry.
        """
        from google.genai import types
        call = lambda: self.client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
        )
        try:
            return call()
        except Exception as e:
            denied = "403" in str(e) or "PERMISSION_DENIED" in str(e)
            if denied and self.mode == "vertex" and self._switch_to_api_key():
                print("GenerateComplete: Vertex AI permission denied; retrying with API key.")
                return call()
            raise

    @staticmethod
    def _should_stop(err_msg):
        """Errors that will fail identically for every candidate model."""
        return any(k in err_msg for k in ("429", "RESOURCE_EXHAUSTED", "limit: 0", "403", "PERMISSION_DENIED"))

    def predict(self, border_img, pallu_img, body_img, custom_prompt="", aspect_ratio_img=None):
        """
        Sends the 3 component images directly to Gemini to generate the complete draped saree.
        NO masked image is provided.
        """
        if not self.client:
            self._init_client()
        if not self.client:
            print("GenerateComplete.predict: Client not initialized.")
            return None

        from google.genai import types

        # Ensure all images are RGB PIL Images
        if hasattr(border_img, "convert"):
            border_img = border_img.convert("RGB")
        if hasattr(pallu_img, "convert"):
            pallu_img = pallu_img.convert("RGB")
        if hasattr(body_img, "convert"):
            body_img = body_img.convert("RGB")

        prompt = (
            "You are an AI saree generator and master fashion textile designer. "
            "I have provided 3 reference input images for a custom designed saree:\n"
            "1. Input Image 1: Saree Border (the horizontal zari border pattern for edges and pleats)\n"
            "2. Input Image 2: Saree Pallu (the grand decorative end piece with motifs for the shoulder drape)\n"
            "3. Input Image 3: Saree Body (the main fabric color, weave texture, and butti motifs for the pleats and body)\n\n"
            f"User notes: {custom_prompt if custom_prompt else 'An exquisite royal handloom silk saree'}\n\n"
            "Task: Based on these 3 input images, generate ONE complete, photorealistic, 4K studio photograph "
            "of an elegant mannequin wearing this custom saree draped naturally. "
            "The drape must faithfully combine all 3 components: "
            "the body fabric across the front pleats and waist, the border along the neckline, drape edges, and bottom hem, "
            "and the pallu falling gracefully over the shoulder. "
            "The image must look clean, realistic, professionally photographed, and beautifully lit on a neutral studio background."
        )

        contents = [
            prompt,
            "Reference Image for Saree Border:",
            border_img,
            "Reference Image for Saree Pallu:",
            pallu_img,
            "Reference Image for Saree Body fabric:",
            body_img,
        ]

        if aspect_ratio_img is not None:
            contents.append("Mannequin drape pose reference:")
            contents.append(aspect_ratio_img.convert("RGB") if hasattr(aspect_ratio_img, "convert") else aspect_ratio_img)

        # Candidate models to try in order (gemini-2.5-flash-image verified active on Vertex AI)
        candidate_models = [
            "gemini-2.5-flash-image",
            "gemini-3.1-flash-image",
            "gemini-3.1-flash-lite-image",
            "gemini-3-pro-image",
        ]

        for model_name in candidate_models:
            try:
                print(f"GenerateComplete: Attempting direct saree generation with {model_name}...")
                response = self._generate(model_name, contents)

                if response and response.candidates:
                    for part in response.candidates[0].content.parts:
                        if getattr(part, "inline_data", None):
                            img = Image.open(BytesIO(part.inline_data.data))
                            print(f"GenerateComplete: Successfully generated complete draped saree image with {model_name}!")
                            return img

            except Exception as e:
                err_msg = str(e)
                print(f"GenerateComplete: {model_name} attempt note: {err_msg[:120]}")
                # Quota / permission errors fail the same way for every model: stop here
                if self._should_stop(err_msg):
                    break

        return None  # end of predict


    def generate_template(self, border_img, pallu_img, body_img, scroll_img=None):
        """
        Uses Gemini to generate a photorealistic, top-down flat-lay saree template.
        Images map to the prompt as: body→image_2, border→image_1, pallu→image_0,
        scroll→image_3 (optional decorative band at pallu end).
        Returns a PIL Image or None on failure.
        """
        if not self.client:
            self._init_client()
        if not self.client:
            return None

        from google.genai import types

        prompt = (
            "Generate a high-resolution, photorealistic, top-down flat-lay photograph of a complete, "
            "unfolded Indian handloom saree laid out in a long, continuous horizontal strip.\n\n"
            "Layout: Show the full length with a long main body section (left 70%) and a distinct, "
            "ornate pallu panel at the far right (30%).\n\n"
            "Reference images provided:\n"
            "- Image 1 (Saree Border): Use this exact motif as a continuous, flawless border running "
            "seamlessly along the entire top and bottom margins of the template — both body and pallu sections.\n"
            "- Image 2 (Saree Body): Fill the entire body area (left 70%) with a flawless, seamless, "
            "perfectly aligned repetition of this motif. The pattern must appear continuous and undetectable "
            "where tiles join, creating a uniform rich silk texture.\n"
            "- Image 3 (Saree Pallu): Integrate this detailed grand pallu panel at the far right 30%, "
            "framed by the same continuous border along its top and bottom edges. The body fabric "
            "transitions cleanly into this panel.\n"
        )

        contents = [
            prompt,
            "Image 1 — Saree Border motif:",
            border_img.convert("RGB") if hasattr(border_img, "convert") else border_img,
            "Image 2 — Saree Body fabric motif:",
            body_img.convert("RGB") if hasattr(body_img, "convert") else body_img,
            "Image 3 — Saree Pallu design:",
            pallu_img.convert("RGB") if hasattr(pallu_img, "convert") else pallu_img,
        ]

        if scroll_img is not None:
            contents.append(
                "Image 4 — Decorative scroll/diamond motif: Incorporate this as a detailed decorative "
                "band at the very end of the pallu, after the main pallu scene."
            )
            contents.append(scroll_img.convert("RGB") if hasattr(scroll_img, "convert") else scroll_img)

        contents.append(
            "Details & Quality: The fabric must have a rich, high-quality silk texture with a subtle sheen. "
            "Lighting is even and bright, highlighting the detailed weave and metallic thread colors. "
            "The template is perfectly flat with no creases, folds, or defects. "
            "Background is a clean, neutral, light-colored surface (white cutting table). "
            "Output a single wide, horizontal image."
        )

        candidate_models = [
            "gemini-2.5-flash-image",
            "gemini-3-pro-image-preview",
            "gemini-3.1-flash-image",
            "gemini-3-pro-image"
        ]

        for model_name in candidate_models:
            try:
                print(f"GenerateComplete.generate_template: Attempting AI flat-lay template with {model_name}...")
                response = self._generate(model_name, contents)

                if response and response.candidates:
                    for part in response.candidates[0].content.parts:
                        if getattr(part, "inline_data", None):
                            img = Image.open(BytesIO(part.inline_data.data))
                            print(f"GenerateComplete.generate_template: AI flat-lay template generated with {model_name}!")
                            return img

            except Exception as e:
                err_msg = str(e)
                print(f"GenerateComplete.generate_template: {model_name} note: {err_msg[:120]}")
                if self._should_stop(err_msg):
                    break

        return None  # end of generate_template
