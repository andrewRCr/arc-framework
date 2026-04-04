#!/usr/bin/env bash
# frame-screenshot.sh — Style raw screenshots to match VHS GIF aesthetic
#
# Takes a raw PNG screenshot and wraps it in window chrome matching the
# VHS demo style: Tokyo Night dark background, rounded corners, macOS-style
# traffic light title bar, drop shadow.
#
# Usage:
#   ./frame-screenshot.sh input.png [output.png] [--width N]
#
# Options:
#   --width N   Target canvas width in pixels (default: 1000, matching VHS).
#               Input is scaled proportionally to fit. Use --width 0 to
#               skip scaling and use raw input dimensions.
#
# If output is omitted, writes to input-framed.png.
#
# Dependencies: ImageMagick 6+ (convert, identify)

set -euo pipefail

# --- Argument parsing ---
INPUT=""
OUTPUT=""
TARGET_WIDTH=1000  # Match VHS canvas width

while [[ $# -gt 0 ]]; do
    case "$1" in
        --width) TARGET_WIDTH="$2"; shift 2 ;;
        *)
            if [[ -z "$INPUT" ]]; then INPUT="$1"
            elif [[ -z "$OUTPUT" ]]; then OUTPUT="$1"
            fi
            shift ;;
    esac
done

if [[ -z "$INPUT" ]]; then
    echo "Usage: frame-screenshot.sh input.png [output.png] [--width N]" >&2
    exit 1
fi

OUTPUT="${OUTPUT:-${INPUT%.png}-framed.png}"

if [[ ! -f "$INPUT" ]]; then
    echo "Error: input file not found: $INPUT" >&2
    exit 1
fi

# --- Configuration (measured from VHS output at 1000px canvas) ---
MARGIN=40                # Outer margin (VHS: Margin 40)
PADDING=20               # Inner padding (VHS: Padding 20)
BORDER_RADIUS=10         # Corner rounding (VHS: BorderRadius 10)
BAR_HEIGHT=40            # Title bar height (VHS: WindowBarSize 40)
BAR_COLOR="#1a1b26"      # Title bar background (Tokyo Night base)
BG_COLOR="#0d1117"       # Outer background (VHS: MarginFill "#0d1117")
SHADOW_OPACITY=40        # Shadow opacity percentage
SHADOW_SIGMA=25          # Shadow blur radius
SHADOW_Y=12              # Shadow vertical offset

# Traffic light dots (pixel-matched from VHS Colorful at 1000px)
DOT_RADIUS=6
DOT_Y=$((BAR_HEIGHT / 2))
DOT_X_START=20           # Center of first dot from window left
DOT_SPACING=20           # Center-to-center spacing

# --- Working directory ---
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# --- Scale input to target canvas width ---
# Content width = canvas - margins - padding on each side
CONTENT_W=$((TARGET_WIDTH - MARGIN * 2 - PADDING * 2))

if [[ "$TARGET_WIDTH" -gt 0 ]]; then
    RAW_W=$(identify -format "%w" "$INPUT")
    if [[ "$RAW_W" -ne "$CONTENT_W" ]]; then
        convert "$INPUT" -resize "${CONTENT_W}x" "${TMPDIR}/scaled.png"
        INPUT="${TMPDIR}/scaled.png"
    fi
fi

# --- Get (possibly scaled) input dimensions ---
READ_W=$(identify -format "%w" "$INPUT")
READ_H=$(identify -format "%h" "$INPUT")

# Window dimensions
WIN_W=$((READ_W + PADDING * 2))
WIN_H=$((BAR_HEIGHT + READ_H + PADDING * 2))

# --- Step 1: Create title bar with traffic lights ---
DOT_X1=$DOT_X_START
DOT_X2=$((DOT_X_START + DOT_SPACING))
DOT_X3=$((DOT_X_START + DOT_SPACING * 2))

convert -size "${WIN_W}x${BAR_HEIGHT}" "xc:${BAR_COLOR}" \
    -fill "#ff5f56"  -draw "circle ${DOT_X1},${DOT_Y} $((DOT_X1 + DOT_RADIUS)),${DOT_Y}" \
    -fill "#ffbd2e"  -draw "circle ${DOT_X2},${DOT_Y} $((DOT_X2 + DOT_RADIUS)),${DOT_Y}" \
    -fill "#27c93f"  -draw "circle ${DOT_X3},${DOT_Y} $((DOT_X3 + DOT_RADIUS)),${DOT_Y}" \
    "${TMPDIR}/bar.png"

# --- Step 2: Create padded content area ---
convert "$INPUT" \
    -bordercolor "${BAR_COLOR}" -border "${PADDING}" \
    "${TMPDIR}/padded.png"

# --- Step 3: Stack title bar + padded content ---
convert "${TMPDIR}/bar.png" "${TMPDIR}/padded.png" \
    -append \
    "${TMPDIR}/window.png"

# --- Step 4: Round corners via mask ---
convert -size "${WIN_W}x${WIN_H}" xc:none \
    -fill white \
    -draw "roundrectangle 0,0 $((WIN_W - 1)),$((WIN_H - 1)) ${BORDER_RADIUS},${BORDER_RADIUS}" \
    "${TMPDIR}/mask.png"

convert "${TMPDIR}/window.png" "${TMPDIR}/mask.png" \
    -alpha set -compose DstIn -composite \
    "${TMPDIR}/rounded.png"

# --- Step 5+6: Shadow + background composition ---
# Place window at exact (MARGIN, MARGIN) position — same as VHS.
# Shadow is a blurred black silhouette offset beneath the window,
# bleeding into the margin space. No centering of shadow composite
# (which would shift the window off-center due to asymmetric blur).
CANVAS_W=$((WIN_W + MARGIN * 2))
CANVAS_H=$((WIN_H + MARGIN * 2))

# Shadow layer: black silhouette of window placed at offset, then blurred
SHADOW_MULT=$(awk "BEGIN {printf \"%.2f\", ${SHADOW_OPACITY}/100}")
convert -size "${CANVAS_W}x${CANVAS_H}" xc:none \
    \( "${TMPDIR}/rounded.png" -fill black -colorize 100 \) \
    -geometry "+${MARGIN}+$((MARGIN + SHADOW_Y))" -composite \
    -blur "0x${SHADOW_SIGMA}" \
    -channel A -evaluate Multiply "${SHADOW_MULT}" +channel \
    "${TMPDIR}/shadow.png"

# Assemble: background + shadow + window at exact position
convert -size "${CANVAS_W}x${CANVAS_H}" "xc:${BG_COLOR}" \
    "${TMPDIR}/shadow.png" -composite \
    "${TMPDIR}/rounded.png" -geometry "+${MARGIN}+${MARGIN}" -composite \
    "$OUTPUT"

echo "Wrote: $OUTPUT (${CANVAS_W}x${CANVAS_H})"
