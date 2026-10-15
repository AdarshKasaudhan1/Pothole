import os
import sys
import shutil
import zipfile
import random
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

def prepare_dataset():
    zip_path = Path("D:/Pothhole/dataset/pothole.zip")
    extract_dir = Path("D:/Pothhole/dataset/pothole_raw_voc")
    output_dir = Path("D:/Pothhole/dataset/yolov7_data")
    
    # 1. Unzip
    print("[1/4] Extracting pothole.zip...")
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)
    
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_dir)
        
    # Find images and xml files
    img_files = list(extract_dir.rglob("*.jpg")) + list(extract_dir.rglob("*.jpeg")) + list(extract_dir.rglob("*.png"))
    print(f"Discovered {len(img_files)} images in archive.")
    
    # 2. Match Images with XMLs & Validate
    print("[2/4] Validating images and converting Pascal VOC XML to YOLO format...")
    valid_samples = [] # list of (img_path, list of (cls_id, xc, yc, bw, bh))
    corrupt_count = 0
    missing_xml_count = 0
    invalid_box_count = 0
    total_boxes = 0
    
    for img_p in sorted(img_files):
        # Integrity check
        try:
            with Image.open(img_p) as im:
                im.verify()
            with Image.open(img_p) as im:
                img_w, img_h = im.size
        except Exception as e:
            print(f"Corrupt image {img_p.name}: {e}")
            corrupt_count += 1
            continue
            
        xml_p = img_p.with_suffix(".xml")
        if not xml_p.exists():
            missing_xml_count += 1
            continue
            
        # Parse XML
        boxes = []
        try:
            tree = ET.parse(xml_p)
            root = tree.getroot()
            
            # Read size if in xml, else use PIL size
            size_tag = root.find("size")
            if size_tag is not None:
                w_tag = size_tag.find("width")
                h_tag = size_tag.find("height")
                if w_tag is not None and int(w_tag.text) > 0:
                    img_w = int(w_tag.text)
                if h_tag is not None and int(h_tag.text) > 0:
                    img_h = int(h_tag.text)
                    
            for obj in root.findall("object"):
                name = obj.find("name").text.strip().lower()
                # Target class: pothole -> 0
                if "pothole" in name:
                    cls_id = 0
                else:
                    continue
                    
                bndbox = obj.find("bndbox")
                xmin = float(bndbox.find("xmin").text)
                ymin = float(bndbox.find("ymin").text)
                xmax = float(bndbox.find("xmax").text)
                ymax = float(bndbox.find("ymax").text)
                
                # Clamp coordinates to image boundaries
                xmin = max(0.0, min(float(img_w), xmin))
                ymin = max(0.0, min(float(img_h), ymin))
                xmax = max(0.0, min(float(img_w), xmax))
                ymax = max(0.0, min(float(img_h), ymax))
                
                bw = xmax - xmin
                bh = ymax - ymin
                if bw <= 1.0 or bh <= 1.0:
                    invalid_box_count += 1
                    continue
                    
                # Normalize 0..1
                xc = (xmin + xmax) / (2.0 * img_w)
                yc = (ymin + ymax) / (2.0 * img_h)
                nw = bw / float(img_w)
                nh = bh / float(img_h)
                
                # Final boundary check
                if 0.0 <= xc <= 1.0 and 0.0 <= yc <= 1.0 and 0.0 < nw <= 1.0 and 0.0 < nh <= 1.0:
                    boxes.append((cls_id, xc, yc, nw, nh))
                    total_boxes += 1
                else:
                    invalid_box_count += 1
                    
        except Exception as e:
            print(f"Error parsing XML {xml_p.name}: {e}")
            continue
            
        valid_samples.append((img_p, boxes))
        
    print(f"Valid image-annotation pairs: {len(valid_samples)}")
    print(f"Total valid pothole bounding boxes: {total_boxes}")
    print(f"Corrupted images: {corrupt_count}")
    print(f"Missing annotations: {missing_xml_count}")
    print(f"Invalid bounding boxes filtered: {invalid_box_count}")
    
    # 3. Split 80% train, 10% val, 10% test
    print("[3/4] Creating 80/10/10 train/val/test splits...")
    random.seed(42)
    random.shuffle(valid_samples)
    
    n_total = len(valid_samples)
    n_train = int(n_total * 0.80)
    n_val = int(n_total * 0.10)
    
    splits = {
        "train": valid_samples[:n_train],
        "val": valid_samples[n_train:n_train + n_val],
        "test": valid_samples[n_train + n_val:]
    }
    
    # Prepare output directories
    if output_dir.exists():
        shutil.rmtree(output_dir)
        
    for s in ["train", "val", "test"]:
        (output_dir / "images" / s).mkdir(parents=True, exist_ok=True)
        (output_dir / "labels" / s).mkdir(parents=True, exist_ok=True)
        
    split_counts = {}
    for s_name, samples in splits.items():
        box_cnt = 0
        for img_p, boxes in samples:
            # Copy image
            dst_img = output_dir / "images" / s_name / img_p.name
            shutil.copy2(img_p, dst_img)
            
            # Write YOLO format label .txt
            dst_lbl = output_dir / "labels" / s_name / f"{img_p.stem}.txt"
            with open(dst_lbl, "w") as lf:
                for cls_id, xc, yc, nw, nh in boxes:
                    lf.write(f"{cls_id} {xc:.6f} {yc:.6f} {nw:.6f} {nh:.6f}\n")
                    box_cnt += 1
        split_counts[s_name] = (len(samples), box_cnt)
        
    # 4. Generate data.yaml for YOLOv7
    print("[4/4] Generating data.yaml for YOLOv7...")
    train_path = (output_dir / "images" / "train").resolve().as_posix()
    val_path = (output_dir / "images" / "val").resolve().as_posix()
    test_path = (output_dir / "images" / "test").resolve().as_posix()
    
    yaml_content = f"""train: {train_path}
val: {val_path}
test: {test_path}

# Number of classes
nc: 1

# Class names
names: ['pothole']
"""
    yaml_file = output_dir / "data.yaml"
    with open(yaml_file, "w") as yf:
        yf.write(yaml_content.strip())
        
    print("\n==================================================")
    print("      YOLOv7 DATASET PREPARATION REPORT           ")
    print("==================================================")
    print(f"Total images:       {n_total}")
    print(f"Training:           {split_counts['train'][0]} images ({split_counts['train'][1]} pothole boxes)")
    print(f"Validation:         {split_counts['val'][0]} images ({split_counts['val'][1]} pothole boxes)")
    print(f"Testing:            {split_counts['test'][0]} images ({split_counts['test'][1]} pothole boxes)")
    print(f"Classes:            1 ('pothole' -> Class 0)")
    print(f"Annotation format:  YOLO (converted from Pascal VOC XML)")
    print(f"Configuration YAML: {yaml_file.resolve()}")
    print("==================================================")

if __name__ == "__main__":
    prepare_dataset()
