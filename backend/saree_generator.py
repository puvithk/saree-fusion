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
    Builds the flat handloom weaving template (Output 2):
    - Continuous top and bottom borders along full width
    - Clean seamless body fabric tiling across body field
    - Pallu design aligned on right side
    """
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

    def tempelete(self, border, pallu, body, saree_width=960, saree_height=1800):
        """
        Portrait-oriented weaving template matching standard saree CAD layout:
        - Narrow ornate border strips on LEFT and RIGHT edges (full height)
        - PALLU panel at the top (~46% of center height)
        - BODY fabric tiled at the bottom (~54% of center height)
        - Gradient blend at pallu→body junction, softened border seams, silk sheen
        """
        border = self.apply_clahe(border.convert("RGB"), 1.0)
        pallu  = self.apply_clahe(pallu.convert("RGB"),  1.2)
        body   = self.apply_clahe(body.convert("RGB"),   1.5)

        border_w  = int(saree_width * 0.125)           # ~120px per side
        center_w  = saree_width - 2 * border_w         # ~720px
        pallu_h   = int(saree_height * 0.46)           # ~828px (top)
        body_h    = saree_height - pallu_h             # ~972px (bottom)
        blend_h   = 50    # gradient blend px at pallu→body junction
        seam_blur = 10    # px for vertical border-center seam softening

        # --- Border: scale to border_w wide; if input is landscape, rotate first ---
        bimg = border
        if bimg.width > bimg.height:
            bimg = bimg.rotate(90, expand=True)
        b_aspect  = bimg.height / max(1, bimg.width)
        btile_h   = max(20, int(border_w * b_aspect))
        border_tile = bimg.resize((border_w, btile_h), Image.Resampling.LANCZOS)
        border_strip = self._tile_border_vertical(
            np.array(border_tile), saree_height, border_w, btile_h
        )

        # --- Body tile: snap width so columns divide evenly into center_w ---
        n_cols   = max(1, round(center_w / max(1, body.width)))
        tile_w   = max(60, center_w // n_cols)
        tile_h   = max(60, int(tile_w * (body.height / max(1, body.width))))
        body_tile = body.resize((tile_w, tile_h), Image.Resampling.LANCZOS)
        body_patch = self._tile_seamless_body(
            np.array(body_tile), center_w, body_h, tile_w, tile_h
        )

        # --- Pallu: resize to center_w × (pallu_h + blend_h) for gradient overlap ---
        pallu_tall = np.array(
            pallu.resize((center_w, pallu_h + blend_h), Image.Resampling.LANCZOS),
            dtype=np.float32
        )

        # --- Gradient blend pallu→body at junction ---
        alpha  = np.linspace(1.0, 0.0, blend_h, dtype=np.float32).reshape(blend_h, 1, 1)
        body_f = body_patch.astype(np.float32)
        blend_zone = (
            pallu_tall[pallu_h:pallu_h + blend_h] * alpha +
            body_f[:blend_h] * (1.0 - alpha)
        )
        pallu_f         = pallu_tall[:pallu_h].copy()
        body_f[:blend_h] = blend_zone

        # --- Assemble canvas ---
        canvas = np.full((saree_height, saree_width, 3), [245, 240, 235], dtype=np.float32)
        canvas[:, 0:border_w]               = border_strip.astype(np.float32)
        canvas[:, saree_width - border_w:]  = border_strip.astype(np.float32)
        canvas[0:pallu_h,          border_w:saree_width - border_w] = pallu_f
        canvas[pallu_h:saree_height, border_w:saree_width - border_w] = body_f

        # --- Soften vertical border-center seams ---
        canvas = self._soften_v_seam(canvas, border_w, seam_blur)
        canvas = self._soften_v_seam(canvas, saree_width - border_w, seam_blur)

        # --- Silk sheen overlay ---
        canvas = self._silk_sheen(canvas)

        return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))

    def _tile_border_vertical(self, tile, target_h, border_w, tile_h):
        """Tiles border vertically (for left/right side strips) with feathered seams."""
        strip = np.zeros((target_h, border_w, 3), dtype=np.uint8)
        for y in range(0, target_h, tile_h):
            y2 = min(y + tile_h, target_h)
            strip[y:y2, :] = tile[:y2 - y, :]

        feather = min(12, tile_h // 4)
        if feather < 2:
            return strip

        result = strip.astype(np.float32)
        for y in range(tile_h, target_h, tile_h):
            y0 = max(0, y - feather)
            y1 = min(target_h, y + feather)
            k  = ((y1 - y0) | 1)
            zone    = np.clip(result[y0:y1, :], 0, 255).astype(np.uint8)
            blurred = cv2.GaussianBlur(zone, (1, k), k / 3.0)
            result[y0:y1, :] = blurred.astype(np.float32)
        return np.clip(result, 0, 255).astype(np.uint8)

    def _tile_seamless_body(self, tile, target_w, target_h, tile_w, tile_h):
        """Tiles body fabric and feathers every seam to hide hard edges."""
        patch = np.zeros((target_h, target_w, 3), dtype=np.uint8)
        for y in range(0, target_h, tile_h):
            for x in range(0, target_w, tile_w):
                y2 = min(y + tile_h, target_h)
                x2 = min(x + tile_w, target_w)
                patch[y:y2, x:x2] = tile[:y2 - y, :x2 - x]

        feather = min(14, tile_w // 5, tile_h // 5)
        if feather < 2:
            return patch

        result = patch.astype(np.float32)
        for x in range(tile_w, target_w, tile_w):
            x0 = max(0, x - feather)
            x1 = min(target_w, x + feather)
            k  = ((x1 - x0) | 1)
            zone    = np.clip(result[:, x0:x1], 0, 255).astype(np.uint8)
            blurred = cv2.GaussianBlur(zone, (k, 1), k / 3.0)
            result[:, x0:x1] = blurred.astype(np.float32)
        for y in range(tile_h, target_h, tile_h):
            y0 = max(0, y - feather)
            y1 = min(target_h, y + feather)
            k  = ((y1 - y0) | 1)
            zone    = np.clip(result[y0:y1, :], 0, 255).astype(np.uint8)
            blurred = cv2.GaussianBlur(zone, (1, k), k / 3.0)
            result[y0:y1, :] = blurred.astype(np.float32)
        return np.clip(result, 0, 255).astype(np.uint8)

    def _soften_v_seam(self, canvas, x_seam, blur_px):
        """Blurs a narrow vertical band at x_seam to soften the border-center transition."""
        x0 = max(0, x_seam - blur_px)
        x1 = min(canvas.shape[1], x_seam + blur_px)
        k  = max(3, (blur_px * 2 + 1) | 1)
        zone    = np.clip(canvas[:, x0:x1], 0, 255).astype(np.uint8)
        blurred = cv2.GaussianBlur(zone, (k, 1), blur_px / 2.0)
        result  = canvas.copy()
        result[:, x0:x1] = blurred.astype(np.float32)
        return result

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
        self._init_client()

    def _init_client(self):
        try:
            from google import genai
            project = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-0040f2f2-3458-4658-848").strip()
            location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1").strip()
            try:
                self.client = genai.Client(vertexai=True, project=project, location=location)
                print(f"GenerateComplete: Initialized Vertex AI Client (project='{project}', location='{location}').")
                return
            except Exception as ve:
                print(f"GenerateComplete: Vertex AI init failed ({ve}), trying API key mode...")

            api_key = os.environ.get("GOOGLE_CLOUD_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
            if api_key:
                self.client = genai.Client(api_key=api_key.strip())
                print("GenerateComplete: Initialized Google GenAI Client (AI Studio fallback).")
            else:
                print("GenerateComplete: No credentials available.")
        except Exception as e:
            print(f"GenerateComplete: Failed to initialize: {e}")
            self.client = None

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
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"]
                    )
                )

                if response and response.candidates:
                    for part in response.candidates[0].content.parts:
                        if getattr(part, "inline_data", None):
                            img = Image.open(BytesIO(part.inline_data.data))
                            print(f"GenerateComplete: Successfully generated complete draped saree image with {model_name}!")
                            return img

            except Exception as e:
                err_msg = str(e)
                print(f"GenerateComplete: {model_name} attempt note: {err_msg[:120]}")
                # If rate limited or quota 0, no need to keep hammering the same quota bucket
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "limit: 0" in err_msg:
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
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"]
                    )
                )

                if response and response.candidates:
                    for part in response.candidates[0].content.parts:
                        if getattr(part, "inline_data", None):
                            img = Image.open(BytesIO(part.inline_data.data))
                            print(f"GenerateComplete.generate_template: AI flat-lay template generated with {model_name}!")
                            return img

            except Exception as e:
                err_msg = str(e)
                print(f"GenerateComplete.generate_template: {model_name} note: {err_msg[:120]}")
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "limit: 0" in err_msg:
                    break

        return None  # end of generate_template
