#!/usr/bin/env bash
#
# Securely store a YouTube Data API v3 key in server/.env.
#
# WHY THIS EXISTS
# ---------------
# The key must stay server-side and must never be committed, echoed to the
# screen, or pasted into a chat window or shell history. This script reads it
# with terminal echo DISABLED and writes it straight into server/.env, which is
# git-ignored. The key is never printed by this script.
#
# Usage:  bash scripts/set-youtube-key.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

if [[ "$(git -C "$ROOT" check-ignore -q server/.env && echo yes || echo no)" != "yes" ]]; then
  echo "error: server/.env is NOT git-ignored. Refusing to write a secret." >&2
  exit 1
fi

echo "Paste your YouTube Data API v3 key."
echo "Input is hidden. Press Enter when done."
echo

if [[ -t 0 ]]; then
  read -r -s -p "YOUTUBE_API_KEY: " KEY
  echo
else
  echo "error: needs a terminal (run this directly, not piped)" >&2
  exit 1
fi

KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [[ -z "$KEY" ]]; then
  echo "error: empty key" >&2
  exit 1
fi

# Google API keys are 39 chars, beginning AIza. Catch obvious paste mistakes
# without echoing the value.
if [[ ! "$KEY" =~ ^AIza[0-9A-Za-z_-]{35}$ ]]; then
  echo "error: that does not look like a Google API key (expected AIza + 35 chars)." >&2
  echo "       length was ${#KEY}. Nothing was written." >&2
  exit 1
fi

# Replace in place without printing anything, using a temp file so the value is
# never passed through an argv or echoed.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if grep -qE '^YOUTUBE_API_KEY=' "$ENV_FILE"; then
  KEY="$KEY" awk -F= '
    /^YOUTUBE_API_KEY=/ { print "YOUTUBE_API_KEY=" ENVIRON["KEY"]; next }
    { print }
  ' "$ENV_FILE" > "$TMP"
else
  cat "$ENV_FILE" > "$TMP"
  printf '\nYOUTUBE_API_KEY=%s\n' "$KEY" >> "$TMP"
fi

# Preserve the original file's permissions and only then overwrite it.
chmod 600 "$TMP"
cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"
trap - EXIT

chmod 600 "$ENV_FILE"

echo
echo "Key stored in server/.env (permissions 600, git-ignored)."
echo "It was not printed and is not in git."
echo
echo "Next:  bash scripts/verify-youtube-key.sh"