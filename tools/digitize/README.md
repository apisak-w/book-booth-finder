# Floor-plan digitising pipeline

These scripts turn the official floor-plan image into `data/booths.json`. Run them only when the booth layout changes. The web app doesn't use them.

```bash
cd tools/digitize
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

python3 detect_cells.py      # 1. find booth rectangles -> out/cells.json
python3 contact_sheets.py    # 2. enlarged tiles to read codes -> out/sheet*.png
#    ...type "<index> <code>" lines into labels.txt ("-" for pillar cells)
python3 overlay_check.py     # 3. check for missed or misread booths -> out/overlay_*.png
python3 build_booths.py      # 4. write data/booths.json
cd ../.. && npm test         # 5. validate
```

## How it works

1. **Detect** (`detect_cells.py`): anything far from the cream floor colour is a booth island. Inside each island, lines lighter than the island colour are extracted with long, thin morphological openings. These are the white booth dividers; text strokes are too short to survive. Removing them splits the island into booth cells. Cells are sorted by `(x, y)`, and that index is the key used in `labels.txt`.
2. **Read** (`contact_sheets.py` + `labels.txt`): OCR can't read the booth codes reliably because the text is about 8 px tall. A person reads them from the contact sheets instead. Mark pillar cells, the small white squares with no code, with `-`.
3. **Check** (`overlay_check.py`): labelled cells are painted white. Any coloured booth still visible was missed.
4. **Build** (`build_booths.py`): applies hand corrections, assigns categories by nearest legend colour and assigns halls by x position.

## Hand corrections for the 2026 plan

These live in `build_booths.py`:

- **`MANUAL_CELLS`** covers booths the detector merged or missed:
  - C06 and C04
  - E20, E16, F21, F17 and F15, where pink and yellow booths share one block
  - C17, hidden under a charge-spot callout
  - G16
  - the A31 and A15 boxes
- **`RECT_OVERRIDES`** fixes the C11 height and D30.
- **`EXTRA_PARTS`** handles D30, which is L-shaped around D28.

The printed plan has duplicate codes. In `labels.txt`, cell #89 (the second `B44`) is recorded as `D44` and cell #105 (the second `D15`) as `E15`, both inferred from their column. `H31` is left duplicated.

## Things the pipeline doesn't cover

These are set by hand in `src/config.js` and `src/content.js`:

- the hall outline, doors, recesses and walkable areas
- the foyer exhibition boxes (U01–U11) and information desks
- the stage position
- landmark positions: toilets, charge spots, information points, MRT
- aisle letter positions along the back wall
- zone names, read from the plan

For a new plan, re-measure these from the image. They're all in the same pixel coordinates.
