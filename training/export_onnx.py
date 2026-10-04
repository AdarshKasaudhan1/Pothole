#!/usr/bin/env python3
"""
PotholeGuard — ONNX Export & Sanity Verification Suite
Author: PotholeGuard AI Engineering Team

Exports trained PyTorch YOLO model (.pt) to ONNX (.onnx) for ONNX Runtime Web:
- Exports with dynamic batching/fixed shape for browser deployment
- Simplifies ONNX graph (via onnxslim/onnx-simplifier if available)
- Performs rigorous shape, type, and tensor parity inspection
- Validates PyTorch vs ONNX Runtime numerical equivalence
"""

import os
import sys
import json
import shutil
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, Any

def export_and_verify_onnx(
    weights_path: str = "models/best.pt",
    output_onnx: str = "models/pothole.onnx",
    imgsz: int = 640,
    opset: int = 17,
    simplify: bool = True,
    device: str = "cpu"
) -> Dict[str, Any]:
    try:
        from ultralytics import YOLO
        import onnx
        import onnxruntime as ort
        import torch
    except ImportError as e:
        print(f"[-] Missing required package: {e}")
        sys.exit(1)

    weights = Path(weights_path).resolve()
    if not weights.exists():
        print(f"[-] ERROR: Model weights not found at {weights}")
        sys.exit(1)

    print("==================================================")
    print("      POTHOLEGUARD — ONNX EXPORT & VERIFICATION   ")
    print("==================================================")
    print(f"• Input Weights:    {weights}")
    print(f"• Target ONNX:      {Path(output_onnx).resolve()}")
    print(f"• Input Size:       {imgsz}x{imgsz}")
    print(f"• Opset Version:    {opset}")
    print(f"• Simplify Graph:   {simplify}")
    print("==================================================")

    model = YOLO(str(weights))

    # 1. Export via Ultralytics API
    exported_path = model.export(
        format="onnx",
        imgsz=imgsz,
        simplify=simplify,
        opset=opset,
        device=device
    )
    exported_file = Path(exported_path)

    # 2. Copy/Move to target models/pothole.onnx
    target_onnx_path = Path(output_onnx).resolve()
    target_onnx_path.parent.mkdir(parents=True, exist_ok=True)
    if exported_file != target_onnx_path:
        shutil.copy2(exported_file, target_onnx_path)

    print(f"\n[+] Export succeeded! Final ONNX file: {target_onnx_path}")
    file_size_mb = target_onnx_path.stat().st_size / (1024 * 1024)
    print(f"• File Size: {file_size_mb:.2f} MB")

    # 3. Inspect ONNX Model Architecture & Graph
    onnx_model = onnx.load(str(target_onnx_path))
    onnx.checker.check_model(onnx_model)
    print("[+] ONNX model checker passed (graph is valid and well-formed).")

    # 4. Inspect Inputs & Outputs via ONNX Runtime
    session = ort.InferenceSession(str(target_onnx_path), providers=["CPUExecutionProvider"])

    inputs_meta = []
    for inp in session.get_inputs():
        inp_info = {
            "name": inp.name,
            "shape": inp.shape,
            "type": inp.type
        }
        inputs_meta.append(inp_info)
        print(f"• Model Input:  name='{inp.name}', shape={inp.shape}, type={inp.type}")

    outputs_meta = []
    for out in session.get_outputs():
        out_info = {
            "name": out.name,
            "shape": out.shape,
            "type": out.type
        }
        outputs_meta.append(out_info)
        print(f"• Model Output: name='{out.name}', shape={out.shape}, type={out.type}")

    # 5. Sanity Test: Numerical Equivalence Test (PyTorch vs ONNX Runtime)
    print("\n--- Running Numerical Parity Sanity Test ---")
    dummy_input = np.random.uniform(0.0, 1.0, (1, 3, imgsz, imgsz)).astype(np.float32)

    # ONNX Runtime inference
    ort_inputs = {session.get_inputs()[0].name: dummy_input}
    ort_outputs = session.run(None, ort_inputs)
    ort_pred = ort_outputs[0]

    # PyTorch inference
    torch_model = model.model.to("cpu").eval()
    with torch.no_grad():
        torch_input = torch.from_numpy(dummy_input)
        torch_pred = torch_model(torch_input)
        if isinstance(torch_pred, tuple):
            torch_pred = torch_pred[0]
        torch_pred_np = torch_pred.detach().cpu().numpy()

    # Compare shapes and max absolute error
    shape_match = (ort_pred.shape == torch_pred_np.shape)
    max_diff = float(np.max(np.abs(ort_pred - torch_pred_np)))

    print(f"• PyTorch Output Shape: {torch_pred_np.shape}")
    print(f"• ONNX Output Shape:    {ort_pred.shape}")
    print(f"• Shapes Match:         {shape_match}")
    print(f"• Max Absolute Diff:    {max_diff:.6e}")

    sanity_passed = shape_match and (max_diff < 1e-2)
    if sanity_passed:
        print("[+] SANITY CHECK PASSED: ONNX output matches PyTorch within acceptable numerical tolerance.")
    else:
        print("[-] WARNING: Output divergence detected between PyTorch and ONNX!")

    report = {
        "onnx_file": str(target_onnx_path),
        "file_size_mb": round(file_size_mb, 2),
        "imgsz": imgsz,
        "opset": opset,
        "inputs": inputs_meta,
        "outputs": outputs_meta,
        "sanity_test": {
            "passed": bool(sanity_passed),
            "max_abs_diff": max_diff,
            "pytorch_shape": list(torch_pred_np.shape),
            "onnx_shape": list(ort_pred.shape)
        },
        "browser_integration_spec": {
            "input_tensor_name": inputs_meta[0]["name"] if inputs_meta else "images",
            "input_tensor_shape": [1, 3, imgsz, imgsz],
            "input_normalization": "RGB, range [0.0, 1.0], normalized as (pixel / 255.0)",
            "output_tensor_name": outputs_meta[0]["name"] if outputs_meta else "output0",
            "output_tensor_shape": [1, 5, 8400] if imgsz == 640 else list(ort_pred.shape),
            "output_format": "[batch, 5, anchors] where row 0-3 = (x_center, y_center, width, height) in 0-640 px and row 4 = pothole confidence score"
        }
    }

    report_path = Path("results/metrics/onnx_export_report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"[+] Saved ONNX export report to: {report_path}")

    return report

def main():
    parser = argparse.ArgumentParser(description="Export and Verify PotholeGuard ONNX Model")
    parser.add_argument("--weights", type=str, default="models/best.pt", help="Input .pt weights")
    parser.add_argument("--out", type=str, default="models/pothole.onnx", help="Output .onnx path")
    parser.add_argument("--imgsz", type=int, default=640, help="Export image resolution")
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    parser.add_argument("--device", type=str, default="cpu", help="Device")
    args = parser.parse_args()

    export_and_verify_onnx(
        weights_path=args.weights,
        output_onnx=args.out,
        imgsz=args.imgsz,
        opset=args.opset,
        device=args.device
    )

if __name__ == "__main__":
    main()
