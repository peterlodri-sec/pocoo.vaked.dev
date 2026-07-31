#!/bin/bash
# build.sh — entheai agy fan-out: compile QUANT-LOVE VIA BRETT SHAW manuscript → PDF
# Usage: ./build.sh
# Prerequisites: pandoc, wkhtmltopdf
set -euo pipefail

BOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
MANUSCRIPT="$BOOK_DIR/manuscript.html"
CSS="$BOOK_DIR/book.css"
OUTPUT="$BOOK_DIR/QUANT-LOVE-VIA-BRETT-SHAW.pdf"

echo "→ agy fan-out: compiling manuscript..."
echo "→ Integrating 42 chapters + 4 appendices + cover..."

if [ ! -f "$MANUSCRIPT" ]; then
  echo "ERROR: manuscript.html not found"
  exit 1
fi

echo "→ wkhtmltopdf: rendering PDF (6×9, dark quantum theme)..."
wkhtmltopdf \
  --page-size B6 \
  --margin-top 12mm \
  --margin-bottom 12mm \
  --margin-left 10mm \
  --margin-right 10mm \
  --encoding UTF-8 \
  --enable-local-file-access \
  --no-stop-slow-scripts \
  --javascript-delay 500 \
  --user-style-sheet "$CSS" \
  "$MANUSCRIPT" \
  "$OUTPUT" 2>&1 | tail -3

echo ""
echo "≡ PDF written: $OUTPUT"
ls -lh "$OUTPUT" | awk '{print "  Size: " $5}'
echo "  Pages: $(strings "$OUTPUT" | grep -c '/Type /Page' 2>/dev/null || echo '?')"
echo "≡ Ω"
