#!/usr/bin/env bash
#
# Pusti edge funkciju i PROVERI da je zaista živa i da se podigla.
#
# ZAŠTO OVAKO, A NE PREKO `deploy`
# --------------------------------
# Projekat je dostigao dozvoljen broj funkcija (188 ih je na njemu, iz svih
# proizvoda zajedno). Zbog toga `POST /functions/deploy` vraća 402 i odbija
# čak i IZMENU postojeće funkcije — API taj poziv vodi kao stvaranje nove.
# `PATCH /functions/{slug}` je izmena i prolazi.
#
# PATCH prima samo JEDAN izvorni fajl, pa se zajednički modul `_shared/ai.ts`
# UGRAĐUJE u izvor pre slanja. Prvi pokušaj bez ugrađivanja je funkciju digao
# u vazduh: verzija se uredno upisala, a svaki poziv je vraćao BOOT_ERROR jer
# `../_shared/ai.ts` sa te strane ne postoji. Zato provera na kraju nije
# formalnost nego jedini razlog zbog kog se ovo sme pokretati.
#
#   SUPABASE_TOKEN=... tools/deploy-function.sh analyze-hazards
set -euo pipefail

: "${SUPABASE_TOKEN:?treba SUPABASE_TOKEN iz okoline}"
PROJECT="${SUPABASE_PROJECT:-equjrxwpxrkchicetyvs}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fn="${1:?ime funkcije}"
src="$ROOT/supabase/functions/$fn/index.ts"
[ -f "$src" ] || { echo "nema $src"; exit 1; }

bundle=$(mktemp)
python3 - "$src" "$ROOT/supabase/functions/_shared/ai.ts" "$bundle" <<'PY'
import re, sys
src, shared, out = sys.argv[1], sys.argv[2], sys.argv[3]
code = open(src, encoding="utf-8").read()
m = re.search(r"import\s*\{[^}]*\}\s*from\s*'\.\./_shared/ai\.ts';", code)
if m:
    lib = open(shared, encoding="utf-8").read()
    # `export` nema smisla u ugrađenom kodu i samo smeta pri čitanju greške.
    lib = re.sub(r"^export\s+", "", lib, flags=re.M)
    code = code[:m.start()] + "// ── ugrađeno iz _shared/ai.ts ──\n" + lib + "\n// ── kraj ──\n" + code[m.end():]
open(out, "w", encoding="utf-8").write(code)
print(f"  ugrađeno: {'da' if m else 'nije trebalo'} · {len(code)} znakova")
PY

body=$(mktemp)
python3 -c "
import json,sys
json.dump({'body': open(sys.argv[1], encoding='utf-8').read(),
           'verify_jwt': False, 'name': sys.argv[2]}, open(sys.argv[3],'w'))
" "$bundle" "$fn" "$body"

out=$(mktemp)
for i in 1 2 3 4; do
  code=$(curl -sS -X PATCH \
    "https://api.supabase.com/v1/projects/$PROJECT/functions/$fn" \
    -H "Authorization: Bearer $SUPABASE_TOKEN" -H "Content-Type: application/json" \
    --data-binary @"$body" -o "$out" -w "%{http_code}" --max-time 180)
  if [ "$code" = "200" ]; then
    ver=$(python3 -c "import json;print(json.load(open('$out')).get('version'))")
    echo "$fn: upisana verzija $ver — proveravam da li se podiže…"
    sleep 4
    boot=$(curl -sS -X POST "https://$PROJECT.supabase.co/functions/v1/$fn" \
      -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}" --max-time 90 || echo 000)
    # 400 = funkcija radi i traži ispravan ulaz. 503 = BOOT_ERROR, mrtva je.
    if [ "$boot" = "503" ] || [ "$boot" = "000" ]; then
      echo "$fn: PODIGLA SE ALI NE RADI (http $boot) — verzija $ver je neispravna"
      rm -f "$out" "$body" "$bundle"; exit 1
    fi
    echo "$fn: živa (http $boot)"
    rm -f "$out" "$body" "$bundle"; exit 0
  fi
  echo "$fn: pokušaj $i -> $code"
  head -c 200 "$out"; echo
  sleep $((i * 3))
done
echo "$fn: NIJE PUŠTENA"; rm -f "$out" "$body" "$bundle"; exit 1
