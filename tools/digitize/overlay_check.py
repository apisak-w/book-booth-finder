"""Step 3 (optional): draw the labelled cells over the plan to spot gaps and misreads.

Writes out/overlay_{a,b,c,d}.png (four quadrants). Any coloured booth still
visible under the white boxes was missed and needs a MANUAL_CELLS entry in
build_booths.py.
"""
import json
import cv2
from common import SOURCE, CELLS, LABELS, OUT

im = cv2.imread(str(SOURCE))
cells = json.loads(CELLS.read_text())
lab = dict(line.split() for line in LABELS.read_text().splitlines() if line.strip())
vis = im.copy()
for c in cells:
    code = lab.get(str(c["i"]), "?")
    if code == "-":
        continue
    x, y, w, h = c["x"], c["y"], c["w"], c["h"]
    cv2.rectangle(vis, (x + 2, y + 2), (x + w - 2, y + h - 2), (255, 255, 255), -1)
    cv2.rectangle(vis, (x + 1, y + 1), (x + w - 1, y + h - 1), (0, 0, 0), 1)
    cv2.putText(vis, code, (x + 3, y + h // 2 + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0, 0, 255), 1)
for name, (y0, y1, x0, x1) in {"a": (330, 880, 420, 1420), "b": (330, 880, 1400, 2420),
                               "c": (860, 1420, 420, 1420), "d": (860, 1420, 1400, 2420)}.items():
    cv2.imwrite(str(OUT / f"overlay_{name}.png"), vis[y0:y1, x0:x1])
print(f"overlays -> {OUT}")
