#!/usr/bin/env bash
# Regenerate the Open Graph card at assets/img/og-image.jpg from og.html.
#
# The card is rendered headless (not composited with ffmpeg) so it uses the real
# site fonts — Night Corp Display (local woff2), Fira Code + Rajdhani (Google
# Fonts) — matching the website exactly. ffmpeg's text renderer segfaults on
# Fira Code, which is why this goes through a browser.
#
# Usage:   bash tools/og/build.sh [background-image]
#   background-image  optional source frame (default: a Kabuki rooftop capture)
#
# After running, bump the ?v= query on og:image / twitter:image in index.html
# (e.g. ?v=3 -> ?v=4) so social validators re-fetch, then commit.
#
# Requires: ffmpeg, python, Microsoft Edge (Windows / Git Bash).

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${1:-$ROOT/uploads/kabuki_roof__t0022_00044.webp}"
PORT=8877

echo "Background source: $SRC"
ffmpeg -y -i "$SRC" -vf "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630" -q:v 2 "$HERE/bg.jpg" 2>/dev/null

EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -f "$EDGE" ] || EDGE="/c/Program Files/Microsoft/Edge/Application/msedge.exe"

( cd "$HERE" && python -m http.server "$PORT" >/dev/null 2>&1 & echo $! > "$HERE/.httpd.pid" )
sleep 1.5
"$EDGE" --headless=old --disable-gpu --hide-scrollbars --window-size=1200,630 \
  --virtual-time-budget=7000 \
  --screenshot="$(cygpath -w "$HERE/og-render.png")" "http://127.0.0.1:$PORT/og.html" 2>/dev/null
kill "$(cat "$HERE/.httpd.pid" 2>/dev/null)" 2>/dev/null
rm -f "$HERE/.httpd.pid"

ffmpeg -y -i "$HERE/og-render.png" -q:v 2 "$ROOT/assets/img/og-image.jpg" 2>/dev/null
rm -f "$HERE/og-render.png"

echo "Wrote $ROOT/assets/img/og-image.jpg ($(stat -c%s "$ROOT/assets/img/og-image.jpg") bytes)"
echo "Next: bump ?v= on og:image / twitter:image in index.html, then commit + push."
