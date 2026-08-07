#!/usr/bin/env python3
"""Katalog demo galerije koju šaljemo potencijalnim klijentima.

Do sada je demo stajao na nasumičnim slikama sa interneta — što znači da je
mogao da se raspadne bez ijedne naše promene. Ovde su iste dvanaest slika, ali
naše, sa našeg domena, i ceo katalog se može ponovo napraviti jednom komandom:

    python3 tools/spacematch-seed-demo.py --key <sm_ kljuc demo studija>

Skripta prvo obriše zatečeni katalog, pa ubaci ovaj — dakle bezbedno je
pokrenuti je više puta.
"""

import argparse
import json
import sys
import urllib.request

URL = "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/spacematch"

PRODUCTS = [
    {
        "title": "Quiet Horizon",
        "description": "Large abstract seascape, hand-finished on cotton canvas.",
        "price": "640",
        "style": "minimal,scandinavian",
        "colors": "#e8e2d9,#b8c4c9,#6f7c82",
        "materials": "canvas,oak frame",
        "room_types": "living room,bedroom",
        "width_cm": "120",
        "height_cm": "90",
        "tags": "light,pale,calm",
        "popularity": 38,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-01.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Copper Field",
        "description": "Warm textured abstract with brushed copper leaf.",
        "price": "890",
        "style": "mid-century,eclectic",
        "colors": "#b5714a,#e3c9a8,#3a2a22",
        "materials": "canvas,copper leaf",
        "room_types": "living room,dining room",
        "width_cm": "100",
        "height_cm": "140",
        "tags": "warm,brass,statement",
        "popularity": 26,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-02.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Studio Line, 1962",
        "description": "Archival print of a mid-century line study.",
        "price": "210",
        "style": "mid-century,traditional",
        "colors": "#f2ede4,#4a4038",
        "materials": "paper,walnut frame",
        "room_types": "bedroom,hallway",
        "width_cm": "50",
        "height_cm": "70",
        "tags": "dark,walnut,classic",
        "popularity": 44,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-03.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Grid No. 7",
        "description": "Monochrome geometry, screen printed by hand.",
        "price": "320",
        "style": "modern,minimal",
        "colors": "#ffffff,#111111",
        "materials": "paper,aluminium frame",
        "room_types": "office,hallway,living room",
        "width_cm": "70",
        "height_cm": "70",
        "tags": "white,gloss,graphic",
        "popularity": 31,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-04.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Salt Marsh Triptych",
        "description": "Three-panel coastal landscape in soft greens.",
        "price": "1450",
        "style": "coastal,rustic",
        "colors": "#cfd8c5,#8fa07f,#e6e2d3",
        "materials": "canvas,ash frame",
        "room_types": "living room,dining room",
        "width_cm": "180",
        "height_cm": "80",
        "tags": "light,pale,wide",
        "popularity": 18,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-05.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Ink Bloom",
        "description": "Japanese-inspired sumi ink study on rice paper.",
        "price": "380",
        "style": "japandi,minimal",
        "colors": "#f6f3ec,#2b2b2b,#8a7f6d",
        "materials": "rice paper,oak frame",
        "room_types": "bedroom,office",
        "width_cm": "60",
        "height_cm": "90",
        "tags": "light,calm,paper",
        "popularity": 35,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-06.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Concrete Study II",
        "description": "Small format brutalist photograph.",
        "price": "150",
        "style": "industrial,minimal",
        "colors": "#9a9a97,#d5d3cd,#3c3c3a",
        "materials": "paper,black frame",
        "room_types": "office,hallway",
        "width_cm": "40",
        "height_cm": "50",
        "tags": "grey,matte,small",
        "popularity": 47,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-07.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Gilded Fern",
        "description": "Botanical study with gold leaf detail.",
        "price": "540",
        "style": "art-deco,traditional",
        "colors": "#0f3d33,#c8a24a,#f0e9dc",
        "materials": "canvas,gold frame",
        "room_types": "dining room,hallway",
        "width_cm": "60",
        "height_cm": "80",
        "tags": "gold,brass,rich",
        "popularity": 29,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-08.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Pale Dune",
        "description": "Sand-toned minimal abstract, unframed.",
        "price": "420",
        "style": "minimal,japandi,scandinavian",
        "colors": "#efe6d8,#d8c7ae,#a8916d",
        "materials": "linen",
        "room_types": "bedroom,living room",
        "width_cm": "80",
        "height_cm": "100",
        "tags": "light,pale,linen",
        "popularity": 41,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-09.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Night Garden",
        "description": "Deep-toned floral oil, heavy impasto.",
        "price": "1180",
        "style": "traditional,eclectic",
        "colors": "#14211c,#4a5d3f,#c9a86b",
        "materials": "oil,canvas,walnut frame",
        "room_types": "dining room,bedroom",
        "width_cm": "100",
        "height_cm": "100",
        "tags": "dark,walnut,moody",
        "popularity": 15,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-10.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Foundry",
        "description": "Industrial photographic print on brushed steel.",
        "price": "760",
        "style": "industrial,modern",
        "colors": "#3f4448,#8c9296,#1a1c1e",
        "materials": "steel,acrylic",
        "room_types": "office,living room",
        "width_cm": "90",
        "height_cm": "120",
        "tags": "dark,charcoal,matte",
        "popularity": 22,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-11.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    },
    {
        "title": "Wide Coast",
        "description": "Panoramic seascape for above a sofa.",
        "price": "1690",
        "style": "coastal,contemporary",
        "colors": "#dfe7ea,#7fa0ad,#f3efe6",
        "materials": "canvas,ash frame",
        "room_types": "living room",
        "width_cm": "200",
        "height_cm": "70",
        "tags": "light,wide,glass",
        "popularity": 24,
        "image_url": "https://safenessai.co.uk/spacematch/img/art-12.jpg",
        "url": "https://safenessai.co.uk/spacematch/"
    }
]


def call(payload):
    req = urllib.request.Request(
        URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="api_key demo studija (sm_...)")
    ap.add_argument("--slug", default="demo")
    a = ap.parse_args()

    old = call({"action": "products", "slug": a.slug}).get("products", [])
    for p in old:
        call({"action": "t-product-del", "api_key": a.key, "id": p["id"]})
    print(f"obrisano: {len(old)}")

    for p in PRODUCTS:
        r = call({"action": "t-product-add", "api_key": a.key, "product": p})
        if not r.get("ok"):
            sys.exit(f"nije ubaceno {p['title']}: {r}")
    print(f"ubaceno: {len(PRODUCTS)}")

    now = call({"action": "products", "slug": a.slug}).get("products", [])
    bad = [p["title"] for p in now if "safenessai.co.uk" not in (p.get("image_url") or "")]
    print("katalog:", len(now), "tudjih slika:", len(bad) or "nema")
    return 1 if bad or len(now) != len(PRODUCTS) else 0


if __name__ == "__main__":
    sys.exit(main())
