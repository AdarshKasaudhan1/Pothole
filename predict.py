import os
import sys
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def run_prediction(source_path: str, model_path: str = "models/best.pt", output_dir: str = "results/predictions"):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[-] Please install ultralytics: pip install ultralytics")
        sys.exit(1)
        
    src = Path(source_path).resolve()
    if not src.exists():
        print(f"[-] Image not found: {src}")
        sys.exit(1)
        
    weights = Path(model_path).resolve()
    if not weights.exists():
        fallback = Path("runs/classify/pothole_training/weights/best.pt").resolve()
        if fallback.exists():
            weights = fallback
        else:
            print(f"[-] Model weights not found at {weights}")
            sys.exit(1)
            
    model = YOLO(str(weights))
    results = model.predict(source=str(src), save=False)
    
    res = results[0]
    top1_idx = res.probs.top1
    top1_conf = float(res.probs.top1conf)
    top1_label = res.names[top1_idx]
    
    print("==================================================")
    print("             POTHOLEGUARD PREDICTION              ")
    print("==================================================")
    print(f"• Input Image:  {src.name}")
    print(f"• Prediction:   {top1_label.upper()}")
    print(f"• Confidence:   {top1_conf * 100:.2f}%")
    print(f"• All Probs:    {', '.join([f'{res.names[i]}: {float(res.probs.data[i])*100:.1f}%' for i in range(len(res.names))])}")
    print("==================================================")
    
    # Save visual result
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_img_path = out_dir / f"pred_{src.name}"
    
    try:
        img = Image.open(src).convert("RGB")
        draw = ImageDraw.Draw(img)
        
        # Color coding: Red/Orange for Pothole, Green for Normal
        color = "#ef4444" if "pothole" in top1_label.lower() else "#22c55e"
        badge_text = f" {top1_label.upper()}: {top1_conf*100:.1f}% "
        
        # Draw header banner
        draw.rectangle([0, 0, img.width, 40], fill="#0f172a")
        draw.text((10, 10), badge_text, fill=color)
        
        img.save(out_img_path)
        print(f"[+] Annotated image saved to: {out_img_path.resolve()}")
    except Exception as e:
        print(f"[-] Could not save annotated image: {e}")

def main():
    parser = argparse.ArgumentParser(description="PotholeGuard — Test image prediction")
    parser.add_argument("--source", type=str, required=True, help="Path to input image")
    parser.add_argument("--model", type=str, default="models/best.pt", help="Path to model weights")
    parser.add_argument("--out", type=str, default="results/predictions", help="Output directory")
    args = parser.parse_args()
    
    run_prediction(args.source, args.model, args.out)

if __name__ == "__main__":
    main()
