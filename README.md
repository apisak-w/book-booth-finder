# Booth Finder

A mobile-first booth finder for events at a venue. Guests search for a booth, exhibitor or place, pick where they are, and get a walking route on the floor plan with distance, time and written steps, in Thai and English.

It is a static site built with SvelteKit and Bun. Every event gets its own page at `/e/<event-id>/`, and `/` lists all events.

## Run it

```bash
bun install
bun run dev          # http://localhost:5173
```

## Check it

```bash
bun run lint && bun run fmt:check && bun run check
bun run build && bun run test
bun run test:e2e     # Playwright, needs: bunx playwright install chromium
```

## Add an event

Events live in `events/<event-id>/`. The id appears in URLs and printed QR codes, so never rename one.

1. Get the floor plan image and, if there is one, the exhibitor spreadsheet from the organiser.
2. Create the event and run the automatic stages:
   ```bash
   bun run event:new book-fair-2027 --plan ~/Downloads/plan.jpg \
     --name-th "…" --name-en "…" --start 2027-03-25 --end 2027-04-05
   ```
3. Review what the pipeline found, fix codes, and add the stage, info desks, foyer zones and landmarks:
   ```bash
   bun run event:review book-fair-2027
   ```
4. Build the event files and check them:
   ```bash
   bun run event:build book-fair-2027
   bun run test
   ```
5. Import exhibitors (CSV or XLSX):
   ```bash
   bun run event:exhibitors book-fair-2027 ~/Downloads/exhibitors.xlsx
   ```

`tools/pipeline/README.md` explains each stage.

## Add a venue

Venues live in `venues/<venue-id>/`: a `venue.json` and a `reference.jpg` whose pixels define the venue's coordinate space. Write `venue.json` by hand against the reference image (see `venues/qsncc-lg-5-8/venue.json`), then run `bun run test`. The venue tests check that doors sit on walls, areas don't overlap and every venue landmark is reachable.

## Street map tiles

Set these in the Cloudflare Pages build settings to show street tiles while a guest is locating:

- `VITE_TILE_URL`: a raster tile URL template with `{z}`, `{x}` and `{y}`, for a style without text labels (labels would appear upside down, because tiles are turned to match the plan). Restrict the key to this site's domain.
- `VITE_TILE_CREDIT`: the provider's credit line.

Without them, guests see the bundled street drawing with an "Offline map" chip. A venue needs map pins (`geo` in `venue.json`) before guests see "Use my location"; then run `bun run venue:surroundings <venue-id>` for the bundled drawing.

## Share links and QR codes

```
https://<site>/e/<event-id>/#to=K16&from=door6
```

`to` takes a booth code or place id, `from` a place id, and `n=1` picks the second booth when a code appears twice. Print a QR code for `#from=<place-id>` at each door or information desk. Old links without `/e/<id>/` open the 2026 book fair.

## Deploy

Cloudflare Pages builds `main` through its Git integration. Build command `npm run build`, output directory `_site`. The build image installs dependencies from `bun.lock`.

## Credits

The 2026 floor plan belongs to the Publishers and Booksellers Association of Thailand (PUBAT). Check permission before publishing plan images.

## Guest spots and the admin screen

Guests at a door can send one GPS reading to `/api/spots`. The owner reviews them at `/admin/` and turns a "Move pin" into a pull request. The code is in `functions/`, `src/lib/api/` and `src/lib/admin/`, and the schema is in `migrations/`.

### One-time setup

1. Sign in to Cloudflare from this folder:

   ```bash
   bunx wrangler login
   ```

2. Make the two databases:

   ```bash
   bunx wrangler d1 create booth-spots
   bunx wrangler d1 create booth-spots-preview
   ```

3. Create the tables in both:

   ```bash
   bunx wrangler d1 execute booth-spots --remote --file migrations/0001_spots.sql
   bunx wrangler d1 execute booth-spots-preview --remote --file migrations/0001_spots.sql
   ```

4. In the Pages project, go to Settings, then Bindings, and add a D1 binding named `DB`: `booth-spots` for Production and `booth-spots-preview` for Preview. Bindings live in the dashboard, so the repo has no `wrangler.toml`.
5. In Settings, then Variables and secrets, for Production only, add these secrets:
   - `ADMIN_SETUP_CODE`: 16 characters or more, for example the output of `openssl rand -base64 24`.
   - `GITHUB_TOKEN`: a fine-grained token for `apisak-w/book-booth-finder` only, with Contents and Pull requests set to read and write and a 90-day expiry.
   - `GITHUB_REPO`: `apisak-w/book-booth-finder`.
6. Redeploy, open `/admin/`, enter the setup code under "Set up a passkey", then use "Add a passkey" to add a spare on a second device.
7. Once the "What we keep" page is approved, add the build variable `VITE_SPOTS` = `1` for Production and redeploy. The guest card stays hidden until then.

### Recovery

If both passkeys are lost, set a new `ADMIN_SETUP_CODE`, redeploy and set up again. A passkey belongs to one web address, so moving to a custom domain also means setting up again there. Replace `GITHUB_TOKEN` before it expires.

### Trying it locally

Create a `wrangler.toml` (git ignores it, so Cloudflare's Git builds never see it) and a `.dev.vars`:

```toml
pages_build_output_dir = "_site"

[[d1_databases]]
binding = "DB"
database_name = "booth-spots"
database_id = "local"
preview_database_id = "DB"
```

```
ADMIN_SETUP_CODE=a-local-code-of-16-chars
```

Then run:

```bash
bunx wrangler d1 execute booth-spots --local --file migrations/0001_spots.sql
```

```bash
VITE_SPOTS=1 bun run build
```

```bash
bunx wrangler pages dev
```

Passkeys work on `http://localhost`. Leave `GITHUB_TOKEN` unset locally, and Move pin will say what is missing instead of touching the real repo.
