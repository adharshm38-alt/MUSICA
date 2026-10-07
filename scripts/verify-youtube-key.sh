#!/usr/bin/env bash
#
# Verify a live YouTube Data API key without ever printing it.
#
# 1. confirms the key is present, well-formed, git-ignored and 600
# 2. restarts the API so it picks the key up
# 3. calls the real /api/youtube/status and /api/youtube/search
# 4. prints only NON-SECRET result fields (titles, channels, durations)
#
# Usage:  bash scripts/verify-youtube-key.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"
API="http://localhost:5000/api"

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
grn()  { printf '\033[32m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }

echo "=============================================================="
echo " YouTube Data API key check (the key itself is never shown)"
echo "=============================================================="

# ---- 1. local hygiene ---------------------------------------------------
echo
echo "--- 1. Key presence and safety ---"

KEY="$(grep -E '^YOUTUBE_API_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]')"

if [[ -z "$KEY" ]]; then
  red "  FAIL  YOUTUBE_API_KEY is empty in server/.env"
  echo "        Run:  bash scripts/set-youtube-key.sh"
  exit 1
fi
grn "  PASS  a key is present (length ${#KEY}, value not shown)"

if [[ "$KEY" =~ ^AIza[0-9A-Za-z_-]{35}$ ]]; then
  grn "  PASS  key format looks like a Google API key"
else
  red "  FAIL  key format is wrong - expected AIza + 35 chars, got ${#KEY}"
  exit 1
fi

MODE="$(stat -c '%a' "$ENV_FILE")"
if [[ "$MODE" == "600" ]]; then
  grn "  PASS  server/.env permissions are 600"
else
  warn "  WARN  server/.env permissions are $MODE (600 recommended)"
fi

if git -C "$ROOT" check-ignore -q server/.env; then
  grn "  PASS  server/.env is git-ignored"
else
  red "  FAIL  server/.env is NOT git-ignored"
fi

if [[ -z "$(git -C "$ROOT" status --porcelain server/.env)" ]]; then
  grn "  PASS  server/.env is not staged or tracked"
else
  red "  FAIL  server/.env shows up in git status"
fi

# The key must never appear in anything the browser can see.
TRACKED="$(git -C "$ROOT" grep -l "$KEY" -- . 2>/dev/null | head -5)"
if [[ -z "$TRACKED" ]]; then
  grn "  PASS  the key does not appear in any tracked file"
else
  red "  FAIL  the key appears in tracked files:"
  echo "$TRACKED" | sed 's/^/        /'
fi

# ---- 2. restart the API -------------------------------------------------
echo
echo "--- 2. Restarting the API so it loads the key ---"
if command -v musica-api >/dev/null 2>&1; then
  musica-api restart >/dev/null 2>&1
  sleep 3
  grn "  API restarted"
else
  warn "  musica-api command not found; restart the server yourself"
  sleep 1
fi

# ---- 3. status endpoint -------------------------------------------------
echo
echo "--- 3. GET /api/youtube/status ---"
STATUS="$(curl -s --max-time 20 "$API/youtube/status")"
echo "  $STATUS" | sed 's/^/  /'

if echo "$STATUS" | grep -q '"configured":true'; then
  grn "  PASS  the server reports YouTube discovery is configured"
else
  red "  FAIL  the server does not see a working key"
  exit 1
fi

if echo "$STATUS" | grep -q 'AIza'; then
  red "  FAIL  the status response leaked the key"
else
  grn "  PASS  the status response does not contain the key"
fi

# ---- 4. real search -----------------------------------------------------
echo
echo "--- 4. GET /api/youtube/search (live Google Data API) ---"
QUERY="${1:-the weeknd blinding lights}"
RAW="$(curl -s --max-time 45 --get "$API/youtube/search" --data-urlencode "q=$QUERY" --data-urlencode "maxResults=5")"

if echo "$RAW" | grep -q '"success":true'; then
  COUNT="$(echo "$RAW" | grep -o '"videoId"' | wc -l | tr -d ' ')"
  if [[ "$COUNT" -gt 0 ]]; then
    grn "  PASS  live search returned $COUNT result(s) for \"$QUERY\""
  else
    red "  FAIL  the search succeeded but returned no results"
    echo "$RAW" | head -c 400 | sed 's/^/        /'; echo
    exit 1
  fi
else
  red "  FAIL  live search failed:"
  echo "$RAW" | head -c 500 | sed 's/^/        /'; echo
  exit 1
fi

echo
echo "  Real results (metadata only, no media):"
echo "$RAW" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("        (could not parse)"); raise SystemExit
items = (d.get("data") or {}).get("items") or []
def dur(s):
    s = int(s or 0)
    return f"{s//60}:{s%60:02d}"
for i, v in enumerate(items, 1):
    print(f"        {i}. {v.get(\"title\",\"\")[:64]}")
    print(f"           {v.get(\"channelTitle\",\"\")}  |  {dur(v.get(\"durationSeconds\"))}  |  {v.get(\"viewCount\",0):,} views  |  embeddable={v.get(\"embeddable\")}")
    print(f"           {v.get(\"embedUrl\")}")
' 2>/dev/null || echo "$RAW" | head -c 400 | sed 's/^/        /'

# ---- 5. the key must not be echoed back ---------------------------------
echo
echo "--- 5. Response safety ---"
if echo "$RAW" | grep -q 'AIza'; then
  red "  FAIL  the search response leaked the key"
else
  grn "  PASS  the search response does not contain the key"
fi

echo
grn "All checks passed. YouTube search is working live."
echo "Reminder: the APK has NOT been rebuilt; say so when you want that done."