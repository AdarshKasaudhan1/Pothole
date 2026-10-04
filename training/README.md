# PotholeGuard AI — Model Training & Dataset Engineering

This directory contains the complete pipeline for dataset validation, training, evaluating, and exporting the **YOLO11n** single-class pothole detection model for **PotholeGuard**.

---

## 📁 Directory Structure

```
d:/Pothhole/
├── dataset/
│   ├── images/
│   │   ├── train/
│   │   ├── val/
│   │   └── test/
│   ├── labels/
│   │   ├── train/
│   │   ├── val/
│   │   └── test/
│   └── data.yaml
│
├── training/
│   ├── PotholeGuard_Colab_Training.ipynb   # Complete Colab GPU pipeline
│   ├── dataset_check.py                    # Dataset integrity & sanity validation
│   ├── convert_rdd_to_yolo.py              # RDD2022 Pascal VOC to YOLO converter
│   ├── train.py                            # Standalone YOLO11n training script
│   ├── evaluate.py                         # Evaluation & error analysis
│   ├── export_onnx.py                      # ONNX export & numerical parity test
│   ├── requirements.txt                    # Python ML dependencies
│   └── README.md
│
├── results/
│   ├── metrics/                            # Quantitative reports (JSON/CSV)
│   ├── predictions/                        # Qualitative prediction images
│   ├── plots/                              # Loss, PR curves, F1 curves
│   └── error_analysis/                     # Diagnostic reports
│
└── models/
    ├── best.pt                             # PyTorch trained weights
    └── pothole.onnx                        # Verified browser ONNX model
```

---

## 🛠️ Step-by-Step Instructions

### Step 1: Install Dependencies
```bash
pip install -r training/requirements.txt
```

### Step 2: Dataset Preparation
1. **Option A — Roboflow Universe (YOLOv8 format)**:
   - Search for public pothole datasets (e.g., [Roboflow Universe](https://universe.roboflow.com)).
   - Download in **YOLOv8 format**.
   - Unzip into `dataset/` (ensuring `images/` and `labels/` match the structure).

2. **Option B — RDD2022 (India Subset)**:
   - Download the RDD2022 India dataset.
   - Run the automated converter (maps only `D40` &rarr; `0: pothole` and balances hard negatives):
   ```bash
   python training/convert_rdd_to_yolo.py --rdd_path /path/to/RDD2022_India --out_dir dataset --neg_ratio 0.15
   ```

### Step 3: Validate Dataset Integrity
Run the dataset sanity checker before training:
```bash
python training/dataset_check.py --data_dir dataset
```
This inspects:
* Normalized bounding box bounds `[0, 1]`
* Single class ID (`0`) constraint
* Duplicate / corrupt image detection
* Hard negative ratio verification

### Step 4: Train YOLO11n (Google Colab / Local GPU)
* **Google Colab (Recommended)**: Open [`training/PotholeGuard_Colab_Training.ipynb`](file:///d:/Pothhole/training/PotholeGuard_Colab_Training.ipynb), enable **T4 GPU**, and run all cells.
* **Local CLI**:
```bash
python training/train.py --data dataset/data.yaml --model yolo11n.pt --imgsz 640 --epochs 100 --batch 16 --patience 20
```

### Step 5: Evaluate & Run Error Analysis
```bash
python training/evaluate.py --weights models/best.pt --data dataset/data.yaml --imgsz 640
```

### Step 6: Export to ONNX & Verify Parity
```bash
python training/export_onnx.py --weights models/best.pt --out models/pothole.onnx --imgsz 640
```

---

## 🌐 ONNX Browser Integration Specification

| Parameter | Value | Details |
|---|---|---|
| **File Location** | `models/pothole.onnx` | Stored in app web root |
| **Input Node** | `images` | Shape: `[1, 3, 640, 640]`, `float32` (NCHW) |
| **Input Normalization** | RGB, `[0.0, 1.0]` | Divide RGB pixel values by 255.0 |
| **Output Node** | `output0` | Shape: `[1, 5, 8400]`, `float32` |
| **Output Format** | `[1, 5, 8400]` | Rows 0–3: `(x_center, y_center, width, height)` in pixels (0–640); Row 4: `pothole` confidence score |
