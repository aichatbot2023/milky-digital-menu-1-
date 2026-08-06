"""Izvoz istreniranog modela opasnosti u ONNX, za pregledač.

Postojeći YOLOv8n u aplikaciji je tfjs graph model. Ovaj se izvozi u ONNX i
vrti kroz onnxruntime-web — isti onaj koji već nosimo zbog procene dubine.
Razlog nije ukus: tfjs izvoz iz Ultralyticsa traži lanac alata (onnx2tf,
tflite_support i još nekoliko) koji ume da pukne na sitnicu, dok je ONNX
izvoz jedna linija i uvek isti rezultat.

    python3 tools/hazard-export.py --weights runs/detect/hazards/weights/best.pt

Rezultat ide u `public/model/hazard/`, odakle se služi sa našeg domena —
kao i svi ostali modeli, bez ijednog spoljnog zahteva u radu aplikacije.
"""
import argparse
import json
import os
import shutil


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default="runs/detect/hazards/weights/best.pt")
    ap.add_argument("--out", default="public/model/hazard")
    ap.add_argument("--imgsz", type=int, default=320)
    a = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(a.weights)
    names = model.names  # {0: 'socket', ...}

    # `simplify` skida suvišne čvorove; bez toga onnxruntime-web zna da
    # naiđe na operaciju koju wasm izvršilac nema.
    path = model.export(format="onnx", imgsz=a.imgsz, simplify=True, opset=12)
    os.makedirs(a.out, exist_ok=True)
    dest = os.path.join(a.out, "hazard.onnx")
    shutil.copy(path, dest)

    # Imena klasa idu uz model, u istom redosledu kao izlaz mreže. Ako se
    # razmimoiđu, aplikacija bi utičnicu zvala stepenicama — pa se čuvaju
    # zajedno, a ne prepisuju rukom na drugom mestu.
    meta = {
        "imgsz": a.imgsz,
        "names": [names[i] for i in sorted(names)],
    }
    with open(os.path.join(a.out, "hazard.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    mb = os.path.getsize(dest) / 1048576
    print(f"→ {dest}  ({mb:.1f} MB)")
    print(f"→ klase: {', '.join(meta['names'])}")


if __name__ == "__main__":
    main()
