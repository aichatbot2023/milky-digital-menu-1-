#!/usr/bin/env python3
"""Prevod SafeNest interfejsa na sve jezike iz birača.

Aplikacija je nudila 42 jezika, a interfejs je postojao na dva. AI sadržaj
je stizao na izabranom jeziku, a dugmad i upozorenja ostajala na engleskom —
tačno ono mešanje koje ne sme da se desi u aplikaciji o bezbednosti deteta.

Engleski i srpski su ručno pisani i ovde se NE diraju: oni su izvor. Za
svaki drugi jezik pravi se `src/lib/locales/<kod>.ts`, koji aplikacija
učitava lenjo — u paket ulazi samo jezik koji je korisnik izabrao.

    python3 tools/safenest-translate.py --key <ADMIN_KEY> [kod ...]

Prevodi se samo ono što u fajlu jezika još ne postoji, pa dodavanje nove
grupe tekstova ne znači ponovno plaćanje celog jezika; `--force` prevodi sve
iznova.

Prevodi se u paketima; svaki paket se proverava pre nego što se prihvati
(svi ključevi prisutni, ništa prazno, ništa ostalo na engleskom, pismo
odgovara jeziku). Paket koji padne proveru se ponavlja, a ako i dalje pada,
kvarni ključevi se traže pojedinačno. Ništa se ne upisuje dok ceo jezik ne
prođe.
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "lib", "i18n.ts")
OUT = os.path.join(ROOT, "src", "lib", "locales")
URL = "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/free-llm"

# Kod: (ime na engleskom, ocekivano pismo). Engleski i srpski nisu ovde —
# oni su izvor i ostaju ručno pisani.
LANGS = {
    "es": ("Spanish", "latin"),
    "pt": ("Portuguese (European)", "latin"),
    "fr": ("French", "latin"),
    "de": ("German", "latin"),
    "it": ("Italian", "latin"),
    "nl": ("Dutch", "latin"),
    "pl": ("Polish", "latin"),
    "ru": ("Russian", "cyrillic"),
    "uk": ("Ukrainian", "cyrillic"),
    "tr": ("Turkish", "latin"),
    "ar": ("Arabic", "arabic"),
    "he": ("Hebrew", "hebrew"),
    "fa": ("Persian (Farsi)", "arabic"),
    "ur": ("Urdu", "arabic"),
    "hi": ("Hindi", "devanagari"),
    "bn": ("Bengali", "bengali"),
    "zh": ("Simplified Chinese", "han"),
    "ja": ("Japanese", "han"),
    "ko": ("Korean", "hangul"),
    "id": ("Indonesian", "latin"),
    "ms": ("Malay", "latin"),
    "vi": ("Vietnamese", "latin"),
    "th": ("Thai", "thai"),
    "fil": ("Filipino (Tagalog)", "latin"),
    "sw": ("Swahili", "latin"),
    "sv": ("Swedish", "latin"),
    "no": ("Norwegian (Bokmål)", "latin"),
    "da": ("Danish", "latin"),
    "fi": ("Finnish", "latin"),
    "el": ("Greek", "greek"),
    "cs": ("Czech", "latin"),
    "sk": ("Slovak", "latin"),
    "hu": ("Hungarian", "latin"),
    "ro": ("Romanian", "latin"),
    "bg": ("Bulgarian", "cyrillic"),
    "hr": ("Croatian", "latin"),
    "bs": ("Bosnian", "latin"),
    "sl": ("Slovenian", "latin"),
    "mk": ("Macedonian", "cyrillic"),
    "sq": ("Albanian", "latin"),
}

SCRIPT_RANGES = {
    "cyrillic": ("CYRILLIC",),
    "arabic": ("ARABIC",),
    "hebrew": ("HEBREW",),
    "devanagari": ("DEVANAGARI",),
    "bengali": ("BENGALI",),
    "han": ("CJK", "HIRAGANA", "KATAKANA"),
    "hangul": ("HANGUL",),
    "thai": ("THAI",),
    "greek": ("GREEK",),
    "latin": ("LATIN",),
}

BATCH = 30

# Reči koje smeju ostati iste u svakom jeziku — brend i tehnicki pojmovi.
# „⭐ SafeNest AI Premium" nema šta da se prevede, pa ne sme da pada proveru.
ALLOWED_SAME = {
    "safenest", "ai", "ok", "email", "mail", "pdf", "url", "sms", "premium", "pro",
    "app", "web", "wifi", "gps", "id", "sos", "csv", "qr",
}


def translatable(text):
    """Šta u tekstu uopšte ima da se prevede — bez brenda, brojeva i znakova."""
    rest = [w for w in re.findall(r"[^\W\d_]{2,}", text, re.UNICODE)
            if w.lower() not in ALLOWED_SAME]
    return "".join(rest)


VAL = r'((?:"(?:[^"\\]|\\.)*")|(?:\'(?:[^\'\\]|\\.)*\'))'


def _unquote(raw):
    return json.loads(raw) if raw[0] == '"' else raw[1:-1].replace("\\'", "'")


def _named(text, name, prefix, out):
    """Mape oblika  KLJUC: { en: "...", sr: "..." }."""
    body = re.search(r"const " + name + r"[^=]*=\s*\{(.*?)\n\};", text, re.S).group(1)
    rx = re.compile(r'"?([\w.\-+]+)"?:\s*\{\s*en:\s*' + VAL + r',\s*sr:\s*' + VAL + r',?\s*\}')
    for m in rx.finditer(body):
        out[prefix + m.group(1)] = _unquote(m.group(2))


def _listed(text, name, prefix, out, sr_first=True):
    """Mape oblika  KLJUC: [ { sr: "...", en: "..." }, ... ] — kljuc je redni broj."""
    body = re.search(r"const " + name + r"[^=]*=\s*\{(.*?)\n\};", text, re.S).group(1)
    first, second = ("sr", "en") if sr_first else ("en", "sr")
    item = re.compile(r"\{\s*" + first + r":\s*" + VAL + r",\s*" + second + r":\s*" + VAL + r",?\s*\}")
    group = re.compile(r'"?([\w.\-+]+)"?:\s*\[(.*?)\n  \]', re.S)
    for g in group.finditer(body):
        for i, m in enumerate(item.finditer(g.group(2))):
            out[f"{prefix}{g.group(1)}.{i}"] = _unquote(m.group(2 if sr_first else 1))


def source():
    """Engleski i srpski iz koda — jedini izvor istine.

    Skupljeno je i ono što nije u i18n.ts: vodiči prve pomoći, čekliste po
    prostoriji i smernice ishrane. Te tekstove korisnik vidi bez interneta,
    pa moraju da govore njegovim jezikom kao i sve ostalo.
    """
    out = {}
    ui = open(SRC, encoding="utf-8").read()
    for name, prefix in (("D", ""), ("AGE", "$age."), ("ROOM", "$room."),
                         ("SEV", "$sev."), ("CAT", "$cat.")):
        _named(ui, name, prefix, out)

    guides = open(os.path.join(ROOT, "src", "lib", "guides.ts"), encoding="utf-8").read()
    _listed(guides, "CHECKLISTS", "$chk.", out)
    aid = re.search(r"const FIRST_AID[^=]*=\s*\[(.*?)\n\];", guides, re.S).group(1)
    for block in re.finditer(
            r'id: "([\w-]+)",.*?title: \{\s*sr:\s*' + VAL + r',\s*en:\s*' + VAL +
            r'\s*\},\s*steps:\s*\[(.*?)\n    \]', aid, re.S):
        out[f"$aid.{block.group(1)}.t"] = _unquote(block.group(3))
        step = re.compile(r"\{\s*sr:\s*" + VAL + r",\s*en:\s*" + VAL + r",?\s*\}")
        for i, m in enumerate(step.finditer(block.group(4))):
            out[f"$aid.{block.group(1)}.{i}"] = _unquote(m.group(2))

    food = open(os.path.join(ROOT, "src", "lib", "food.ts"), encoding="utf-8").read()
    _listed(food, "FOOD_BY_AGE", "$fd.", out)
    always = re.search(r"const FOOD_ALWAYS[^=]*=\s*\[(.*?)\n\];", food, re.S).group(1)
    step = re.compile(r"\{\s*sr:\s*" + VAL + r",\s*en:\s*" + VAL + r",?\s*\}")
    for i, m in enumerate(step.finditer(always)):
        out[f"$fd.always.{i}"] = _unquote(m.group(2))

    # Baza znanja: naziv, zašto, statistika i rešenje za svako pravilo koje
    # se prepoznaje lokalno, bez interneta. To je tekst koji roditelj vidi
    # na svakom nalazu, pa mora da bude na njegovom jeziku kao i sve ostalo.
    know = open(os.path.join(ROOT, "src", "lib", "hazardKnowledge.ts"), encoding="utf-8").read()
    en_body = re.search(r"const RULES_EN[^=]*=\s*\{(.*?)\n\};", know, re.S).group(1)
    for line in en_body.splitlines():
        m = re.match(r'\s*"?([\w \-\']+)"?:\s*\{(.*)\},?\s*$', line)
        if not m:
            continue
        rid, fields = m.group(1).strip(), m.group(2)
        for field in ("label", "why", "stats", "fix"):
            f = re.search(field + r":\s*" + VAL, fields)
            if f:
                out[f"$kn.{rid}.{field}"] = _unquote(f.group(1))

    prio = open(os.path.join(ROOT, "src", "lib", "priority.ts"), encoding="utf-8").read()
    for m in re.finditer(r'localized\("(\$pr\.[\w.]+)", \{\s*sr:\s*' + VAL +
                         r',\s*en:\s*' + VAL + r',?\s*\}\)', prio, re.S):
        out[m.group(1)] = _unquote(m.group(3))
    return out


# Merenjem utvrdjeno: Nemotron na bengalskom i svahiliju vraca besmislice,
# pa se prevod trazi samo od modela koji te jezike zaista zna.
GOOD = ("lovable", "gemini", "openrouter")


def ask(prompt, key, tries=4):
    body = json.dumps({
        "admin_key": key,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 4000,
    }).encode()
    last = ""
    for attempt in range(tries):
        for provider in GOOD:
            payload = json.loads(body)
            payload["provider"] = provider
            data_bytes = json.dumps(payload).encode()
            try:
                req = urllib.request.Request(
                    URL, data=data_bytes, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=200) as r:
                    data = json.loads(r.read())
                text = data.get("text") or ""
                if text:
                    return text
                last = str(data.get("tried") or data)[:200]
            except Exception as e:
                last = f"{provider}: {str(e)[:160]}"
        time.sleep(2 + 3 * attempt)
    raise RuntimeError(last)


def parse(text):
    """Model ume da doda uvod ili ogradu — vadimo samo JSON."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("nema JSON-a u odgovoru")
    return json.loads(text[start:end + 1])


def script_ok(text, want):
    """Bar jedno slovo mora biti u pismu tog jezika."""
    names = SCRIPT_RANGES[want]
    for ch in text:
        if ch.isalpha():
            try:
                n = unicodedata.name(ch)
            except ValueError:
                continue
            if any(n.startswith(p) or p in n for p in names):
                return True
    return False


def check(part, got, want_script):
    """Vraća ključeve koje treba ponoviti, sa razlogom."""
    bad = {}
    for k, en in part.items():
        v = got.get(k)
        if not isinstance(v, str) or not v.strip():
            bad[k] = "prazno"
            continue
        if len(v) > max(60, len(en) * 4):
            bad[k] = "predugo"
            continue
        # Emodži iz izvora mora da preživi — nosi značenje u dugmadima.
        src_emoji = [c for c in en if ord(c) > 0x2190]
        if src_emoji and not all(c in v for c in src_emoji):
            bad[k] = "izgubljen emodži"
            continue
        holes = re.findall(r"\{\w+\}", en)
        if holes and not all(h in v for h in holes):
            bad[k] = "izgubljen {n}"
            continue
        letters = [c for c in v if c.isalpha()]
        if not letters:
            continue  # samo broj ili znak — u redu
        if not script_ok(v, want_script):
            bad[k] = "pogrešno pismo"
            continue
        if v.strip() == en.strip() and len(translatable(en)) > 8:
            bad[k] = "ostalo na engleskom"
    return bad


PROMPT = """You are translating the interface of SafeNest, a mobile app that helps parents
find hazards for small children in a room and shows how to remove them.

OUTPUT LANGUAGE: {lang}

Translate every value below into {lang}. Rules:
- Return ONLY a JSON object with exactly the same keys. No commentary, no code fence.
- Translate the value, never the key.
- Keep any emoji exactly where it is.
- Keep any placeholder in curly braces (like {{n}}) exactly as it is — it is filled
  in with a number at runtime. Put it where the sentence needs it.
- These are buttons, labels and short warnings on a phone screen: keep them SHORT,
  natural and idiomatic. Never longer than about 1.5x the English.
- Use the register a careful safety app would use with a parent: calm, plain, direct.
  Never playful, never marketing language.
- First-aid and warning texts must stay medically precise. Do not soften, do not add
  advice that is not there, do not drop the instruction to call emergency services.
  Keep every number exactly as it is: ages, months, quantities, counts of
  compressions or blows, and emergency phone numbers.
- "SafeNest" is the product name and stays as it is.
- Use the natural word for each thing in {lang}, not a word-by-word calque of English.

JSON to translate:
{json}"""


def translate_lang(code, src, key, verbose=True):
    name, script = LANGS[code]
    keys = list(src)
    out = {}
    for i in range(0, len(keys), BATCH):
        part = {k: src[k] for k in keys[i:i + BATCH]}
        got = {}
        for attempt in range(3):
            try:
                raw = ask(PROMPT.format(lang=name, json=json.dumps(part, ensure_ascii=False, indent=1)), key)
                cand = parse(raw)
            except Exception as e:
                if verbose:
                    print(f"    paket {i // BATCH + 1}: {e}", flush=True)
                continue
            got = {k: cand.get(k) for k in part}
            bad = check(part, got, script)
            if not bad:
                break
            if attempt == 2:
                # Poslednji pokušaj: samo problematični ključevi, jedan po jedan.
                for k in bad:
                    try:
                        one = parse(ask(PROMPT.format(
                            lang=name, json=json.dumps({k: part[k]}, ensure_ascii=False)), key))
                        got[k] = one.get(k)
                    except Exception:
                        pass
            elif verbose:
                print(f"    paket {i // BATCH + 1}: ponavljam {len(bad)} ({list(bad.values())[:3]})", flush=True)
        for k in part:
            out[k] = got.get(k) or src[k]
    return out


def read_locale(code):
    """Šta je za taj jezik već prevedeno — da drugi prolaz ne plaća isto dvaput."""
    path = os.path.join(OUT, f"{code}.ts")
    if not os.path.exists(path):
        return {}
    body = open(path, encoding="utf-8").read()
    pair = re.compile(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$', re.M)
    return {json.loads(k): json.loads(v) for k, v in pair.findall(body)}


def write_locale(code, table):
    os.makedirs(OUT, exist_ok=True)
    name = LANGS[code][0]
    lines = [
        "// Prevod interfejsa — pravi ga tools/safenest-translate.py.",
        f"// Jezik: {name}. Ne menjati ručno: sledeće pokretanje alata briše izmene.",
        "// Engleski i srpski se ne generišu — oni su izvor i žive u ../i18n.ts.",
        "",
        "export default {",
    ]
    for k, v in table.items():
        lines.append(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},")
    lines += ["} as Record<string, string>;", ""]
    path = os.path.join(OUT, f"{code}.ts")
    open(path, "w", encoding="utf-8").write("\n".join(lines))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("ADMIN_KEY", ""))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("codes", nargs="*")
    a = ap.parse_args()
    if not a.key:
        sys.exit("nedostaje --key (ADMIN_KEY)")

    src = source()
    print(f"izvor: {len(src)} tekstova", flush=True)
    todo = a.codes or list(LANGS)
    failed = []
    for n, code in enumerate(todo, 1):
        if code not in LANGS:
            print(f"[{n}/{len(todo)}] {code}: nepoznat jezik, preskacem", flush=True)
            continue
        have = {} if a.force else read_locale(code)
        # Prevodi se samo ono cega nema — kad se doda nova grupa tekstova,
        # drugi prolaz kosta koliko i ta grupa, a ne kao ceo jezik.
        missing = {k: v for k, v in src.items() if k not in have}
        if not missing:
            print(f"[{n}/{len(todo)}] {code}: kompletan, preskacem", flush=True)
            continue
        t0 = time.time()
        try:
            table = {**have, **translate_lang(code, missing, a.key)}
            table = {k: table[k] for k in src}
            left = check(src, table, LANGS[code][1])
            write_locale(code, table)
            note = f"sumnjivih {len(left)}" if left else "cist"
            print(f"[{n}/{len(todo)}] {code} ({LANGS[code][0]}): +{len(missing)} novih, "
                  f"{len(table)} ukupno, {note}, {time.time() - t0:.0f}s", flush=True)
        except Exception as e:
            failed.append(code)
            print(f"[{n}/{len(todo)}] {code}: NIJE USPELO — {e}", flush=True)
    print("sve gotovo" if not failed else "nije uspelo: " + ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
