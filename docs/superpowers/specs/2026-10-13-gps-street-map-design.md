# GPS and street map: design

Date: 2026-10-13 · Status: agreed in chat, mockups on the design canvas · Branch: `claude/booth-map-gps-overlay-b3d3fa`

Mockups: https://claude.ai/artifact/XHgHtjkv7a8dTBSswgZvu8 (rows 1–5 and "4 again"). Round 2 picks: https://claude.ai/artifact/JcT3EEuVEoHFiYbQ8LbneV

## 1. Intent

Guests lose time working out where they are when they arrive at the venue. Show where they are on a street map around the venue and walk them to the right entrance, then hand over to the hall plan they already know.

Indoors on QSNCC Level LG, phone GPS is off by 20–50 m. Halls 5–8 are about 200 m wide and an aisle is 3 m. So GPS is never used to place a guest in an aisle.

## 2. Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | What GPS is for | Outside: street map, walk to the best entrance, hand off to the hall plan at the door (1a). Indoors: one tap "Which hall are you in?" with the GPS guess marked (1b). |
| 2 | Map facing | The plan stays as printed; the street map is turned to match it (2a). A compass button turns the map with the phone (2c), off by default. |
| 3 | Map images | A raster tile provider when online (3b). When tiles fail (offline, quota, key refused), fall back to a small bundled street drawing of the area around the venue (3a) with an "Offline map" chip (E). |
| 4 | Pinning the plan to the Earth | Satellite pins first (4b). Guests improve them later (plan 2). |
| 5 | Asking for location | Only after the guest taps "Use my location" (5a). If refused, a plain note and the start list (5b). |

## 3. Behaviour

- "Use my location" sits in the start picker on the result card. It shows only when the venue has map pins.
- While locating, the position never leaves the phone and nothing is stored.
- Accuracy worse than 100 m: say GPS is weak, keep trying, don't hand off.
- More than 1.5 km away: say how far, suggest the guest's usual map app, stop locating.
- Outside within 1.5 km: pick the entrance that minimises outdoor straight-line distance plus indoor route length to the destination, among the venue's street entrances. Draw the guest's dot, accuracy circle and a dashed line to that entrance; draw the indoor route from that entrance. The card shows "Walk to <entrance>", distance, minutes, and the indoor distance after it, plus "I'm inside now".
- Within 30 m of the chosen entrance, or "I'm inside now": stop locating, set that entrance as the start (saved like a manual pick), show "You're at <entrance>. Switched to the hall plan."
- Inside the walls: stop locating, ask which hall with the GPS guess and its neighbours. Picking a hall sets that hall's door as the start.
- Picking a start from the list while locating stops locating.
- Going to the background pauses locating; coming back resumes it.
- Street map shows only while the guest is outside and locating.
- Compass mode rotates the map around the guest's dot. Dragging the map turns it off.

## 4. Data

- `venue.json` gains `geo: { pins: [{ id, x, y, lat, lng }], entrances: [landmark ids] }`. Pins are plan pixels matched to WGS84. At least 3 pins, 4 recommended. Checks: the fitted scale is within 5% of `metersPerPx`, the fit is not mirrored or stretched, and with 4+ pins the RMS error is under 5 m.
- `venues/<id>/surroundings.json`: roads, paths, buildings, water and parks from OpenStreetMap, projected into plan pixels, made by `bun run venue:surroundings <venue-id>`. Served at `/v/<venue-id>/surroundings.json`, fetched only when locating starts. At most 150 KB.
- Tile provider set at build time: `VITE_TILE_URL` (template with `{z}`, `{x}`, `{y}`) and `VITE_TILE_CREDIT`. The style must have no text labels, because tiles are turned to match the plan. Unset means the bundled drawing only.

## 5. Out of scope here (plan 2)

Guest spots: a Cloudflare Pages Function at `/api/spots` with D1, the "Help line up the map?" card once per event at the door hand-off, door spots only able to move pins, a Guest spots tab in the review tool, deletion 30 days after the event ends, a "What we keep" page drafted by Claude for the owner's approval.

Admin sign-in for that tab with passkeys (WebAuthn). Options to settle in plan 2: Cloudflare Access in front of `/api/admin/*`, or passkeys implemented in the Pages Function with credentials in D1.
