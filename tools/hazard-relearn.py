"""Zatvaranje kruga: ispravke roditelja postaju sledeći trening.

Roditelj koji dodirne 👎 na nalazu „Utičnica" zna nešto što nijedan javni
skup podataka nema — kako taj predmet izgleda u pravom stanu, na pravom
svetlu, snimljen pravim telefonom. Open Images ima 359 primera utičnice i
nema ih više; korisnici ih mogu napraviti koliko treba.

Ovaj alat skida prikupljene isečke i njihove ocene, pa ih uklapa u skup:

  - 👍 potvrde idu kao dodatni pozitivni primeri te klase;
  - 👎 ispravke idu kao TVRDI NEGATIVI — slika bez ijednog okvira. Prazna
    oznaka nije greška nego uputstvo: „ovde te stvari nema, prestani da je
    vidiš". Upravo to gasi lažne uzbune, a lažna uzbuna je ono zbog čega
    roditelj prestane da veruje aplikaciji.

Isečci su mali (224 px) i sami po sebi nisu dovoljni za detekciju okvira, pa
se koriste za DOTERIVANJE već istreniranog modela, ne za trening od nule.

    SERVICE_KEY=... python3 tools/hazard-relearn.py --out data/hazards
"""
import argparse
import json
import os
import subprocess
import sys

PROJECT = "equjrxwpxrkchicetyvs"
REST = f"https://{PROJECT}.supabase.co/rest/v1"
STORAGE = f"https://{PROJECT}.supabase.co/storage/v1/object"


def curl(url, key, out=None):
    """Izlaz iz ovog okruženja posredniku vraća 403 na urllib, a curl prolazi."""
    args = ["curl", "-sS", url, "-H", f"Authorization: Bearer {key}",
            "-H", f"apikey: {key}", "--max-time", "120"]
    if out:
        args += ["-o", out]
    r = subprocess.run(args, capture_output=True, text=bool(not out), timeout=180)
    if r.returncode:
        raise RuntimeError(str(r.stderr)[:200])
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/hazards")
    ap.add_argument("--limit", type=int, default=5000)
    a = ap.parse_args()

    key = os.environ.get("SERVICE_KEY")
    if not key:
        sys.exit("treba SERVICE_KEY (Supabase service role)")

    rows = json.loads(curl(
        f"{REST}/sn_learning?select=claim,correct,crop_path&limit={a.limit}", key))
    if not rows:
        print("nema prikupljenih ispravki — nema šta da se uči")
        return

    names = json.load(open(os.path.join(
        os.path.dirname(a.out), "..", "public", "model", "hazard", "hazard.json")
    ))["names"] if os.path.exists("public/model/hazard/hazard.json") else []
    index = {n: i for i, n in enumerate(names)}

    imgs = os.path.join(a.out, "images", "train")
    labs = os.path.join(a.out, "labels", "train")
    os.makedirs(imgs, exist_ok=True)
    os.makedirs(labs, exist_ok=True)

    added = {"da": 0, "ne": 0, "preskoceno": 0}
    for r in rows:
        claim = r["claim"]
        if claim not in index:
            added["preskoceno"] += 1  # COCO klasa — nije naš model
            continue
        stem = "fb_" + r["crop_path"].replace("/", "_").rsplit(".", 1)[0]
        jpg = os.path.join(imgs, stem + ".jpg")
        if not os.path.exists(jpg):
            try:
                curl(f"{STORAGE}/sn-learning/{r['crop_path']}", key, out=jpg)
            except Exception:
                added["preskoceno"] += 1
                continue
        with open(os.path.join(labs, stem + ".txt"), "w") as f:
            if r["correct"]:
                # Isečak je napravljen oko samog predmeta uz ~12 % ivice, pa
                # predmet zauzima gotovo ceo kadar.
                f.write(f"{index[claim]} 0.5 0.5 0.78 0.78\n")
                added["da"] += 1
            else:
                # Prazna datoteka = tvrdi negativ. Ovo je najvredniji podatak
                # koji uopšte dobijamo, jer se lažne uzbune ne mogu ispraviti
                # dodavanjem još pozitivnih primera.
                added["ne"] += 1

    print(f"potvrde: {added['da']} · ispravke (negativi): {added['ne']} · "
          f"preskočeno: {added['preskoceno']}")
    print("\nsledeći korak — doterivanje na postojećim težinama:")
    print("  python3 tools/hazard-train.py --base runs/detect/hazards/weights/best.pt \\\n"
          "      --epochs 8 --name hazards-v2")


if __name__ == "__main__":
    main()
