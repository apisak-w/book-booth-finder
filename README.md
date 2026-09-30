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

## Share links and QR codes

```
https://<site>/e/<event-id>/#to=K16&from=door6
```

`to` takes a booth code or place id, `from` a place id, and `n=1` picks the second booth when a code appears twice. Print a QR code for `#from=<place-id>` at each door or information desk. Old links without `/e/<id>/` open the 2026 book fair.

## Deploy

Cloudflare Pages builds `main` through its Git integration. Build command `npm run build`, output directory `_site`. The build image installs dependencies from `bun.lock`.

## Credits

The 2026 floor plan belongs to the Publishers and Booksellers Association of Thailand (PUBAT). Check permission before publishing plan images.
