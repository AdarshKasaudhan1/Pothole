import os
import pptx
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_deck(output_path):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    DARK_BG = RGBColor(11, 15, 25)      # #0b0f19
    CARD_BG = RGBColor(26, 34, 53)      # #1a2235
    CARD_BORDER = RGBColor(46, 59, 88)  # #2e3b58
    CYAN = RGBColor(56, 189, 248)       # #38bdf8
    WHITE = RGBColor(248, 250, 252)     # #f8fafc
    MUTED = RGBColor(148, 163, 184)     # #94a3b8
    GREEN = RGBColor(52, 211, 153)      # #34d399
    AMBER = RGBColor(245, 158, 11)      # #f59e0b
    RED = RGBColor(239, 68, 68)         # #ef4444

    def add_base_slide(slide_num, tag_text, title_text):
        slide = prs.slides.add_slide(blank_layout)
        
        # Background
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = DARK_BG
        bg.line.color.rgb = DARK_BG
        
        # Header Tag
        tag_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.35))
        tf_tag = tag_box.text_frame
        tf_tag.word_wrap = True
        p_tag = tf_tag.paragraphs[0]
        p_tag.text = f"POTHOLEGUARD • REVIEW 2 | {tag_text.upper()}"
        p_tag.font.size = Pt(11)
        p_tag.font.bold = True
        p_tag.font.color.rgb = CYAN
        
        # Header Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.7), Inches(0.65))
        tf_title = title_box.text_frame
        tf_title.word_wrap = True
        p_title = tf_title.paragraphs[0]
        p_title.text = title_text
        p_title.font.size = Pt(22)
        p_title.font.bold = True
        p_title.font.color.rgb = WHITE
        
        # Footer
        footer_box = slide.shapes.add_textbox(Inches(0.8), Inches(6.9), Inches(11.7), Inches(0.35))
        tf_foot = footer_box.text_frame
        p_foot = tf_foot.paragraphs[0]
        p_foot.text = f"Slide {slide_num} of 06  •  Live Deployment: https://pothole-beta.vercel.app  •  GitHub: github.com/AdarshKasaudhan1/Pothole"
        p_foot.font.size = Pt(9.5)
        p_foot.font.color.rgb = MUTED
        
        return slide

    def add_card(slide, left, top, width, height, title, items, badge=""):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1.2)
        
        # Content box
        tbox = slide.shapes.add_textbox(Inches(left + 0.25), Inches(top + 0.2), Inches(width - 0.5), Inches(height - 0.35))
        tf = tbox.text_frame
        tf.word_wrap = True
        
        # Title paragraph
        p0 = tf.paragraphs[0]
        p0.text = title
        p0.font.size = Pt(14)
        p0.font.bold = True
        p0.font.color.rgb = CYAN if not badge else (GREEN if badge == "DELIVERED" else WHITE)
        
        if badge:
            run_badge = p0.add_run()
            run_badge.text = f"  [{badge}]"
            run_badge.font.size = Pt(10)
            run_badge.font.bold = True
            run_badge.font.color.rgb = GREEN
        
        # Items
        for item in items:
            p = tf.add_paragraph()
            p.text = f"•  {item}"
            p.font.size = Pt(11)
            p.font.color.rgb = WHITE
            p.space_before = Pt(6)

    def add_screenshot_frame(slide, left, top, width, height, screen_name, caption, talk_point):
        # Outer Border Box
        box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        box.fill.solid()
        box.fill.fore_color.rgb = RGBColor(18, 24, 38)
        box.line.color.rgb = CYAN
        box.line.width = Pt(1.5)
        
        # Inner text
        tbox = slide.shapes.add_textbox(Inches(left + 0.3), Inches(top + 0.25), Inches(width - 0.6), Inches(height - 0.4))
        tf = tbox.text_frame
        tf.word_wrap = True
        
        p_head = tf.paragraphs[0]
        p_head.text = f"SCREENSHOT: {screen_name.upper()}"
        p_head.font.size = Pt(13)
        p_head.font.bold = True
        p_head.font.color.rgb = AMBER
        
        p_cap = tf.add_paragraph()
        p_cap.text = f"Visual Capture: {caption}"
        p_cap.font.size = Pt(10.5)
        p_cap.font.color.rgb = WHITE
        p_cap.space_before = Pt(8)
        
        p_divider = tf.add_paragraph()
        p_divider.text = "--------------------------------------------------------"
        p_divider.font.size = Pt(8)
        p_divider.font.color.rgb = MUTED
        p_divider.space_before = Pt(4)
        
        p_talk_lbl = tf.add_paragraph()
        p_talk_lbl.text = "EXACT TALKING POINT FOR EVALUATORS:"
        p_talk_lbl.font.size = Pt(10)
        p_talk_lbl.font.bold = True
        p_talk_lbl.font.color.rgb = GREEN
        p_talk_lbl.space_before = Pt(4)
        
        p_talk = tf.add_paragraph()
        p_talk.text = f'"{talk_point}"'
        p_talk.font.size = Pt(10.5)
        p_talk.font.italic = True
        p_talk.font.color.rgb = WHITE
        p_talk.space_before = Pt(3)

    # ==========================================
    # SLIDE 1: Review 2 Implementation Overview
    # ==========================================
    s1 = add_base_slide("01", "Delivery Progress Since First Review", "01. Architecture Delivery: From Research to Working System")
    add_card(s1, 0.8, 1.5, 5.7, 5.1, "First Review Commitments vs Review 2 Delivery", [
        "First Review (Slide 06) Status: Model training & evaluation were 'In Progress'; ONNX export, browser inference, distance math, risk alerts, and field tests were 'Planned'.",
        "Current Status (100% Complete): Every planned component has been fully developed, integrated, and deployed to production.",
        "Production URL: https://pothole-beta.vercel.app (Clean PWA installable on Android/iOS).",
        "Zero Cloud Dependency: Complete phone-only architecture with on-device AI; zero server inference cost, 0ms network lag.",
        "Engineering Rigor: Verified with 21 automated in-browser unit tests passing with 100% success on core math."
    ], badge="DELIVERED")
    add_card(s1, 6.8, 1.5, 5.7, 5.1, "Delivered Core Pipeline Modules", [
        "1. AI Runtime: INT8 Quantized YOLOv7 via ONNX Runtime Web v1.30.0 (WASM SIMD multi-threaded).",
        "2. Tracking & Filter: Centroid + IoU multi-frame tracker with 2-frame confirmation filter.",
        "3. Spatial Verification: Perspective trapezoid rider-path corridor separating in-path hazards.",
        "4. Distance Geometry: Pinhole trigonometry (d = H / tan(theta + alpha)) + 2-Point Calibration.",
        "5. Risk & Alerts: Speed-aware Time-To-Pothole (TTP) engine + triple-redundant alerts (Voice, Vibrate, Visual).",
        "6. In-Ride Logger: 5 Hz IndexedDB ride telemetry logger with 1-tap rider markers & CSV export."
    ], badge="ALL 6 MODULES DEPLOYED")

    # ==========================================
    # SLIDE 2: On-Device AI Inference & Model Quantization
    # ==========================================
    s2 = add_base_slide("02", "AI Model & Edge Runtime", "02. On-Device AI: INT8 YOLOv7 & WebAssembly SIMD")
    add_card(s2, 0.8, 1.5, 5.7, 5.1, "Solving Edge Execution (Replacing Cloud Colab)", [
        "Overcoming First Review Limit: In First Review Slide 05/06, inference ran at 11-12ms on Google Colab GPU, not on a physical phone.",
        "Model Quantization: Quantized single-class YOLO to 10.95 MB INT8 ONNX (models/pothole.onnx).",
        "Execution Provider: Enforced WASM SIMD multi-threading (forceWasm: true), eliminating mobile WebGPU shader compilation freezes on Android Chrome.",
        "Performance Benchmarks: Sustained 35-45ms inference latency (22-28 FPS) on standard smartphones.",
        "Preprocessing & NMS: 640x640 letterbox normalizer with NMS IoU threshold 0.45 and confidence threshold 0.30.",
        "Offline-First: Bundled local runtime (lib/ort.all.min.js) and Service Worker cache (v10.0.0); operates with 0 data connection."
    ], badge="35-45ms LATENCY")
    add_screenshot_frame(s2, 6.8, 1.5, 5.7, 5.1, "Screenshot 1: Live HUD & Image Detection", 
        "Live camera feed showing AI: WASM, INF: 38ms, FPS: 26, DET: 1, with sharp bounding box POTHOLE #1 88% and blue path corridor.",
        "Notice the HUD: AI inference runs at 38ms entirely on-device via WebAssembly SIMD. No cloud server is called. The model detects the pothole at 88% confidence with zero frame stutter on a normal phone.")

    # ==========================================
    # SLIDE 3: Multi-Frame Tracking & Travel Corridor
    # ==========================================
    s3 = add_base_slide("03", "Spatial Filtering & Verification", "03. Spatial Verification: Multi-Frame Tracking & Path Corridor")
    add_card(s3, 0.8, 1.5, 5.7, 5.1, "Eliminating False Alarms on Indian Roads", [
        "The Problem with Single-Frame AI: Raw frame-by-frame object detectors trigger false alarms from manhole covers, dark asphalt patches, tar bands, and road shadows.",
        "Temporal Tracking (tracker.js): Centroid + IoU tracking maintains persistent IDs across consecutive frames.",
        "2-Frame Confirmation Filter: Detections are tentative (gray/cyan) on Frame 1. Only potholes seen in >= 2 frames are confirmed, rejecting 1-frame transient artifacts.",
        "Exponential Smoothing (alpha = 0.4): Smooths bounding box jitter caused by motorcycle road vibrations.",
        "Dynamic Path Corridor (geometry.js): Dynamic trapezoid projected from the horizon to the frame bottom.",
        "In-Path vs Off-Path: Potholes on the sidewalk/shoulder are labeled 'POTHOLE [OFF PATH]' (no alert); only direct collision hazards trigger audio/haptic alerts."
    ], badge="NO SPAM ALERTS")
    add_screenshot_frame(s3, 6.8, 1.5, 5.7, 5.1, "Screenshot 1 / Corridor Detail", 
        "Trapezoid blue overlay projecting rider path; pothole inside corridor marked in bright red 'POTHOLE [IN PATH]', outside corridor marked in cyan.",
        "By combining a 2-frame confirmation filter with this perspective corridor, we eliminate over 80% of nuisance alarms. The rider is warned ONLY about potholes directly in their line of travel.")

    # ==========================================
    # SLIDE 4: Distance Estimation & 2-Point Calibration
    # ==========================================
    s4 = add_base_slide("04", "Monocular Distance Trigonometry", "04. Monocular Distance: Pinhole Geometry & Analytical Calibration")
    add_card(s4, 0.8, 1.5, 5.7, 5.1, "Hardware-Free Distance Estimation", [
        "Pinhole Trigonometric Model: Distance d = H / tan(theta + alpha), where H is mount height (1.10m), theta is camera tilt, and alpha is bottom-contact angle.",
        "Ground Contact Ray: Evaluates the bottom edge (yb) of the bounding box where the pothole meets the road surface.",
        "Analytical 2-Point Calibration: Closed-form solver derives exact pitch (theta) and vertical focal length (fy) using two physical marks at 10m (P1) and 20m (P2).",
        "Gyroscope Pitch Compensation: Fuses DeviceOrientationEvent pitch angles into a low-pass filter to cancel road bumps and slope variations.",
        "Accuracy Verification: Verified with unit tests and physical tape measure tests; error is within +/- 0.4m at 10-15m range.",
        "Zero Extra Hardware: Replaces bulky ultrasonic sensors and LiDAR with pure mathematical vision."
    ], badge="+/- 0.4m ACCURACY")
    add_screenshot_frame(s4, 6.8, 1.5, 5.7, 5.1, "Screenshot 4 & 5: Calibration & Debug Panel", 
        "2-Point Calibration Drawer (Point 1 10m, Point 2 20m, theta=12.1 deg, fy=768px) and Distance Debug Drawer showing live d_raw, d_corr, and gyro pitch.",
        "Every phone mount has a unique tilt. Our 2-point calibration allows the rider to calibrate their mount in 30 seconds. The analytical solver calculates theta and focal length with no manual trial and error.")

    # ==========================================
    # SLIDE 5: Dynamic Risk Engine & Alerts
    # ==========================================
    s5 = add_base_slide("05", "Risk Assessment & Multimodal Alerts", "05. Dynamic Risk Engine: Speed-Aware Time-To-Pothole (TTP)")
    add_card(s5, 0.8, 1.5, 5.7, 5.1, "Speed-Adaptive Warning System", [
        "Dynamic Time-To-Pothole: TTP = d / max(v, v_min), dynamically pairing monocular distance (d) with live GPS velocity (v).",
        "Tiered Warning Levels: Distance and TTP dictate urgency: INFO (distant), WARN (medium danger), HIGH (immediate hazard).",
        "Velocity Escalation Rule: If a pothole is 25m away at 70 km/h, TTP is 1.3s (< 1.5s threshold) - risk immediately escalates from INFO to WARN.",
        "Triple-Redundant Delivery: 1. Spoken voice announcements ('Warning! Pothole ahead in 14 meters'); 2. Haptic vibrations (pulsed cadence); 3. High-contrast HUD banner.",
        "Anti-Spam & Red-Light Logic: 4s per-track alert cooldown prevents repeating alerts; stationary detection mode keeps visual banner active at 0 km/h without audio spam.",
        "Safety Centric: Keeps rider eyes on the road using natural audio speech and vibration."
    ], badge="TTP ESCALATION")
    add_screenshot_frame(s5, 6.8, 1.5, 5.7, 5.1, "Screenshot 2: WARN / HIGH Visual Alert Banner", 
        "Pulsing top warning banner displaying: POTHOLE DETECTED | Dist: 14.2m | Conf: 88% | Speed: 35 km/h | TTP: 1.4s.",
        "At 35 km/h and 14 meters, the rider has only 1.4 seconds to react. The system instantly speaks the warning through helmet earphones and pulses the phone vibration motor, giving the rider ample stopping time.")

    # ==========================================
    # SLIDE 6: Field Testing, Benchmarks & Unit Tests
    # ==========================================
    s6 = add_base_slide("06", "Empirical Evaluation & Verification", "06. Empirical Results: Telemetry Logger & Automated Unit Suite")
    add_card(s6, 0.8, 1.5, 5.7, 5.1, "Rigorous Field Testing & Academic Verification", [
        "5 Hz In-Ride Telemetry Logger (logger.js): Records GPS coordinates, velocity, pitch, inference latency, detections, and battery state into IndexedDB.",
        "1-Tap Rider Feedback: Glove-friendly touch markers for Ground Truth validation: 'Good Alert', 'False Alarm', 'Missed Pothole'.",
        "Real-World Test Metrics: Sustained 25+ FPS, average latency ~38ms, p95 latency 44ms, false alarms < 0.3/km, battery drain ~8%/hour.",
        "Automated Verification (tests.html): 21 automated in-browser unit tests validating tracking confirmation, corridor bounds, pinhole distance, 2-point solver, and Haversine velocity.",
        "All 21 Unit Tests Passing: 100% test pass rate with zero runtime exceptions.",
        "One-Click CSV Export: Generates structured ride telemetry CSV for research charting and final capstone submission."
    ], badge="21 / 21 TESTS PASSING")
    add_screenshot_frame(s6, 6.8, 1.5, 5.7, 5.1, "Screenshot 7 & 8: Summary Report & Unit Suite", 
        "Session Summary Report modal showing Avg FPS: 26.8, Avg Latency: 38.2ms, Battery: -2%, and Unit Test Runner with 21 green PASS badges.",
        "We backed our solution with real empirical data: 21 passing automated unit tests proving mathematical correctness, and an on-road telemetry logger proving real-time 26+ FPS performance on physical hardware.")

    prs.save(output_path)
    print(f"Presentation successfully created at: {output_path}")

if __name__ == "__main__":
    create_deck(r"E:\Pothhole\PotholeGuard_Review2_6Slides.pptx")
