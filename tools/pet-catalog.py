"""Katalog zaštite za LJUBIMCE.

Nije prevod dečjeg kataloga. Departman za ljubimce nalazi druge opasnosti, pa
mu trebaju drugi proizvodi: mrežica za prozor rešava ono što je kod mačke
najsmrtonosnije u stanu, a u dečjem katalogu je nema jer dete ne skače za
pticom sa petog sprata.

Svaki unos je vezan za KLJUČ REŠENJA iz baze znanja (`petKnowledge.ts`), a ne
za široku kategoriju. To je ono što je danas popravljeno u dečjem departmanu:
kad se popunjava po kategoriji, za kadu se ponudi kapija za stepenice.

    SUPABASE_TOKEN=... python3 tools/pet-catalog.py
"""
import json
import os
import subprocess
import sys

PROJECT = "equjrxwpxrkchicetyvs"
SQL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

# (kategorija, solves, ključ rešenja, naziv sr, naziv en, ključne reči, upit)
#
# `solves` su vrste opasnosti koje proizvod zaista rešava — po njima se bira,
# uz ključ rešenja. Upit je ono što se traži na Amazonu; namerno na engleskom,
# jer se pretraga vodi na amazon.co.uk.
PETS = [
    ("fall", "fall,other", "window_net",
     "Mrežica za prozor i balkon (mačke)", "Cat-proof window and balcony net",
     "cat window net balcony safety mesh anti escape",
     "cat safety window net balcony"),
    ("electric", "electric", "cord_cover",
     "Zaštitna cev za kablove", "Cable protector tubing",
     "cable protector cord cover chew proof pet rabbit spiral wrap",
     "chew proof cable protector pet"),
    ("poisoning", "poisoning,choking", "cabinet_lock",
     "Magnetne bravice za ormariće", "Magnetic cupboard locks",
     "magnetic cabinet lock child pet proof cupboard latch",
     "magnetic cupboard lock pet proof"),
    ("poisoning", "poisoning", "plant_shelf",
     "Viseća saksija van domašaja", "Hanging planter out of reach",
     "hanging planter macrame ceiling pot holder cat safe plant",
     "hanging planter ceiling hook"),
    ("strangulation", "strangulation", "cord_winder",
     "Namotač za gajtan roletne", "Blind cord safety winder",
     "blind cord winder cleat tidy safety wall",
     "blind cord safety winder"),
    ("burn", "burn", "hob_guard",
     "Poklopci za ringle", "Hob covers",
     "hob cover stove top protector cat paw burn guard",
     "hob cover stove top protector"),
    ("burn", "burn", "fireplace_guard",
     "Ograda za kamin i grejalicu", "Fireplace and heater guard",
     "fireplace guard screen pet safety fire surround heater",
     "fireplace guard pet safety"),
    ("choking", "choking", "small_parts_bin",
     "Kutija sa poklopcem za sitnice", "Lidded box for small items",
     "lidded storage box small parts coins batteries pet safe",
     "lockable small parts storage box"),
    ("drowning", "drowning", "toilet_lock",
     "Bravica za WC dasku", "Toilet lid lock",
     "toilet seat lock lid latch pet dog cat safety",
     "toilet lid lock pet"),
    ("fall", "fall", "stair_gate",
     "Kapija za stepenice (ljubimci)", "Pet stair gate",
     "pet stair gate dog barrier indoor rabbit puppy",
     "pet stair gate dog"),
    ("crush", "crush", "anti_tip_strap",
     "Trake protiv prevrtanja nameštaja", "Furniture anti-tip straps",
     "furniture anti tip strap tv wall anchor cat climbing",
     "furniture anti tip straps"),
    ("choking", "choking,cutting", "sewing_box",
     "Kutija za pribor za šivenje", "Lidded sewing box",
     "sewing box lidded thread storage cat safe needle",
     "lidded sewing storage box"),
]

BRAND = "Amazon UK"
TAG = "safenest0b-21"


def sql(query, token):
    """Upit ide kroz `curl` — posrednik u ovom okruženju urllib-u vraća 403."""
    body = json.dumps({"query": query})
    with open("/tmp/petq.json", "w") as f:
        f.write(body)
    out = subprocess.run(
        ["curl", "-sS", "-X", "POST", SQL,
         "-H", f"Authorization: Bearer {token}",
         "-H", "Content-Type: application/json",
         "--data-binary", "@/tmp/petq.json", "--max-time", "90"],
        capture_output=True, text=True, timeout=120)
    if out.returncode:
        raise RuntimeError(out.stderr[:200])
    return out.stdout


def esc(v: str) -> str:
    return v.replace("'", "''")


def main():
    token = os.environ.get("SUPABASE_TOKEN")
    if not token:
        sys.exit("treba SUPABASE_TOKEN")

    sql("alter table sn_products add column if not exists domain text not null default 'child'", token)
    # Ponovno pokretanje ne sme da napravi duplikate.
    sql("delete from sn_products where domain = 'pet'", token)

    rows = []
    for cat, solves, key, sr, en, kw, query in PETS:
        url = f"https://www.amazon.co.uk/s?k={query.replace(' ', '+')}&tag={TAG}"
        rows.append(
            f"('{esc(cat)}','{esc(BRAND)}','{esc(sr)}','{esc(en)}','{esc(url)}',"
            f"null,true,'{esc(kw + ' ' + key)}','{esc(solves)}','pet')")

    sql("insert into sn_products (category, brand, title, title_en, url, price, "
        "active, keywords, solves, domain) values " + ",".join(rows), token)

    got = json.loads(sql("select count(*)::int as n from sn_products where domain='pet'", token))
    print(f"katalog za ljubimce: {got[0]['n']} proizvoda")
    for _, _, key, sr, *_ in PETS:
        print(f"   {key:18} {sr}")


if __name__ == "__main__":
    main()
