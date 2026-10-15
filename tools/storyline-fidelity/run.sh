#!/usr/bin/env bash
# Storyline → Chronicle fidelity check, end to end.
#
#   tools/storyline-fidelity/run.sh <story> <web output> <out dir> ["Course name"]
#
#   <story>       the .story file (or a .zip copy, or an already-unzipped folder)
#   <web output>  the Storyline "Web" publish folder (or a .zip of it) made from that same .story
#   <out dir>     where screenshots, scores.json and report.html go
#
# Chronicle's dev server must be running (npm run dev). Set CHRONICLE_URL if it isn't on http://localhost:8080.
# Never commit course files: fixtures/ and runs/ are git-ignored.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STORY="$1"; WEB="$2"; OUT="$3"; NAME="${4:-Course}"
CHRONICLE_URL="${CHRONICLE_URL:-http://localhost:8080/}"
CHROMIUM="${CHROMIUM:-/opt/pw-browsers/chromium}"
mkdir -p "$OUT"
WORK="$(mktemp -d)"
trap 'kill ${SERVER_PID:-0} 2>/dev/null || true; rm -rf "$WORK"' EXIT

unpack() { # <file or dir> <dest>
  if [ -d "$1" ]; then echo "$1"; else mkdir -p "$2"; unzip -oq "$1" -d "$2"; echo "$2"; fi
}
# The importer takes the .story file itself; an unzipped folder is zipped back up.
if [ -d "$STORY" ]; then (cd "$STORY" && zip -qr "$WORK/course.story" .); STORY="$WORK/course.story"; fi
WEB_DIR="$(unpack "$WEB" "$WORK/web")"
# A zipped publish folder sometimes has one extra folder level.
[ -f "$WEB_DIR/story.html" ] || WEB_DIR="$(dirname "$(find "$WEB_DIR" -maxdepth 3 -name story.html | head -1)")"

echo "1/3 Capturing Storyline slides"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WEB_DIR" > /dev/null 2>&1 &
SERVER_PID=$!
sleep 1
node "$HERE/capture-storyline.mjs" "http://127.0.0.1:$PORT/story.html" "$OUT/storyline" "$CHROMIUM"

echo "2/3 Importing into Chronicle and capturing its slides"
node "$HERE/capture-chronicle.mjs" "$CHRONICLE_URL" "$STORY" "$OUT/chronicle" "$OUT/storyline/manifest.json" "$CHROMIUM"

echo "3/3 Scoring"
python3 -I "$HERE/compare.py" "$OUT/storyline" "$OUT/chronicle" - "$OUT" "$NAME"
echo "Report: $OUT/report.html"
