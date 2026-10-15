import os
import shutil
import random
from pathlib import Path
from PIL import Image

src_root = Path("D:/Pothhole/dataset/pothole")
dst_root = Path("D:/Pothhole/dataset/classification")

random.seed(42)

# Reset destination if needed
if dst_root.exists():
    shutil.rmtree(dst_root)

for split in ["train", "val", "test"]:
    for cls_name in ["normal", "potholes"]:
        (dst_root / split / cls_name).mkdir(parents=True, exist_ok=True)

stats = {
    "corrupt": 0,
    "total": 0,
    "train": {"normal": 0, "potholes": 0},
    "val": {"normal": 0, "potholes": 0},
    "test": {"normal": 0, "potholes": 0}
}

for cls_name in ["normal", "potholes"]:
    cls_dir = src_root / cls_name
    imgs = sorted(list(cls_dir.glob("*.jpg")) + list(cls_dir.glob("*.png")) + list(cls_dir.glob("*.jpeg")))
    
    valid_imgs = []
    for img_p in imgs:
        try:
            with Image.open(img_p) as im:
                im.verify()
            valid_imgs.append(img_p)
        except Exception as e:
            print(f"Corrupt image {img_p.name}: {e}")
            stats["corrupt"] += 1
            
    random.shuffle(valid_imgs)
    n = len(valid_imgs)
    n_train = int(n * 0.80)
    n_val = int(n * 0.10)
    
    train_imgs = valid_imgs[:n_train]
    val_imgs = valid_imgs[n_train:n_train + n_val]
    test_imgs = valid_imgs[n_train + n_val:]
    
    for p in train_imgs:
        shutil.copy2(p, dst_root / "train" / cls_name / p.name)
        stats["train"][cls_name] += 1
    for p in val_imgs:
        shutil.copy2(p, dst_root / "val" / cls_name / p.name)
        stats["val"][cls_name] += 1
    for p in test_imgs:
        shutil.copy2(p, dst_root / "test" / cls_name / p.name)
        stats["test"][cls_name] += 1

print("==================================================")
print("         DATASET PREPARATION COMPLETE             ")
print("==================================================")
print(f"Corrupt images:   {stats['corrupt']}")
print(f"Train split:      {stats['train']['normal']} normal + {stats['train']['potholes']} potholes = {sum(stats['train'].values())} (80%)")
print(f"Val split:        {stats['val']['normal']} normal + {stats['val']['potholes']} potholes = {sum(stats['val'].values())} (10%)")
print(f"Test split:       {stats['test']['normal']} normal + {stats['test']['potholes']} potholes = {sum(stats['test'].values())} (10%)")
print(f"Total dataset:    {sum(stats['train'].values()) + sum(stats['val'].values()) + sum(stats['test'].values())} images")
print(f"Destination:      {dst_root.resolve()}")
print("==================================================")
