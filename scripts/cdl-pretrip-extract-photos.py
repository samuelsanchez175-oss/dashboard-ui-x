#!/usr/bin/env python3
"""
CDL Pre-Trip — extract the 6 inspection-area photos from the source composite.

Usage:
    python3 scripts/cdl-pretrip-extract-photos.py <source_image_path> [--preview]

The source is the user's "OUTSIDE PRE-TRIP INSPECTION — HOW TO SAY IT / HOW TO ACT"
sheet — one big image, 2 columns x 3 rows of section panels, each panel containing
a numbered photo + a "CHECK THESE ITEMS / HOW TO SAY IT" text block.

This script crops the photo portion of each section and writes them as JPGs into
`public/cdl-pretrip/` with the filenames the parts-map component expects.

Crop regions are expressed as percentages of the source image so the script
survives any input resolution. If a region is slightly off (the source layout
isn't an exact grid), tweak `REGIONS` below and re-run — the preview file shows
exactly what each crop captured.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.stderr.write("Pillow is required: pip3 install Pillow\n")
    sys.exit(1)


# ── Crop layout — percentages of the source image (x, y, w, h in 0..1 space) ──
# Adjust these if the source image's aspect ratio differs from what was assumed
# when these were authored. Each entry corresponds to one inspection section.

REGIONS = [
    # Per-section heights tuned to fit each photo exactly — the inspection sheet's
    # photos all have slightly different aspect ratios because each panel has a
    # different amount of text below the photo. Numbers come from iterative
    # eyeballing of the preview overlay.

    # 1. FRONT / ENGINE AREA — col 1, row 1 (tall truck-front photo)
    {"out": "1-front-engine.jpg",    "x": 0.020, "y": 0.107, "w": 0.310, "h": 0.197},
    # 2. STEERING AXLE — col 2, row 1 (square-ish wheel close-up, shorter)
    {"out": "2-steering-axle.jpg",   "x": 0.493, "y": 0.107, "w": 0.310, "h": 0.168},
    # 3. SIDE OF TRACTOR — col 1, row 2 (landscape side photo)
    {"out": "3-side-of-tractor.jpg", "x": 0.020, "y": 0.405, "w": 0.310, "h": 0.176},
    # 4. COUPLING / COMBINATION VEHICLE — col 2, row 2 (landscape coupling shot)
    {"out": "4-coupling.jpg",        "x": 0.493, "y": 0.405, "w": 0.310, "h": 0.176},
    # 5. TRAILER (FRONT) — col 1, row 3 (landscape trailer-front, photo is narrower
    # than other sections so the column 2 text panel encroaches if we don't trim w)
    {"out": "5-trailer-front.jpg",   "x": 0.020, "y": 0.708, "w": 0.265, "h": 0.125},
    # 6. REAR OF TRAILER — col 2, row 3 (landscape trailer-rear, lots of text below)
    {"out": "6-rear-of-trailer.jpg", "x": 0.493, "y": 0.708, "w": 0.310, "h": 0.120},
]


OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "cdl-pretrip"


def crop_pct(img: Image.Image, x: float, y: float, w: float, h: float) -> Image.Image:
    iw, ih = img.size
    box = (int(x * iw), int(y * ih), int((x + w) * iw), int((y + h) * ih))
    return img.crop(box)


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write(__doc__ or "")
        return 1
    src = Path(sys.argv[1]).expanduser()
    preview = "--preview" in sys.argv[2:]

    if not src.exists():
        sys.stderr.write(f"source not found: {src}\n")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"loading {src}")
    img = Image.open(src).convert("RGB")
    print(f"  size: {img.size[0]} x {img.size[1]}")

    for r in REGIONS:
        out_path = OUT_DIR / r["out"]
        crop = crop_pct(img, r["x"], r["y"], r["w"], r["h"])
        crop.save(out_path, "JPEG", quality=90)
        print(f"  → {out_path.relative_to(OUT_DIR.parent.parent)} "
              f"({crop.size[0]}x{crop.size[1]})")

    if preview:
        # Draw the crop boxes onto a thumbnail of the source so you can verify the
        # cropping visually without re-cropping by trial and error.
        preview_img = img.copy()
        draw = ImageDraw.Draw(preview_img)
        iw, ih = preview_img.size
        for r in REGIONS:
            box = (int(r["x"] * iw), int(r["y"] * ih),
                   int((r["x"] + r["w"]) * iw), int((r["y"] + r["h"]) * ih))
            draw.rectangle(box, outline=(245, 196, 41), width=6)
            draw.text((box[0] + 12, box[1] + 12), r["out"], fill=(245, 196, 41))
        preview_out = OUT_DIR / "_preview.jpg"
        preview_img.save(preview_out, "JPEG", quality=70)
        print(f"  → {preview_out.relative_to(OUT_DIR.parent.parent)} (preview)")

    print("\nDone. Hard-refresh the Parts Map page in the browser.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
