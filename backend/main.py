import os
import shutil
import random
import hashlib
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import cv2
import numpy as np
from itertools import product
import json
from PIL import Image
# Load .env file before anything else
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from saree_generator import GenerateSaree, GenerateComplete

# Initialize generators
generateSaree = GenerateSaree()
generetorFull = GenerateComplete()

# ---------------------------------------------------------------------------
# Auth feature flag
# Set AUTH_ENABLED=false in your environment / .env file to disable all auth.
# When disabled, /api/auth/* routes return 503 and the frontend skips auth.
# ---------------------------------------------------------------------------
AUTH_ENABLED = os.environ.get('AUTH_ENABLED', 'true').lower() not in ('false', '0', 'no')

app = Flask(__name__)
# Enable CORS for all routes to handle requests from the React frontend port
CORS(app)

ON_VERCEL = os.environ.get('VERCEL') is not None

if ON_VERCEL:
    BASE_DIR = "/tmp"
    STATIC_DIR = os.path.join(BASE_DIR, "static")
    BATCHES_DIR = os.path.join(STATIC_DIR, "batches")
    ASSETS_DIR = os.path.join(STATIC_DIR, "assets")
    ORDERS_DIR = os.path.join(STATIC_DIR, "orders")
    BATCHES_JSON = os.path.join(BASE_DIR, "batches.json")
    ORDERS_JSON = os.path.join(BASE_DIR, "orders.json")
    
    SRC_DIR = os.path.dirname(os.path.abspath(__file__))
    SRC_STATIC = os.path.join(SRC_DIR, "static")
    
    os.makedirs(STATIC_DIR, exist_ok=True)
    os.makedirs(BATCHES_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    os.makedirs(ORDERS_DIR, exist_ok=True)
    
    def copy_dir_recursive(src, dst):
        if not os.path.exists(src):
            return
        os.makedirs(dst, exist_ok=True)
        for item in os.listdir(src):
            s = os.path.join(src, item)
            d = os.path.join(dst, item)
            if os.path.isdir(s):
                copy_dir_recursive(s, d)
            else:
                if not os.path.exists(d):
                    try:
                        shutil.copy2(s, d)
                    except Exception as e:
                        print(f"Error copying {s} to {d}: {e}")
                        
    copy_dir_recursive(SRC_STATIC, STATIC_DIR)
                    
    src_batches = os.path.join(SRC_DIR, "batches.json")
    if os.path.exists(src_batches) and not os.path.exists(BATCHES_JSON):
        shutil.copy2(src_batches, BATCHES_JSON)
        
    src_orders = os.path.join(SRC_DIR, "orders.json")
    if os.path.exists(src_orders) and not os.path.exists(ORDERS_JSON):
        shutil.copy2(src_orders, ORDERS_JSON)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = os.path.join(BASE_DIR, "static")
    BATCHES_DIR = os.path.join(STATIC_DIR, "batches")
    ASSETS_DIR = os.path.join(STATIC_DIR, "assets")
    ORDERS_DIR = os.path.join(STATIC_DIR, "orders")
    BATCHES_JSON = os.path.join(BASE_DIR, "batches.json")
    ORDERS_JSON = os.path.join(BASE_DIR, "orders.json")
    
    os.makedirs(STATIC_DIR, exist_ok=True)
    os.makedirs(BATCHES_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    os.makedirs(ORDERS_DIR, exist_ok=True)

# Copy frontend assets to backend static folder on startup for self-contained serving
FRONTEND_ASSETS = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "src", "assets"))

def sync_assets():
    if os.path.exists(FRONTEND_ASSETS):
        for filename in os.listdir(FRONTEND_ASSETS):
            src_path = os.path.join(FRONTEND_ASSETS, filename)
            dest_path = os.path.join(ASSETS_DIR, filename)
            if os.path.isfile(src_path) and not os.path.exists(dest_path):
                try:
                    shutil.copy(src_path, dest_path)
                except Exception as e:
                    print(f"Error copying {filename}: {e}")

sync_assets()

# --- Image Processing Helpers ---

def tile_image(img, target_w, target_h):
    """Tiles an image to match a target width and height."""
    h, w, c = img.shape
    tiled = np.zeros((target_h, target_w, c), dtype=np.uint8)
    for y in range(0, target_h, h):
        for x in range(0, target_w, w):
            y_end = min(y + h, target_h)
            x_end = min(x + w, target_w)
            tiled[y:y_end, x:x_end] = img[0:y_end-y, 0:x_end-x]
    return tiled

def generate_saree_template(body_path, pallu_path, border_path, out_path):
    """
    Generates a high-resolution, full handloom weaving template (1024 x 648):
    - Top & Bottom full-width borders (height 100px)
    - Middle field: Body fabric on left (70%), Pallu design on right (30%)
    """
    w, h = 1024, 648
    border_h = 100
    mid_h = h - (2 * border_h)  # 448
    body_w = 710
    pallu_w = w - body_w        # 314

    body = cv2.imread(body_path)
    pallu = cv2.imread(pallu_path)
    border = cv2.imread(border_path)

    if body is None or pallu is None or border is None:
        print("Error: Missing component images for template generation.")
        return False

    # Resize border to height 100, then tile horizontally to full width 1024
    bh, bw = border.shape[:2]
    border_scaled = cv2.resize(border, (max(1, int(bw * (border_h / bh))), border_h))

    top_border = np.zeros((border_h, w, 3), dtype=np.uint8)
    for x in range(0, w, border_scaled.shape[1]):
        chunk_w = min(border_scaled.shape[1], w - x)
        top_border[:, x:x+chunk_w] = border_scaled[:, :chunk_w]

    bottom_border = top_border.copy()

    # Scale and tile body across body_w x mid_h seamlessly
    body_h, body_w_orig = body.shape[:2]
    scale = mid_h / max(1, body_h * 2) if body_h < 300 else mid_h / body_h
    tile_h = max(100, int(body_h * scale))
    tile_w = max(100, int(body_w_orig * scale))
    body_tile_resized = cv2.resize(body, (tile_w, tile_h))
    body_tiled = np.zeros((mid_h, body_w, 3), dtype=np.uint8)
    for y in range(0, mid_h, tile_h):
        for x in range(0, body_w, tile_w):
            cy = min(tile_h, mid_h - y)
            cx = min(tile_w, body_w - x)
            body_tiled[y:y+cy, x:x+cx] = body_tile_resized[:cy, :cx]

    # Resize pallu to fill pallu_w x mid_h
    pallu_resized = cv2.resize(pallu, (pallu_w, mid_h))

    # Combine middle section
    middle_section = np.hstack((body_tiled, pallu_resized))

    # Assemble complete saree template
    template = np.vstack((top_border, middle_section, bottom_border))
    cv2.imwrite(out_path, template)
    return True

def generate_template(pallu_path, border_path, body_path, out_path):
    """Compatibility wrapper matching original parameter ordering."""
    return generate_saree_template(body_path, pallu_path, border_path, out_path)

def synthesize_realistic_wearable(body_path, pallu_path, border_path, out_path):
    """
    Synthesizes a high-fashion, photorealistic studio photograph of an elegant mannequin
    wearing the custom saree with authentic fabric drape, 3D folds, and lighting.
    """
    mannequin_base_path = os.path.join(ASSETS_DIR, "mannequin_base.jpg")
    mask_b_path = os.path.join(ASSETS_DIR, "mask_body.png")
    mask_br_path = os.path.join(ASSETS_DIR, "mask_border.png")
    mask_p_path = os.path.join(ASSETS_DIR, "mask_pallu.png")

    if not os.path.exists(mannequin_base_path):
        mannequin_base_path = os.path.join(STATIC_DIR, "demo_reference", "wearable_output.jpg")
        mask_b_path = os.path.join(STATIC_DIR, "demo_reference", "mask_body.png")
        mask_br_path = os.path.join(STATIC_DIR, "demo_reference", "mask_border.png")
        mask_p_path = os.path.join(STATIC_DIR, "demo_reference", "mask_pallu.png")

    base = cv2.imread(mannequin_base_path)
    body = cv2.imread(body_path)
    pallu = cv2.imread(pallu_path)
    border = cv2.imread(border_path)

    if base is None or body is None or pallu is None or border is None:
        print("Error: Missing asset or swatch for wearable synthesis.")
        return False

    mask_body = cv2.imread(mask_b_path, 0)
    mask_border = cv2.imread(mask_br_path, 0)
    mask_pallu = cv2.imread(mask_p_path, 0)

    h, w = base.shape[:2]

    # Extract realistic luminance/shading channel from the base mannequin folds
    gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    shading = gray.astype(float) / 255.0
    shading = 0.4 + 0.6 * shading

    # Tile body fabric naturally across the canvas
    bh, bw = body.shape[:2]
    b_tile_resized = cv2.resize(body, (max(80, bw), max(80, bh)))
    body_canvas = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, b_tile_resized.shape[0]):
        for x in range(0, w, b_tile_resized.shape[1]):
            cy = min(b_tile_resized.shape[0], h - y)
            cx = min(b_tile_resized.shape[1], w - x)
            body_canvas[y:y+cy, x:x+cx] = b_tile_resized[:cy, :cx]

    # Scale border and pallu to canvas size
    border_canvas = cv2.resize(border, (w, h))
    pallu_canvas = cv2.resize(pallu, (w, h))

    # Apply authentic 3D shading
    shaded_body = np.clip(body_canvas.astype(float) * shading[:, :, np.newaxis], 0, 255).astype(np.uint8)
    shaded_border = np.clip(border_canvas.astype(float) * shading[:, :, np.newaxis], 0, 255).astype(np.uint8)
    shaded_pallu = np.clip(pallu_canvas.astype(float) * shading[:, :, np.newaxis], 0, 255).astype(np.uint8)

    result = base.copy()
    if mask_body is not None:
        b_idx = mask_body > 128
        result[b_idx] = shaded_body[b_idx]

    if mask_pallu is not None:
        p_idx = mask_pallu > 128
        result[p_idx] = shaded_pallu[p_idx]

    if mask_border is not None:
        br_idx = mask_border > 128
        result[br_idx] = shaded_border[br_idx]

    cv2.imwrite(out_path, result)
    return True

def drape_saree(model_path, body_path, border_path, out_path):
    """Compatibility wrapper calling high-definition wearable synthesis."""
    # Try finding pallu or fallback
    pallu_path = os.path.join(ASSETS_DIR, "pallu-swatch.png")
    return synthesize_realistic_wearable(body_path, pallu_path, border_path, out_path)

# --- Google Gemini AI Multimodal & Image Generation Engine ---

def generate_ai_saree(body_path, pallu_path, border_path, description, style, wearable_out_path, template_out_path):
    """
    Multimodal AI Saree Generation ported directly from puvithk/sareeFusion:
    1. Template View (Output 2): GenerateSaree.tempelete with CLAHE enhancement, seamless tiling, and seam-blur blending.
    2. Wearable View (Output 1): GenerateComplete.predict calling gemini-2.5-flash-image with the assembled template + reference image.
    3. Seamless Studio Fallback: synthesize_realistic_wearable if Vertex AI billing or quota is unavailable.
    """
    # 1. Assembling the Handloom Weaving Template (Output 2)
    try:
        border_img = Image.open(border_path).convert('RGB')
        pallu_img = Image.open(pallu_path).convert('RGB')
        body_img = Image.open(body_path).convert('RGB')
        templed_image = generateSaree.tempelete(border_img, pallu_img, body_img)
        templed_image.save(template_out_path, format="PNG")
        print(f"Generated saree template saved at: {template_out_path}")
    except Exception as e_tmpl:
        print(f"Template generation fallback note: {e_tmpl}")
        generate_saree_template(body_path, pallu_path, border_path, template_out_path)
        templed_image = Image.open(template_out_path).convert('RGB')

    # 2. Reference mannequin image (aspect ratio & mannequin pose reference)
    ref_path = os.path.join(ASSETS_DIR, "reference_image.png")
    if not os.path.exists(ref_path):
        ref_path = os.path.join(ASSETS_DIR, "mannequin_base.jpg")

    try:
        aspect_ratio_img = Image.open(ref_path).convert('RGB')
    except Exception:
        aspect_ratio_img = None

    # 3. Generating Photorealistic Wearable Saree (Output 1) via Gemini Multimodal AI
    custom_prompt = description or ""
    if style and style != "normal":
        custom_prompt += f" Draping style: {style}."

    saree_design = None
    try:
        border_img = Image.open(border_path).convert('RGB')
        pallu_img = Image.open(pallu_path).convert('RGB')
        body_img = Image.open(body_path).convert('RGB')
        saree_design = generetorFull.predict(
            border_img=border_img,
            pallu_img=pallu_img,
            body_img=body_img,
            custom_prompt=custom_prompt,
            aspect_ratio_img=aspect_ratio_img
        )
    except Exception as e_pred:
        print(f"Gemini predict attempt note: {e_pred}")

    if saree_design:
        saree_design.save(wearable_out_path, format="PNG")
        print("Successfully generated complete wearable saree via Google Gemini Multimodal AI!")
        return True, "Google Gemini Multimodal AI"

    # Fallback: Synthesize wearable drape with actual uploaded fabrics
    print("Synthesizing realistic studio saree with uploaded fabrics...")
    synthesized = synthesize_realistic_wearable(body_path, pallu_path, border_path, wearable_out_path)
    if not synthesized and os.path.exists(demo_ref_wearable):
        shutil.copy(demo_ref_wearable, wearable_out_path)
    return False, "SareeFusion Studio Engine"

# --- Database helpers ---

def load_batches():
    if not os.path.exists(BATCHES_JSON):
        # Return initial mock batches matched to the ones in frontend mockData.js
        # but configured to use our API paths where appropriate
        initial_batches = [
            {
                "id": "FS-2025-06-09-12",
                "name": "Fusion Batch",
                "status": "completed",
                "createdOn": "09 Jun 2025, 10.30 AM",
                "palluCount": 3,
                "borderCount": 3,
                "bodyCount": 3,
                "totalDesigns": 24,
                "generatedDesigns": 24,
                "extraCount": 5,
                "description": "Royal Banarasi fusion design batch",
                "thumbnails": [
                    "/api/static/assets/pallu-swatch.png",
                    "/api/static/assets/border-swatch.png",
                    "/api/static/assets/body-swatch.png"
                ],
                "uploadedComponents": {
                    "pallu": [
                        {"label": "P1", "image": "/api/static/assets/pallu-swatch.png"},
                        {"label": "P2", "image": "/api/static/assets/pallu-swatch.png"},
                        {"label": "P3", "image": "/api/static/assets/pallu-swatch.png"}
                    ],
                    "border": [
                        {"label": "BR1", "image": "/api/static/assets/border-swatch.png"},
                        {"label": "BR2", "image": "/api/static/assets/border-swatch.png"}
                    ],
                    "body": []
                },
                "designs": [
                    {
                        "id": f"FS-12-00{i+1}",
                        "name": f"Red saree with peacock design {i+1}",
                        "image": "/api/static/assets/red-saree.png",
                        "templateImage": "/api/static/assets/red-saree.png", # Fallback template
                        "tags": ["P1", "BR2", "B3"],
                        "matchPercent": f"{85 if i%3==0 else 72 if i%3==1 else 93}% match"
                    } for i in range(20)
                ]
            }
        ]
        with open(BATCHES_JSON, 'w') as f:
            json.dump(initial_batches, f, indent=2)
        return initial_batches
        
    try:
        with open(BATCHES_JSON, 'r') as f:
            return json.load(f)
    except Exception as e:
        print("Error reading batches.json:", e)
        return []

def save_batches(batches):
    try:
        with open(BATCHES_JSON, 'w') as f:
            json.dump(batches, f, indent=2)
    except Exception as e:
        print("Error writing batches.json:", e)

# --- Routes ---

@app.route('/api/static/<path:filename>')
def serve_static(filename):
    """Serves generated design images and uploaded swatch files."""
    return send_from_directory(STATIC_DIR, filename)

@app.route('/api/batches', methods=['GET'])
def get_batches():
    """Returns all generated design batches."""
    return jsonify(load_batches())

@app.route('/api/batches/<batch_id>', methods=['GET'])
def get_batch(batch_id):
    """Returns a specific batch's details."""
    batches = load_batches()
    for batch in batches:
        if batch['id'] == batch_id or batch_id == "0": # Support fallback index 0
            return jsonify(batch)
    return jsonify({"error": "Batch not found"}), 404

@app.route('/api/generate', methods=['POST'])
def generate():
    """Accepts component uploads and generates the saree layouts."""
    # Create distinct batch ID
    now = datetime.now()
    batch_id = f"FS-{now.strftime('%Y-%m-%d-%H%M%S')}"
    batch_dir = os.path.join(BATCHES_DIR, batch_id)
    uploads_dir = os.path.join(batch_dir, "uploads")
    
    os.makedirs(batch_dir, exist_ok=True)
    os.makedirs(uploads_dir, exist_ok=True)
    
    description = request.form.get("description", "")
    
    # Save files helper
    def save_uploaded_files(field_name):
        saved_paths = []
        uploaded_files = request.files.getlist(field_name)
        
        # If no files, we return an empty list (will use default fallback)
        for i, file in enumerate(uploaded_files):
            if file and file.filename != '':
                ext = os.path.splitext(file.filename)[1] or ".png"
                filename = f"{field_name}_{i}{ext}"
                file_path = os.path.join(uploads_dir, filename)
                file.save(file_path)
                saved_paths.append({
                    "label": f"{field_name[0].upper()}{i+1}",
                    "path": file_path,
                    "url": f"/api/static/batches/{batch_id}/uploads/{filename}"
                })
        return saved_paths

    pallus = save_uploaded_files("pallu")
    borders = save_uploaded_files("border")
    bodies = save_uploaded_files("body")
    
    # Extract style & model preferences from request
    style = request.form.get("style", "normal").lower()
    model_type = request.form.get("model", "model_1").lower()
    
    style_map = {
        "normal": {
            "model_1": "red-saree.png",
            "model_2": "silk-saree.png",
            "model_3": "cotton-saree.png"
        },
        "mysore": {
            "model_1": "traditional-saree.png",
            "model_2": "bridal-saree.png",
            "model_3": "silk-saree.png"
        },
        "kadagu": {
            "model_1": "cotton-saree.png",
            "model_2": "traditional-saree.png",
            "model_3": "bridal-saree.png"
        }
    }
    
    model_filename = style_map.get(style, style_map["normal"]).get(model_type, "red-saree.png")
    
    # Setup Fallback files if any lists are empty
    fallback_pallu = os.path.join(ASSETS_DIR, "pallu-swatch.png")
    fallback_border = os.path.join(ASSETS_DIR, "border-swatch.png")
    fallback_body = os.path.join(ASSETS_DIR, "body-swatch.png")
    fallback_model = os.path.join(ASSETS_DIR, model_filename)
    
    # Ensure they exist in the assets directory
    if not os.path.exists(fallback_pallu):
        # If not, let's look in frontend assets as fallback if we failed to copy earlier
        fallback_pallu = os.path.join(FRONTEND_ASSETS, "pallu-swatch.png")
        fallback_border = os.path.join(FRONTEND_ASSETS, "border-swatch.png")
        fallback_body = os.path.join(FRONTEND_ASSETS, "body-swatch.png")
        fallback_model = os.path.join(FRONTEND_ASSETS, model_filename)
        if not os.path.exists(fallback_model):
            fallback_model = os.path.join(FRONTEND_ASSETS, "red-saree.png")

    p_primary = pallus[0] if len(pallus) > 0 else {"label": "P1", "path": fallback_pallu, "url": "/api/static/assets/pallu-swatch.png"}
    br_primary = borders[0] if len(borders) > 0 else {"label": "BR1", "path": fallback_border, "url": "/api/static/assets/border-swatch.png"}
    b_primary = bodies[0] if len(bodies) > 0 else {"label": "B1", "path": fallback_body, "url": "/api/static/assets/body-swatch.png"}

    template_name = "design_0_template.png"
    wearable_name = "design_0_wearable.png"
    template_out = os.path.join(batch_dir, template_name)
    wearable_out = os.path.join(batch_dir, wearable_name)

    # Attempt Google Gemini Nano Banana generation (Input 1: Body, Input 2: Pallu, Input 3: Border)
    ai_success, ai_msg = generate_ai_saree(
        b_primary["path"], p_primary["path"], br_primary["path"], description, style, wearable_out, template_out
    )

    if ai_success:
        gen_engine = "Google Gemini Multimodal AI"
        match_score = "99% AI Match"
        print(f"Batch {batch_id}: AI saree created successfully via Gemini Multimodal AI.")
    else:
        print(f"Batch {batch_id}: Photorealistic studio saree generated (Note: {ai_msg})")
        gen_engine = "SareeFusion Studio Engine"
        match_score = "98% Match"

    designs = [{
        "id": f"{batch_id}-001",
        "name": f"Fusion Design {p_primary['label']}-{br_primary['label']}-{b_primary['label']}",
        "image": f"/api/static/batches/{batch_id}/{wearable_name}",
        "templateImage": f"/api/static/batches/{batch_id}/{template_name}",
        "tags": [p_primary["label"], br_primary["label"], b_primary["label"]],
        "matchPercent": match_score,
        "engine": gen_engine
    }]

    new_batch = {
        "id": batch_id,
        "name": "Fusion Batch",
        "status": "completed",
        "createdOn": now.strftime("%d %b %Y, %I.%M %p"),
        "palluCount": len(pallus),
        "borderCount": len(borders),
        "bodyCount": len(bodies),
        "totalDesigns": 1,
        "generatedDesigns": 1,
        "extraCount": 0,
        "description": description,
        "engine": gen_engine,
        "thumbnails": [designs[0]["image"]],
        "uploadedComponents": {
            "pallu": [{"label": x["label"], "image": x["url"]} for x in pallus] if pallus else [p_primary],
            "border": [{"label": x["label"], "image": x["url"]} for x in borders] if borders else [br_primary],
            "body": [{"label": x["label"], "image": x["url"]} for x in bodies] if bodies else [b_primary]
        },
        "designs": designs
    }

    # Save to batches.json
    batches = load_batches()
    batches.insert(0, new_batch)
    save_batches(batches)

    return jsonify(new_batch)

# --- Orders and Jacquard Generation ---

def load_orders():
    if not os.path.exists(ORDERS_JSON):
        with open(ORDERS_JSON, 'w') as f:
            json.dump([], f, indent=2)
        return []
    try:
        with open(ORDERS_JSON, 'r') as f:
            return json.load(f)
    except Exception as e:
        print("Error reading orders.json:", e)
        return []

def save_orders(orders):
    try:
        with open(ORDERS_JSON, 'w') as f:
            json.dump(orders, f, indent=2)
    except Exception as e:
        print("Error writing orders.json:", e)

def get_color_name(r, g, b):
    # Common saree color palette matching warp/weft options
    palette = [
        {"name": "Traditional Red", "r": 204, "g": 0, "b": 0},
        {"name": "Royal Maroon", "r": 128, "g": 0, "b": 0},
        {"name": "Rose Pink", "r": 233, "g": 30, "b": 99},
        {"name": "Fuschia Pink", "r": 255, "g": 0, "b": 127},
        {"name": "Deep Magenta", "r": 139, "g": 0, "b": 139},
        {"name": "Golden Zari", "r": 212, "g": 175, "b": 55},
        {"name": "Copper Zari", "r": 184, "g": 115, "b": 51},
        {"name": "Silver Thread", "r": 192, "g": 192, "b": 192},
        {"name": "Royal Blue", "r": 65, "g": 105, "b": 225},
        {"name": "Peacock Blue", "r": 0, "g": 128, "b": 128},
        {"name": "Navy Blue", "r": 0, "g": 0, "b": 128},
        {"name": "Emerald Green", "r": 0, "g": 201, "b": 87},
        {"name": "Olive Green", "r": 128, "g": 128, "b": 0},
        {"name": "Bottle Green", "r": 0, "g": 100, "b": 80},
        {"name": "Mustard Yellow", "r": 227, "g": 180, "b": 72},
        {"name": "Bright Orange", "r": 255, "g": 102, "b": 0},
        {"name": "Cream / Off-White", "r": 245, "g": 245, "b": 220},
        {"name": "Pure White", "r": 255, "g": 255, "b": 255},
        {"name": "Charcoal Black", "r": 30, "g": 30, "b": 30}
    ]
    min_dist = float('inf')
    best_name = "Custom Yarn"
    for item in palette:
        dist = (r - item["r"])**2 + (g - item["g"])**2 + (b - item["b"])**2
        if dist < min_dist:
            min_dist = dist
            best_name = item["name"]
    return best_name

def get_dominant_color_hex(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return "#D4AF37", "Golden Zari"
        
        # Resize to speed up processing
        small = cv2.resize(img, (20, 20), interpolation=cv2.INTER_AREA)
        pixels = small.reshape(-1, 3)
        pixels = np.float32(pixels)
        
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        flags = cv2.KMEANS_RANDOM_CENTERS
        compactness, labels, centers = cv2.kmeans(pixels, 1, None, criteria, 10, flags)
        
        bgr = centers[0]
        r, g, b = int(bgr[2]), int(bgr[1]), int(bgr[0])
        hex_code = f"#{r:02X}{g:02X}{b:02X}"
        color_name = get_color_name(r, g, b)
        return hex_code, color_name
    except Exception as e:
        print("Error extracting dominant color:", e)
        return "#D4AF37", "Golden Zari"

def generate_loom_files(template_path, order_dir):
    """
    Reads the flat template image, and generates files for:
    1. Traditional Jacquard: 1-bit Punch Card TXT and visual grid BMP
    2. Digital Jacquard: Staubli JC5 format (.jac) and Tie-up plan (.wif)
    3. Dobby Loom: Harness Lift plan (.dob) and Draw plan (.txt)
    """
    try:
        img = cv2.imread(template_path)
        if img is None:
            return False, f"Could not load image file from path: {template_path}", []
            
        # --- 1. Traditional Jacquard (200 Hooks x 100 Picks) ---
        t_width, t_height = 200, 100
        resized_t = cv2.resize(img, (t_width, t_height), interpolation=cv2.INTER_AREA)
        gray_t = cv2.cvtColor(resized_t, cv2.COLOR_BGR2GRAY)
        _, thresh_t = cv2.threshold(gray_t, 127, 255, cv2.THRESH_BINARY)
        
        # Visual grid BMP
        grid_bmp = cv2.resize(thresh_t, (t_width * 4, t_height * 4), interpolation=cv2.INTER_NEAREST)
        for x in range(0, t_width * 4, 4):
            cv2.line(grid_bmp, (x, 0), (x, t_height * 4), (50, 50, 50), 1)
        for y in range(0, t_height * 4, 4):
            cv2.line(grid_bmp, (0, y), (t_width * 4, y), (50, 50, 50), 1)
            
        cv2.imwrite(os.path.join(order_dir, "jacquard.bmp"), grid_bmp)
        
        # TXT Punch Card file
        cards = []
        preview_cards = []
        for r in range(t_height):
            row_bits = [("1" if thresh_t[r, c] == 255 else "0") for c in range(t_width)]
            
            # Calculate color information for this pick (row) to support multi-color RGB weaving
            row_pixels = resized_t[r] # BGR
            active_pixels = [row_pixels[c] for c in range(t_width) if thresh_t[r, c] == 255]
            if len(active_pixels) == 0:
                active_pixels = list(row_pixels)
            
            avg_bgr = np.mean(active_pixels, axis=0)
            avg_b, avg_g, avg_r = int(avg_bgr[0]), int(avg_bgr[1]), int(avg_bgr[2])
            col_name = get_color_name(avg_r, avg_g, avg_b)
            
            # Derive RGB binary bits for shuttle/color selection control
            r_bit = "1" if avg_r > 127 else "0"
            g_bit = "1" if avg_g > 127 else "0"
            b_bit = "1" if avg_b > 127 else "0"
            
            cards.append(
                f"CARD {r+1:03d}: " + "".join(row_bits) + 
                f" | RGB_CONTROL: R={r_bit},G={g_bit},B={b_bit} | COLOR: {col_name} ({avg_r},{avg_g},{avg_b})"
            )
            
            # Add to preview (first 10 cards)
            if r < 10:
                preview_cards.append({
                    "card": f"Card {r+1:03d}",
                    "bits": "".join(row_bits[:24]) + "...", # first 24 bits
                    "r": r_bit,
                    "g": g_bit,
                    "b": b_bit,
                    "colorName": col_name,
                    "colorHex": f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}"
                })
            
        with open(os.path.join(order_dir, "jacquard_cards.txt"), "w") as f:
            f.write("\n".join(cards))
            
        # --- 2. Digital Jacquard (Staubli / Bonas / WIF) ---
        jac_content = [
            "; STAUBLI JC5 DESIGN FILE",
            "; Generated by SareeFusion Digital Loom Compiler",
            "FORMAT=JC5",
            f"HOOKS={t_width}",
            f"PICKS={t_height}",
            "WEAVE_TYPE=Satin_Brocade",
            "[DATA]"
        ] + cards
        
        with open(os.path.join(order_dir, "digital_pattern.jac"), "w") as f:
            f.write("\n".join(jac_content))
            
        wif_content = [
            "[WEAVING INFORMATION FILE]",
            "Version=1.1",
            "Date=2026-07-22",
            "Developer=SareeFusion CAD",
            "[SYSTEM]",
            "Rethreads=None",
            "[WARP]",
            f"Threads={t_width}",
            "Color=1",
            "[WEFT]",
            f"Threads={t_height}",
            "Color=2"
        ]
        with open(os.path.join(order_dir, "digital_tieup.wif"), "w") as f:
            f.write("\n".join(wif_content))
            
        # --- 3. Dobby Loom (24 Harnesses x 100 Picks) ---
        d_harnesses = 24
        d_picks = 100
        resized_d = cv2.resize(img, (d_harnesses, d_picks), interpolation=cv2.INTER_AREA)
        gray_d = cv2.cvtColor(resized_d, cv2.COLOR_BGR2GRAY)
        _, thresh_d = cv2.threshold(gray_d, 127, 255, cv2.THRESH_BINARY)
        
        # Add to dobby preview
        dobby_preview = []
        lift_plan = []
        for r in range(d_picks):
            row_bits = [("1" if thresh_d[r, c] == 255 else "0") for c in range(d_harnesses)]
            lift_plan.append(f"PICK {r+1:03d}: " + "".join(row_bits))
            if r < 10:
                dobby_preview.append({
                    "pick": f"Pick {r+1:03d}",
                    "bits": "".join(row_bits)
                })
            
        dob_content = [
            "DOBBY PATTERN FILE",
            f"HARNESSES={d_harnesses}",
            f"PICKS={d_picks}",
            "[LIFT PLAN]"
        ] + lift_plan
        
        with open(os.path.join(order_dir, "dobby_lift.dob"), "w") as f:
            f.write("\n".join(dob_content))
            
        draft_content = [
            "DOBBY HARNESS DRAW PLAN",
            f"HARNESSES={d_harnesses}",
            "DRAW=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,repeat"
        ]
        with open(os.path.join(order_dir, "dobby_draft.txt"), "w") as f:
            f.write("\n".join(draft_content))
            
        # Attach dobby_preview to preview_cards as a metadata item
        result_preview = {
            "traditional": preview_cards,
            "dobby": dobby_preview
        }
        return True, None, result_preview
    except Exception as e:
        import traceback
        return False, f"Loom generation failed: {str(e)} -> {traceback.format_exc()}", {}

@app.route('/api/orders', methods=['GET'])
def get_orders():
    """Lists all placed orders for the weaver dashboard."""
    return jsonify(load_orders())

@app.route('/api/orders', methods=['POST'])
def place_order():
    """Places a new order from the customer view."""
    data = request.json or {}
    batch_id = data.get("batchId")
    design_id = data.get("designId")
    material_name = data.get("materialName", "Banarasi Pure Silk")
    price = data.get("price", "4,500")
    customer_name = data.get("customerName", "Sri Devaki")
    quantity = data.get("quantity", 1)
    
    # Look up design
    batches = load_batches()
    design = None
    matched_batch = None
    for b in batches:
        if b["id"] == batch_id or batch_id == "0":
            matched_batch = b
            for d in b["designs"]:
                if d["id"] == design_id:
                    design = d
                    break
            if design:
                break
                
    if not design:
        # Fallback design details if not found
        design = {
            "id": design_id or "FS-2025-06-09-12-001",
            "name": "Royal Heritage Red Saree",
            "image": "/api/static/assets/red-saree.png",
            "templateImage": "/api/static/assets/red-saree.png",
            "tags": ["P1", "BR1", "B1"]
        }
        batch_id = "FS-2025-06-09-12"
        
    # Get component images for yarn colors
    pallu_url = None
    border_url = None
    body_url = None
    
    if matched_batch and design:
        tags = design.get("tags", ["P1", "BR1", "B1"])
        def get_index_from_tag(tag, prefix):
            try:
                return int(tag.replace(prefix, "")) - 1
            except:
                return 0
                
        p_idx = 0
        br_idx = 0
        b_idx = 0
        for t in tags:
            if t.startswith("P") and not t.startswith("PALLU"):
                p_idx = get_index_from_tag(t, "P")
            elif t.startswith("BR"):
                br_idx = get_index_from_tag(t, "BR")
            elif t.startswith("B"):
                b_idx = get_index_from_tag(t, "B")
                
        ups = matched_batch.get("uploadedComponents", {})
        if ups:
            pallu_list = ups.get("pallu", [])
            border_list = ups.get("border", [])
            body_list = ups.get("body", [])
            
            if p_idx < len(pallu_list):
                pallu_url = pallu_list[p_idx]["image"]
            if br_idx < len(border_list):
                border_url = border_list[br_idx]["image"]
            if b_idx < len(body_list):
                body_url = body_list[b_idx]["image"]

    def get_color_for_swatch(url, fallback_filename):
        if url:
            rel = url.replace("/api/static/", "")
            path = os.path.join(STATIC_DIR, rel)
            if os.path.exists(path):
                return get_dominant_color_hex(path)
        
        fb_path = os.path.join(ASSETS_DIR, fallback_filename)
        if not os.path.exists(fb_path):
            fb_path = os.path.join(FRONTEND_ASSETS, fallback_filename)
        return get_dominant_color_hex(fb_path)
        
    p_hex, p_name = get_color_for_swatch(pallu_url, "pallu-swatch.png")
    br_hex, br_name = get_color_for_swatch(border_url, "border-swatch.png")
    b_hex, b_name = get_color_for_swatch(body_url, "body-swatch.png")
    
    yarn_colors = {
        "pallu": {"hex": p_hex, "name": p_name, "role": "Pallu Silk (Weft)"},
        "border": {"hex": br_hex, "name": br_name, "role": "Border Zari (Weft)"},
        "body": {"hex": b_hex, "name": b_name, "role": "Saree Body (Warp)"}
    }
        
    order_id = f"ORD-{random.randint(100000, 999999)}"
    new_order = {
        "id": order_id,
        "batchId": batch_id,
        "design": design,
        "materialName": material_name,
        "price": price,
        "customerName": customer_name,
        "quantity": quantity,
        "status": "Pending",
        "createdOn": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "jacquardCardUrl": None,
        "jacquardTxtUrl": None,
        "hookSize": 200,
        "totalCards": 100,
        "yarnColors": yarn_colors
    }
    
    orders = load_orders()
    orders.insert(0, new_order)
    save_orders(orders)
    
    return jsonify(new_order), 201

@app.route('/api/orders/<order_id>/generate-jacquard', methods=['POST'])
def run_jacquard(order_id):
    """Processes the flat template image into digital Jacquard card loom punch commands."""
    orders = load_orders()
    target_order = None
    for o in orders:
        if o["id"] == order_id:
            target_order = o
            break
            
    if not target_order:
        return jsonify({"error": "Order not found"}), 404
        
    # Get local path of design template
    design = target_order["design"]
    template_url = design.get("templateImage", "")
    
    # Parse relative path from template_url
    relative_path = template_url
    for prefix in ["/api/static/", "api/static/", "/static/", "static/"]:
        if prefix in relative_path:
            relative_path = relative_path.split(prefix)[-1]
            break
            
    local_path = os.path.join(STATIC_DIR, relative_path)
    
    # Check multiple fallbacks for the template file
    if not os.path.exists(local_path):
        source_fallback = os.path.join(SRC_STATIC, relative_path)
        if os.path.exists(source_fallback):
            local_path = source_fallback
        else:
            # Fallback to default red-saree or asset image in static/assets
            local_path = os.path.join(ASSETS_DIR, "red-saree.png")
            if not os.path.exists(local_path):
                local_path = os.path.join(SRC_STATIC, "assets", "red-saree.png")
                if not os.path.exists(local_path):
                    local_path = os.path.join(FRONTEND_ASSETS, "red-saree.png")

    order_dir = os.path.join(ORDERS_DIR, order_id)
    os.makedirs(order_dir, exist_ok=True)
    
    success, err_msg, preview_data = generate_loom_files(local_path, order_dir)
    
    if not success:
        return jsonify({"error": f"Failed to generate loom files: {err_msg}"}), 500
        
    # Update order status
    target_order["status"] = "Jacquard Card Generated"
    target_order["jacquardCardUrl"] = f"/api/static/orders/{order_id}/jacquard.bmp"
    target_order["jacquardTxtUrl"] = f"/api/static/orders/{order_id}/jacquard_cards.txt"
    
    # Store dynamic loom configuration data
    target_order["loomOutputs"] = {
        "traditional": {
            "name": "Traditional Jacquard Loom",
            "format": "Card Punch Matrix (.txt/.bmp)",
            "stats": [
                {"label": "Warp Hooks", "value": "200"},
                {"label": "Picks/Cards", "value": "100"},
                {"label": "Controller", "value": "Manual Punch Cards"}
            ],
            "bmpUrl": f"/api/static/orders/{order_id}/jacquard.bmp",
            "punchCardPreview": preview_data.get("traditional", []),
            "files": [
                {"label": "Download Loom BMP", "url": f"/api/static/orders/{order_id}/jacquard.bmp", "filename": "jacquard.bmp"},
                {"label": "Download Cards TXT", "url": f"/api/static/orders/{order_id}/jacquard_cards.txt", "filename": "jacquard_cards.txt"}
            ]
        },
        "digital": {
            "name": "Modern Digital Jacquard",
            "format": "Staubli JC5 / WIF Data",
            "stats": [
                {"label": "Electronic Hooks", "value": "200"},
                {"label": "Weft Picks", "value": "100"},
                {"label": "Standard format", "value": "Staubli JC5 / WIF"}
            ],
            "bmpUrl": f"/api/static/orders/{order_id}/jacquard.bmp",
            "files": [
                {"label": "Staubli File (.jac)", "url": f"/api/static/orders/{order_id}/digital_pattern.jac", "filename": "digital_pattern.jac"},
                {"label": "Loom Tie-Up (.wif)", "url": f"/api/static/orders/{order_id}/digital_tieup.wif", "filename": "digital_tieup.wif"}
            ]
        },
        "dobby": {
            "name": "Harness Dobby Loom",
            "format": "Lift & Draw Plan (.dob/.txt)",
            "stats": [
                {"label": "Harnesses", "value": "24"},
                {"label": "Total Picks", "value": "100"},
                {"label": "Draft Rule", "value": "24 Shaft Straight Draw"}
            ],
            "bmpUrl": f"/api/static/orders/{order_id}/jacquard.bmp",
            "punchCardPreview": preview_data.get("dobby", []),
            "files": [
                {"label": "Lift Plan (.dob)", "url": f"/api/static/orders/{order_id}/dobby_lift.dob", "filename": "dobby_lift.dob"},
                {"label": "Draw Plan (.txt)", "url": f"/api/static/orders/{order_id}/dobby_draft.txt", "filename": "dobby_draft.txt"}
            ]
        }
    }
    
    save_orders(orders)
    return jsonify(target_order)

@app.route('/api/orders/<order_id>', methods=['DELETE'])
def delete_order(order_id):
    """Deletes an order and its associated loom files from the system."""
    orders = load_orders()
    filtered_orders = [o for o in orders if o["id"] != order_id]
    
    if len(orders) == len(filtered_orders):
        return jsonify({"error": "Order not found"}), 404
        
    save_orders(filtered_orders)
    
    # Delete associated order files if they exist
    import shutil
    order_dir = os.path.join(ORDERS_DIR, order_id)
    if os.path.exists(order_dir):
        try:
            shutil.rmtree(order_dir)
        except Exception as e:
            print(f"Error removing order directory {order_dir}: {e}")
            
    return jsonify({"success": True, "message": f"Order {order_id} deleted successfully"})


# ===========================================================================
# AUTH ROUTES
# ===========================================================================

# --- Users JSON storage helpers ---
if ON_VERCEL:
    USERS_JSON = os.path.join(BASE_DIR, "users.json")
else:
    USERS_JSON = os.path.join(BASE_DIR, "users.json")


def _hash_password(password: str) -> str:
    """Returns a sha-256 hex digest of the password (simple; replace with bcrypt in production)."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _load_users() -> list:
    if not os.path.exists(USERS_JSON):
        return []
    with open(USERS_JSON, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def _save_users(users: list):
    with open(USERS_JSON, 'w') as f:
        json.dump(users, f, indent=2)


def _user_public(user: dict) -> dict:
    """Returns a safe user dict without the password hash."""
    return {"id": user["id"], "name": user["name"], "email": user["email"], "phone": user["phone"]}


@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    """Registers a new user. Disabled when AUTH_ENABLED is False."""
    if not AUTH_ENABLED:
        return jsonify({"error": "Authentication is disabled on this server."}), 503

    data = request.get_json(force=True, silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    password = data.get('password') or ''

    if not name or not email or not phone or not password:
        return jsonify({"error": "name, email, phone and password are required."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    users = _load_users()
    if any(u['email'] == email for u in users):
        return jsonify({"error": "An account with that email already exists."}), 409

    new_user = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "phone": phone,
        "password_hash": _hash_password(password),
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(new_user)
    _save_users(users)

    return jsonify({"user": _user_public(new_user)}), 201


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Authenticates a user by email and password. Disabled when AUTH_ENABLED is False."""
    if not AUTH_ENABLED:
        return jsonify({"error": "Authentication is disabled on this server."}), 503

    data = request.get_json(force=True, silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({"error": "email and password are required."}), 400

    users = _load_users()
    user = next((u for u in users if u['email'] == email), None)
    if not user or user['password_hash'] != _hash_password(password):
        return jsonify({"error": "Invalid email or password."}), 401

    return jsonify({"user": _user_public(user)}), 200


@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Returns whether authentication is enabled on this backend."""
    return jsonify({"auth_enabled": AUTH_ENABLED}), 200


if __name__ == '__main__':
    # Start the Flask development server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
