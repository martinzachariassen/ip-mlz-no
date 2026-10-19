#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5050}"
PROJECT="${PROJECT:-what-is-my-ip-f7210}"

cd "$(dirname "$0")/.."

base="http://127.0.0.1:$PORT"
log="emulator.log"

bunx firebase-tools emulators:start --only hosting,functions \
  --project "$PROJECT" > "$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

up=0
for _ in $(seq 1 120); do
  if curl -sf -o /dev/null "$base/"; then up=1; break; fi
  sleep 0.5
done
if [ "$up" != "1" ]; then
  echo "FAIL emulator never came up on $base (port taken?)"
  echo "--- emulator log ---"
  cat "$log"
  exit 1
fi

# Hosting is up before the Functions emulator registers /ip, which 404s with
# "does not exist" until then. `! ... | grep -q`, not `grep -qv`: -qv succeeds
# when any line fails to match, so a multi-line error page would pass as ready.
for _ in $(seq 1 60); do
  curl -s "$base/ip" | grep -q "does not exist" || break
  sleep 1
done

fail=0
ok()  { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

headers() { curl -s -D - -o /dev/null "$1"; }

for header in content-security-policy strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy cross-origin-opener-policy; do
  if headers "$base/" | grep -qi "^$header:"; then
    ok "header $header present"
  else
    bad "header $header missing"
  fi
done

status="$(curl -s -o /dev/null -w '%{http_code}' "$base/nope")"
if [ "$status" = "404" ] && curl -s "$base/nope" | grep -q 'class="notfound"'; then
  ok "unknown path serves the custom 404 page"
else
  bad "unknown path did not serve the custom 404 page (status $status)"
fi

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/firebase.json")" = "404" ]; then
  ok "firebase.json is not served"
else
  bad "firebase.json is served"
fi

if headers "$base/" | grep -qi '^cache-control:.*must-revalidate'; then
  ok "HTML is revalidated"
else
  bad "HTML is not revalidated"
fi

# 200 is checked first so a missing file can't pass the immutable check.
favicon="$base/assets/icons/favicon.svg"
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$favicon")" != "200" ]; then
  bad "favicon is not served (cannot check its cache policy)"
elif headers "$favicon" | grep -qi '^cache-control:.*immutable'; then
  bad "favicon marked immutable"
else
  ok "favicon is served and not immutable"
fi

plain="$(curl -s "$base/ip")"
if echo "$plain" | grep -qE '^[0-9a-fA-F:.]+$'; then
  ok "/ip returns a bare address as plain text"
else
  bad "/ip did not return a bare address (got: $plain)"
fi

json="$(curl -s -H 'Accept: application/json' "$base/ip")"
if echo "$json" | grep -q '"ip"'; then
  ok "/ip returns JSON when asked"
else
  bad "/ip did not return JSON (got: $json)"
fi

if headers "$base/ip" | grep -qi '^cache-control:.*no-store'; then
  ok "/ip is not cached"
else
  bad "/ip is missing no-store"
fi

if headers "$base/ip" | grep -qi '^vary:.*accept'; then
  ok "/ip varies on Accept"
else
  bad "/ip is missing Vary: Accept"
fi

if headers "$base/ip" | grep -qi '^x-robots-tag:.*noindex'; then
  ok "/ip is noindex"
else
  bad "/ip is missing X-Robots-Tag: noindex"
fi

status="$(curl -s -o /dev/null -w '%{http_code}' \
  -H 'X-Forwarded-For: not-an-address' "$base/ip")"
if [ "$status" = "502" ]; then
  ok "/ip refuses a forwarded value that isn't an address"
else
  bad "/ip accepted a forwarded value that isn't an address (status $status)"
fi

mapped="$(curl -s -H 'X-Forwarded-For: ::ffff:198.51.100.7' \
  -H 'Accept: application/json' "$base/ip")"
if echo "$mapped" | grep -q '"ip":"198.51.100.7","family":"v4"'; then
  ok "/ip unwraps IPv4-mapped IPv6"
else
  bad "/ip did not unwrap IPv4-mapped IPv6 (got: $mapped)"
fi

status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/ip")"
if [ "$status" = "405" ]; then
  ok "/ip rejects POST"
else
  bad "/ip accepted POST (status $status)"
fi

# Spoofed address, because the function exempts loopback in the emulator.
seen429=0
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' \
    -H 'X-Forwarded-For: 203.0.113.9' "$base/ip")"
  if [ "$code" = "429" ]; then seen429=1; break; fi
done
if [ "$seen429" = "1" ]; then
  ok "/ip rate limits a flood from one address"
else
  bad "/ip served 60 rapid requests from one address without limiting"
fi

if [ "$(curl -s -o /dev/null -w '%{http_code}' \
      -H 'X-Forwarded-For: 203.0.113.9' "$base/ip")" = "429" ]; then
  ok "a limited address stays limited"
else
  bad "a flooded address was served again immediately"
fi

if [ "$fail" -ne 0 ]; then
  echo "--- emulator log ---"
  cat "$log"
fi
exit "$fail"
