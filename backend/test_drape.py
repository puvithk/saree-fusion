import cv2
import numpy as np
import os
from PIL import Image, ImageOps, ImageEnhance

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
    # Target size: 1200 x 400
    w, h = 1200, 400
    border_h = 60
    body_w = 900
    pallu_w = 300
    mid_h = h - (2 * border_h) # 280
    
    # Load inputs
    pallu = cv2.imread(pallu_path)
    border = cv2.imread(border_path)
    body = cv2.imread(body_path)
    
    # Resize border to heights matching border_h
    border_resized = cv2.resize(border, (int(border.shape[1] * (border_h / border.shape[0])), border_h))
    top_border = tile_image(border_resized, w, border_h)
    bottom_border = tile_image(border_resized, w, border_h)
    
    # Resize body and pallu to match mid_h height
    body_resized = cv2.resize(body, (int(body.shape[1] * (mid_h / body.shape[0])), mid_h))
    pallu_resized = cv2.resize(pallu, (int(pallu.shape[1] * (mid_h / pallu.shape[0])), mid_h))
    
    body_tiled = tile_image(body_resized, body_w, mid_h)
    pallu_tiled = tile_image(pallu_resized, pallu_w, mid_h)
    
    # Assemble middle section
    middle_sec = np.hstack((body_tiled, pallu_tiled))
    
    # Assemble final template
    template = np.vstack((top_border, middle_sec, bottom_border))
    
    # Add a nice black border or background for aesthetic layout
    canvas = np.zeros((h + 40, w + 40, 3), dtype=np.uint8)
    canvas[20:20+h, 20:20+w] = template
    
    cv2.imwrite(out_path, canvas)
    print(f"Template saved to {out_path}")

def drape_saree(model_path, body_path, border_path, out_path):
    """Drapes the custom body and border patterns onto the model's saree."""
    model = cv2.imread(model_path)
    h_m, w_m, c_m = model.shape
    
    # Convert model to HSV for masking
    hsv = cv2.cvtColor(model, cv2.COLOR_BGR2HSV)
    
    # --- 1. SEGMENT RED BODY ---
    lower_red1 = np.array([0, 40, 30])
    upper_red1 = np.array([12, 255, 255])
    lower_red2 = np.array([165, 40, 30])
    upper_red2 = np.array([180, 255, 255])
    
    mask_body1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask_body2 = cv2.inRange(hsv, lower_red2, upper_red2)
    mask_body = mask_body1 + mask_body2
    
    # Clean up body mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_body = cv2.morphologyEx(mask_body, cv2.MORPH_CLOSE, kernel)
    mask_body = cv2.morphologyEx(mask_body, cv2.MORPH_OPEN, kernel)
    
    # --- 2. SEGMENT GOLD BORDER ---
    # Gold/yellow is around hue 15-30
    lower_gold = np.array([13, 30, 40])
    upper_gold = np.array([35, 255, 255])
    mask_border = cv2.inRange(hsv, lower_gold, upper_gold)
    
    # Clean up border mask
    mask_border = cv2.morphologyEx(mask_border, cv2.MORPH_CLOSE, kernel)
    mask_border = cv2.morphologyEx(mask_border, cv2.MORPH_OPEN, kernel)
    
    # Subtract body mask from border mask to prevent overlap
    mask_border = cv2.subtract(mask_border, mask_body)
    
    # Load swatches
    body_img = cv2.imread(body_path)
    border_img = cv2.imread(border_path)
    
    # Tile swatches to cover the size of the model image
    body_tiled = tile_image(body_img, w_m, h_m)
    border_tiled = tile_image(border_img, w_m, h_m)
    
    # Convert model image to grayscale (or use V channel from HSV/L channel from LAB)
    # This will be used as a shading map (multiplied with the textures to preserve folds/shadows)
    gray = cv2.cvtColor(model, cv2.COLOR_BGR2GRAY)
    
    # Normalize shading (0.0 to 1.0) with an offset so shadows aren't completely black
    shading = gray.astype(float) / 255.0
    # Enhance contrast of the shading map slightly
    shading = 0.3 + 0.7 * shading
    
    # Apply shading to body texture
    shaded_body = (body_tiled.astype(float) * shading[:, :, np.newaxis]).astype(np.uint8)
    # Apply shading to border texture
    shaded_border = (border_tiled.astype(float) * shading[:, :, np.newaxis]).astype(np.uint8)
    
    # Combine everything using masks
    result = model.copy()
    
    # Mask indices where body and border are present
    body_idx = mask_body > 0
    border_idx = mask_border > 0
    
    # Blend slightly at the edges for smoothness
    result[body_idx] = shaded_body[body_idx]
    result[border_idx] = shaded_border[border_idx]
    
    # Save the result
    cv2.imwrite(out_path, result)
    print(f"Wearable image saved to {out_path}")

if __name__ == '__main__':
    # Test paths
    pallu = r"d:\sareefusion project\saree-fusion\frontend\src\assets\pallu-swatch.png"
    border = r"d:\sareefusion project\saree-fusion\frontend\src\assets\border-swatch.png"
    body = r"d:\sareefusion project\saree-fusion\frontend\src\assets\body-swatch.png"
    model = r"d:\sareefusion project\saree-fusion\frontend\src\assets\red-saree.png"
    
    os.makedirs("test_out", exist_ok=True)
    generate_template(pallu, border, body, "test_out/template.png")
    drape_saree(model, body, border, "test_out/wearable.png")
