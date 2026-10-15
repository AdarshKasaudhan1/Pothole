from pathlib import Path
from ultralytics import YOLO

def main():
    model = YOLO("D:/Pothhole/models/best.pt")
    data_dir = Path("D:/Pothhole/dataset/classification").resolve()
    metrics = model.val(data=str(data_dir), split="test")
    
    print("==================================================")
    print("             TEST SET EVALUATION                  ")
    print("==================================================")
    print(f"• Test Top-1 Accuracy: {metrics.top1:.4f} ({metrics.top1*100:.2f}%)")
    print(f"• Test Top-5 Accuracy: {metrics.top5:.4f} ({metrics.top5*100:.2f}%)")
    print(f"• Inference Latency:   {metrics.speed.get('inference', 0.0):.2f} ms")
    print("==================================================")

if __name__ == "__main__":
    main()
