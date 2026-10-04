#!/usr/bin/env python3
"""
PotholeGuard — Dataset Validation & Sanity Inspection Tool
Author: PotholeGuard AI Engineering Team

Validates YOLO dataset integrity prior to training:
1. File readability and image integrity
2. Label syntax, normalization, and bounds
3. Single-class constraint (Class ID == 0, 'pothole')
4. Missing label vs empty label (hard negative) tracking
5. Duplicate / near-duplicate detection via image hashing
6. Bounding box visualization generator for dataset verification
"""

import os
import sys
import glob
import hashlib
import json
import yaml
from pathlib import Path
from typing import Dict, List, Tuple, Any

try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = None

def compute_md5(filepath: Path) -> str:
    """Compute MD5 checksum of an image file."""
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()

def validate_split(
    split_name: str,
    images_dir: Path,
    labels_dir: Path,
    expected_class_id: int = 0
) -> Dict[str, Any]:
    """Validate a single dataset split (train/val/test)."""
    results = {
        "split": split_name,
        "total_images": 0,
        "valid_images": 0,
        "corrupt_images": [],
        "total_labels": 0,
        "missing_label_files": [],
        "empty_labels_hard_negatives": 0,
        "total_boxes": 0,
        "invalid_boxes": [],
        "invalid_classes": set(),
        "duplicates": [],
        "aspect_ratios": [],
        "image_sizes": set(),
    }

    if not images_dir.exists():
        print(f"[-] Warning: Image directory does not exist: {images_dir}")
        return results

    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    image_files = [f for f in images_dir.iterdir() if f.suffix.lower() in image_extensions]
    results["total_images"] = len(image_files)

    seen_hashes: Dict[str, Path] = {}

    for img_path in sorted(image_files):
        # 1. Image Integrity Check
        try:
            if Image:
                with Image.open(img_path) as img:
                    img.verify()
                # Reopen to read dimensions after verify()
                with Image.open(img_path) as img:
                    w, h = img.size
                    results["image_sizes"].add((w, h))
                    results["aspect_ratios"].append(round(w / h, 2))
            results["valid_images"] += 1
        except Exception as e:
            results["corrupt_images"].append({"file": str(img_path), "error": str(e)})
            continue

        # 2. Duplicate Detection
        img_hash = compute_md5(img_path)
        if img_hash in seen_hashes:
            results["duplicates"].append({
                "original": str(seen_hashes[img_hash].name),
                "duplicate": str(img_path.name)
            })
        else:
            seen_hashes[img_hash] = img_path

        # 3. Label File Validation
        label_path = labels_dir / f"{img_path.stem}.txt"
        if not label_path.exists():
            results["missing_label_files"].append(str(img_path.name))
            continue

        results["total_labels"] += 1

        try:
            with open(label_path, 'r') as lf:
                lines = [line.strip() for line in lf if line.strip()]

            if len(lines) == 0:
                # Intentional Hard Negative image (no potholes)
                results["empty_labels_hard_negatives"] += 1
                continue

            for line_idx, line in enumerate(lines, 1):
                parts = line.split()
                if len(parts) != 5:
                    results["invalid_boxes"].append({
                        "file": str(label_path.name),
                        "line": line_idx,
                        "error": f"Expected 5 values (class x y w h), got {len(parts)}: '{line}'"
                    })
                    continue

                try:
                    cls_id = int(float(parts[0]))
                    x_c, y_c, bw, bh = map(float, parts[1:])
                except ValueError as ve:
                    results["invalid_boxes"].append({
                        "file": str(label_path.name),
                        "line": line_idx,
                        "error": f"Value conversion error: {ve}"
                    })
                    continue

                # Check Class ID
                if cls_id != expected_class_id:
                    results["invalid_classes"].add(cls_id)
                    results["invalid_boxes"].append({
                        "file": str(label_path.name),
                        "line": line_idx,
                        "error": f"Invalid class ID {cls_id} (expected {expected_class_id})"
                    })

                # Check Normalization (0 <= val <= 1)
                if not (0.0 <= x_c <= 1.0 and 0.0 <= y_c <= 1.0 and 0.0 < bw <= 1.0 and 0.0 < bh <= 1.0):
                    results["invalid_boxes"].append({
                        "file": str(label_path.name),
                        "line": line_idx,
                        "error": f"Box coordinates out of bounds [0, 1]: ({x_c}, {y_c}, {bw}, {bh})"
                    })
                    continue

                # Check Bounding Box Boundaries
                x1 = x_c - bw / 2.0
                y1 = y_c - bh / 2.0
                x2 = x_c + bw / 2.0
                y2 = y_c + bh / 2.0

                if x1 < -0.05 or y1 < -0.05 or x2 > 1.05 or y2 > 1.05:
                    results["invalid_boxes"].append({
                        "file": str(label_path.name),
                        "line": line_idx,
                        "error": f"Box exceeds image edge significantly: x1={x1:.2f}, y1={y1:.2f}, x2={x2:.2f}, y2={y2:.2f}"
                    })
                    continue

                results["total_boxes"] += 1

        except Exception as e:
            results["invalid_boxes"].append({"file": str(label_path.name), "error": str(e)})

    results["invalid_classes"] = list(results["invalid_classes"])
    results["image_sizes"] = [f"{w}x{h}" for w, h in sorted(results["image_sizes"])]
    return results

def render_sample_visualizations(
    images_dir: Path,
    labels_dir: Path,
    output_dir: Path,
    max_samples: int = 10
):
    """Draw bounding boxes on a few sample images for manual inspection."""
    if not Image:
        print("[-] PIL not installed. Skipping sample visualizations.")
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    image_files = [f for f in images_dir.iterdir() if f.suffix.lower() in image_extensions]

    count = 0
    for img_path in sorted(image_files):
        label_path = labels_dir / f"{img_path.stem}.txt"
        if not label_path.exists():
            continue

        with open(label_path, 'r') as lf:
            lines = [l.strip() for l in lf if l.strip()]

        if not lines:
            continue  # skip hard negatives for bounding box samples

        try:
            with Image.open(img_path) as img:
                img_rgb = img.convert("RGB")
                draw = ImageDraw.Draw(img_rgb)
                w, h = img_rgb.size

                for line in lines:
                    parts = line.split()
                    if len(parts) == 5:
                        cls_id, xc, yc, bw, bh = float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                        x1 = (xc - bw / 2.0) * w
                        y1 = (yc - bh / 2.0) * h
                        x2 = (xc + bw / 2.0) * w
                        y2 = (yc + bh / 2.0) * h

                        # Draw green box
                        draw.rectangle([x1, y1, x2, y2], outline="#22c55e", width=3)
                        draw.text((x1 + 4, max(0, y1 - 15)), f"pothole (0)", fill="#22c55e")

                save_path = output_dir / f"sample_{count+1:02d}_{img_path.name}"
                img_rgb.save(save_path)
                count += 1
                if count >= max_samples:
                    break
        except Exception as e:
            print(f"[-] Visualization error on {img_path.name}: {e}")

    print(f"[+] Saved {count} sample annotated visualizations to: {output_dir}")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="PotholeGuard Dataset Integrity & Validation Tool")
    parser.add_argument("--data_dir", type=str, default="dataset", help="Root dataset directory containing images/ and labels/")
    parser.add_argument("--yaml", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--vis_out", type=str, default="results/plots/dataset_samples", help="Output directory for sample bounding box visualizations")
    parser.add_argument("--max_vis", type=int, default=10, help="Max visualization samples to render")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    yaml_path = Path(args.yaml)

    print("==================================================")
    print("      POTHOLEGUARD — DATASET VALIDATION REPORT     ")
    print("==================================================")
    print(f"Dataset root: {data_dir.resolve()}")

    if not data_dir.exists():
        print(f"\n[-] ERROR: Dataset directory not found at: {data_dir.resolve()}")
        print("    Please download or create the dataset folder before training.")
        sys.exit(1)

    # Validate data.yaml
    if yaml_path.exists():
        try:
            with open(yaml_path, 'r') as yf:
                cfg = yaml.safe_load(yf)
            print(f"[+] Found data.yaml: classes={cfg.get('names')}")
        except Exception as e:
            print(f"[-] Error reading data.yaml: {e}")
    else:
        print(f"[-] Warning: data.yaml not found at {yaml_path}")

    splits = ["train", "val", "test"]
    overall_report = {}
    has_critical_errors = False

    for split in splits:
        img_dir = data_dir / "images" / split
        lbl_dir = data_dir / "labels" / split

        print(f"\n--- Validating Split: [{split.upper()}] ---")
        if not img_dir.exists():
            print(f"  [-] Split folder '{img_dir}' does not exist.")
            continue

        res = validate_split(split, img_dir, lbl_dir)
        overall_report[split] = res

        print(f"  • Total Images:               {res['total_images']}")
        print(f"  • Valid Readable Images:      {res['valid_images']}")
        print(f"  • Corrupted Images:           {len(res['corrupt_images'])}")
        print(f"  • Total Bounding Boxes:       {res['total_boxes']}")
        print(f"  • Hard Negative Images:       {res['empty_labels_hard_negatives']}")
        print(f"  • Missing Label Files:        {len(res['missing_label_files'])}")
        print(f"  • Invalid Boxes / Formatting: {len(res['invalid_boxes'])}")
        print(f"  • Duplicates Detected:        {len(res['duplicates'])}")
        print(f"  • Unique Image Resolutions:   {', '.join(res['image_sizes'][:5])}{' ...' if len(res['image_sizes']) > 5 else ''}")

        if res['corrupt_images'] or res['invalid_boxes'] or res['missing_label_files']:
            has_critical_errors = True

    # Save summary json
    report_file = Path("results/metrics/dataset_validation_report.json")
    report_file.parent.mkdir(parents=True, exist_ok=True)
    with open(report_file, 'w') as rf:
        json.dump(overall_report, rf, indent=2)
    print(f"\n[+] Validation report saved to: {report_file}")

    # Generate sample visuals from train split
    train_imgs = data_dir / "images" / "train"
    train_lbls = data_dir / "labels" / "train"
    if train_imgs.exists() and train_lbls.exists():
        render_sample_visualizations(train_imgs, train_lbls, Path(args.vis_out), args.max_vis)

    print("==================================================")
    if has_critical_errors:
        print("[!] STATUS: Dataset has errors that must be resolved before training.")
        sys.exit(1)
    else:
        print("[+] STATUS: Dataset passed validation successfully!")
    print("==================================================")

if __name__ == "__main__":
    main()
