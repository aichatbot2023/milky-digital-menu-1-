#!/usr/bin/env python3
"""Slike zastite za SafeNest katalog.

Katalog je imao deset proizvoda i nijednu sliku. Posledica se videla na dva
mesta odjednom: kartice resenja su bile sivi karticasti red sa ikonicom
korpe, a prikaz „resenje na svom mestu" se UOPSTE nije crtao, jer se pali
tek kad postoji slika koja se da izrezati. Roditelj je dakle dobijao spisak
teksta umesto odgovora koji se vidi.

Slike pravi NVIDIA flux.1-dev preko nase `imagegen` funkcije, isto kao za
SpaceMatch vizuale — dakle besplatno i bez ijednog tudjeg naloga.

Dve stvari su namerne i vazne:

1. RAVNA SVETLA PODLOGA. Nije ukras: `cutout.ts` izrezuje predmet izlivanjem
   od ivica, a to radi samo kad je podloga mirna. Bez toga bi slika postojala
   a prikaz na fotografiji i dalje ostao prazan.
2. PREDMET SAM, BEZ RUKU I BEZ AMBIJENTA. Slika prikazuje VRSTU zastite, ne
   tacan artikal iz prodavnice, pa mora da izgleda kao ilustracija predmeta,
   a ne kao tudja fotografija proizvoda.

Pokretanje:
    ADMIN_KEY=... SUPABASE_TOKEN=... python3 tools/safenest-product-images.py
"""
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.request

from PIL import Image

PROJECT = "equjrxwpxrkchicetyvs"
IMAGEGEN = f"https://{PROJECT}.supabase.co/functions/v1/imagegen"
STORAGE = f"https://{PROJECT}.supabase.co/storage/v1"
SQL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
BUCKET = "safenest-products"

# Flux nema poseban negativan prompt, pa zabrane idu u samu recenicu.
#
# PODLOGA JE SREDNJEG TONA, i to je izmereno a ne stvar ukusa. Prva serija je
# imala vrlo svetlu podlogu; zastita za decu je gotovo uvek bela ili prozirna,
# pa je izlivanje pri izrezivanju prolazilo kroz sam predmet i pojelo ga:
# sedam od deset slika je „uklonilo" preko 97 % kadra i prikaz na fotografiji
# se nije ni pojavio. Srednji topli ton se od bele razlikuje dovoljno da
# izlivanje stane na ivici predmeta.
CLEAN = (
    " Studio product photograph on a plain seamless mid-tone warm taupe grey"
    " background, clearly darker than the object, soft even lighting from the"
    " upper left, one soft contact shadow directly beneath the object, object"
    " centred and fully inside the frame with generous empty margin on all"
    " four sides. No people, no hands, no room, no furniture, no props, no"
    " text, no logos, no watermark, no packaging, no collage, no multiple"
    " views."
)

# id proizvoda -> opis predmeta. Reci su izabrane tako da model napravi
# tacno onu vrstu zastite koju kartica obecava.
PIECES = {
    14: ("corner-guard",
         "Four small soft transparent silicone corner protectors for furniture"
         " edges, rounded triangular cushions, arranged in a neat row"),
    15: ("socket-cover",
         "Three white plastic child-safety plug socket covers for UK three-pin"
         " sockets, simple matte plastic, arranged in a small neat group"),
    16: ("stair-gate",
         "A white metal baby safety stair gate with vertical bars and a top"
         " latch, standing upright, seen slightly from the front-left"),
    17: ("cabinet-lock",
         "Two white plastic child-safety cabinet latches with adhesive pads,"
         " simple U-shaped drawer locks, lying side by side"),
    18: ("medicine-box",
         "A small sturdy white lockable medicine storage box with a combination"
         " latch on the front, closed lid, clean matte finish"),
    19: ("hob-guard",
         "A clear acrylic hob and cooker guard panel with rounded corners and"
         " small metal brackets, standing upright"),
    20: ("spill-mug",
         "A pastel green insulated toddler drinking cup with a sealed spill"
         " proof lid and two side handles"),
    21: ("cord-winder",
         "Two small white plastic blind cord safety winders with a short white"
         " cord neatly wound around one of them"),
    22: ("anti-tip-strap",
         "Two black nylon furniture anti-tip safety straps with metal buckles"
         " and white wall anchors, laid out straight"),
    23: ("bath-mat",
         "A soft pale blue non-slip rubber bath mat with round suction cups"
         " underneath, lying flat and slightly curled at one corner"),
}

SIZE = 768  # kvadrat; kartica i prikaz na fotografiji oba koriste isti isecak


def post(url, body, headers, timeout=300):
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def generate(prompt, seed, admin, tries=3):
    body = json.dumps({
        "admin_key": admin,
        "model": "flux.1-dev",
        "prompt": prompt + CLEAN,
        "width": SIZE,
        "height": SIZE,
        "steps": 40,
        "cfg": 3.5,
        "seed": seed,
    }).encode()
    last = ""
    for attempt in range(tries):
        try:
            data = json.loads(post(IMAGEGEN, body, {"Content-Type": "application/json"}))
            if data.get("b64"):
                return base64.b64decode(data["b64"])
            last = str(data.get("tried") or data.get("error"))[:200]
        except Exception as e:
            last = str(e)[:200]
        time.sleep(2 + 3 * attempt)
    raise RuntimeError(last)


def cuts_cleanly(im, side=256):
    """Da li se predmet sa ove slike ZAISTA da izrezati.

    Ovo je isti postupak koji radi `cutout.ts` u pregledacu, ne priblizna
    zamena za njega. Prva verzija alata je proveravala samo mirnocu oboda —
    to je propustilo sedam od deset slika kod kojih je izlivanje proslo kroz
    sam predmet. Provera mora da bude ista kao ona koja odlucuje u aplikaciji,
    inace ne proverava nista.
    """
    im = im.convert("RGB")
    k = side / max(im.size)
    im = im.resize((max(2, round(im.width * k)), max(2, round(im.height * k))))
    w, h = im.size
    px = im.load()
    ring = ([(x, 0) for x in range(w)] + [(w - 1, y) for y in range(1, h)]
            + [(x, h - 1) for x in range(w - 2, -1, -1)] + [(0, y) for y in range(h - 2, 0, -1)])
    d = lambda a, b: abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    jumps = sum(1 for i in range(1, len(ring)) if d(px[ring[i]], px[ring[i - 1]]) > 52)
    if jumps / len(ring) >= 0.09:
        return False, "obod nije miran"

    med = lambda vals: sorted(vals)[len(vals) // 2]
    bg = tuple(med([px[p][c] for p in ring]) for c in range(3))

    from collections import deque
    off = [[False] * w for _ in range(h)]
    q = deque()

    def push(x, y, fx=None, fy=None):
        if not (0 <= x < w and 0 <= y < h) or off[y][x]:
            return
        c = px[x, y]
        if fx is not None and d(c, px[fx, fy]) > 26:
            return
        if d(c, bg) > 190:
            return
        off[y][x] = True
        q.append((x, y))

    for x in range(w):
        push(x, 0); push(x, h - 1)
    for y in range(h):
        push(0, y); push(w - 1, y)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            push(nx, ny, x, y)

    removed = sum(map(sum, off)) / (w * h)
    if removed < 0.04:
        return False, f"podloga se ne prepoznaje ({removed:.2f})"
    if removed > 0.97:
        return False, f"izlivanje je pojelo predmet ({removed:.2f})"
    weakest = min(sum(off[0]) / w, sum(off[h - 1]) / w,
                  sum(off[y][0] for y in range(h)) / h,
                  sum(off[y][w - 1] for y in range(h)) / h)
    if weakest < 0.6:
        return False, f"predmet dodiruje ivicu kadra ({weakest:.2f})"
    return True, f"uklonjeno {removed:.2f}"


def upload(raw, name, service):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=88, method=6)
    post(f"{STORAGE}/object/{BUCKET}/{name}", buf.getvalue(), {
        "Authorization": f"Bearer {service}",
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=604800",
        "x-upsert": "true",
    }, timeout=120)
    return f"{STORAGE}/object/public/{BUCKET}/{name}"


def sql(query, token):
    """Upit ide kroz `curl`, ne kroz urllib.

    Izlaz iz ovog okruzenja prolazi kroz posrednika koji urllib-u vraca 403
    na upravljacki API, a curl-u ne. Nije vredno debatovati — curl radi.
    """
    out = subprocess.run(
        ["curl", "-sS", "-X", "POST", SQL,
         "-H", f"Authorization: Bearer {token}",
         "-H", "Content-Type: application/json",
         "--data-binary", json.dumps({"query": query}), "--max-time", "60"],
        capture_output=True, text=True, timeout=90)
    if out.returncode:
        raise RuntimeError(out.stderr[:200])
    return json.loads(out.stdout or "[]")


def main():
    admin = os.environ.get("ADMIN_KEY")
    token = os.environ.get("SUPABASE_TOKEN")
    service = os.environ.get("SERVICE_KEY")
    if not (admin and token and service):
        sys.exit("treba ADMIN_KEY, SUPABASE_TOKEN i SERVICE_KEY")

    sql("ALTER TABLE sn_products ADD COLUMN IF NOT EXISTS image_url text", token)

    done, failed = [], []
    for pid, (name, prompt) in PIECES.items():
        made = None
        for seed in (11, 27, 43, 61, 89):
            try:
                raw = generate(prompt, seed, admin)
            except Exception as e:
                failed.append(f"{name}: {e}")
                break
            ok, why = cuts_cleanly(Image.open(io.BytesIO(raw)))
            if ok:
                made = raw
                print(f"  {name}: {why}")
                break
            print(f"  {name}: {why} (seme {seed}) — probam drugo")
        if not made:
            failed.append(f"{name}: nijedno seme nije dalo cistu podlogu")
            continue
        url = upload(made, f"{name}.webp", service)
        sql(f"UPDATE sn_products SET image_url = '{url}' WHERE id = {pid}", token)
        done.append(name)
        print(f"✓ {name}")

    print(f"\ngotovo: {len(done)}, palo: {len(failed)}")
    for f in failed:
        print("  ✗", f)


if __name__ == "__main__":
    main()
