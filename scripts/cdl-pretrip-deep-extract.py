#!/usr/bin/env python3
"""
CDL Pre-Trip — extract individual part photos from the ChatGPT-generated
composite grids in `cdl interactive images/`.

Each PNG is a grid of cells. Each cell starts with an orange tag at top
(e.g. "ENGINE-7 · DRIVE BELTS"). Cell heights are NOT uniform across PNGs
— some have 3 equal rows, some have 2 equal rows, some have variable rows
where the middle row is shorter because its photo is smaller.

Strategy: detect the Y positions of the orange tag rows automatically by
scanning each PNG's left column for the distinctive orange color, then crop
each cell from one tag-Y to the next.

Output: `public/cdl-pretrip-deep/{engine,cabin,trailer}/<slug>.jpg`
"""

from __future__ import annotations
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError:
    sys.stderr.write("Pillow + numpy required: pip3 install Pillow numpy\n")
    sys.exit(1)


SRC_DIR = Path("cdl interactive images ")
OUT_BASE = Path("public/cdl-pretrip-deep")

# Orange tag color from the ChatGPT output is ~#F5A623. The yellow numbered
# circles look similar but their G channel is higher (~200) vs the tag (~160).
# To avoid false positives from circles, we ALSO require a long contiguous run
# of orange pixels — tags are wide bars; circles are small dots.
ORANGE_R_MIN = 230
ORANGE_G_MIN = 140
ORANGE_G_MAX = 185
ORANGE_B_MAX = 70
MIN_TAG_RUN_PX = 60  # tag bars are 100+ px wide; circles are < 30


def detect_tag_rows(img: Image.Image) -> list[int]:
    """Find Y coordinates of orange tag rows. Returns the TOP of each tag.

    A tag-row is a row where the LEFT region contains a contiguous run of
    orange pixels at least MIN_TAG_RUN_PX wide. This rules out the yellow
    numbered circles, which are small isolated dots."""
    arr = np.array(img.convert("RGB"))
    h, w, _ = arr.shape
    left = arr[:, : int(w * 0.40), :]
    orange = (
        (left[:, :, 0] >= ORANGE_R_MIN)
        & (left[:, :, 1] >= ORANGE_G_MIN)
        & (left[:, :, 1] <= ORANGE_G_MAX)
        & (left[:, :, 2] <= ORANGE_B_MAX)
    )
    # For each row, compute the longest contiguous run of orange pixels
    is_tag = np.zeros(h, dtype=bool)
    for y in range(h):
        row = orange[y]
        if not row.any():
            continue
        # Longest True run
        best = 0
        cur = 0
        for v in row:
            if v:
                cur += 1
                if cur > best:
                    best = cur
            else:
                cur = 0
        if best >= MIN_TAG_RUN_PX:
            is_tag[y] = True
    # Cluster consecutive tag rows; take the TOP of each cluster.
    # Then merge any clusters within ~50 px of each other — a tag bar's top
    # edge and bottom edge can register as two separate clusters when the bar
    # has gradient or anti-aliased edges that briefly drop below threshold.
    raw_tops: list[int] = []
    in_cluster = False
    for y, t in enumerate(is_tag):
        if t and not in_cluster:
            raw_tops.append(y)
            in_cluster = True
        elif not t:
            in_cluster = False
    merged: list[int] = []
    for y in raw_tops:
        if not merged or y - merged[-1] > 80:
            merged.append(y)
    return merged


# Per-PNG: list of (col, row_idx, slug). row_idx indexes into the detected
# tag-rows for that PNG (0-based). Cell column width = image_width / cols.
EXTRACTIONS = [
    {
        "src": "0F3A62EA-F767-4D5E-8CCB-3E8D5FF032BF.PNG",
        "section": "engine",
        "cols": 4,
        "cells": [
            (0, 0, "1-oil-dipstick"),
            (2, 0, "2-coolant-reservoir"),
            (0, 1, "3-power-steering-fluid"),
            (2, 1, "4-windshield-washer-fluid"),
        ],
    },
    {
        "src": "54101402-5B0B-4DA4-8326-708B4F52BB24.PNG",
        "section": "engine",
        "cols": 4,
        "cells": [
            (0, 0, "5-alternator"),
            (2, 0, "6-water-pump"),
            (0, 1, "7-drive-belts"),
            (2, 1, "8-radiator-hoses"),
            (0, 2, "9-air-compressor"),
            (2, 2, "10-steering-box"),
            (0, 3, "11-battery"),
        ],
    },
    {
        "src": "F698407B-FCAD-42C7-ABFE-4D7D009D00D0.PNG",
        "section": "cabin",
        "cols": 4,
        "cells": [
            (0, 0, "1-three-point-contact"),
            (2, 0, "2-seat-belt"),
            (0, 1, "3-mirrors"),
            (2, 1, "4-steering-wheel"),
            (0, 2, "5-horn"),
            (2, 2, "6-wipers-windshield"),
        ],
    },
    {
        "src": "749F7FCF-931C-43D9-BC9F-CF6B6552F43F.PNG",
        "section": "cabin",
        "cols": 4,
        "cells": [
            (0, 1, "7-heater-defroster"),
            (2, 1, "8-dashboard-gauges"),
            (0, 2, "9-lights-dash-indicators"),
            (2, 2, "10-emergency-equipment"),
        ],
    },
    {
        "src": "E5A80B38-EC72-4465-AB1C-3EC823318187.PNG",
        "section": "cabin",
        "cols": 4,
        "cells": [
            (0, 2, "11-parking-brake"),
        ],
    },
    {
        "src": "CECF9E32-DFD9-4BC9-AD62-CAA30FB92B09.PNG",
        "section": "trailer",
        "cols": 4,
        "cells": [
            (0, 0, "1-brake-lights"),
            (2, 0, "2-turn-signals"),
            (0, 1, "3-clearance-marker-lights"),
            (2, 1, "4-reflective-tape"),
        ],
    },
    {
        "src": "7FC5A441-28B5-45F3-BE46-B0BB5270E153.PNG",
        "section": "trailer",
        "cols": 4,
        "cells": [
            (0, 0, "5-wheels-tires"),
            (2, 0, "6-suspension"),
            (0, 1, "7-landing-gear"),
            (2, 1, "8-coupling-devices"),
        ],
    },
    {
        "src": "5D5D956F-62CE-4466-A4DF-62912B5DA8AB.PNG",
        "section": "trailer",
        "cols": 4,
        "cells": [
            (0, 0, "9-electrical-connections"),
            (2, 0, "10-air-lines"),
            (0, 1, "11-doors-latches"),
            (2, 1, "12-undercarriage"),
            (0, 2, "13-light-operation"),
            (2, 2, "14-abs-light"),
            (0, 3, "15-brake-chambers"),
            (2, 3, "16-slack-adjusters"),
        ],
    },
]


def main() -> int:
    if not SRC_DIR.exists():
        sys.stderr.write(f"source directory not found: {SRC_DIR}\n")
        return 1

    total = 0
    for ex in EXTRACTIONS:
        src_path = SRC_DIR / ex["src"]
        if not src_path.exists():
            sys.stderr.write(f"missing source: {src_path}\n")
            continue
        img = Image.open(src_path).convert("RGB")
        iw, ih = img.size
        tag_rows = detect_tag_rows(img)
        print(f"\n{ex['src']}  →  section: {ex['section']}")
        print(f"  size {iw}x{ih}  detected {len(tag_rows)} tag rows at: {tag_rows}")

        if not tag_rows:
            sys.stderr.write(f"  ! no tag rows detected — skipping\n")
            continue

        # Compute per-row crop boundaries from the tag positions.
        row_bounds = []
        for i, top in enumerate(tag_rows):
            bottom = tag_rows[i + 1] if i + 1 < len(tag_rows) else ih
            row_bounds.append((top, bottom))

        cw = iw // ex["cols"]
        out_dir = OUT_BASE / ex["section"]
        out_dir.mkdir(parents=True, exist_ok=True)

        for col, row_idx, slug in ex["cells"]:
            if row_idx >= len(row_bounds):
                sys.stderr.write(f"  ! row {row_idx} out of range for {slug} ({len(row_bounds)} rows)\n")
                continue
            y0, y1 = row_bounds[row_idx]
            # Normal phase: just the yellow numbered circle on the part
            x0, x1 = col * cw, (col + 1) * cw
            cell = img.crop((x0, y0, x1, y1))
            out_path = out_dir / f"{slug}.jpg"
            cell.save(out_path, "JPEG", quality=90)
            print(f"  ({col},{row_idx}) → {out_path.name}  {cell.size[0]}x{cell.size[1]}")
            total += 1
            # Highlight phase: same cell but COL+1 (the "double" with yellow
            # oval outlining the part). Each pair is laid out left-right in the
            # composite, so the highlight version is always the next column.
            hx0, hx1 = (col + 1) * cw, (col + 2) * cw
            if hx1 <= iw:
                hcell = img.crop((hx0, y0, hx1, y1))
                hout = out_dir / f"{slug}-highlight.jpg"
                hcell.save(hout, "JPEG", quality=90)
                print(f"  ({col+1},{row_idx}) → {hout.name}  {hcell.size[0]}x{hcell.size[1]}  (highlight)")
                total += 1

    print(f"\n{total} cell extractions complete.")
    for sec in ("engine", "cabin", "trailer"):
        n = len(list((OUT_BASE / sec).glob("*.jpg")))
        print(f"  {sec}/ : {n} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
