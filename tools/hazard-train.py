"""Doterivanje YOLOv8n na kućne opasnosti.

Polazi se od COCO težina, ne od nule. Razlog nije štednja nego to što model
koji već ume da razlikuje ivicu od senke treba samo da nauči DVANAEST novih
oblika — a to je posao od nekoliko sati, dok je učenje od nule posao od
nedelja i skupa podataka koji nemamo.

Ovde nema grafičke kartice. Sve što sledi je podešeno za četiri procesorska
jezgra i za to da rezultat mora da stane u telefon:

  - ulaz 320 px umesto 640: izmereno je koliko traje jedan korak, i 640 bi
    značilo dane. Utičnica je sitna pa se time nešto gubi, ali model koji
    postoji i greši je bolji od savršenog koji nikad nije istreniran.
  - BEZ keširanja na disk. Prva verzija je koristila `cache="disk"` da
    ubrza pripremu slike; izmereno je da svaka keširana slika zauzme 2,2 MB,
    a to je za 5.692 slike 12 GB — tačno onoliko koliko je na ovoj mašini
    ostalo slobodno. Trening bi stao na pola, kad se disk napuni. Priprema
    u hodu je sporija po prolazu, ali se posao završi.
  - bez mozaika u poslednjih par prolaza: mozaik pomaže na početku, a pri
    kraju uči model na spojevima koji u stanu ne postoje.

    python3 tools/hazard-train.py --data data/hazards/hazards.yaml \\
        --epochs 24 --imgsz 320
"""
import argparse
import os

os.environ.setdefault("OMP_NUM_THREADS", "4")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/hazards/hazards.yaml")
    ap.add_argument("--epochs", type=int, default=24)
    ap.add_argument("--imgsz", type=int, default=320)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--name", default="hazards")
    ap.add_argument("--base", default="yolov8n.pt")
    ap.add_argument("--fraction", type=float, default=1.0,
                    help="udeo skupa (za merenje brzine)")
    ap.add_argument("--resume", action="store_true")
    a = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(a.base)
    model.train(
        data=a.data,
        epochs=a.epochs,
        imgsz=a.imgsz,
        batch=a.batch,
        device="cpu",
        workers=4,
        cache=False,
        fraction=a.fraction,
        name=a.name,
        exist_ok=True,
        resume=a.resume,
        # Zatvoreni mozaik pri kraju: model poslednje prolaze uči na celim
        # slikama, kakve i dolaze iz telefona.
        close_mosaic=4,
        patience=12,
        val=True,
        plots=False,
        verbose=True,
    )
    print("\nnajbolje težine:", model.trainer.best)


if __name__ == "__main__":
    main()
