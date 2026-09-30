export type I18n = { th: string; en: string };
export type Rect = { x: number; y: number; w: number; h: number };
export type Box = [number, number, number, number];
export type Point = [number, number];

export const GROUP_ORDER = ['entry', 'wc', 'info', 'charge', 'stage', 'other'] as const;
export type LandmarkGroup = (typeof GROUP_ORDER)[number];

export const ICON_NAMES = ['mrt', 'door', 'doorSide', 'wc', 'info', 'charge', 'stage', 'lift'] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const WALK_M_PER_MIN = 55;

export type Landmark = I18n & { id: string; group: LandmarkGroup; x: number; y: number; icon: IconName };

export type Area = { id: string; name: I18n; label: { x: number; y: number; text: string }; bounds: Point[] };
export type Door = { id: string; area: string; punch: Box; gap: Box };

export type Venue = {
  id: string;
  name: I18n;
  timezone: string;
  reference: { width: number; height: number };
  view: Rect;
  overview: { narrow: { box: Box; pad: number }; wide: { box: Box; pad: number } };
  metersPerPx: number;
  gridCell: number;
  walls: Point[][];
  floor: { op: 'add' | 'remove'; box: Box }[];
  areas: Area[];
  outside: I18n;
  doors: Door[];
  depth?: { back: number; front: number; text: { back: I18n; mid: I18n; front: I18n }; aisleHint: I18n };
  landmarks: Landmark[];
  origin: string;
};

export type Category = I18n & { color: string; darkText?: boolean };
export type Obstacle = Rect & { kind: 'stage' | 'info' | 'other'; note?: string };
export type FoyerZone = Rect & { c: string; vertical?: boolean };
export type QuickPick = ['booth', string] | ['place', string];
export type TextKey = 'ph' | 'searchLabel' | 'exhibitors';

export type EventFile = {
  id: string;
  name: I18n;
  subtitle?: I18n;
  dates: { start: string; end: string };
  venue: string;
  codePattern: string;
  categories: Record<string, Category>;
  zones: Record<string, I18n & { short?: string }>;
  foyerZones: FoyerZone[];
  obstacles: Obstacle[];
  aisles?: { signY: number; boothMinY: number; x: Record<string, number> };
  landmarks: Landmark[];
  quickPicks: QuickPick[];
  allowedDuplicateCodes: string[];
  notes: string[];
  text?: Partial<Record<TextKey, I18n>>;
};

export type BoothRaw = Rect & { c: string; cat: string; extra?: Rect[] };
export type Pillar = Rect & { cat: string; inner: Rect };
export type BoothsFile = { booths: BoothRaw[]; pillars: Pillar[] };
export type ExhibitorRow = Record<string, string>;

export type Booth = BoothRaw & { i: number; cx: number; cy: number; area: string | null; foyer?: true };
export type Exhibitor = { booth: string; th: string; en: string };

export type EventData = {
  venue: Venue;
  event: EventFile;
  booths: Booth[];
  pillars: Pillar[];
  byCode: Record<string, Booth[]>;
  exhibitors: Exhibitor[];
  unknownExhibitorBooths: string[];
  landmarks: Landmark[];
  landmarkById: Record<string, Landmark>;
};

export type Dest = { kind: 'booth'; b: Booth } | { kind: 'place'; lm: Landmark };

export type RouteOk = {
  P: Point[];
  len: number;
  meters: number;
  minutes: number;
  doorsUsed: number[];
  areas: string[];
};
export type RouteResult = RouteOk | { same: true } | { fail: true };
export const isRouteOk = (r: RouteResult | null | undefined): r is RouteOk => !!r && 'P' in r;

export type EventBundle = { venue: Venue; event: EventFile; booths: BoothsFile; exhibitors: ExhibitorRow[] };
export type EventSummary = {
  id: string;
  name: I18n;
  subtitle?: I18n;
  dates: { start: string; end: string };
  venueName: I18n;
  timezone: string;
};
