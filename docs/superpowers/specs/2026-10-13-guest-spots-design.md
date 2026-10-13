# Guest spots and the admin review: design

Date: 2026-10-13 · Status: agreed in chat · Builds on: `docs/superpowers/specs/2026-10-13-gps-street-map-design.md` (plan 1, PR apisak-w/book-booth-finder#5)

Mockups: https://claude.ai/artifact/XHgHtjkv7a8dTBSswgZvu8, row "4 again": 4d (guest card) and 4e (Guest spots review).

## 1. Intent

Plan 1 pins each venue plan to the Earth with satellite pins. Those are good to a few metres at best, and a pin off by 15 m sends guests to the wrong side of a door. Guests standing at a door already know exactly where they are. Let them send one GPS reading at that moment, let the owner see those readings together, and let the owner decide whether a pin moves. A move becomes a pull request that the owner merges.

## 2. Decisions

| #   | Question                        | Decision                                                                                                                                                                                                               |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where spots go                  | A Cloudflare Pages Function at `/api/spots` writing to a D1 database. No separate Worker.                                                                                                                              |
| 2   | Where the owner reviews         | A hosted `/admin` page on the same site, usable from a phone at the venue. Not a tab in the local review tool, because passkeys are tied to one web address and cannot be used on `localhost`.                         |
| 3   | Admin sign-in                   | Passkeys implemented in the Pages Function with `@simplewebauthn/server`, credentials in D1. The first passkey needs a one-time setup code that the owner sets as a Cloudflare secret. Recovery: set a new setup code. |
| 4   | How a Move pin reaches the repo | The Function commits the new `venue.json` to a branch `spots/<venue-id>` and opens a pull request, or adds to the open one. The owner checks the Cloudflare preview and merges. The site never pushes to `main`.       |
| 5   | What a spot holds               | Event id, door or hall, place id, one GPS reading (lat, lng, accuracy) and the hour it was sent. No name, device id, IP address or user agent.                                                                         |
| 6   | Which spots can move a pin      | Only door spots. A hall spot (sent when a guest picks their hall indoors) only raises a flag in review.                                                                                                                |
| 7   | How long spots are kept         | Deleted 30 days after the event's last day.                                                                                                                                                                            |
| 8   | Explaining it to guests         | A bilingual "What we keep" page at `/what-we-keep/`, drafted by Claude and approved by the owner before the card is turned on.                                                                                         |
| 9   | Asking again                    | After "Send this spot": not again at that event. After "No thanks": again at a hand-off on a later day. With "Don't ask again at this event" ticked: never at that event.                                              |

## 3. Guest behaviour

- The card "Help line up the map?" (4d) appears in the result card at a hand-off:
  - door: GPS arrival within 30 m of the entrance, or "I'm inside now". This sends `kind: 'door'` with the entrance landmark id.
  - hall: the guest picks a hall in "Which hall are you in?". This sends `kind: 'hall'` with the area id.
- The card only appears when all of these hold:
  - the site was built with `VITE_SPOTS=1`
  - the venue has map pins
  - the GPS reading taken at that moment has accuracy ≤ 50 m and is at most 2 minutes old
  - for a door, the reading is within 150 m of where the current pins put that entrance
  - the event's ask state allows it (see 9 above)
- Buttons: "No thanks" and "Send this spot". Below them: the checkbox "Don't ask again at this event", the small print "Sends this entrance, one GPS reading and the time. No name, no phone ID." and a "What we keep" link.
- Sending: one `POST /api/spots`. A toast says "Thanks. Spot sent." or "Couldn't send the spot. You can carry on." The card closes either way and nothing retries.
- New storage key `bf:<eventId>:asked`. Values: `sent`, `never`, or the venue-local date of the last "No thanks". It holds no position. It is needed so the card is not shown twice. It is read and written through `store` (try/catch) like the other keys.
- The position is still never stored on the phone.

## 4. API and data

### 4.1 `POST /api/spots`

Body `{ event, kind, place, lat, lng, accuracy }` as JSON. The Function rejects with 400 and a plain message unless:

- `event` is in `/spots-config.json` and today, in the venue's time zone, is between 7 days before `dates.start` and `dates.end`
- `kind` is `door` and `place` is one of the venue's street entrances, or `kind` is `hall` and `place` is one of its area ids
- `lat` and `lng` are finite and within 2 km of the venue centre
- `0 < accuracy ≤ 100`
- the event has fewer than 5,000 spots (above that: 503 "Spots are full for this event")

It stores lat and lng rounded to 6 decimals, accuracy rounded to whole metres, `hour` as `YYYY-MM-DDTHH` in UTC, and `purge_after` set to `dates.end` plus 30 days. Every call to `/api/spots` or `/api/admin/*` first runs `DELETE FROM spots WHERE purge_after < date('now')`. The response is 204. Requests must be `application/json`. There are no CORS headers, so other sites cannot post from a browser without a preflight that fails.

### 4.2 `/spots-config.json`

Prerendered with the site from the catalog, so the Function and the site agree on events and places:

```json
{
  "events": {
    "bkkibf-2026": {
      "venue": "qsncc-lg-5-8",
      "start": "2026-10-15",
      "end": "2026-10-25",
      "tz": "Asia/Bangkok",
      "doors": ["mrt", "door5"],
      "halls": ["hall5"]
    }
  },
  "venues": { "qsncc-lg-5-8": { "lat": 13.7236, "lng": 100.5597 } }
}
```

Only venues with `geo` and their events are listed. The Function reads it with `env.ASSETS.fetch`.

### 4.3 D1 schema (`migrations/0001_spots.sql`)

- `spots(id INTEGER PK, event TEXT, kind TEXT, place TEXT, lat REAL, lng REAL, accuracy INTEGER, hour TEXT, purge_after TEXT)` with indexes on `(event, place)` and `purge_after`.
- `decisions(id INTEGER PK, venue TEXT, place TEXT, action TEXT, lat REAL, lng REAL, spots INTEGER, pr TEXT, at TEXT)`. Kept after spots are deleted. It holds only the computed middle, not any one guest's reading.
- `passkeys(id TEXT PK, public_key BLOB, counter INTEGER, transports TEXT, name TEXT, created TEXT, last_used TEXT)`.
- `sessions(token_hash TEXT PK, expires TEXT)`.
- `challenges(challenge TEXT PK, kind TEXT, expires TEXT)`.
- `meta(key TEXT PK, value TEXT)`, used for `setup_used`.

### 4.4 Bindings and secrets

`wrangler.toml` with `pages_build_output_dir = "_site"`, D1 binding `DB` (database `booth-spots`, preview database `booth-spots-preview`) and `migrations_dir = "migrations"`. Secrets set in the Cloudflare dashboard for production only: `ADMIN_SETUP_CODE`, `GITHUB_TOKEN` (fine-grained, this repo only, Contents and Pull requests read and write) and `GITHUB_REPO` (`apisak-w/book-booth-finder`).

## 5. Admin

### 5.1 Sign-in

- `/admin/` is a prerendered page (`noindex`). It is English only, like the local review tool, because only the owner uses it.
- First visit: "Set up" asks for the setup code, then the browser creates a passkey. The server keeps the SHA-256 of a used code in `meta.setup_used` and refuses the same code twice ("Set a new setup code in Cloudflare, then try again").
- Later visits: "Sign in with a passkey". Signed in, the owner can add a spare passkey without a code.
- Recovery: set a new `ADMIN_SETUP_CODE`, redeploy, and set up again. The owner's Cloudflare account is the master key.
- Session: 32 random bytes in cookie `__Host-bf_admin` (HttpOnly, Secure, SameSite=Strict, Path=/, 12 hours). D1 stores only its SHA-256.
- Every admin `POST` must be JSON and carry an `Origin` equal to the site's own. Challenges are single use and expire after 5 minutes. User verification is required.
- `rpID` is the request's hostname. A passkey made on `*.pages.dev` does not work on a later custom domain, so the owner sets up again there. Preview deployments use the preview database and have no setup code, so `/admin` cannot be used on them.

### 5.2 Guest spots screen (4e)

- A venue picker, then a list of that venue's places. Each door shows its count and one of: "suggests a move", "pin looks right", "too few to judge" or "kept". Hall confirms show "used to check only" and, when flagged, "7 of 10 land in Hall 7".
- Map: the venue drawing and the street drawing (plan 1's `StreetLayer`), the current pin position of the entrance, good spots, left-out spots, and the middle of the good spots.
- Filters, all on by default: "GPS better than 15 m", "Within 100 m of the pin", "Sent during event days".
- Numbers: good spots, left out, spread in metres. Below them, the map-pin checks the venue would get after the move: fit error, scale against `metersPerPx`, mirrored, aspect and skew.
- "Keep pin" records a `keep` decision. The place shows "kept" until a newer spot arrives.
- "Move pin" is greyed out with the failing check named when there are fewer than 5 good spots or a check would fail.

### 5.3 Review maths (pure, in `src/lib/core/spots.ts`)

- The pin's entrance position is `planToLatLng(georef(pins), [landmark.x, landmark.y])`.
- Good spots pass every filter that is on. The middle is the median latitude and median longitude of the good spots. Spread is the median distance from the good spots to the middle.
- Status:
  - "too few to judge" when there are fewer than 5 good spots
  - "suggests a move" when the middle is more than `max(5 m, spread)` from the pin position
  - otherwise "pin looks right"
- Hall flag: at least 5 hall spots for a hall, and more than half of them land, through the current pins, in a different area or outside the walls.
- Pin move: the pin with `id` equal to the entrance id is set to `{ x: landmark.x, y: landmark.y, lat, lng }` (rounded to 7 decimals), or added if there isn't one. Satellite pins stay.
- The checks are those of `tests/venues.test.ts`, moved into `pinProblems(pins, metersPerPx)` in `geo.ts` so the test, the screen and the Function share them: not mirrored, scale within 5%, aspect above 0.95, skew below 3°, RMS under 5 m with 4 or more pins.

### 5.4 Move pin on the server

`POST /api/admin/decisions` with `{ venue, place, action: 'move', filters }`:

1. Reads the venue's spots from D1 and recomputes the middle with the same pure code. It never trusts a position sent by the browser.
2. Reads `venues/<venue>/venue.json` from GitHub at `spots/<venue>` if that branch has an open PR, else at `main`. If the branch exists without an open PR, it is reset to `main`'s head.
3. Applies the pin move and runs `pinProblems`. Any problem returns 409 with the problem named.
4. Commits with the message `fix(venue): move the <entrance> map pin from guest spots`. The body gives the number of spots, the spread and the distance moved.
5. Opens a PR titled `fix(venue): line up <venue> map pins from guest spots` if none is open, and records the decision with the PR link.

GitHub errors return 502 with the GitHub message. Nothing is recorded unless the commit succeeded.

## 6. Code layout

```
functions/api/spots.ts                 onRequestPost → handleSpot
functions/api/admin/[[path]].ts        onRequest → handleAdmin
migrations/0001_spots.sql
wrangler.toml
src/lib/core/spots.ts                  pure: parse, accept window, review maths, hall flags, pin move
src/lib/core/geo.ts                    + pinProblems
src/lib/api/db.ts                      minimal D1 interface the code uses
src/lib/api/spots.ts                   handleSpot(request, env)
src/lib/api/auth.ts                    sessions, challenges, setup code, passkey ceremonies
src/lib/api/github.ts                  read file, branch, commit, PR
src/lib/api/admin.ts                   handleAdmin router
src/lib/server/spotsConfig.ts          builds /spots-config.json from the catalog
src/routes/spots-config.json/+server.ts
src/routes/admin/+page.server.ts, +page.svelte
src/lib/admin/                         admin client: api calls, SpotsMap.svelte, PlaceList.svelte, Decision.svelte, SignIn.svelte
src/routes/what-we-keep/+page.svelte
src/lib/ui/SpotAsk.svelte              the guest card
src/lib/ui/spotAsk.ts                  ask state and offer rules
```

`src/lib/api/` never imports Svelte or Zod and is imported only by `functions/` and tests. `@simplewebauthn/browser` is imported only under `src/lib/admin/`, so it stays out of the guest pages. A build test checks this.

## 7. Testing

- Unit (bun): `spots.ts` maths, `pinProblems`, the ask-state rules, the spots config, `handleSpot` and `handleAdmin` against a fake D1 that runs `migrations/0001_spots.sql` on `bun:sqlite`, and the GitHub client against a fake `fetch`. Passkey verification is injected, so tests swap in a stub. The real library is exercised only through its own tests and a manual check.
- e2e (Playwright): the guest card with `/api/spots` intercepted (sent, failed, no thanks, never), and the admin screen with `/api/admin/*` intercepted.
- Manual, once: `wrangler pages dev _site` with a local D1, setting up a passkey, sending spots and opening a PR against a scratch branch.

## 8. Out of scope

Rate limiting by IP (nothing about the sender is stored; the per-event cap bounds abuse). Moving satellite pins or deleting them from the admin screen (use the review tool or edit `venue.json`). Email or push alerts when spots arrive. Using hall spots to move pins.
