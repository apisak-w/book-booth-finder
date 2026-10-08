# CLAUDE.md

Handover notes for Claude Code (and humans) working on this repo.

## What this is

A bilingual (Thai default, English) mobile-first booth finder for events at a venue. Guests search, pick a start point and get a walking route on an SVG floor plan. Users are visitors on phones in crowded halls on weak mobile data: keep it fast, legible and one-handed.

## Commands

```bash
bun run dev            # vite dev server
bun run build          # static site into _site/
bun run test           # bun test (unit, golden parity, per-event and per-venue checks, build smoke)
bun run test:e2e       # Playwright against the built site
bun run lint / fmt / fmt:check / check
bun run event:new|detect|read|review|build|exhibitors|ocr-report <event-id>
```

Run `bun run test` after any change to `venues/`, `events/`, `src/lib/core/` or `src/lib/i18n/`.

## Layout

```
venues/<id>/venue.json + reference.jpg   fixed geometry: walls, floor, areas, doors, venue landmarks
events/<id>/event.json, booths.json, exhibitors.csv, source/   per-event content; source/ is pipeline input, never published
src/lib/core/        pure TS: types, geometry, grid, routing, search, directions, prepare, hash, status, panzoom
src/lib/server/      Zod schemas and the catalog loader (build time only)
src/lib/i18n/        app strings and language state
src/lib/map/         FloorMap and its layers, viewport gestures
src/lib/ui/          sheet, search, results, card, start picker, header, event card
src/routes/          / (event list), /e/[id]/ (finder), +error
tools/pipeline/      ingestion CLI and the review tool
tests/               bun tests, golden v1 snapshot, e2e
```

Keep `src/lib/core/` free of DOM, Svelte and Zod. Zod must never reach the client bundle (a build test checks this).

## Venue vs event

A venue is the building: walls, walkable floor, named areas (halls), doors, scale, time zone, toilets and entrances. An event is what is set up inside it: booths, pillars, categories, zones, stage and info desks, foyer zones, aisle letters, event landmarks, quick picks and wording overrides. Landmark ids share one namespace across both and are never renamed.

## Coordinates

Each venue uses pixels of its own `reference.jpg`. Everything for that venue and its events is in that space. For `qsncc-lg-5-8` the reference is the 2026 plan (2560 × 1932); back wall at y ≈ 280, lakeside doors at y ≈ 1464, MRT corridor at x < 446, 3 m per 29.5 px. `qsncc-lg-5-7` (Book Expo layout) shares that coordinate space with the east wall at x = 2104; its reference is the Book Expo 2026 plan warped into it. Walking speed is 55 m/min for every venue.

## Routing

`createGrid(venue, blockers)` rasterises `venue.floor` ops in order, punches door boxes, blocks booths, pillars and event obstacles with 2 px padding, then stores clearance. `findRoute` runs 8-way A* with clearance cost and no corner cutting, string-pulls with line of sight, and returns `{P, len, meters, minutes, doorsUsed, areas}`, `{same}` or `{fail}`. `tests/golden/v1.json` pins the 2026 routes, steps, search results and hall lookup to v1 exactly. v1 is gone, so the file can't be regenerated. If a change moves these results on purpose, edit the affected entries by hand and say why in the commit.

## Content rules

- Every guest-facing string exists in `th` and `en` (tests enforce it).
- Plain verbs, sentence case, no exclamation marks. Errors say what to do next.
- Storage keys `bf:lang` and `bf:<eventId>:from`, always in try/catch.
- No verbose code comments.

## Commits

Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): `<type>[optional scope]: <description>`, with an optional body and footers.

- Types: `feat` (new feature), `fix` (bug fix), `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scopes match the area touched, for example `app`, `map`, `core`, `pipeline`, `review`, `venue`, `event`.
- Description in the imperative, lower case, no trailing full stop: `fix(pipeline): report ranges with unknown endpoints`.
- Breaking changes add `!` after the type or scope and a `BREAKING CHANGE:` footer, for example when a landmark id, event id or share-link format changes.
- Data-only changes to an event use `feat(event)` for a new event and `fix(event)` for corrections.

## Design

Mitr for display, Anuphan for body. Tokens on `:root` in `src/lib/styles/app.css`, dark mode under `prefers-color-scheme` and `[data-theme]`. The large booth code on the result card is the signature element. Route draws once and the pin pulses, both respect reduced motion. Below 900 px a bottom sheet (46vh, Less/More), at 900 px and above a 400 px side panel.

## Gotchas

- Map layer ids `layer-base|booths|zones|marks|route|pins`; CSS targets `#layer-route`.
- `viewport.frame()` waits one animation frame before measuring. Keep it.
- The viewBox aspect ratio always equals the element's (`clampVB`). Never set `h` on its own.
- Pointer capture sends events to the `<svg>`; taps are resolved from the `pointerdown` target.
- Booth labels hide below 0.42 screen px per map unit.
- Prerender loads events on the server side of SvelteKit; a bad event file fails the build with the file and field named.

## Known data issues

Each event lists its own in `event.json` `notes`. Check them with the organiser before the event. Don't silently "fix" them.
