#!/usr/bin/env python3
"""Generisanje vizuala za SpaceMatch AI.

Slike pravi NVIDIA flux.1-dev preko nase `imagegen` funkcije — dakle
kljucem koji vec placamo nulom. Model prima samo odredjene dimenzije, pa se
generise najblizi dozvoljeni kadar, kropuje na tacan odnos iz brifa i snima
u JPG i WebP, plus uza verzija za telefon.

    python3 tools/spacematch-images.py --key <ADMIN_KEY> [ime ...]

Bez imena radi ceo spisak. Postojece slike preskace osim uz --force.
"""

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image

URL = "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/imagegen"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "public", "spacematch", "img")

# flux.1-dev prima samo ove vrednosti za sirinu i visinu.
ALLOWED = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344]

COMMON = (
    "Photorealistic interior photography, shot on a full-frame camera with a 35mm lens, "
    "soft late-afternoon daylight coming from one side, no harsh shadows, no flash. "
    "Warm neutral palette: sand, beige, off-white, with a single deep teal accent used sparingly. "
    "Calm, uncluttered, editorial magazine styling. Shallow but honest depth of field. "
    "Completely free of any text, lettering, numbers, logos, watermarks or brand names. "
)

# Flux nema poseban negativan prompt, pa zabrane idu kao deo recenice.
CLEAN = (
    " Natural colour, no oversaturation, no HDR, no neon, no purple or magenta cast. "
    "Straight undistorted perspective, no fisheye. Real photograph, not an illustration, "
    "not a 3d render, not a cartoon. Tidy and undamaged. No people and no faces in the frame."
)

# Katalog prikazuje same radove, ne sobe: model inace svaki put naslika
# uramljenu sliku obesenu o zid, sto je u mrezi malih slicica ruzno i neujednaceno.
# Katalog prikazuje same radove, ne sobe. Model inace svaki put naslika
# uramljeno platno obeseno o zid, pa se ovde trazi sama povrsina — a
# `art_crop` posle toga ispravlja i ono sto prompt ne stigne.
ART_FRAME = (
    "A full-bleed composition that completely covers the picture area, seen from directly in "
    "front and so close that the painted surface continues past all four edges. This is the "
    "surface itself, not a photograph of a picture hanging somewhere: no picture frame, no mount, "
    "no border, no wall, no gallery, no room, no floor, no drop shadow, no empty margin anywhere. "
    "Even lighting, subtle canvas or paper texture. Completely free of any text, lettering, "
    "numbers, written characters, signature, logos or watermarks. The composition is "
)


def size_for(w, h):
    """Najblizi dozvoljeni kadar — nikad manji od trazenog, blizu megapiksela.

    Model se najbolje ponasa oko jednog megapiksela, a slika sme samo da se
    smanjuje: rastezanje bi omeksalo detalj koji smo platili vremenom.
    """
    want = w / h
    fits = [(gw, gh) for gw in ALLOWED for gh in ALLOWED if gw >= w and gh >= h]
    if not fits:
        fits = [(gw, gh) for gw in ALLOWED for gh in ALLOWED]
    least = min(abs(gw / gh - want) for gw, gh in fits)
    close = [p for p in fits if abs(p[0] / p[1] - want) <= least + 0.005]
    return min(close, key=lambda p: abs(p[0] * p[1] - 1_200_000))


JOBS = []


def job(name, w, h, prompt, seed, after=None, pre=None):
    JOBS.append({"name": name, "w": w, "h": h, "prompt": prompt, "seed": seed,
                 "after": after, "pre": pre})


def art_crop(im):
    """Iseca samo platno, kad model ipak naslika sliku obešenu o zid.

    Rez je namerno plašljiv. Traži se zid — jednobojan okvir po svim
    ivicama — pa se seče tek ako takav zaista postoji i ako se povlači sa
    najmanje tri strane. Minimalan rad od dva mirna polja boje inače izgleda
    isto kao zid, a pogrešan rez bi mu pojeo pola kompozicije; zato u svakoj
    nedoumici slika ostaje netaknuta.
    """
    small = im.resize((im.width // 4, im.height // 4), Image.BILINEAR)
    px = small.load()
    w, h = small.size

    ring = []
    edge = max(2, round(min(w, h) * 0.02))
    for x in range(w):
        ring += [px[x, y] for y in range(edge)] + [px[x, h - 1 - y] for y in range(edge)]
    for y in range(h):
        ring += [px[x, y] for x in range(edge)] + [px[w - 1 - x, y] for x in range(edge)]
    wall = tuple(sorted(c[i] for c in ring)[len(ring) // 2] for i in range(3))

    spread = sorted(sum(abs(c[i] - wall[i]) for i in range(3)) for c in ring)
    # Ako sam okvir nije jednobojan, to nije zid — ne diramo sliku.
    if spread[int(len(spread) * 0.9)] > 40:
        return im

    def differs(pts):
        return sum(1 for c in pts if sum(abs(c[i] - wall[i]) for i in range(3)) > 55) > len(pts) * 0.25

    xs = [x for x in range(w) if differs([px[x, y] for y in range(h)])]
    ys = [y for y in range(h) if differs([px[x, y] for x in range(w)])]
    if not xs or not ys:
        return im

    box = (xs[0], ys[0], xs[-1] + 1, ys[-1] + 1)
    inset = sum([box[0] > w * 0.03, box[1] > h * 0.03,
                 box[2] < w * 0.97, box[3] < h * 0.97])
    if inset < 3:
        return im
    if box[2] - box[0] < w * 0.45 or box[3] - box[1] < h * 0.45:
        return im
    # Nazad na punu rezoluciju, plus dva piksela unutra da ivica rama otpadne.
    return im.crop((box[0] * 4 + 2, box[1] * 4 + 2, box[2] * 4 - 2, box[3] * 4 - 2))


def teal_wash(im):
    """Drugi korak: soba koju čitamo.

    Model ovo ne ume da odglumi — kad se traži „tirkizni preliv preko slike"
    on jednostavno okreči zid u tirkizno. Zato se soba generiše čista, a
    preliv se ovde crta u tačnoj boji marke, dijagonalno i slabo, tako da
    nameštaj ostane potpuno čitljiv ispod njega.
    """
    from PIL import ImageEnhance

    base = ImageEnhance.Color(im).enhance(0.55)
    w, h = base.size
    wash = Image.new("RGB", (w, h), (15, 118, 110))
    mask = Image.new("L", (w, h))
    px = mask.load()
    for y in range(h):
        for x in range(w):
            # Dijagonala od gornjeg levog ugla: jače gore levo, tiho dole desno.
            d = (x / w + y / h) / 2
            px[x, y] = int(105 * (1 - d) + 30)
    return Image.composite(wash, base, mask.point(lambda v: v // 2))


# ---------------------------------------------------------- 1. delatnosti
IND = 1000, 920
job("ind-furniture", *IND, COMMON + (
    "A calm modern living room corner with a low three-seat linen sofa in warm sand colour, "
    "one round oak side table, a single deep teal cushion. Plain off-white wall behind, "
    "wide-plank oak floor. The walls are completely bare with nothing hanging on them. "
    "Composition centred on the sofa.") + CLEAN, 11)
job("ind-art", *IND, COMMON + (
    "An empty off-white gallery wall with three small framed abstract prints hung in a row, "
    "thin light oak frames, generous empty space around them. A polished concrete floor and the "
    "edge of a wooden bench in the lower corner. The wall is the subject and the frames stay small."
    ) + CLEAN, 12)
job("ind-lighting", *IND, COMMON + (
    "A single sculptural pendant lamp with a matte ceramic shade hanging over an empty oak dining "
    "table, switched on with a warm glow. Plain sand-coloured wall behind, a lot of empty space "
    "above the table. The lamp is the only object in focus.") + CLEAN, 13)
job("ind-kitchen", *IND, COMMON + (
    "A minimal kitchen worktop in warm off-white, matte handleless cabinets, a light stone "
    "splashback, one ceramic bowl and a small olive plant. Daylight from a window on the left. "
    "No appliances visible, no clutter.") + CLEAN, 14)
job("ind-flooring", *IND, COMMON + (
    "A close low-angle view of a large hand-woven wool rug in sand and beige tones lying on a "
    "wide-plank oak floor, the corner of a linen armchair leg entering the frame at the top. "
    "The texture of the weave is clearly visible.") + CLEAN, 15)
job("ind-realestate", *IND, COMMON + (
    "An empty unfurnished apartment room with white walls, oak herringbone floor, one tall window "
    "with sheer curtains, afternoon light falling across the floor. Completely empty with no "
    "furniture at all. It feels full of possibility, not abandoned.") + CLEAN, 16)

# ------------------------------------------------------------- 2. koraci
STEP = 1200, 750
job("step-1-photograph", *STEP, COMMON + (
    "A single hand entering the frame from the right edge, holding a smartphone in portrait "
    "orientation and photographing a living room wall with a linen sofa. The phone screen shows "
    "the same room it is pointed at. Nothing of the person is in the picture except that one hand "
    "and forearm in a neutral sleeve — no head, no shoulder, no back of a head, no reflection of "
    "a person. The room fills the rest of the frame. The phone screen shows only the photograph "
    "itself, with no camera buttons, no icons and no writing of any kind on it.") + CLEAN, 29)
job("step-2-understand", *STEP, COMMON + (
    "A living room corner with a linen sofa in warm sand colour against a plain off-white wall, one "
    "oak side table and a plant, wide-plank oak floor. Photographed straight on, the whole room "
    "clearly visible and evenly lit. All walls are painted plain off-white.") + CLEAN, 27,
    after=teal_wash)
job("step-3-recommend", *STEP, COMMON + (
    "Three interior objects arranged side by side on a plain sand-coloured background, evenly "
    "spaced, photographed straight on: a framed abstract print, a ceramic table lamp and a folded "
    "wool throw. Product-catalogue styling with a soft shadow under each.") + CLEAN, 23)
job("step-4-preview", *STEP, COMMON + (
    "A living room wall above a linen sofa with one large framed abstract artwork hanging on it, "
    "photographed straight on so the wall fills the frame. The artwork is clearly the finished "
    "result and the room looks complete.") + CLEAN, 24)

# --------------------------------------------------------------- 3. hero
job("hero-room", 1200, 800, COMMON + (
    "A living room photographed by someone standing in the doorway: a linen sofa against a large "
    "empty off-white wall, oak floor, one plant in the corner. The empty wall takes up the upper "
    "half of the frame. Slightly casual framing, as if taken on a phone.") + CLEAN, 31)

PIECE = (
    "A single interior product photographed straight on, centred, on a plain {bg} background, "
    "a soft shadow beneath it, catalogue styling with a generous margin around the object. "
    "The object is {obj}."
)
job("hero-piece-1", 800, 800, COMMON + PIECE.format(
    bg="warm sand", obj="a framed abstract landscape print in a thin light oak frame") + CLEAN, 32)
job("hero-piece-2", 800, 800, COMMON + PIECE.format(
    bg="off-white", obj="a ceramic table lamp with a linen shade") + CLEAN, 33)
job("hero-piece-3", 800, 800, COMMON + PIECE.format(
    bg="warm beige",
    obj="one square hand-woven wool rug in sand and deep teal tones, shot as a flat lay from "
        "directly overhead so the rug fills most of the frame as a clean square with no "
        "perspective, no wall and no horizon in the picture, the weave and the fringed edges "
        "clearly visible") + CLEAN, 43)

# ---------------------------------------------------------- 4. probaj sam
job("try-room", 1200, 900, COMMON + (
    "A bedroom photographed from the foot of the bed: a made bed with linen bedding in warm neutral "
    "tones, a large completely empty wall above the headboard, one bedside table with a small lamp. "
    "The empty wall above the bed is the focus of the composition.") + CLEAN, 41)

# ------------------------------------------------------------ 5. galerija
# Za crteze figure izostavljamo zabranu ljudi — sve ostalo ostaje.
CLEAN_ART = CLEAN.replace(" No people and no faces in the frame.", " No visible face.")

ART = [
    ("art-01", "a soft horizontal seascape in pale grey-green and sand, minimal and calm", 151),
    ("art-02", "a warm textured abstract in copper and deep brown with thick brushstrokes", 152),
    # Figura ovde ne prolazi — NVIDIA filter na svaki crtez tela vrati crn
    # pravougaonik, pa isti mid-century duh nosi apstraktna linijska kompozicija.
    ("art-03", "a bold mid-century abstract composition in charcoal on warm cream paper: several "
     "thick black curved shapes and confident straight lines spread across the whole sheet, the "
     "black marks covering a good part of the picture, high contrast, nothing left empty", 241),
    ("art-04", "a bold black and white geometric grid of about six large hard-edged squares across and eight down, each square big enough to read on its own, screen-print look, the grid filling the picture right into the corners", 204),
    ("art-05", "a wide three-part coastal landscape in soft greens and off-white", 155),
    ("art-06", "a single wide black sumi ink brush stroke sweeping across rice paper, an abstract mark and never a written character or letter", 166),
    ("art-07", "an industrial photographic abstract of concrete and steel in cool grey", 157),
    ("art-08", "a botanical fern study in deep green with gold leaf accents", 158),
    ("art-09", "two roughly equal soft blocks of warm sand and deep teal meeting across bare "
     "linen, minimal, with visible weave and a soft painted edge between the two blocks", 229),
    ("art-10", "a dark moody floral oil painting in deep green and gold with heavy impasto, the flowers gathered in the middle of the picture and the dark leaves reaching to every edge", 190),
    ("art-11", "a small brutalist architecture photograph, grey concrete, high contrast", 71),
    ("art-12", "a very calm seascape in pale blue and off-white with a clear low horizon line, soft clouds above and gentle texture on the water, filling the whole picture", 192),
]
for name, style, seed, *rest in ART:
    # „Bez ljudi u kadru" ubija crtez figure — model vrati crn pravougaonik.
    # Radovi koji prikazuju figuru zato nose blazu zabranu.
    tail = rest[0] if rest else CLEAN
    job(name, 900, 1200, ART_FRAME + style + "." + tail, seed, pre=art_crop)

# -------------------------------------------------------------- 6. deljenje
job("og-spacematch", 1200, 630, COMMON + (
    "A living room wall seen straight on: the left half is a completely empty off-white wall and "
    "the right half has a large framed abstract artwork already hanging. The contrast between the "
    "empty side and the finished side is the whole idea, and the left third stays visually quiet."
    ) + CLEAN, 71)


def generate(job_, key, tries=3):
    gw, gh = size_for(job_["w"], job_["h"])
    body = json.dumps({
        "admin_key": key,
        "model": "flux.1-dev",
        "prompt": job_["prompt"],
        "width": gw,
        "height": gh,
        "steps": 40,
        "cfg": 3.5,
        "seed": job_["seed"],
    }).encode()
    last = ""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(
                URL, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
            if data.get("b64"):
                return base64.b64decode(data["b64"]), data.get("via", "?")
            last = str(data.get("tried") or data.get("error"))[:200]
        except Exception as e:  # mreza ume da zakaze, vredi probati ponovo
            last = str(e)[:200]
        time.sleep(2 + 3 * attempt)
    raise RuntimeError(f"{job_['name']}: {last}")


def finish(raw, name, w, h, after=None, pre=None):
    """Krop na tacan odnos, pa tacne dimenzije, pa JPG + WebP + mala verzija."""
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if pre:
        im = pre(im)
    want = w / h
    have = im.width / im.height
    if have > want:  # preširoko — secemo sa strane
        new = round(im.height * want)
        left = (im.width - new) // 2
        im = im.crop((left, 0, left + new, im.height))
    elif have < want:  # previsoko — secemo odozgo i odozdo
        new = round(im.width / want)
        top = (im.height - new) // 2
        im = im.crop((0, top, im.width, top + new))
    im = im.resize((w, h), Image.LANCZOS)
    if after:
        im = after(im)

    os.makedirs(OUT, exist_ok=True)
    # Gusto slikan rad ume da nabuja; nekoliko koraka nize niko ne vidi,
    # a stotinu kilobajta na mobilnoj vezi se oseti.
    for q, wq in ((84, 80), (76, 72), (68, 64)):
        im.save(os.path.join(OUT, f"{name}.jpg"), "JPEG", quality=q,
                optimize=True, progressive=True)
        im.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=wq, method=6)
        if os.path.getsize(os.path.join(OUT, f"{name}.webp")) <= 90 * 1024:
            break
    small = im.resize((round(w * 0.5), round(h * 0.5)), Image.LANCZOS)
    small.save(os.path.join(OUT, f"{name}@0.5x.webp"), "WEBP", quality=78, method=6)
    return (os.path.getsize(os.path.join(OUT, f"{name}.jpg")),
            os.path.getsize(os.path.join(OUT, f"{name}.webp")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("ADMIN_KEY", ""))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("names", nargs="*")
    a = ap.parse_args()
    if not a.key:
        sys.exit("nedostaje --key (ADMIN_KEY)")

    todo = [j for j in JOBS if not a.names or j["name"] in a.names]
    failed = []
    for i, j in enumerate(todo, 1):
        path = os.path.join(OUT, j["name"] + ".jpg")
        if os.path.exists(path) and not a.force:
            print(f"[{i}/{len(todo)}] {j['name']}: vec postoji, preskacem", flush=True)
            continue
        t0 = time.time()
        try:
            raw, via = generate(j, a.key)
            jpg, webp = finish(raw, j["name"], j["w"], j["h"], j.get("after"), j.get("pre"))
            print(f"[{i}/{len(todo)}] {j['name']}: {j['w']}x{j['h']} "
                  f"jpg {jpg // 1024}kB webp {webp // 1024}kB "
                  f"({via}, {time.time() - t0:.0f}s)", flush=True)
        except Exception as e:
            failed.append(j["name"])
            print(f"[{i}/{len(todo)}] {j['name']}: NIJE USPELO — {e}", flush=True)

    print(("sve gotovo" if not failed else "nije uspelo: " + ", ".join(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
