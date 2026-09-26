# AI Model Training Guide — PotholeGuard

Complete guide to building the pothole-detection model, from zero to a working `pothole.onnx` file. This is manual work — a coding agent cannot collect data or train a model for you.

---

## 1. Tool to use

**Ultralytics YOLO**, trained in **Google Colab** (free GPU), exported to **ONNX** for the browser.

| Why this choice | Detail |
|---|---|
| Free GPU | Colab gives a free T4 GPU — no local GPU needed |
| Small, fast models | YOLO11n / YOLOv8n ("nano") are made for real-time mobile/edge use |
| One-line export | Ultralytics exports directly to ONNX, TFLite, or other formats |
| Runs in-browser | ONNX Runtime Web loads the exported `.onnx` file with no server |

- Ultralytics docs: https://docs.ultralytics.com
- Ultralytics ONNX export guide: https://docs.ultralytics.com/integrations/onnx/
- Google Colab: https://colab.research.google.com

**Alternative tools** (not needed, but worth knowing): Roboflow's own hosted training (paid tiers for best models), or training locally with PyTorch if you have a GPU laptop. Colab + Ultralytics is the free, simplest path.

---

## 2. Is a dataset required?

**Yes — you cannot train a detector without labeled pothole images.** You need bounding boxes (x, y, width, height) drawn around potholes in each image.

You have two complementary sources — use both if possible, or just the first if you're short on time.

### 2.1 Ready-made datasets (fastest start)

**Roboflow Universe** — public, pre-labeled pothole datasets, ready to download in YOLO format:
- https://universe.roboflow.com — search "pothole"
- Look for datasets with 1,000+ images and a license that allows your use (check the license tab on the dataset page)
- Download → format **YOLOv8** (also works for YOLO11) → gives you images + label `.txt` files + `data.yaml` already in the right structure

**RDD2022 (Road Damage Dataset 2022)** — includes an India subset, useful for realistic Indian road conditions:
- Project/paper: https://github.com/sekilab/RoadDamageDetector
- Data download (figshare): https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547
- Note: RDD2022 uses Pascal VOC XML annotations with 4 damage classes (D00, D10, D20, D40). **Only D40 = pothole.** You must filter and convert this to YOLO format (script below) and discard the other 3 classes.

### 2.2 Your own images (makes the project original, strongly recommended)

Public datasets don't reflect your exact conditions (Bengaluru roads, your camera, your mount angle, monsoon water-filled potholes). Add your own:

1. Record short videos with the phone mounted on the bike (a helper operates it, or ride slowly and safely) — cover: dry roads, wet roads, water-filled potholes, shadows, evening light.
2. Extract frames (~2 per second):
   ```bash
   ffmpeg -i ride.mp4 -vf fps=2 frames/%04d.jpg
   ```
3. Upload frames to a Roboflow project (free tier) and draw boxes around potholes with a single class named `pothole`: https://roboflow.com
   - Alternative labeling tool: CVAT — https://www.cvat.ai
4. Include **hard negatives**: photos of manhole covers, speed breakers, road patches, and puddles *without* potholes, left unlabeled (no boxes). This teaches the model what NOT to flag.
5. Aim for at least 200–500 of your own images to start; add more after field-testing reveals mistakes.
6. Export from Roboflow in **YOLOv8** format.

### 2.3 Merging multiple sources

Combine your Roboflow export + converted RDD2022 data into one dataset folder before training (script below handles this).

---

## 3. Converting RDD2022 to YOLO format (only if using RDD2022)

Ask your coding agent (or run yourself with any Python 3 + pip environment) to create this script:

```python
# convert_rdd_to_yolo.py
# Filters RDD2022 to keep only D40 (pothole), converts Pascal VOC XML -> YOLO txt,
# splits into train/val, and can merge in another already-YOLO dataset.
#
# Usage:
#   python convert_rdd_to_yolo.py /path/to/RDD2022_India --merge /path/to/roboflow_export
```

What it should do:
1. Parse each XML annotation; keep only boxes labeled `D40`; map to class id `0` (`pothole`); discard all other classes (`D00`, `D10`, `D20`).
2. Convert each kept box to YOLO format: `class x_center y_center width height` (all normalized 0–1).
3. Keep some images with no potholes as negative examples (empty label file), capped at ~20% of the dataset so negatives don't dominate.
4. Split randomly (fixed seed) 80% train / 20% val into:
   ```
   dataset/images/train, dataset/images/val
   dataset/labels/train, dataset/labels/val
   ```
5. Generate `dataset/data.yaml`:
   ```yaml
   path: /content/dataset
   train: images/train
   val: images/val
   names:
     0: pothole
   ```
6. Optional `--merge <folder>` flag: copy another YOLO-format dataset's images/labels into the same train/val folders, remapping all its classes to `0` (pothole).
7. Print final statistics: image counts per split, total pothole boxes, negative count.

---

## 4. Training in Google Colab

1. Zip your final `dataset/` folder (must contain `data.yaml`, `images/`, `labels/`) and upload it to Google Drive.
2. Open https://colab.research.google.com, create a new notebook.
3. **Runtime → Change runtime type → T4 GPU** (free tier).
4. Run these cells in order:

```python
# Cell 1 — install
!pip install -q ultralytics
```

```python
# Cell 2 — mount Drive and unzip dataset
from google.colab import drive
drive.mount('/content/drive')
!unzip -q /content/drive/MyDrive/dataset.zip -d /content/
# confirm dataset/data.yaml has correct paths
```

```python
# Cell 3 — train
from ultralytics import YOLO

model = YOLO("yolo11n.pt")   # if unavailable, use "yolov8n.pt"
model.train(
    data="/content/dataset/data.yaml",
    epochs=100,
    imgsz=640,
    batch=16,
    patience=20,              # stop early if no improvement
    project="/content/drive/MyDrive/runs",
    name="pothole_v1"
)
```

```python
# Cell 4 — evaluate
metrics = model.val()
print("mAP50:", metrics.box.map50)
print("precision:", metrics.box.mp)
print("recall:", metrics.box.mr)
```

```python
# Cell 5 — quick visual sanity check
best = YOLO("/content/drive/MyDrive/runs/pothole_v1/weights/best.pt")
results = best("/content/drive/MyDrive/some_pothole_photo.jpg", save=True)
# check the saved output image — does it actually draw correct boxes?
```

```python
# Cell 6 — export to ONNX for the browser
best.export(format="onnx", imgsz=640, simplify=True)
# creates best.onnx next to best.pt inside the weights folder — download it
```

**If your phone runs it too slowly later:** re-export with a smaller input size, e.g. `imgsz=416` or `imgsz=320`. Smaller input = faster inference, slightly lower accuracy.

---

## 5. What to look for in the results

| Metric | What it means | What's "good enough" for an MVP |
|---|---|---|
| `mAP50` | Overall detection accuracy at 50% overlap threshold | Aim for 0.5+ as a starting MVP baseline; higher is better |
| Precision | Of the potholes it flagged, how many were real | Higher = fewer false alarms |
| Recall | Of the real potholes, how many it found | Higher = fewer missed potholes |
| Visual check (Cell 5) | Does it actually look right on a real photo? | Always do this — metrics alone can mislead |

If accuracy is poor: usually means more/better data is needed (especially hard negatives and your own road conditions), not a bigger model.

---

## 6. Preparing the model for the app

1. Open the exported `best.onnx` in **Netron** (https://netron.app, runs entirely in your browser, no install).
2. Note down:
   - **Input shape** — typically `1x3x640x640`, float32, RGB, values 0–1, NCHW layout. Confirm yours; don't assume.
   - **Output shape** — typically `1x5x8400` for a one-class YOLOv8/YOLO11 model (4 box values + 1 class score, across 8400 candidate boxes). Confirm yours.
3. Rename the file to `pothole.onnx`.
4. Place it in your project at `models/pothole.onnx`.
5. Keep the exact input/output shape — you'll need to give these to your coding agent when it writes the in-browser inference code.

---

## 7. Retraining loop (after field testing)

Training once is not the end. After testing the app on real roads:

1. Identify frames where the app gave **false alarms** or **missed potholes** (from session logs / recordings).
2. Add those exact frames to your Roboflow project and label them correctly (false alarms become new hard negatives; missed potholes get boxes drawn).
3. Re-export the merged dataset, retrain (Cell 3 onward), re-export ONNX.
4. Replace `models/pothole.onnx`, redeploy the app, re-test the same route.
5. Compare before/after metrics — this comparison is strong evidence for your capstone report.

Repeat 2–3 times if time allows.

---

## 8. Quick reference — all links

| Purpose | Link |
|---|---|
| Ultralytics docs | https://docs.ultralytics.com |
| Ultralytics ONNX export | https://docs.ultralytics.com/integrations/onnx/ |
| Google Colab | https://colab.research.google.com |
| Roboflow | https://roboflow.com |
| Roboflow Universe (datasets) | https://universe.roboflow.com |
| RDD2022 project | https://github.com/sekilab/RoadDamageDetector |
| RDD2022 data (figshare) | https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547 |
| CVAT (alternative labeling tool) | https://www.cvat.ai |
| Netron (model inspector) | https://netron.app |
| ONNX Runtime Web (used by the app) | https://onnxruntime.ai/docs/tutorials/web/ |
