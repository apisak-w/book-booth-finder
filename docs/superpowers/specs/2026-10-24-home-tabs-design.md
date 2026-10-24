# Home screen with On now, Coming up and Past tabs: design

Date: 2026-10-24 · Status: variant C picked in chat, waiting for spec review

Mockups: https://claude.ai/artifact/4nzf8ANx3xuWvzc6d3cjvG (artboard "C · On now, coming up, past tabs"; A and B are the options not picked).

## 1. Intent

Most guests open the site while they stand in the hall. They want the event that is on today, not a list of every event. Today the home screen (`/`) is a flat list of equal cards. A live event gets only a small yellow badge, so it looks the same as a past one.

The new home screen opens on the event that is on now and gives it a large card with the event poster, today's progress and one big way into the finder. Other events stay one tap away in tabs.

## 2. Decisions

| #   | Question      | Decision                                                                                                                        |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layout        | Three tabs: On now, Coming up, Past (variant C). Not a single hero card (A) and not opening straight into one event (B).        |
| 2   | Poster        | Optional per event. Shown as a full-width strip at the top of the card, at its own aspect ratio. Not behind the text.           |
| 3   | Poster source | A file in the event folder, committed, supplied by the organiser. First one: the Book Expo 2026 web banner (1030 × 367, 58 KB). |
| 4   | Opening hours | Optional per event, one daily range. Display only. It does not change the status.                                               |

## 3. Behaviour

### Tabs

- Three tabs in a segmented control under the header: On now, Coming up, Past. The On now label carries the count when it is more than 0 ("On now · 1"). Coming up and Past show no count.
- Status per event is the existing `eventStatus(dates, timezone, now)`: date-based in the venue's time zone.
- Opening tab: On now if any event is live, else Coming up if any, else Past.
- The chosen tab is not saved. Each visit starts from the rule above.
- Each tab lists its events with the existing `sortEvents` order (live and upcoming by start date, past newest first).
- Empty tab: a dashed box with a title and one line. Coming up: "No events coming up yet" / "New events show here when the organiser sends the plan." On now and Past use the same pattern with their own copy.

### Cards

All cards are one link to `/e/<id>/` (keeps `.event-card` and the large tap target). The button inside is styled, not a separate control.

- **On now card**: poster strip (if any), yellow "On now" badge, event name (Mitr 500, 22 px), venue name, opening hours (if any), a progress bar with "Day 2 of 10" and "Until 1 Nov 2026", and a "Find a booth" button. Border `--blue`.
- **Coming up card**: poster strip (if any), "Coming up" badge, name, venue, date range, opening hours (if any), "Opens in 3 days" (or "Opens tomorrow"), and a "Preview the map" button. Border `--line`.
- **Past card**: poster strip (if any), muted "Past" badge, name, venue, date range, "This event has ended. The map still works." and an "Open map" button with a secondary style. Border `--line`.

"Day N of M" counts calendar days in the venue's time zone, start date = day 1. "Opens in N days" counts whole days from today to the start date.

### Before the script runs

The page prerenders in Thai with no `now`, so status is unknown at build time. The prerendered HTML shows the header and an empty tab bar placeholder of the final height. Tabs and cards render on mount, when `now` is set. No layout shift above the cards.

### Unchanged

- Old share links (`/#to=…&from=…`) still redirect to `bkkibf-2026`.
- Header: title "ค้นหาบูธ" / "Booth Finder", subtitle "งานทั้งหมด" / "Events", language toggle.

## 4. Data

- `event.json` gains two optional fields:
  - `poster`: file name of an image in the event folder, for example `"poster.jpg"`. JPEG or WebP, at most 1100 px wide, at most 100 KB. Width and height are read at build time.
  - `hours`: `{ "open": "10:00", "close": "21:00" }`, 24-hour local time in the venue's time zone, `open` before `close`.
- `EventSummary` gains `poster?: { url, width, height }` and `hours?: { open, close }`.
- Poster files are published with a content-hashed URL so they sit under the existing one-year cache rule. The build test that blocks source material keeps blocking `plan.*` and `reference.jpg`, and allows `poster.*`.
- `events/bookexpo-2026/poster.jpg`: the Book Expo 2026 banner, already downloaded with the owner's approval on 2026-10-24 from `https://www.thailandbookfair.com/wp-content/uploads/2026/09/9-BET2026_KV-Web-Banner_1366x480px-1030x367.jpg` (1030 × 367, 57 788 bytes). The first plan step copies it from this session's scratch folder (`scratchpad/kv/bet2026-kv.jpg`). If that copy is gone, ask the owner before downloading it again. `hours`: 10:00 to 21:00 (from the poster). `bkkibf-2026` gets neither until the organiser sends them.
- Poster code is also tested against a fixture event in `tests/fixtures`, so the tests do not depend on one real event.

## 5. Look

- Tokens, fonts and components from `src/lib/styles/app.css`. No new colours.
- Tab bar: `--chip` track, 4 px inset, pill tabs at least 44 px tall. Selected tab: `--ink` background with white text in light mode, `#9fc2ff` with `--panel` text in dark mode.
- Poster strip: `aspect-ratio` from the file, `object-fit: cover`, `alt=""` (the name is in the text). The first card's poster loads eagerly; others use `loading="lazy"`.
- Progress bar: 8 px, `--chip` track, `--sun` fill.
- Width: the existing 720 px max column. No separate desktop layout.

## 6. Copy

All new strings exist in `th` and `en`. Thai wording to be checked by the owner.

| Key              | th                                     | en                                                      |
| ---------------- | -------------------------------------- | ------------------------------------------------------- |
| `dayOf`          | วันที่ {n} จาก {m}                     | Day {n} of {m}                                          |
| `until`          | ถึง {date}                             | Until {date}                                            |
| `hours`          | เปิด {open}–{close} น.                 | Open {open}–{close}                                     |
| `opensIn`        | เริ่มในอีก {n} วัน                     | Opens in {n} days                                       |
| `opensTomorrow`  | เริ่มพรุ่งนี้                          | Opens tomorrow                                          |
| `findBooth`      | หาบูธ                                  | Find a booth                                            |
| `previewMap`     | ดูผังงานล่วงหน้า                       | Preview the map                                         |
| `pastNote`       | งานนี้จบไปแล้ว แผนที่ยังใช้ได้         | This event has ended. The map still works.              |
| `noLive`         | ตอนนี้ยังไม่มีงานที่กำลังจัด           | Nothing is on right now                                 |
| `noLiveHint`     | ดูงานที่กำลังจะมาในแท็บถัดไป           | See what's coming up in the next tab.                   |
| `noUpcoming`     | ยังไม่มีงานที่กำลังจะมา                | No events coming up yet                                 |
| `noUpcomingHint` | งานใหม่จะขึ้นที่นี่เมื่อผู้จัดส่งผังมา | New events show here when the organiser sends the plan. |
| `noPast`         | ยังไม่มีงานที่จบแล้ว                   | No past events yet                                      |
| `noPastHint`     | งานจะขึ้นที่นี่หลังจากจบงาน            | Events show here after they end.                        |

Tab labels reuse the existing `live`, `upcoming` and `past` strings.

Thai times use a full stop (10.00); English times use a colon (10:00).

## 7. Tests

- Unit (`bun test`): day-of and opens-in counts across a time-zone boundary; opening-tab rule for each mix of statuses; schema accepts and rejects `poster` and `hours`; every `poster` file exists, is within the size limits and has its dimensions.
- Strings test: every new key in both languages.
- e2e: fix the clock with Playwright's `page.clock` so results do not depend on today's date. On 2026-10-24 the page opens on On now with the Book Expo card; the Past tab shows the National Book Fair card with "จบแล้ว"; clicking a card goes to `/e/<id>/`. Update `events.e2e.ts`, which today expects the past card on first load.
- Build test: the poster is in `_site`, plans and references are not.

## 8. Out of scope

- Using opening hours to say "Closed now" or to change the status.
- Saving the last tab, search across events, or a calendar view.
- Fetching posters from the organiser's website at build time.
- Poster in the finder page header.
