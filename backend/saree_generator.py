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

    def tempelete(self, border, pallu, body, saree_width=2400, saree_height=600):
        """
        Creates a clean, proportion-accurate weaving template:
        - Top border (height ~90px)
        - Bottom border (height ~90px)
        - Body field (70% width, height ~420px) tiled seamlessly
        - Pallu field (30% width, height ~420px) placed on right
        """
        if border.mode != "RGB":
            border = border.convert("RGB")
        if pallu.mode != "RGB":
            pallu = pallu.convert("RGB")
        if body.mode != "RGB":
            body = body.convert("RGB")

        border = self.apply_clahe(border, 1.0)
        pallu = self.apply_clahe(pallu, 1.2)
        body = self.apply_clahe(body, 1.5)

        border_h = 90
        body_h = saree_height - (2 * border_h)  # 420px
        pallu_w = int(saree_width * 0.30)       # 720px
        body_w = saree_width - pallu_w          # 1680px

        # 1. Scale border to height border_h while preserving aspect ratio
        b_aspect = border.width / max(1, border.height)
        new_bw = max(20, int(border_h * b_aspect))
        border_tile = border.resize((new_bw, border_h), Image.Resampling.LANCZOS)

        # 2. Scale body tile cleanly
        body_aspect = body.width / max(1, body.height)
        new_bh = min(body_h, max(120, int(body.height)))
        new_bw = max(80, int(new_bh * body_aspect))
        body_tile = body.resize((new_bw, new_bh), Image.Resampling.LANCZOS)

        # 3. Create canvas
        saree = Image.new("RGB", (saree_width, saree_height), "white")

        # 4. Tile top and bottom borders
        for x in range(0, saree_width, border_tile.width):
            saree.paste(border_tile, (x, 0))
            saree.paste(border_tile, (x, saree_height - border_h))

        # 5. Seamlessly tile body fabric across (body_w x body_h)
        body_patch = Image.new("RGB", (body_w, body_h))
        for y in range(0, body_h, body_tile.height):
            for x in range(0, body_w, body_tile.width):
                body_patch.paste(body_tile, (x, y))

        saree.paste(body_patch, (0, border_h))

        # 6. Resize pallu to fill pallu_w x body_h and paste on the right
        pallu_resized = pallu.resize((pallu_w, body_h), Image.Resampling.LANCZOS)
        saree.paste(pallu_resized, (body_w, border_h))

        return saree


class GenerateComplete:
    """
    AI Saree Generator:
    Takes 3 raw component images (Border, Pallu, Body) and asks Google Gemini
    to generate the complete realistic saree draped on a mannequin.
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

        return None
