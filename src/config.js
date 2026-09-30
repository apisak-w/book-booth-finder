// Venue geometry for QSNCC Level LG, Halls 5–8 (BKKIBF 2026 layout).
// All coordinates are pixels on the official floor-plan image (2560 x 1932),
// the same space used by data/booths.json. See CLAUDE.md, "Coordinate system".

/** Visible map area (SVG viewBox at full zoom-out). */
export const VIEW = { x: 180, y: 240, w: 2230, h: 1420 };

/** Metres per image pixel. One standard booth (29.5 px) is about 3 m. */
export const M_PER_PX = 3 / 29.5;
/** Walking speed in a busy hall, metres per minute. */
export const WALK_M_PER_MIN = 55;

/**
 * Hall boundaries (x of the dividing aisle). ASSUMPTION: inferred from the
 * door/wall recesses on the plan, not from an official source. Verify on site.
 * Hall 5: aisles A–C, Hall 6: D–I, Hall 7: J–O, Hall 8: P–T.
 */
export const HALL_SPLITS = [
  { hall: 5, maxX: 749 },
  { hall: 6, maxX: 1300 },
  { hall: 7, maxX: 1852 },
  { hall: 8, maxX: Infinity },
];

/** Hall floor outline (polygon), drawn as the wall. */
export const HALL_OUTLINE = [
  [446, 280], [2391, 280], [2391, 1440], [2263, 1440], [2263, 1464], [1883, 1464],
  [1883, 1440], [1718, 1440], [1718, 1464], [1333, 1464], [1333, 1440], [1165, 1440],
  [1165, 1464], [774, 1464], [774, 1440], [620, 1440], [620, 1464], [446, 1464],
  [446, 1205], [390, 1205], [390, 976], [446, 976], [446, 772], [390, 772], [390, 556], [446, 556],
];

/** Where the lakeside wall is set back (x ranges); the doors sit in these recesses. */
export const RECESSES = [[620, 774], [1165, 1333], [1718, 1883], [2263, 2391]];

/** Walkable rectangles [x0, y0, x1, y1] used to build the routing grid. */
export const WALKABLE = {
  hall: [450, 284, 2387, 1460],
  sideBays: [[394, 560, 452, 768], [394, 980, 452, 1201]],
  mrtCorridor: [[180, 300, 382, 1640], [382, 776, 440, 972]],
  foyer: [180, 1470, 2410, 1640],
};

/** Doors between halls and the outside. `hall` is the hall the door opens into. */
export const DOORS = [
  { id: 'door5', x: 687, y: 1452, hall: 5 },
  { id: 'door6', x: 1247, y: 1452, hall: 6 },
  { id: 'door7', x: 1799, y: 1452, hall: 7 },
  { id: 'door8', x: 2333, y: 1452, hall: 8 },
  { id: 'west', x: 446, y: 880, hall: 5 },
];

/** Aisle letter signs along the back wall: letter -> x. Booth letter = aisle it faces. */
export const AISLE_X = {
  A: 471, B: 562, C: 654, D: 746, E: 839, F: 932, G: 1022, H: 1113, I: 1205, J: 1298,
  K: 1390, L: 1482, M: 1574, N: 1665, O: 1758, P: 1849, Q: 1942, R: 2033, S: 2125, T: 2218,
};
export const AISLE_SIGN_Y = 322;

/** Hall name labels [x, y, hall]. */
export const HALL_LABELS = [[697, 1424, 5], [1250, 1424, 6], [1800, 1424, 7], [2320, 1424, 8]];

/** Exhibition boxes outside the booth grid: [code, x, y, w, h, vertical?]. Names live in content.js ZONES. */
export const FOYER_ZONES = [
  ['U01', 324, 591, 39, 126, true], ['U02', 324, 994, 39, 91, true], ['U03', 323, 1096, 40, 40],
  ['U04', 746, 1398, 27, 58, true], ['U06', 1305, 1398, 26, 58, true],
  ['U05', 779, 1511, 191, 40], ['U07', 1333, 1511, 192, 39], ['U08', 1541, 1511, 80, 40],
  ['U09', 1624, 1511, 81, 40], ['U10', 1884, 1511, 90, 39], ['U11', 1977, 1511, 91, 39],
];

/** Information desks in the foyer [x, y, w, h] (obstacles; the destinations are in LANDMARKS). */
export const INFO_DESKS = [[535, 1514, 73, 36], [1083, 1513, 72, 35], [2162, 1511, 98, 39]];

/** Main stage + interview area in Hall 8 [x, y, w, h]. */
export const STAGE = [2105, 738, 229, 168];

/** Routing grid cell size in image pixels. Aisles are ~32 px wide, so 6 px gives ~5 cells. */
export const GRID_CELL = 6;
