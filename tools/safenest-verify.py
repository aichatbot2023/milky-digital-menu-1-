#!/usr/bin/env python3
"""Povratna provera prevoda SafeNest interfejsa.

Prevod se proverava tako što se vrati na engleski — bez originala pred
sobom — pa se dobijeni tekst uporedi sa polaznim. Ako se značenje izgubilo,
ovde se to vidi; obična provera pisma i dužine to ne hvata (svahili je znao
da za „Critical" vrati „Kifedha", što je pravilan svahili i pogrešno
značenje).

Ne proverava se svih 255 tekstova na svih 40 jezika — to bi bilo deset
hiljada poziva bez svrhe. Proveravaju se tekstovi gde greška zaista boli:
prva pomoć, upozorenja, nazivi opasnosti i stepeni ozbiljnosti.

    python3 tools/safenest-verify.py --key <ADMIN_KEY> [kod ...]

Izveštaj ide na ekran i u `docs/prevod-provera.md`.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from safenest_translate_lib import LANGS, ask, parse, source  # noqa: E402

OUT = os.path.join(ROOT, "src", "lib", "locales")
REPORT = os.path.join(ROOT, "docs", "prevod-provera.md")

# Tekstovi na kojima greška ima cenu: uputstva prve pomoći, upozorenja,
# nazivi opasnosti i stepeni ozbiljnosti.
def risky(keys):
    return [k for k in keys
            if k.startswith(("fa.", "$cat.", "$sev.", "$age."))
            or "warning" in k or "emergency" in k or "danger" in k]


BACK = """Translate the following JSON values into English. This is interface text from
a child-safety mobile app. Return ONLY a JSON object with the same keys and the
English meaning as the value — a plain, literal translation, not a paraphrase.
Do not explain anything.

{json}"""


def words(s):
    return {w for w in re.findall(r"[a-z]{4,}", s.lower())}


def compare(en, back):
    """Grubo poklapanje značenja — deli li povratni prevod ključne reči."""
    a, b = words(en), words(back)
    if not a:
        return 1.0
    return len(a & b) / len(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("ADMIN_KEY", ""))
    ap.add_argument("codes", nargs="*")
    a = ap.parse_args()
    if not a.key:
        sys.exit("nedostaje --key (ADMIN_KEY)")

    src = source()
    keys = risky(list(src))
    print(f"proveravam {len(keys)} osetljivih tekstova po jeziku", flush=True)

    codes = a.codes or [c for c in LANGS if os.path.exists(os.path.join(OUT, f"{c}.ts"))]
    rows = []
    for n, code in enumerate(codes, 1):
        path = os.path.join(OUT, f"{code}.ts")
        if not os.path.exists(path):
            print(f"[{n}/{len(codes)}] {code}: nema fajla", flush=True)
            continue
        body = open(path, encoding="utf-8").read()
        table = dict(re.findall(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$', body, re.M))
        table = {json.loads(k): json.loads(v) for k, v in table.items()}
        part = {k: table[k] for k in keys if k in table}

        worst = []
        try:
            got = {}
            step = 25
            items = list(part)
            for i in range(0, len(items), step):
                chunk = {k: part[k] for k in items[i:i + step]}
                got.update(parse(ask(BACK.format(json=json.dumps(chunk, ensure_ascii=False, indent=1)), a.key)))
            for k in part:
                score = compare(src[k], str(got.get(k, "")))
                if score < 0.34:
                    worst.append((k, src[k], part[k], got.get(k), round(score, 2)))
        except Exception as e:
            print(f"[{n}/{len(codes)}] {code}: provera pala — {e}", flush=True)
            continue
        rows.append((code, len(part), worst))
        mark = "ok" if not worst else f"{len(worst)} za pogledati"
        print(f"[{n}/{len(codes)}] {code} ({LANGS[code][0]}): {mark}", flush=True)
        time.sleep(0.5)

    total = sum(len(w) for _, _, w in rows)
    lines = [
        "# Povratna provera prevoda",
        "",
        "Osetljivi tekstovi — prva pomoć, upozorenja, opasnosti, ozbiljnost —",
        "prevedeni su nazad na engleski i upoređeni sa polaznim tekstom.",
        "Ispod je sve gde se poklapanje značenja pokazalo slabim; to nije",
        "nužno greška, ali je mesto koje vredi pogledati.",
        "",
        f"Provereno: {len(rows)} jezika · {rows[0][1] if rows else 0} tekstova po jeziku · "
        f"za pogledati: {total}",
        "",
    ]
    for code, _, worst in rows:
        if not worst:
            continue
        lines += [f"## {code} — {LANGS[code][0]}", ""]
        for k, en, tr, back, score in worst:
            lines += [f"**`{k}`** ({score})", "", f"- polazno: {en}",
                      f"- prevod: {tr}", f"- nazad: {back}", ""]
    if total == 0:
        lines += ["Nijedan tekst nije pao ispod praga.", ""]
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, "w", encoding="utf-8").write("\n".join(lines))
    print(f"\nza pogledati ukupno: {total} · izveštaj: docs/prevod-provera.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
