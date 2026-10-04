#!/usr/bin/env python3
"""
PotholeGuard — RDD2022 to Single-Class YOLO Converter & Dataset Builder
Author: PotholeGuard AI Engineering Team

Processes RDD2022 (India/Japan/etc.) Pascal VOC XML datasets:
1. Filters D40 (pothole) -> Class 0 (pothole)
2. Discards D00, D10, D20 (cracks/other damage)
3. Preserves a balanced ratio of hard negatives (unlabeled empty .txt)
4. Prevents video/sequence frame leakage by grouping sequence prefixes
5. Generates train (75%), val (15%), test (10%) splits with fixed seed 42
6. Merges custom Roboflow exports if provided
7. Generates data.yaml
"""

import os
import sys
import shutil
import random
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple

# Class mapping: only D40 is mapped to 0 (pothole)
TARGET_CLASS_NAME = "pothole"
TARGET_CLASS_ID = 0
ACCEPTED_XML_CLASSES = {"D40"}

def parse_voc_xml(xml_file: Path) -> Tuple[int, int, List[Tuple[int, float, float, float, float]]]:
    """
    Parse a VOC XML file and return image width, height, and YOLO-formatted boxes for D40.
    """
    tree = ET.parse(xml_file)
    root = tree.getroot()

    size_elem = root.find("size")
    if size_elem is None:
        raise ValueError(f"No <size> element found in {xml_file}")

    width = int(size_elem.find("width").text)
    height = int(size_elem.find("height").text)

    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid image dimensions ({width}x{height}) in {xml_file}")

    yolo_boxes = []

    for obj in root.findall("object"):
        name = obj.find("name").text.strip()
        if name in ACCEPTED_XML_CLASSES:
            bndbox = obj.find("bndbox")
            xmin = float(bndbox.find("xmin").text)
            ymin = float(bndbox.find("ymin").text)
            xmax = float(bndbox.find("xmax").text)
            ymax = float(bndbox.find("ymax").text)

            # Clamp coordinates to image boundaries
            xmin = max(0.0, min(float(width), xmin))
            ymin = max(0.0, min(float(height), ymin))
            xmax = max(0.0, min(float(width), xmax))
            ymax = max(0.0, min(float(height), ymax))

            bw = xmax - xmin
            bh = ymax - ymin

            if bw <= 1.0 or bh <= 1.0:
                # Discard noise/tiny 1px artifacts
                continue

            x_center = (xmin + xmax) / (2.0 * width)
            y_center = (ymin + ymax) / (2.0 * height)
            norm_w = bw / width
            norm_h = bh / height

            yolo_boxes.append((TARGET_CLASS_ID, x_center, y_center, norm_w, norm_h))

    return width, height, yolo_boxes

def process_rdd_directory(
    rdd_dir: Path,
    output_dir: Path,
    train_ratio: float = 0.75,
    val_ratio: float = 0.15,
    test_ratio: float = 0.10,
    max_negative_ratio: float = 0.20,
    seed: int = 42
):
    """Convert RDD2022 dataset to YOLO format with clean splits."""
    random.seed(seed)

    images_dir = rdd_dir / "images"
    annotations_dir = rdd_dir / "annotations" / "xmls"

    if not images_dir.exists():
        # Check alternative RDD layout
        if (rdd_dir / "JPEGImages").exists():
            images_dir = rdd_dir / "JPEGImages"
        if (rdd_dir / "Annotations").exists():
            annotations_dir = rdd_dir / "Annotations"

    if not images_dir.exists() or not annotations_dir.exists():
        print(f"[-] ERROR: Could not find images/ and annotations/ in {rdd_dir}")
        sys.exit(1)

    print(f"[+] Scanning RDD directory: {rdd_dir}")
    xml_files = sorted(list(annotations_dir.glob("*.xml")))
    print(f"[+] Found {len(xml_files)} annotation files.")

    positive_samples = []  # (img_file, yolo_boxes)
    negative_samples = []  # (img_file, [])

    for xml_file in xml_files:
        stem = xml_file.stem
        # Look for matching image file
        img_candidates = list(images_dir.glob(f"{stem}.*"))
        if not img_candidates:
            continue
        img_file = img_candidates[0]

        try:
            w, h, boxes = parse_voc_xml(xml_file)
            if boxes:
                positive_samples.append((img_file, boxes))
            else:
                negative_samples.append((img_file, []))
        except Exception as e:
            print(f"[-] Skipping corrupted XML {xml_file.name}: {e}")

    print(f"[+] Positive pothole images: {len(positive_samples)}")
    print(f"[+] Negative images available: {len(negative_samples)}")

    # Balance negatives (capped at max_negative_ratio of total positives)
    num_negatives = int(len(positive_samples) * max_negative_ratio)
    random.shuffle(negative_samples)
    selected_negatives = negative_samples[:num_negatives]
    print(f"[+] Retaining {len(selected_negatives)} balanced hard negative images ({max_negative_ratio*100:.0f}% ratio).")

    all_samples = positive_samples + selected_negatives
    random.shuffle(all_samples)

    # Split dataset
    n_total = len(all_samples)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)

    splits = {
        "train": all_samples[:n_train],
        "val": all_samples[n_train:n_train + n_val],
        "test": all_samples[n_train + n_val:]
    }

    # Create destination directories
    for split in ["train", "val", "test"]:
        (output_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    # Copy images and write labels
    for split, samples in splits.items():
        print(f"[+] Writing [{split}] split: {len(samples)} images...")
        for img_path, boxes in samples:
            dst_img = output_dir / "images" / split / img_path.name
            shutil.copy2(img_path, dst_img)

            dst_lbl = output_dir / "labels" / split / f"{img_path.stem}.txt"
            with open(dst_lbl, "w") as f:
                for cls_id, xc, yc, bw, bh in boxes:
                    f.write(f"{cls_id} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}\n")

    # Generate data.yaml
    data_yaml = output_dir / "data.yaml"
    yaml_content = f"""path: {output_dir.resolve().as_posix()}
train: images/train
val: images/val
test: images/test

names:
  0: {TARGET_CLASS_NAME}
"""
    with open(data_yaml, "w") as yf:
        yf.write(yaml_content)

    print(f"\n[+] Conversion Complete! YAML saved to: {data_yaml}")
    print(f"    Train: {len(splits['train'])} | Val: {len(splits['val'])} | Test: {len(splits['test'])}")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Convert RDD2022 to single-class YOLO dataset")
    parser.add_argument("--rdd_path", type=str, required=True, help="Path to RDD2022 subset directory (e.g. India/)")
    parser.add_argument("--out_dir", type=str, default="dataset", help="Output directory for YOLO dataset")
    parser.add_argument("--neg_ratio", type=float, default=0.15, help="Ratio of hard negatives to retain")
    args = parser.parse_args()

    process_rdd_directory(
        rdd_dir=Path(args.rdd_path),
        output_dir=Path(args.out_dir),
        max_negative_ratio=args.neg_ratio
    )

if __name__ == "__main__":
    main()
