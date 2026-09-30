"""Step 4: combine detected cells + hand-read labels into data/booths.json.

Applies the manual corrections below (cells the detector merged or missed),
assigns each booth a category from its colour and a hall from its x position.
Re-run after editing labels.txt or MANUAL_CELLS.
"""
import json
import cv2
import numpy as np
from common import SOURCE, CELLS, LABELS, BOOTHS_JSON

# Printed-legend colours as they appear in the image (BGR medians).
CATEGORY_BGR = {
    "kids": (179, 136, 250), "fiction": (41, 66, 224), "bl": (185, 125, 155), "intl": (1, 207, 255),
    "rare": (71, 137, 196), "general": (198, 132, 27), "comic": (34, 134, 246), "nonbook": (109, 188, 91),
    "special": (32, 31, 35),
}
# Must match HALL_SPLITS in src/config.js (ASSUMED boundaries, see CLAUDE.md).
HALL_SPLITS = [(749, 5), (1300, 6), (1852, 7), (10 ** 9, 8)]

# Labels in labels.txt that are placeholders for cells fixed by hand below.
REPLACED_LABELS = {"C06+C04", "E20BLOCK", "A31", "A15"}
# Hand-measured booths: code, x, y, w, h. Read from zoomed crops of the source image.
MANUAL_CELLS = [
    ("C06", 673, 1283, 29, 29), ("C04", 673, 1313, 29, 29),          # detector merged them
    ("E20", 857, 938, 28, 91), ("E16", 857, 1030, 28, 60),            # pink/yellow block merged
    ("F21", 887, 938, 29, 60), ("F17", 887, 999, 29, 60), ("F15", 887, 1060, 29, 30),
    ("C17", 611, 1030, 29, 29),                                       # hidden by charge-spot callout
    ("G16", 1041, 1031, 29, 59),                                      # merged into G20
    ("A31", 407, 659, 61, 61), ("A15", 406, 1013, 61, 62),            # black boxes cut by the ROI edge
]
# Corrections to detected rectangles: code -> (x, y, w, h)
RECT_OVERRIDES = {"C11": (611, 1125, 29, 59), "D30": (794, 831, 30, 49)}
# Extra rectangles for L-shaped booths: code -> [[x, y, w, h], …]
EXTRA_PARTS = {"D30": [[765, 831, 29, 21]]}

im = cv2.imread(str(SOURCE)).astype(int)
cells = json.loads(CELLS.read_text())
labels = dict(line.split() for line in LABELS.read_text().splitlines() if line.strip())


def category(bgr):
    return min(CATEGORY_BGR, key=lambda k: sum((a - b) ** 2 for a, b in zip(CATEGORY_BGR[k], bgr)))


def category_at(x, y, w, h):
    return category(np.median(im[y + 3:y + h - 3, x + 3:x + w - 3].reshape(-1, 3), 0))


def hall(x, w):
    cx = x + w / 2
    return next(h for limit, h in HALL_SPLITS if cx < limit)


booths, pillars = [], []
for c in cells:
    code = labels.get(str(c["i"]))
    if code is None:
        raise SystemExit(f"cell #{c['i']} has no label in labels.txt")
    x, y, w, h = c["x"], c["y"], c["w"], c["h"]
    if code == "-":  # building pillar: keep the cell colour and the white square inside it
        sub = im[y:y + h, x:x + w]
        white = sub.min(-1) > 225
        ys, xs = np.where(white)
        pillars.append(dict(x=x, y=y, w=w, h=h, cat=category(np.median(sub[~white], 0)),
                            px=int(xs.min() + x), py=int(ys.min() + y),
                            pw=int(xs.max() - xs.min() + 1), ph=int(ys.max() - ys.min() + 1)))
        continue
    if code in REPLACED_LABELS:
        continue
    x, y, w, h = RECT_OVERRIDES.get(code, (x, y, w, h))
    booths.append(dict(c=code, x=x, y=y, w=w, h=h, cat=category(c["bgr"])))

for code, x, y, w, h in MANUAL_CELLS:
    booths.append(dict(c=code, x=x, y=y, w=w, h=h, cat=category_at(x, y, w, h)))
for b in booths:
    b["hall"] = hall(b["x"], b["w"])
    if b["c"] in EXTRA_PARTS:
        b["extra"] = EXTRA_PARTS[b["c"]]

codes = [b["c"] for b in booths]
dups = sorted({c for c in codes if codes.count(c) > 1})
print(f"{len(booths)} booths, {len(pillars)} pillars, duplicate codes: {dups or 'none'}")

rows = ["{", '  "source": "BKKIBF2026 official floor plan, 2560x1932 px. Coordinates are pixels on that image.",', '  "booths": [']
rows += ["    " + json.dumps(b, separators=(",", ":"), ensure_ascii=False) + ("," if k < len(booths) - 1 else "") for k, b in enumerate(booths)]
rows += ["  ],", '  "pillars": [']
rows += ["    " + json.dumps(p, separators=(",", ":")) + ("," if k < len(pillars) - 1 else "") for k, p in enumerate(pillars)]
rows += ["  ]", "}"]
BOOTHS_JSON.write_text("\n".join(rows) + "\n")
print(f"-> {BOOTHS_JSON}")
