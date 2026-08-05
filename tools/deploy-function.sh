#!/usr/bin/env bash
#
# Pusti edge funkciju zajedno sa zajedničkim modulom, pa PROVERI da je zaista
# živa. Provera nije formalnost: dvaput sam radio nad starom verzijom misleći
# da je nova — jednom zbog tihe greške u skripti koja je fajl ostavila
# nepromenjen, jednom zbog pada mreže (curl je vratio `000`).
#
# Token se NE upisuje ovde. Uzima se iz okoline:
#   SUPABASE_TOKEN=... tools/deploy-function.sh analyze-hazards
set -euo pipefail

: "${SUPABASE_TOKEN:?treba SUPABASE_TOKEN iz okoline}"
PROJECT="${SUPABASE_PROJECT:-equjrxwpxrkchicetyvs}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)/supabase/functions"
fn="${1:?ime funkcije}"

shared=()
if grep -q "_shared/" "$ROOT/$fn/index.ts"; then
  shared=(-F "file=@$ROOT/_shared/ai.ts;filename=../_shared/ai.ts")
fi

out=$(mktemp)
for i in 1 2 3 4; do
  code=$(curl -s -X POST \
    "https://api.supabase.com/v1/projects/$PROJECT/functions/deploy?slug=$fn" \
    -H "Authorization: Bearer $SUPABASE_TOKEN" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$fn\",\"verify_jwt\":false};type=application/json" \
    -F "file=@$ROOT/$fn/index.ts;filename=index.ts" \
    "${shared[@]}" -o "$out" -w "%{http_code}")
  if [ "$code" = "201" ]; then
    echo "$fn: puštena verzija $(python3 -c "import json,sys;print(json.load(open('$out')).get('version'))")"
    rm -f "$out"; exit 0
  fi
  echo "$fn: pokušaj $i -> $code"
  sleep $((i * 3))
done
echo "$fn: NIJE PUŠTENA"; head -c 300 "$out"; rm -f "$out"; exit 1
