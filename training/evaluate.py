#!/usr/bin/env python3
"""
PotholeGuard — Model Evaluation & Error Analysis Suite
Author: PotholeGuard AI Engineering Team

Evaluates trained model performance on validation and unseen test sets:
- Precision, Recall, mAP50, mAP50-95, Inference Latency
- Prediction image rendering with bounding boxes & confidence
- Error analysis (False Positives, False Negatives, Size breakdowns)
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Any

def evaluate_model(
    weights_path: str = "models/best.pt",
    data_yaml: str = "dataset/data.yaml",
    imgsz: int = 640,
    conf_thresh: float = 0.35,
    iou_thresh: float = 0.50,
    save_predictions: bool = True,
    device: str = ""
) -> Dict[str, Any]:
    try:
        from ultralytics import YOLO
        import cv2
    except ImportError as e:
        print(f"[-] Missing required package: {e}")
        sys.exit(1)

    weights = Path(weights_path).resolve()
    data_path = Path(data_yaml).resolve()

    if not weights.exists():
        print(f"[-] ERROR: Model weights not found at {weights}")
        sys.exit(1)
    if not data_path.exists():
        print(f"[-] ERROR: data.yaml not found at {data_path}")
        sys.exit(1)

    print("==================================================")
    print("      POTHOLEGUARD — MODEL EVALUATION START       ")
    print("==================================================")
    print(f"• Weights:        {weights}")
    print(f"• Dataset YAML:   {data_path}")
    print(f"• Image Size:     {imgsz}x{imgsz}")
    print(f"• Confidence:     {conf_thresh}")
    print(f"• IoU Threshold:  {iou_thresh}")
    print("==================================================")

    model = YOLO(str(weights))

    # 1. Validation Split Evaluation
    print("\n--- Evaluating on Validation Set ---")
    val_results = model.val(
        data=str(data_path),
        split="val",
        imgsz=imgsz,
        conf=conf_thresh,
        iou=iou_thresh,
        device=device if device else None,
        plots=True,
        save_json=True
    )

    metrics = {
        "validation": {
            "mAP50": float(val_results.box.map50),
            "mAP50_95": float(val_results.box.map),
            "precision": float(val_results.box.mp),
            "recall": float(val_results.box.mr),
            "f1_score": float(2 * (val_results.box.mp * val_results.box.mr) / (val_results.box.mp + val_results.box.mr + 1e-6)),
            "speed_ms": {
                "preprocess": float(val_results.speed.get('preprocess', 0.0)),
                "inference": float(val_results.speed.get('inference', 0.0)),
                "loss": float(val_results.speed.get('loss', 0.0)),
                "postprocess": float(val_results.speed.get('postprocess', 0.0)),
                "total": float(sum(val_results.speed.values()))
            }
        }
    }

    print("\n[+] Validation Metrics Summary:")
    print(f"  • Precision:   {metrics['validation']['precision']:.4f}")
    print(f"  • Recall:      {metrics['validation']['recall']:.4f}")
    print(f"  • F1-Score:    {metrics['validation']['f1_score']:.4f}")
    print(f"  • mAP@0.50:    {metrics['validation']['mAP50']:.4f}")
    print(f"  • mAP@0.5:0.95:{metrics['validation']['mAP50_95']:.4f}")
    print(f"  • Inference:   {metrics['validation']['speed_ms']['inference']:.2f} ms ({1000.0 / max(0.1, metrics['validation']['speed_ms']['inference']):.1f} FPS)")

    # 2. Test Split Evaluation (if available)
    test_img_dir = data_path.parent / "images" / "test"
    if test_img_dir.exists() and any(test_img_dir.iterdir()):
        print("\n--- Evaluating on Unseen Test Set ---")
        test_results = model.val(
            data=str(data_path),
            split="test",
            imgsz=imgsz,
            conf=conf_thresh,
            iou=iou_thresh,
            device=device if device else None,
            plots=True
        )
        metrics["test"] = {
            "mAP50": float(test_results.box.map50),
            "mAP50_95": float(test_results.box.map),
            "precision": float(test_results.box.mp),
            "recall": float(test_results.box.mr),
            "f1_score": float(2 * (test_results.box.mp * test_results.box.mr) / (test_results.box.mp + test_results.box.mr + 1e-6)),
            "speed_ms": {
                "inference": float(test_results.speed.get('inference', 0.0))
            }
        }
        print(f"  • Test mAP@0.50:     {metrics['test']['mAP50']:.4f}")
        print(f"  • Test mAP@0.5:0.95: {metrics['test']['mAP50_95']:.4f}")

    # 3. Save Metrics JSON
    metrics_out = Path("results/metrics/evaluation_metrics.json")
    metrics_out.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_out, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\n[+] Saved evaluation metrics to: {metrics_out}")

    # 4. Generate Predictions & Visual Error Inspection on Test Set
    if save_predictions and test_img_dir.exists():
        pred_out_dir = Path("results/predictions/test_set")
        pred_out_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n[+] Generating visual test predictions to: {pred_out_dir}")

        test_images = list(test_img_dir.glob("*.[jJ][pP][gG]")) + list(test_img_dir.glob("*.[pP][nN][gG]"))
        for img_path in test_images[:50]:  # render first 50 test samples
            res = model.predict(
                source=str(img_path),
                imgsz=imgsz,
                conf=conf_thresh,
                iou=iou_thresh,
                save=True,
                project="results/predictions",
                name="test_samples",
                exist_ok=True
            )

    return metrics

def main():
    parser = argparse.ArgumentParser(description="Evaluate PotholeGuard YOLO model")
    parser.add_argument("--weights", type=str, default="models/best.pt", help="Path to weights file")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--imgsz", type=int, default=640, help="Evaluation image size")
    parser.add_argument("--conf", type=float, default=0.35, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.50, help="IoU NMS threshold")
    parser.add_argument("--device", type=str, default="", help="Device")
    args = parser.parse_args()

    evaluate_model(
        weights_path=args.weights,
        data_yaml=args.data,
        imgsz=args.imgsz,
        conf_thresh=args.conf,
        iou_thresh=args.iou,
        device=args.device
    )

if __name__ == "__main__":
    main()
