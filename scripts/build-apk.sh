#!/usr/bin/env bash
# Build the MUSICA Android debug APK end to end.
#
#   ./scripts/build-apk.sh
#
# Requires the JDK 17 + Android SDK (see README, "Android build prerequisites").
set -euo pipefail

# Load JAVA_HOME / ANDROID_HOME if the env script exists.
# shellcheck disable=SC1091
[ -f "$HOME/.android-env.sh" ] && source "$HOME/.android-env.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Toolchain"
java -version 2>&1 | head -1
echo "    ANDROID_HOME=${ANDROID_HOME:-<not set>}"

if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "${ANDROID_HOME:-}" ]; then
  echo "ERROR: Android SDK not found. Set ANDROID_HOME or source ~/.android-env.sh" >&2
  exit 1
fi

echo
echo "==> Building the web app (client/dist)"
npm run build

echo
echo "==> Syncing web assets into the Android project"
(cd client && npx cap sync android)

echo
echo "==> Regenerating launcher icons"
node scripts/make-android-icons.mjs

echo
echo "==> Assembling the debug APK"
(cd client/android && ./gradlew assembleDebug --no-daemon)

APK="client/android/app/build/outputs/apk/debug/app-debug.apk"
echo
if [ -f "$APK" ]; then
  echo "==> APK built successfully"
  echo "    $APK"
  echo "    size: $(du -h "$APK" | cut -f1) ($(stat -c%s "$APK") bytes)"
  mkdir -p "$ROOT/release"
  cp "$APK" "$ROOT/release/MUSICA-v1.0.0-debug.apk"
  echo "    copied to release/MUSICA-v1.0.0-debug.apk"
else
  echo "ERROR: APK was not produced at $APK" >&2
  exit 1
fi
