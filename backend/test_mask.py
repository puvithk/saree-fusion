import cv2
import numpy as np
import os

def generate_mask():
    img_path = r"d:\sareefusion project\saree-fusion\frontend\src\assets\red-saree.png"
    if not os.path.exists(img_path):
        print("Image not found at:", img_path)
        return

    img = cv2.imread(img_path)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Red has two ranges in HSV
    lower_red1 = np.array([0, 50, 40])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 50, 40])
    upper_red2 = np.array([180, 255, 255])
    
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    mask = mask1 + mask2
    
    # Clean up the mask with some morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    
    cv2.imwrite("saree_mask.png", mask)
    print("Mask written to saree_mask.png")

if __name__ == '__main__':
    generate_mask()
