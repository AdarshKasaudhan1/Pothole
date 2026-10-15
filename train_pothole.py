import os
import sys
import shutil
from pathlib import Path
import torch

try:
    from ultralytics import YOLO
except ImportError:
    print("[-] Ultralytics not yet installed. Please run: pip install ultralytics")
    sys.exit(1)

def main():
    print("==================================================")
    print("       POTHOLEGUARD — YOLO TRAINING START         ")
    print("==================================================")
    
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"• Hardware Device: {device} ({'GPU' if device != 'cpu' else 'CPU'})")
    
    data_dir = Path("D:/Pothhole/dataset/classification").resolve()
    print(f"• Dataset Path:    {data_dir}")
    
    # Load model
    try:
        model = YOLO("yolo11n-cls.pt")
        print("• Model:           YOLO11n-cls")
    except Exception as e:
        print(f"[-] YOLO11n-cls fallback: {e}")
        model = YOLO("yolov8n-cls.pt")
        print("• Model:           YOLOv8n-cls")
        
    project_dir = "runs/classify"
    run_name = "pothole_training"
    
    # Train
    print("\n--- Training Model ---")
    results = model.train(
        data=str(data_dir),
        epochs=30,
        imgsz=224,
        batch=16,
        patience=15,
        device=device,
        project=project_dir,
        name=run_name,
        seed=42,
        save=True,
        plots=True,
        verbose=True
    )
    
    # Copy best weights to models/best.pt
    best_weight_path = Path(project_dir) / run_name / "weights" / "best.pt"
    models_dir = Path("models")
    models_dir.mkdir(parents=True, exist_ok=True)
    
    dst_best = models_dir / "best.pt"
    if best_weight_path.exists():
        shutil.copy2(best_weight_path, dst_best)
        print(f"\n[+] Saved best model weights to: {dst_best.resolve()}")
    
    # Evaluate on validation / test
    print("\n--- Evaluating Model ---")
    val_metrics = model.val(data=str(data_dir), split="val")
    
    top1 = val_metrics.top1
    top5 = val_metrics.top5
    
    print("\n==================================================")
    print("             MODEL TRAINING COMPLETE              ")
    print("==================================================")
    print(f"Best model:    {dst_best.resolve()}")
    print(f"Validation Top-1 Accuracy: {top1:.4f} ({top1*100:.2f}%)")
    print(f"Validation Top-5 Accuracy: {top5:.4f} ({top5*100:.2f}%)")
    print("Classes:       normal, potholes")
    print("==================================================")

if __name__ == "__main__":
    main()
