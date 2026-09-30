# Ingestion pipeline

Turns an organiser's floor-plan image (and exhibitor spreadsheet) into `events/<id>/`. Every stage reads and writes `events/<id>/source/`, so any stage can be rerun alone.

| Command                                                                         | Stage                                       | Writes                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `event:new <id> --plan … --name-th … --name-en … --start … --end … [--venue …]` | init, then detect, read, categorise         | `event.json`, `source/plan.*`, and everything below                   |
| `event:detect <id>`                                                             | register onto the venue, detect booth cells | `source/registration.json`, `source/detect.json`, `source/cells.json` |
| `event:read <id>`                                                               | OCR each cell, flag suspicious reads        | `source/reads.json`                                                   |
| `event:review <id>`                                                             | browser tool to fix everything by hand      | `source/corrections.json`, `source/registration.json`                 |
| `event:build <id>`                                                              | apply corrections, write the event          | `booths.json`, `event.json`                                           |
| `event:exhibitors <id> <file> [--map booth=Col,th=Col,en=Col]`                  | import exhibitors                           | `exhibitors.csv`                                                      |
| `event:ocr-report <id>`                                                         | compare reads with the built booths         | nothing                                                               |

## Registration

The plan is mapped onto the venue's reference image with a per-axis scale and offset. `event:detect` fits it automatically from the floor outline. If the score is below 0.9, open the review tool, choose Register, click a wall corner on the plan and then the same corner on the reference, twice or more, far apart, and apply. Then run `event:detect` and `event:read` again. Detection settings that the pipeline derived are recomputed for the new registration, and OCR reads are stored in plan pixels, so they follow it. Register before fixing cells: cell fixes are keyed by position on the venue, so a later registration change can orphan them.

## Detection

`detect.json` holds the parameters: the region to search, the floor colour, and the thresholds from the original OpenCV pipeline. Defaults come from the venue outline and the most common colour. The 2026 values are in `events/bkkibf-2026/source/detect.json`.

## Reading codes

OCR (tesseract.js, English data downloaded on first run) only suggests codes. A read is flagged when it is missing, low confidence, duplicated, has the wrong letter for its column or breaks the column's number order. Flagged and unread cells show amber and red in the review tool; press `n` to jump to the next one. On the 2026 plan: 312 right, 11 wrong and 46 unread of 369 booths. All 11 wrong reads were flagged.

If tesseract.js fails to start under Bun, run the read stage with Node: `npx tsx tools/pipeline/cli.ts read <id>`.

## Corrections

`source/corrections.json` is the only hand-edited input and is committed. Cell fixes are keyed by a point in venue coordinates, so they survive re-detection: `code`, `pillar`, `drop`, `rect`, `extra`. `add` holds booths the detector missed. `categoryColours` maps plan colours to category keys. `event` holds categories, zones, foyer zones, obstacles, landmarks and quick picks edited in the review tool.

## Reproduction check

`tests/pipeline-build.test.ts` runs detection on the 2026 plan and applies the committed corrections. The output must match `events/bkkibf-2026/booths.json`: same codes, rectangles within 2 px, same categories. Keep it passing when changing the detector.
