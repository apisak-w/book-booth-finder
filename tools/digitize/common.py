"""Shared paths and settings for the floor-plan digitising pipeline."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = HERE / "source" / "floorplan-2026.jpg"   # official plan, 2560 x 1932 px
OUT = HERE / "out"                                 # scratch output (git-ignored)
CELLS = OUT / "cells.json"
LABELS = HERE / "labels.txt"                       # hand-read: "<index> <code>" per line
BOOTHS_JSON = ROOT / "data" / "booths.json"

# Region of the image that contains the hall floor (x0, y0, x1, y1)
FLOOR_ROI = (440, 340, 2395, 1390)
# Floor colour on the plan (BGR) — anything far from it is a booth
FLOOR_BGR = (240, 253, 255)
# Stage area in Hall 8 — excluded from booth detection
STAGE_BOX = (2095, 725, 2400, 915)

OUT.mkdir(exist_ok=True)
