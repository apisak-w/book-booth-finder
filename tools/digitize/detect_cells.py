"""Step 1: detect booth rectangles on the floor plan.

Booth islands are found as connected regions that differ from the floor colour.
Inside each island, the thin lighter divider lines are extracted with long thin
morphological openings, then removed, which splits the island into booth cells.

Output: out/cells.json — list of {i, x, y, w, h, bgr}, sorted by (x, y).
The index `i` is what labels.txt refers to, so do not change the sort order
without re-reading the labels.
"""
import json
import cv2
import numpy as np
from common import SOURCE, CELLS, FLOOR_ROI, FLOOR_BGR, STAGE_BOX

im = cv2.imread(str(SOURCE))
assert im is not None, f"missing {SOURCE}"
X0, Y0, X1, Y1 = FLOOR_ROI
roi = im[Y0:Y1, X0:X1].astype(int)
colored = (np.abs(roi - np.array(FLOOR_BGR)).max(-1) > 55).astype(np.uint8)
gray = roi.mean(-1)

n, lab, stats, _ = cv2.connectedComponentsWithStats(colored, 4)
blocks, lines = [], np.zeros(colored.shape, np.uint8)
L = 18  # divider lines are at least this long; text strokes are shorter
for i in range(1, n):
    x, y, w, h, _a = stats[i]
    if w < 18 or h < 18:
        continue
    blocks.append((x, y, w, h))
    sub, m = gray[y:y + h, x:x + w], lab[y:y + h, x:x + w] == i
    base = np.median(sub[m])
    lighter = ((sub > base + 35) | (~m)).astype(np.uint8)
    vl = cv2.morphologyEx(lighter, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, L)))
    hl = cv2.morphologyEx(lighter, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (L, 1)))
    lines[y:y + h, x:x + w] |= (((vl | hl) > 0) & m).astype(np.uint8)
    lines[y:y + h, x:x + w] |= (~m).astype(np.uint8)

cell = np.zeros(colored.shape, np.uint8)
for (x, y, w, h) in blocks:
    cell[y:y + h, x:x + w] = 1
cell &= (1 - lines)
cell = cv2.erode(cell, np.ones((2, 2), np.uint8))
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(cell, 4)

cells = []
for i in range(1, n2):
    x, y, w, h, a = st2[i]
    if w < 14 or h < 12 or a < 200:
        continue
    col = roi[y:y + h, x:x + w][lab2[y:y + h, x:x + w] == i]
    gx, gy = int(x + X0), int(y + Y0)
    sx0, sy0, sx1, sy1 = STAGE_BOX
    if sx0 < gx < sx1 and sy0 < gy < sy1:
        continue
    cells.append(dict(x=gx, y=gy, w=int(w), h=int(h), bgr=[int(c) for c in np.median(col, 0)]))

cells.sort(key=lambda c: (c["x"], c["y"]))
for k, c in enumerate(cells):
    c["i"] = k
CELLS.write_text(json.dumps(cells))
print(f"{len(blocks)} islands, {len(cells)} cells -> {CELLS}")
