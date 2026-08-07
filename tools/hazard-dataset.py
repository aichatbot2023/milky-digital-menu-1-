"""Skup podataka za KUĆNE opasnosti — ono što COCO ne vidi.

ZAŠTO POSTOJI
-------------
Lokalni detektor u aplikaciji zna 80 COCO klasa. Izmereno je šta to znači na
fotografiji obične kuhinje: vratio je sedam nalaza — činije, saksije i flašu
— a nijednu od stvarnih opasnosti u toj istoj prostoriji. Razlog je prost:
među tih 80 klasa NEMA utičnice, nema stepenica, nema sveće, nema kese, nema
gajtana roletne. Detektor ne greši; pitali smo ga pogrešnu stvar.

Open Images V7 te klase ima, sa okvirima, besplatno i pod CC-BY licencom.
Ovaj alat iz njega izdvaja samo ono što je opasnost po malo dete i sprema
skup u obliku koji YOLO razume.

ŠTA SE UZIMA, A ŠTA NE
----------------------
Uzimaju se klase koje su (a) prava opasnost po dete u domu i (b) vizuelno
prepoznatljive. Namerno se NE uzimaju stvari koje COCO već dobro pokriva
(nož, makaze, sudopera), da model ne uči ono što već imamo, i da se ono malo
računara što imamo potroši na pravu rupu.

    ADMIN_KEY nije potreban — ovde nema nijednog naloga ni ključa.
    python3 tools/hazard-dataset.py --limit 900 --out data/hazards
"""
import argparse
import csv
import os
import random
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

OI = "https://storage.googleapis.com/openimages"

# Ime klase kod nas -> Open Images identifikator.
#
# Redosled je i redosled indeksa u modelu, pa se NE menja bez ponovnog
# treninga — `hazardModel.ts` na drugoj strani očekuje baš ovaj poredak.
CLASSES = {
    "socket":      "/m/03bbps",   # Power plugs and sockets — najveća rupa
    "stairs":      "/m/01lynh",   # Stairs
    "candle":      "/m/0c06p",    # Candle
    "plastic_bag": "/m/05gqfk",   # Plastic bag — gušenje
    "blind":       "/m/031b6r",   # Window blind — gajtan, davljenje
    "fireplace":   "/m/03tw93",   # Fireplace
    "stove":       "/m/02wv84t",  # Gas stove
    "heater":      "/m/03qhv5",   # Heater / radijator
    "kettle":      "/m/03s_tn",   # Kettle — vrela voda
    "coin":        "/m/0242l",    # Coin — gušenje
    "bathtub":     "/m/03dnzn",   # Bathtub — davljenje
    "drawer":      "/m/0fqfqc",   # Drawer
}
NAMES = list(CLASSES)
BY_ID = {v: i for i, (k, v) in enumerate(CLASSES.items())}

SPLITS = {
    # Podeoci se biraju po CENI. Trening-anotacije Open Imagesa su preko 2 GB
    # i sadrže milione redova koji nam ne trebaju; validacioni i test podeoci
    # su mali, a zajedno daju dovoljno primera za doterivanje već istreniranog
    # modela. Trening podeok se dodaje tek ako se traži više nego što ta dva
    # mogu da daju.
    "validation": f"{OI}/v5/validation-annotations-bbox.csv",
    "test": f"{OI}/v5/test-annotations-bbox.csv",
}
TRAIN_BBOX = f"{OI}/v6/oidv6-train-annotations-bbox.csv"
IMG_URL = "https://s3.amazonaws.com/open-images-dataset/{split}/{iid}.jpg"


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, path)
    return path


def read_boxes(csv_path, split, per_class, wanted):
    """Pokupi okvire samo za tražene klase, uz gornju granicu po klasi.

    Čita se red po red i odbacuje odmah: datoteka trening podeoka ima
    preko 14 miliona redova i ne sme cela u memoriju.
    """
    by_image = defaultdict(list)
    counts = defaultdict(int)
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            cid = row["LabelName"]
            if cid not in wanted:
                continue
            k = BY_ID[cid]
            if counts[k] >= per_class:
                continue
            # Open Images čuva okvir kao udeo širine/visine (XMin..YMax),
            # a YOLO traži centar i veličinu — takođe kao udeo.
            x0, x1 = float(row["XMin"]), float(row["XMax"])
            y0, y1 = float(row["YMin"]), float(row["YMax"])
            w, h = x1 - x0, y1 - y0
            if w <= 0.004 or h <= 0.004:
                continue  # tačkica, ne predmet
            by_image[row["ImageID"]].append((k, x0 + w / 2, y0 + h / 2, w, h))
            counts[k] += 1
    return by_image, counts


def grab_image(args):
    iid, split, dest = args
    path = os.path.join(dest, iid + ".jpg")
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return True
    try:
        urllib.request.urlretrieve(IMG_URL.format(split=split, iid=iid), path + ".part")
        os.replace(path + ".part", path)
        return True
    except Exception:
        for p in (path + ".part",):
            if os.path.exists(p):
                os.remove(p)
        return False


def build(out, per_class, workers, cache, use_train):
    wanted = set(CLASSES.values())
    sources = list(SPLITS.items())
    if use_train:
        sources.append(("train", TRAIN_BBOX))

    everything = []
    total = defaultdict(int)
    for split, url in sources:
        print(f"→ anotacije: {split}")
        path = fetch(url, os.path.join(cache, f"{split}-bbox.csv"))
        left = {cid for cid in wanted if total[BY_ID[cid]] < per_class}
        if not left:
            break
        boxes, counts = read_boxes(path, split, per_class, left)
        for k, n in counts.items():
            total[k] += n
        everything += [(iid, split, b) for iid, b in boxes.items()]
        print(f"   slika: {len(boxes)}")

    print("\nprimeraka po klasi:")
    for i, name in enumerate(NAMES):
        print(f"   {total[i]:5}  {name}")
    if not everything:
        sys.exit("nijedan okvir nije nađen — proveri identifikatore klasa")

    random.seed(11)
    random.shuffle(everything)
    cut = int(len(everything) * 0.85)
    parts = {"train": everything[:cut], "val": everything[cut:]}

    for part, rows in parts.items():
        imgs = os.path.join(out, "images", part)
        labs = os.path.join(out, "labels", part)
        os.makedirs(imgs, exist_ok=True)
        os.makedirs(labs, exist_ok=True)
        print(f"\n→ preuzimam {part}: {len(rows)} slika")
        with ThreadPoolExecutor(max_workers=workers) as ex:
            got = list(ex.map(grab_image, [(iid, sp, imgs) for iid, sp, _ in rows]))
        kept = 0
        for (iid, _sp, boxes), ok in zip(rows, got):
            if not ok:
                continue
            with open(os.path.join(labs, iid + ".txt"), "w") as f:
                for k, cx, cy, w, h in boxes:
                    f.write(f"{k} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
            kept += 1
        print(f"   uspelo: {kept}/{len(rows)}")

    yaml = os.path.join(out, "hazards.yaml")
    with open(yaml, "w") as f:
        f.write(f"path: {os.path.abspath(out)}\ntrain: images/train\nval: images/val\n\nnames:\n")
        for i, n in enumerate(NAMES):
            f.write(f"  {i}: {n}\n")
    print(f"\ngotovo → {yaml}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/hazards")
    ap.add_argument("--limit", type=int, default=900, help="najviše okvira po klasi")
    ap.add_argument("--workers", type=int, default=32)
    ap.add_argument("--cache", default="data/oi-cache")
    ap.add_argument("--train-split", action="store_true",
                    help="dodaj i trening podeok (2 GB anotacija)")
    a = ap.parse_args()
    build(a.out, a.limit, a.workers, a.cache, a.train_split)
