import os
import sys
import subprocess
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="PotholeGuard — YOLOv7 Test Pothole Detector")
    parser.add_argument("--source", type=str, required=True, help="Path to input image or video")
    parser.add_argument("--weights", type=str, default="models/best.pt", help="Path to YOLOv7 best.pt weights")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--img-size", type=int, default=640, help="Inference resolution")
    args = parser.parse_args()
    
    src = Path(args.source).resolve()
    if not src.exists():
        print(f"[-] Error: Image/video not found at: {src}")
        sys.exit(1)
        
    weights = Path(args.weights).resolve()
    if not weights.exists():
        fallback = Path("yolov7/runs/train/pothole_yolov7/weights/best.pt").resolve()
        if fallback.exists():
            weights = fallback
        else:
            print(f"[-] Error: Weights file not found at: {weights}")
            print("    Please place the trained best.pt into D:\\Pothhole\\models\\best.pt")
            sys.exit(1)
            
    yolov7_dir = Path("D:/Pothhole/yolov7").resolve()
    if not yolov7_dir.exists():
        print(f"[-] Error: yolov7 folder not found at {yolov7_dir}")
        sys.exit(1)
        
    out_project = Path("D:/Pothhole/results/yolov7_predictions").resolve()
    out_project.mkdir(parents=True, exist_ok=True)
    
    print("==================================================")
    print("       POTHOLEGUARD — YOLOv7 INFERENCE            ")
    print("==================================================")
    print(f"• Input:       {src}")
    print(f"• Model:       {weights}")
    print(f"• Confidence:  {args.conf}")
    print(f"• Output Dir:  {out_project}")
    print("==================================================")
    
    cmd = [
        sys.executable,
        "detect.py",
        "--weights", str(weights),
        "--conf", str(args.conf),
        "--img-size", str(args.img_size),
        "--source", str(src),
        "--project", str(out_project),
        "--name", "prediction",
        "--exist-ok"
    ]
    
    subprocess.run(cmd, cwd=str(yolov7_dir))
    print(f"\n[+] Detection complete! Check annotated result in: {out_project}\\prediction")

if __name__ == "__main__":
    main()
