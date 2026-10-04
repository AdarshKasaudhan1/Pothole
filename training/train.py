#!/usr/bin/env python3
"""
PotholeGuard — YOLO11n Training Pipeline
Author: PotholeGuard AI Engineering Team

Trains single-class YOLO11n pothole detector with:
- Reproducible random seed (42)
- Early stopping (patience=20)
- Road-optimized data augmentations (horizontal flip, lighting variation, mild tilt)
- Auto-saving best weights to models/best.pt
"""

import os
import sys
import argparse
import shutil
from pathlib import Path

def train_pothole_model(
    data_yaml: str = "dataset/data.yaml",
    model_name: str = "yolo11n.pt",
    imgsz: int = 640,
    epochs: int = 100,
    batch: int = 16,
    patience: int = 20,
    project_dir: str = "results/training",
    run_name: str = "yolo11n_pothole_v1",
    seed: int = 42,
    device: str = ""
):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[-] Ultralytics is not installed. Please run: pip install ultralytics")
        sys.exit(1)

    data_path = Path(data_yaml).resolve()
    if not data_path.exists():
        print(f"[-] ERROR: data.yaml not found at {data_path}")
        sys.exit(1)

    print("==================================================")
    print("       POTHOLEGUARD — YOLO11n TRAINING START       ")
    print("==================================================")
    print(f"• Base Model:       {model_name}")
    print(f"• Dataset YAML:     {data_path}")
    print(f"• Image Size:       {imgsz}x{imgsz}")
    print(f"• Epochs:           {epochs}")
    print(f"• Batch Size:       {batch}")
    print(f"• Early Patience:   {patience}")
    print(f"• Seed:             {seed}")
    print(f"• Project Dir:      {project_dir}")
    print("==================================================")

    # Initialize model
    try:
        model = YOLO(model_name)
    except Exception as e:
        print(f"[-] Failed to load {model_name}: {e}. Falling back to yolov8n.pt...")
        model = YOLO("yolov8n.pt")

    # Start training with road-scene optimized hyperparameters
    results = model.train(
        data=str(data_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        patience=patience,
        seed=seed,
        deterministic=True,
        project=project_dir,
        name=run_name,
        device=device if device else None,
        # Augmentations designed for two-wheeler road perspectives:
        hsv_h=0.015,     # subtle color tone variation
        hsv_s=0.6,       # saturation variation (monsoon wet / dry asphalt)
        hsv_v=0.4,       # brightness / shadow variation (overcast vs bright sunlight)
        degrees=5.0,     # slight bike tilt variation
        translate=0.1,   # frame shift
        scale=0.3,       # scale variation for near vs distant potholes
        fliplr=0.5,      # horizontal flip (road geometry is horizontally invariant)
        flipud=0.0,      # NO vertical flip (road is always bottom, sky is always top)
        mosaic=1.0,      # mosaic augmentation for contextual multi-scale learning
        mixup=0.0,       # avoid blending distinct road scenes
        copy_paste=0.0,
        save=True,
        save_period=-1,
        plots=True,
        verbose=True
    )

    # Copy best weights to models/best.pt
    run_dir = Path(project_dir) / run_name
    best_weight = run_dir / "weights" / "best.pt"
    models_dir = Path("models")
    models_dir.mkdir(parents=True, exist_ok=True)

    if best_weight.exists():
        dst_best = models_dir / "best.pt"
        shutil.copy2(best_weight, dst_best)
        print(f"\n[+] Successfully saved best model weights to: {dst_best.resolve()}")
    else:
        print(f"\n[-] Warning: Best weights not found at {best_weight}")

    return results

def main():
    parser = argparse.ArgumentParser(description="Train PotholeGuard YOLO model")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--model", type=str, default="yolo11n.pt", help="Pretrained model (yolo11n.pt / yolov8n.pt)")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--patience", type=int, default=20, help="Early stopping patience")
    parser.add_argument("--project", type=str, default="results/training", help="Project output folder")
    parser.add_argument("--name", type=str, default="yolo11n_pothole_v1", help="Run name")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--device", type=str, default="", help="Device (e.g. 0 or cpu)")
    args = parser.parse_args()

    train_pothole_model(
        data_yaml=args.data,
        model_name=args.model,
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        patience=args.patience,
        project_dir=args.project,
        run_name=args.name,
        seed=args.seed,
        device=args.device
    )

if __name__ == "__main__":
    main()
