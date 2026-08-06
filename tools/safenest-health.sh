#!/usr/bin/env bash
#
# Da li SafeNest radi — jedan pogled, bez otvaranja aplikacije.
#
# Postoji zato što se ovog popodneva desilo sve što je moglo: projekat je
# pao u INACTIVE zbog neplaćenih računa, funkcije su vraćale
# WORKER_RESOURCE_LIMIT, jedno puštanje je funkciju oborilo u BOOT_ERROR a
# verzija se svejedno uredno upisala, i lanac je odgovarao na engleskom iako
# je tražen srpski. Nijedna od tih stvari se ne vidi iz aplikacije — roditelj
# vidi samo da „ne radi", a vlasnik ne zna ni šta ni gde.
#
# Provera je namerno spolja, kao pravi korisnik: isti URL, ista fotografija,
# isti put. Ono što ovde prođe, prošlo je i na telefonu.
#
#   tools/safenest-health.sh [putanja-do-fotografije.jpg]
set -uo pipefail

PROJECT="${SUPABASE_PROJECT:-equjrxwpxrkchicetyvs}"
BASE="https://$PROJECT.supabase.co/functions/v1"
PHOTO="${1:-}"

ok()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0

echo "SafeNest — provera zdravlja ($(date -u '+%Y-%m-%d %H:%M UTC'))"
echo
echo "funkcije se podižu:"
for fn in analyze-hazards analyze-food safenest-chat; do
  code=$(curl -sS -X POST "$BASE/$fn" -H "Content-Type: application/json" \
    -d '{}' -o /dev/null -w "%{http_code}" --max-time 60 || echo 000)
  # 400 = živa i traži ispravan ulaz. 503 = BOOT_ERROR. 000 = nedostupna.
  case "$code" in
    400|422) ok "$fn (http $code)" ;;
    503) bad "$fn — BOOT_ERROR, verzija je neispravna" ;;
    000) bad "$fn — nedostupna" ;;
    *)   bad "$fn — neočekivano http $code" ;;
  esac
done

if [ -n "$PHOTO" ] && [ -f "$PHOTO" ]; then
  echo
  echo "prava analiza ($PHOTO):"
  req=$(mktemp)
  python3 - "$PHOTO" "$req" <<'PY'
import base64, json, sys
b64 = base64.b64encode(open(sys.argv[1], 'rb').read()).decode()
json.dump({"image": "data:image/jpeg;base64," + b64, "roomType": "kitchen",
           "ageGroup": "1-2y", "language": "Serbian", "live": False},
          open(sys.argv[2], "w"))
PY
  t0=$(date +%s)
  res=$(curl -sS -X POST "$BASE/analyze-hazards" -H "Content-Type: application/json" \
    --data-binary @"$req" --max-time 240 || echo '{}')
  took=$(( $(date +%s) - t0 ))
  rm -f "$req"
  python3 - "$res" "$took" <<'PY'
import json, re, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print(f"  \033[31m✗\033[0m odgovor nije JSON: {sys.argv[1][:120]}")
    sys.exit(1)
hz = d.get("hazards") or []
took = sys.argv[2]
if d.get("error"):
    print(f"  \033[31m✗\033[0m {d['error'][:140]}")
    sys.exit(1)
print(f"  \033[32m✓\033[0m {len(hz)} nalaza za {took}s "
      f"({d.get('_provider')}, drugi pogled +{d.get('_second', 0)})")
# Jezik: engleski odgovor na srpski zahtev je neuspeh, ma kako uredan bio.
text = " ".join(str(h.get("label", "")) + " " + str(h.get("why", "")) for h in hz)
en = len(re.findall(r"\b(the|and|is|are|with|for|child|danger)\b", text, re.I))
words = max(1, len(text.split()))
if en / words > 0.12:
    print(f"  \033[31m✗\033[0m odgovor je na engleskom, a tražen je srpski")
    sys.exit(1)
print(f"  \033[32m✓\033[0m jezik ispravan")
for h in hz[:6]:
    print(f"      [{h.get('severity','?'):8}] {h.get('label')}")
PY
  [ $? -ne 0 ] && FAIL=1
fi

echo
if [ "$FAIL" = "0" ]; then
  echo "sve radi."
else
  echo "IMA PROBLEMA — vidi gore."
  exit 1
fi
