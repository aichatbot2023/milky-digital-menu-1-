"""Vizuali za departman za ljubimce — slike proizvoda i slike za sajt.

Isti postupak koji je već dao deset upotrebljivih slika za dečji katalog, sa
istim dvema stvarima koje su tada bile presudne i koje se ovde NE menjaju:

1. PODLOGA SREDNJEG TONA. Prva serija dečjih slika imala je vrlo svetlu
   podlogu; zaštita je gotovo uvek bela ili prozirna, pa je izlivanje pri
   izrezivanju prolazilo kroz sam predmet i pojelo ga — sedam od deset slika
   je „uklonilo" preko 97 % kadra i prikaz na fotografiji se nije ni pojavio.
2. PROVERA IZREZIVANJA PRE OBJAVE. Slika koja se ne da izrezati je za nas
   neupotrebljiva ma koliko lepo izgledala, jer se prikaz „rešenje na svom
   mestu" pali samo kad izrezivanje uspe.

Slike se prave preko naše `imagegen` funkcije (NVIDIA flux.1-dev) — dakle
besplatno i bez ijednog tuđeg naloga.

    ADMIN_KEY=... SUPABASE_TOKEN=... SERVICE_KEY=... python3 tools/pet-visuals.py
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
SIZE = 768

CLEAN = (
    " Studio product photograph on a plain seamless mid-tone warm taupe grey"
    " background, clearly darker than the object, soft even lighting from the"
    " upper left, one soft contact shadow directly beneath the object, object"
    " centred and fully inside the frame with generous empty margin on all"
    " four sides. No people, no hands, no animals, no room, no furniture, no"
    " props, no text, no logos, no watermark, no packaging, no collage, no"
    " multiple views."
)

# ključ rešenja -> (ime fajla, opis predmeta)
#
# Opisi imenuju TAČNO onu vrstu zaštite koju kartica obećava. Ovde je to
# važnije nego kod dece, jer se pola ovih proizvoda vizuelno preklapa sa
# nečim drugim: mrežica za mačke liči na komarnik, zaštita kabla na običnu
# cev, a kutija za šivenje na bilo koju kutiju.
PIECES = {
    "window_net": ("pet-window-net",
                   "A roll of black fine-mesh cat safety netting for a window or"
                   " balcony, partly unrolled, with small plastic mounting clips"
                   " beside it"),
    "cord_cover": ("pet-cord-cover",
                   "Three lengths of grey flexible spiral cable protector tubing"
                   " for pet-proofing wires, one with a white cable threaded"
                   " through it"),
    "plant_shelf": ("pet-plant-hanger",
                    "A macrame hanging planter with a terracotta pot and a small"
                    " trailing green plant, hanging from a plain wooden dowel"),
    "toilet_lock": ("pet-toilet-lock",
                    "A white plastic toilet lid safety latch with an adhesive"
                    " pad, shown open, simple matte plastic"),
    "sewing_box": ("pet-sewing-box",
                   "A closed lidded fabric sewing box with a simple clasp,"
                   " neutral colours, no contents visible"),
}

# Slike za sajt — nisu proizvodi, pa nemaju provere izrezivanja.
HERO = {
    "pets-hero": (
        "A calm modern living room photographed from standing height, a ginger"
        " cat sitting on the floor near a low bookshelf with a houseplant, soft"
        " natural daylight from a window, realistic interior photography, no"
        " people, no text",
        1344, 768),
    "pets-og": (
        "A tabby cat looking up at a windowsill with a green houseplant, warm"
        " domestic interior, shallow depth of field, realistic photography,"
        " no people, no text",
        1200, 630),
}


def post(url, body, headers, timeout=300):
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def generate(prompt, seed, admin, w=SIZE, h=SIZE, tries=3):
    body = json.dumps({
        "admin_key": admin, "model": "flux.1-dev", "prompt": prompt,
        "width": w, "height": h, "steps": 40, "cfg": 3.5, "seed": seed,
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
    """Isti postupak koji radi `cutout.ts` u pregledaču, ne približna zamena.

    Provera mora da bude ista kao ona koja odlučuje u aplikaciji, inače ne
    proverava ništa — to je greška koja je prvi put propustila sedam slika.
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
        "Authorization": f"Bearer {service}", "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=604800", "x-upsert": "true",
    }, timeout=120)
    return f"{STORAGE}/object/public/{BUCKET}/{name}"


def sql(query, token):
    with open("/tmp/pv.json", "w") as f:
        f.write(json.dumps({"query": query}))
    out = subprocess.run(
        ["curl", "-sS", "-X", "POST", SQL, "-H", f"Authorization: Bearer {token}",
         "-H", "Content-Type: application/json", "--data-binary", "@/tmp/pv.json",
         "--max-time", "90"], capture_output=True, text=True, timeout=120)
    if out.returncode:
        raise RuntimeError(out.stderr[:200])
    return out.stdout


def main():
    admin = os.environ.get("ADMIN_KEY")
    token = os.environ.get("SUPABASE_TOKEN")
    service = os.environ.get("SERVICE_KEY")
    if not (admin and token and service):
        sys.exit("treba ADMIN_KEY, SUPABASE_TOKEN i SERVICE_KEY")

    os.makedirs("public/products", exist_ok=True)
    done, failed = [], []

    for key, (name, prompt) in PIECES.items():
        made = None
        for seed in (11, 27, 43, 61, 89):
            try:
                raw = generate(prompt + CLEAN, seed, admin)
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
            failed.append(f"{name}: nijedno seme nije dalo čistu podlogu")
            continue
        url = upload(made, f"{name}.webp", service)
        # I u aplikaciju, da prikaz radi i bez mreže.
        Image.open(io.BytesIO(made)).convert("RGB").save(
            f"public/products/{name}.webp", "WEBP", quality=88, method=6)
        sql(f"UPDATE sn_products SET image_url = '{url}' "
            f"WHERE domain = 'pet' AND keywords LIKE '%{key}%'", token)
        done.append(name)
        print(f"✓ {name}")

    for name, (prompt, w, h) in HERO.items():
        try:
            raw = generate(prompt, 11, admin, w, h)
            Image.open(io.BytesIO(raw)).convert("RGB").save(
                f"public/{name}.webp", "WEBP", quality=86, method=6)
            print(f"✓ {name} ({w}×{h})")
            done.append(name)
        except Exception as e:
            failed.append(f"{name}: {e}")

    print(f"\ngotovo: {len(done)}, palo: {len(failed)}")
    for f in failed:
        print("  ✗", f)


if __name__ == "__main__":
    main()
