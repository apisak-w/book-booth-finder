# Admin venue editor: design

Date: 2026-10-13 · Status: agreed in chat · Builds on: `docs/superpowers/specs/2026-10-13-guest-spots-design.md` (merged as PR apisak-w/book-booth-finder#7)

Mockups: https://claude.ai/artifact/XHgHtjkv7a8dTBSswgZvu8, row "Admin · venue editor" (boards Admin Q1 to Q7 and Q12).

## 1. Intent

The admin is becoming the place to onboard venues and events and to correct floor plans, so it isn't only about guest spots. This step lets the owner open a venue straight from the repo, see it drawn as a map over its printed plan, edit its landmarks and map pins, and send the result as a pull request. No laptop or local tools are needed. It also replaces the bare "No venue has map pins yet" page with a way forward.

## 2. Decisions

| #   | Question                         | Decision                                                                                                                                                                                            |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What can be edited               | Map pins (`geo.pins`, `geo.entrances`) and venue landmarks. Walls, walkable floor, halls and doors stay read-only for a later step with a route preview.                                            |
| 2   | Which copy opens                 | The venue's open admin PR branch if there is one, otherwise `main`.                                                                                                                                 |
| 3   | Pull requests                    | One rolling PR per venue on branch `admin/<venue-id>` for every admin change to that venue. Move pin in Guest spots moves from `spots/<venue-id>` to this branch.                                   |
| 4   | Printed plan                     | Shown under the drawing with a see-through slider. Read from the repo through a signed-in API route and never published.                                                                            |
| 5   | Putting a pin on the world       | A street map beside the plan using OpenStreetMap tiles, with credit. Click a spot on the plan, then the same spot on the street map. A paste-coordinates field is the fallback.                     |
| 6   | Checks                           | The server refuses to save until its checks pass and names the problem. The checks are the same rules CI runs, where they are cheap enough for a Function.                                          |
| 7   | Devices                          | Desktop and tablet edit. On a phone the venue screen is view-only with "Edit on a larger screen".                                                                                                   |
| 8   | New landmark ids                 | Made from the type plus the next free number (`wc7`, `lift2`, `entry3`) and shown but not editable. Ids are never renamed.                                                                          |
| 9   | Deleting a landmark              | Allowed only when no event refers to it (quick picks, event landmarks). The server checks every event on the same branch before saving. The venue's `origin` and street entrances can't be deleted. |
| 10  | Door landmarks                   | A landmark whose id is also a door id (`door5`, `west`) can be renamed but not moved, because the door gap itself is floor geometry.                                                                |
| 11  | Unsaved edits                    | A draft is kept in this browser under `bf:admin:<venue-id>:draft` and restored on return, with Discard. Undo and redo work within the session (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z).                       |
| 12  | Guest spots with no pinned venue | A card lists each venue, each with an "Add map pins" button that opens it in the Venues editor.                                                                                                     |
| 13  | Tabs                             | Venues first, Guest spots second. Venues opens after sign-in.                                                                                                                                       |

## 3. Behaviour

### 3.1 Venues tab

- **List:** one row per venue in the repo's `venues/` on `main`, with name, id, landmark count, map-pin count (or "Not on the street map yet") and the open admin PR link if one exists.
- **Opening a venue:** loads its `venue.json` from `admin/<venue-id>` if that branch has an open PR, otherwise from `main`. A banner says which: "Editing main" or "Continuing pull request #N · View pull request".

### 3.2 Editor (desktop and tablet)

- **Plan canvas:**
  - Draws the printed plan (`reference.jpg`, opacity slider, default 60%), walls, halls with labels, doors, landmarks and map pins, in the venue's plan pixels.
  - Pan and zoom work like the guest map: wheel, pinch and drag.
- **Toolbar:** Select, Add landmark, Map pins, Undo, Redo, Discard changes.
- **Selecting a landmark:**
  - The side panel shows its id (read-only), name in Thai and in English, type (`entry`, `wc`, `info`, `charge`, `stage`, `other`), icon (`mrt`, `door`, `doorSide`, `wc`, `info`, `charge`, `stage`, `lift`), "Street entrance" and its plan position.
  - Drag to move, or nudge with arrow keys (1 px, or 10 px with Shift).
  - Door landmarks show "Position is part of the floor plan" and don't move.
  - Delete is shown only when allowed (decision 9). Otherwise it says which event uses the landmark.
- **Add landmark:** click a point on the plan, choose a type, and the id appears (`wc7`). The Thai and English names are required.
- **Map pins mode:**
  - The plan sits beside a street map. Pins are numbered on both.
  - **Adding a pin:** click a plan point, then the same place on the street map.
  - **Moving a pin:** drag it on either map.
  - **Paste coordinates:** sets the selected pin from `lat, lng` copied from Google Maps.
  - **Starting point:** with no pins yet, the street map starts from a "Find the venue" step: paste the venue's coordinates once, or use this device's location.
  - **Live fit:** the panel shows the fit live with `pinProblems`: scale against `metersPerPx`, fit error, mirrored, stretched, skewed. It needs at least 3 pins, and 4 are recommended.
- **Live walking check:** runs in the browser while editing. Each landmark has to be reachable on foot from the venue's `origin` on the venue grid with no booths (`createGrid` and `findRoute`). An unreachable landmark is marked red and blocks Save.
- **Draft:** every change is saved to `bf:admin:<venue-id>:draft` with the branch and file sha it started from. On return: "Restored unsaved changes from 14:05 · Discard". If the branch has moved on since, the draft is offered with "The venue changed since this draft. Discard the draft to see the latest."
- **Save:**
  - Shows the list of changes (added, moved, renamed, deleted landmarks; pins added or moved; entrances changed), then commits to `admin/<venue-id>` and opens or reuses the PR.
  - The message names the PR link. The draft is cleared after a successful save.

### 3.3 Phone

The venue list and a read-only plan with landmarks and pins, plus "Edit on a larger screen. Placing points needs a mouse or trackpad."

### 3.4 Guest spots tab

When no venue has map pins, it shows a card: "No venue is on the street map yet", "Guest spots start once a venue has map pins", then one row per venue with "Add map pins", which opens that venue in Map pins mode.

## 4. API (all under `/api/admin/*`, signed in, same origin and JSON rules as today)

- `GET venues` → `[{ id, name, landmarks, pins, pr }]`. It lists `venues/` on `main` through the GitHub contents API, reads each `venue.json`, and finds open PRs for `admin/<id>`.
- `GET venue?id=` → `{ venue, sha, ref, pr, events: [{ id, name, refs: string[] }] }`. `ref` is the branch read, `sha` is the file's blob sha, and `events` are the events using this venue, with the landmark ids each refers to (quick picks and event landmark ids that clash). They're read from the same ref.
- `GET venue/reference?id=` → the `reference.jpg` bytes from the same ref (GitHub raw media type), `cache-control: private, max-age=300`.
- `POST venue/save` `{ id, venue, sha }` → `{ pr }`.
  - The server re-reads the file on `admin/<id>` (or `main`) and refuses with 409 if its sha isn't `sha`: "This venue changed since you opened it. Reload, then save again".
  - It validates (section 5) and writes the file with `formatVenueJson`. It commits "fix(venue): edit <id> from the admin" with a body listing the changes, and opens or reuses the PR.

GitHub calls reuse `src/lib/api/github.ts`, extended with `readFile(ref, path)`, `readRaw(ref, path)`, `listDir(ref, path)` and an expected-sha check in `proposeChange`.

## 5. Checks before a PR (server, refuse on any problem)

- `VenueSchema` from `src/lib/server/schema.ts`: Zod, server-only. `src/lib/api/` may now import it. Zod still never reaches the client bundle, and the build test covers that.
- The venue id equals the requested id. Every landmark id is unique and matches the id pattern.
- No landmark id from the base file is missing, except deletes allowed by decision 9. Landmarks whose id is a door id keep their base position.
- `origin` and every `geo.entrances` id are existing landmarks.
- `geo.pins`: at least 3 when `geo` is present, and `pinProblems` is empty.
- No event on the same ref refers to a deleted landmark.
- Geometry fields (`walls`, `floor`, `areas`, `doors`, `outside`, `depth`, `reference`, `view`, `overview`, `metersPerPx`, `gridCell`, `timezone`, `name`, `id`) are unchanged from the base file.

The walking check runs in the browser and again in CI on the PR. It is too heavy for the Function's CPU budget, so the server doesn't run it.

## 6. Writing the file

`formatVenueJson(value)` in `src/lib/core/jsonFormat.ts` reproduces oxfmt's JSON output:

- 2-space indent; objects always expanded.
- An array prints on one line when it fits in 120 columns and isn't a list of multi-element arrays or non-empty objects. Otherwise one item per line.

It is tested byte for byte against both `venue.json` files and both `event.json` files (checked while writing this spec). CI's `fmt:check` catches any drift. `withPins` (Move pin) switches to it.

## 7. Code layout

```
src/lib/core/jsonFormat.ts           formatVenueJson
src/lib/core/venueEdit.ts            pure edit ops: add, move, rename, retype, delete, toggle entrance, set pin; nextLandmarkId; diffVenue (change list); canMove/canDelete
src/lib/core/venueChecks.ts          venueEditProblems(base, next, eventRefs): the section 5 rules except schema
src/lib/api/venues.ts                handlers for venues, venue, venue/reference, venue/save
src/lib/api/github.ts                + readFile, readRaw, listDir, expected sha on proposeChange
src/lib/api/admin.ts                 + routes; Move pin branch spots/<id> → admin/<id>
src/lib/admin/VenueList.svelte, VenueEditor.svelte, PlanCanvas.svelte, StreetPicker.svelte, LandmarkPanel.svelte, PinPanel.svelte, SaveDialog.svelte, EmptySpots.svelte
src/lib/admin/editor.svelte.ts       editor state: base, draft, undo/redo stacks, selection, storage
src/lib/admin/osm.ts                 OSM tile URL and credit, lat/lng ⇄ tile maths (reuses core geo helpers)
```

OpenStreetMap tiles load only in the admin, from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with "© OpenStreetMap contributors". Owner-only, light use, within the OSM tile policy.

## 8. Testing

- **Unit:**
  - `formatVenueJson` against all four real JSON files.
  - Every edit op and its refusals: door move, delete with references, id generation.
  - `diffVenue` and `venueEditProblems`.
  - The handlers against fake D1 and fake GitHub: sha conflict 409, schema refusal, geometry change refusal, delete refused by an event reference, new branch and PR, reuse of an open PR, and Move pin on `admin/<id>`.
  - The OSM tile maths.
- **e2e (API mocked):**
  - Venue list.
  - Open, add a toilet, rename it, Save, see the PR link.
  - A door landmark won't move.
  - A draft is restored after a reload.
  - A phone shows view-only.
  - The Guest spots empty state opens Map pins mode.
- **Manual:** one real save on the preview environment against a scratch PR, then close it.

## 9. Out of scope

Editing walls, floor, halls and doors (needs a route preview and the golden routes). Event editing (booths, info desks, stages, categories). Creating a new venue or uploading a printed plan. Satellite imagery. Several owners.
