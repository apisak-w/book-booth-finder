"""Step 2: make contact sheets so a person can read each cell's booth code.

Writes out/sheet0.png, sheet1.png, … Each tile shows the centre of one cell,
enlarged, with its index in red. Type "<index> <code>" lines into labels.txt
("-" for pillar cells with no booth code).
"""
import json
import cv2
import numpy as np
from common import SOURCE, CELLS, OUT

im = cv2.imread(str(SOURCE))
cells = json.loads(CELLS.read_text())
TW, TH, COLS, ROWS = 200, 110, 8, 6
per = COLS * ROWS
for s in range(0, len(cells), per):
    sheet = np.full((ROWS * TH, COLS * TW, 3), 255, np.uint8)
    for k, c in enumerate(cells[s:s + per]):
        cx, cy = c["x"] + c["w"] // 2, c["y"] + c["h"] // 2
        hw, hh = max(min(c["w"] // 2, 40), 16), max(min(c["h"] // 2, 16), 12)
        crop = im[cy - hh:cy + hh, cx - hw:cx + hw]
        sc = min((TW - 10) / crop.shape[1], (TH - 30) / crop.shape[0])
        crop = cv2.resize(crop, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
        r, q = divmod(k, COLS)
        oy, ox = r * TH + 25, q * TW + 5
        sheet[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
        cv2.putText(sheet, f"#{c['i']}", (q * TW + 5, r * TH + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 200), 2)
    cv2.imwrite(str(OUT / f"sheet{s // per}.png"), sheet)
print(f"{(len(cells) + per - 1) // per} sheets -> {OUT}")
