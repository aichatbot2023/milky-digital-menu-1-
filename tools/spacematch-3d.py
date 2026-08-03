#!/usr/bin/env python3
"""Pravljenje 3D modela za proizvode iz kataloga klijenata.

Fotografija proizvoda ide kroz TRELLIS.2 (Microsoft, MIT licenca) i vraća se
kao GLB, koji se čuva kod nas i veže za proizvod. Kupcu posle stiže gotov
fajl — čekanje je obavljeno mnogo ranije.

Zašto ovo nije edge funkcija: jedan model traje minutima, a funkcija ima malo
memorije i prekine vezu posle dvadesetak sekundi. Ovde proces sme da čeka, i
koristi se zvanični `gradio_client` umesto ručno pisanog protokola.

    python3 tools/spacematch-3d.py --key <ADMIN_KEY> [--slug demo] [--limit 6]

Treba i `HF_TOKEN` u okruženju: bez njega deljena grafička kartica daje nula
sekundi. Ravni radovi — slike, posteri, ogledala — se ne šalju; njima ravan
zida i perspektiva rade posao, a model bi im samo dodao lažnu debljinu.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request

FN = "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/spacematch-3d"
SPACE = "microsoft/TRELLIS.2"


def call(payload, timeout=180):
    req = urllib.request.Request(
        FN, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def make(client, image_url, resolution="512"):
    """Jedan proizvod: fotografija → pripremljena slika → 3D → GLB."""
    from gradio_client import handle_file

    client.predict(api_name="/start_session")
    clean = client.predict(input=handle_file(image_url), api_name="/preprocess_image")

    client.predict(
        image=handle_file(clean),
        seed=0,
        resolution=resolution,
        # Tri grupe podešavanja koje Space traži: oblik, materijal, doterivanje.
        # Vrednosti su njegove podrazumevane — menja se samo rezolucija, jer
        # 1024 na deljenoj kartici traje minutima, a na telefonu se ne vidi.
        api_name="/image_to_3d",
    )

    out = client.predict(decimation_target=100000, texture_size=1024, api_name="/extract_glb")
    path = out[0] if isinstance(out, (list, tuple)) else out
    if isinstance(path, dict):
        path = path.get("path") or path.get("value")
    if not path or not os.path.exists(path):
        raise RuntimeError("izvlačenje GLB-a nije vratilo fajl")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("ADMIN_KEY", ""))
    ap.add_argument("--slug", default=None, help="samo jedan studio")
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--resolution", default="512", choices=["512", "1024", "1536"])
    a = ap.parse_args()
    if not a.key:
        sys.exit("nedostaje --key (ADMIN_KEY)")
    if not os.environ.get("HF_TOKEN"):
        print("upozorenje: nema HF_TOKEN — deljena kartica daje nula sekundi", flush=True)

    health = call({"admin_key": a.key, "action": "health"})
    print("stanje:", health, flush=True)

    todo = call({"admin_key": a.key, "action": "pending", "slug": a.slug, "limit": a.limit})
    work = todo.get("work", [])
    print(f"za obradu: {len(work)} · preskočeno kao ravno: {todo.get('skipped', 0)}", flush=True)
    if not work:
        return 0

    from gradio_client import Client
    client = Client(SPACE, hf_token=os.environ.get("HF_TOKEN"), verbose=False)

    done, failed = 0, []
    for n, p in enumerate(work, 1):
        t0 = time.time()
        try:
            path = make(client, p["image_url"], a.resolution)
            with open(path, "rb") as f:
                glb = base64.b64encode(f.read()).decode()
            saved = call({"admin_key": a.key, "action": "save",
                          "id": p["id"], "slug": p["slug"], "glb": glb}, timeout=300)
            if not saved.get("ok"):
                raise RuntimeError(str(saved)[:200])
            print(f"[{n}/{len(work)}] {p['title']}: {saved['bytes'] // 1024} kB, "
                  f"{time.time() - t0:.0f}s", flush=True)
            done += 1
        except Exception as e:
            reason = str(e)[:180]
            failed.append(f"{p['title']}: {reason}")
            call({"admin_key": a.key, "action": "fail", "id": p["id"], "reason": reason})
            print(f"[{n}/{len(work)}] {p['title']}: NIJE USPELO — {reason}", flush=True)

    print(f"\ngotovo: {done} · nije uspelo: {len(failed)}")
    for f in failed:
        print(" -", f)
    return 0 if done or not work else 1


if __name__ == "__main__":
    sys.exit(main())
