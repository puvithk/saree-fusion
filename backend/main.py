import os
import shutil
import random
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import cv2
import numpy as np
from itertools import product
import json

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
    
    src_assets = os.path.join(SRC_STATIC, "assets")
    if os.path.exists(src_assets):
        for item in os.listdir(src_assets):
            s = os.path.join(src_assets, item)
            d = os.path.join(ASSETS_DIR, item)
            if not os.path.exists(d):
                if os.path.isdir(s):
                    shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)
                    
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

def generate_template(pallu_path, border_path, body_path, out_path):
    """Generates the flat saree template layout: top/bottom border, body, pallu."""
    w, h = 1200, 400
    border_h = 60
    body_w = 900
    pallu_w = 300
    mid_h = h - (2 * border_h) # 280
    
    pallu = cv2.imread(pallu_path)
    border = cv2.imread(border_path)
    body = cv2.imread(body_path)
    
    if pallu is None or border is None or body is None:
        print("Error: Missing one of the component images for template generation.")
        return False

    # Resize border to heights matching border_h
    border_resized = cv2.resize(border, (max(1, int(border.shape[1] * (border_h / border.shape[0]))), border_h))
    top_border = tile_image(border_resized, w, border_h)
    bottom_border = tile_image(border_resized, w, border_h)
    
    # Resize body and pallu to match mid_h height
    body_resized = cv2.resize(body, (max(1, int(body.shape[1] * (mid_h / body.shape[0]))), mid_h))
    pallu_resized = cv2.resize(pallu, (max(1, int(pallu.shape[1] * (mid_h / pallu.shape[0]))), mid_h))
    
    body_tiled = tile_image(body_resized, body_w, mid_h)
    pallu_tiled = tile_image(pallu_resized, pallu_w, mid_h)
    
    # Assemble middle section
    middle_sec = np.hstack((body_tiled, pallu_tiled))
    
    # Assemble final template
    template = np.vstack((top_border, middle_sec, bottom_border))
    
    # Add a nice padding background
    canvas = np.zeros((h + 40, w + 40, 3), dtype=np.uint8)
    canvas[20:20+h, 20:20+w] = template
    
    cv2.imwrite(out_path, canvas)
    return True

def drape_saree(model_path, body_path, border_path, out_path):
    """Drapes the custom body and border patterns onto the model's saree."""
    model = cv2.imread(model_path)
    if model is None:
        print(f"Error: Model image not found at {model_path}")
        return False
        
    h_m, w_m, c_m = model.shape
    
    # Convert model to HSV for masking
    hsv = cv2.cvtColor(model, cv2.COLOR_BGR2HSV)
    
    # Segment RED body region
    lower_red1 = np.array([0, 40, 30])
    upper_red1 = np.array([12, 255, 255])
    lower_red2 = np.array([165, 40, 30])
    upper_red2 = np.array([180, 255, 255])
    
    mask_body1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask_body2 = cv2.inRange(hsv, lower_red2, upper_red2)
    mask_body = mask_body1 + mask_body2
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_body = cv2.morphologyEx(mask_body, cv2.MORPH_CLOSE, kernel)
    mask_body = cv2.morphologyEx(mask_body, cv2.MORPH_OPEN, kernel)
    
    # Segment GOLD border region
    lower_gold = np.array([13, 30, 40])
    upper_gold = np.array([35, 255, 255])
    mask_border = cv2.inRange(hsv, lower_gold, upper_gold)
    mask_border = cv2.morphologyEx(mask_border, cv2.MORPH_CLOSE, kernel)
    mask_border = cv2.morphologyEx(mask_border, cv2.MORPH_OPEN, kernel)
    mask_border = cv2.subtract(mask_border, mask_body)
    
    # Load swatches
    body_img = cv2.imread(body_path)
    border_img = cv2.imread(border_path)
    
    if body_img is None or border_img is None:
        print("Error: Missing swatches for drape simulation.")
        return False
        
    # Tile swatches
    body_tiled = tile_image(body_img, w_m, h_m)
    border_tiled = tile_image(border_img, w_m, h_m)
    
    # Extract shading (Value channel)
    gray = cv2.cvtColor(model, cv2.COLOR_BGR2GRAY)
    shading = gray.astype(float) / 255.0
    shading = 0.3 + 0.7 * shading # keep shadows soft
    
    # Apply shading to textures
    shaded_body = (body_tiled.astype(float) * shading[:, :, np.newaxis]).astype(np.uint8)
    shaded_border = (border_tiled.astype(float) * shading[:, :, np.newaxis]).astype(np.uint8)
    
    result = model.copy()
    body_idx = mask_body > 0
    border_idx = mask_border > 0
    
    result[body_idx] = shaded_body[body_idx]
    result[border_idx] = shaded_border[border_idx]
    
    cv2.imwrite(out_path, result)
    return True

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

    p_list = pallus if len(pallus) > 0 else [{"label": "P1", "path": fallback_pallu, "url": "/api/static/assets/pallu-swatch.png"}]
    br_list = borders if len(borders) > 0 else [{"label": "BR1", "path": fallback_border, "url": "/api/static/assets/border-swatch.png"}]
    b_list = bodies if len(bodies) > 0 else [{"label": "B1", "path": fallback_body, "url": "/api/static/assets/body-swatch.png"}]
    
    # Compute Cartesian combinations
    combinations = list(product(p_list, br_list, b_list))
    
    designs = []
    for idx, (p, br, b) in enumerate(combinations):
        template_name = f"design_{idx}_template.png"
        wearable_name = f"design_{idx}_wearable.png"
        
        template_out = os.path.join(batch_dir, template_name)
        wearable_out = os.path.join(batch_dir, wearable_name)
        
        # Generate the simulation files
        generate_template(p["path"], br["path"], b["path"], template_out)
        drape_saree(fallback_model, b["path"], br["path"], wearable_out)
        
        designs.append({
            "id": f"{batch_id}-00{idx+1}",
            "name": f"Fusion Design {p['label']}-{br['label']}-{b['label']}",
            "image": f"/api/static/batches/{batch_id}/{wearable_name}",
            "templateImage": f"/api/static/batches/{batch_id}/{template_name}",
            "tags": [p["label"], br["label"], b["label"]],
            "matchPercent": f"{random.randint(78, 97)}% match"
        })
        
    # Gather thumbnails (use wearable images of first 3 designs or swatches)
    thumbnails = []
    if len(designs) > 0:
        thumbnails = [d["image"] for d in designs[:3]]
    else:
        thumbnails = ["/api/static/assets/pallu-swatch.png"]

    new_batch = {
        "id": batch_id,
        "name": "Fusion Batch",
        "status": "completed",
        "createdOn": now.strftime("%d %b %Y, %I.%M %p"),
        "palluCount": len(pallus),
        "borderCount": len(borders),
        "bodyCount": len(bodies),
        "totalDesigns": len(designs),
        "generatedDesigns": len(designs),
        "extraCount": max(0, len(designs) - 3),
        "description": description,
        "thumbnails": thumbnails,
        "uploadedComponents": {
            "pallu": [{"label": x["label"], "image": x["url"]} for x in pallus],
            "border": [{"label": x["label"], "image": x["url"]} for x in borders],
            "body": [{"label": x["label"], "image": x["url"]} for x in bodies]
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
    img = cv2.imread(template_path)
    if img is None:
        print(f"Error loading template for loom file generation: {template_path}")
        return False
        
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
    
    lift_plan = []
    for r in range(d_picks):
        row_bits = [("1" if thresh_d[r, c] == 255 else "0") for c in range(d_harnesses)]
        lift_plan.append(f"PICK {r+1:03d}: " + "".join(row_bits))
        
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
        
    return True

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
    
    relative_path = template_url.replace("/api/static/", "")
    local_path = os.path.join(STATIC_DIR, relative_path)
    
    if not os.path.exists(local_path):
        # Fallback to default red-saree or asset image
        local_path = os.path.join(ASSETS_DIR, "red-saree.png")
        if not os.path.exists(local_path):
            local_path = os.path.join(FRONTEND_ASSETS, "red-saree.png")

    order_dir = os.path.join(ORDERS_DIR, order_id)
    os.makedirs(order_dir, exist_ok=True)
    
    success = generate_loom_files(local_path, order_dir)
    
    if not success:
        return jsonify({"error": "Failed to generate loom files"}), 500
        
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

if __name__ == '__main__':
    # Start the Flask development server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
