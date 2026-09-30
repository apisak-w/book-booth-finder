import type { EventFile, I18n, LandmarkGroup, TextKey } from '../core/types';

export type Lang = 'th' | 'en';

export type Strings = {
  title: string;
  searchLabel: string;
  ph: string;
  exhibitors: string;
  quick: string;
  legend: string;
  noRes: (q: string) => string;
  aisle: (l: string) => string;
  from: string;
  pickFrom: string;
  pickHint: string;
  min: (m: number) => string;
  meters: string;
  s_start: (n: string) => string;
  s_door: (n: string) => string;
  s_area: (n: string) => string;
  s_aisle: (l: string) => string;
  s_arrive: (c: string) => string;
  s_arrivePlace: (n: string) => string;
  same: string;
  clear: string;
  share: string;
  copied: string;
  hide: string;
  show: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  clearSearch: string;
  groups: Record<LandmarkGroup, string>;
  tapHint: string;
  noRoute: string;
  events: string;
  allEvents: string;
  live: string;
  upcoming: string;
  past: string;
  ended: (date: string) => string;
  openMap: string;
  notFound: string;
  noEvents: string;
  language: string;
  floorPlan: string;
};

export const STRINGS: Record<Lang, Strings> = {
  th: {
    title: 'ค้นหาบูธ',
    searchLabel: 'ค้นหาบูธหรือผู้ออกบูธ',
    ph: 'เลขบูธ หรือชื่อผู้ออกบูธ',
    exhibitors: 'ผู้ออกบูธในบูธนี้',
    quick: 'ไปที่ยอดนิยม',
    legend: 'สีของโซน',
    noRes: (q) => `ไม่พบ “${q}” ลองพิมพ์เลขบูธ หรือชื่อผู้ออกบูธ`,
    aisle: (l) => `ทางเดิน ${l}`,
    from: 'คุณอยู่ที่ไหนตอนนี้',
    pickFrom: 'เลือกจุดเริ่มต้น',
    pickHint: 'เลือกจุดที่คุณอยู่ แล้วแอปจะวาดเส้นทางเดินให้',
    min: (m) => `ประมาณ ${m} นาที`,
    meters: 'ม.',
    s_start: (n) => `เริ่มที่${n}`,
    s_door: (n) => `เข้างานทาง${n}`,
    s_area: (n) => `เดินต่อเข้า${n}`,
    s_aisle: (l) => `เลี้ยวเข้าทางเดิน ${l}`,
    s_arrive: (c) => `ถึงบูธ ${c} แล้ว ดูจุดที่ไฮไลต์บนแผนที่`,
    s_arrivePlace: (n) => `ถึง${n}แล้ว`,
    same: 'คุณอยู่ที่นี่แล้ว',
    clear: 'ล้างเส้นทาง',
    share: 'คัดลอกลิงก์',
    copied: 'คัดลอกลิงก์แล้ว',
    hide: 'ย่อ',
    show: 'ขยาย',
    zoomIn: 'ซูมเข้า',
    zoomOut: 'ซูมออก',
    fit: 'ดูทั้งผัง',
    clearSearch: 'ล้างคำค้นหา',
    groups: {
      entry: 'ทางเข้า',
      wc: 'ห้องน้ำ',
      info: 'จุดประชาสัมพันธ์',
      charge: 'จุดชาร์จแบต',
      stage: 'เวทีและกิจกรรม',
      other: 'อื่น ๆ',
    },
    tapHint: 'แตะบูธบนแผนที่ หรือพิมพ์ค้นหาด้านบน',
    noRoute: 'ไม่พบเส้นทาง ลองเลือกจุดเริ่มต้นอื่น',
    events: 'งานทั้งหมด',
    allEvents: 'งานทั้งหมด',
    live: 'กำลังจัด',
    upcoming: 'เร็ว ๆ นี้',
    past: 'จบแล้ว',
    ended: (d) => `งานนี้จบไปแล้วเมื่อ ${d} แผนที่ยังใช้ได้`,
    openMap: 'เปิดแผนที่',
    notFound: 'ไม่พบงานนี้ กลับไปเลือกจากรายการงาน',
    noEvents: 'ยังไม่มีงาน',
    language: 'ภาษา',
    floorPlan: 'ผังงาน',
  },
  en: {
    title: 'Booth Finder',
    searchLabel: 'Search booths or exhibitors',
    ph: 'Booth code or exhibitor',
    exhibitors: 'At this booth',
    quick: 'Popular places',
    legend: 'Zone colours',
    noRes: (q) => `Nothing matches “${q}”. Try a booth code or an exhibitor name.`,
    aisle: (l) => `Aisle ${l}`,
    from: 'Where are you now?',
    pickFrom: 'Choose a starting point',
    pickHint: 'Pick where you are and the map draws your walking route.',
    min: (m) => `about ${m} min`,
    meters: 'm',
    s_start: (n) => `Start at ${n}.`,
    s_door: (n) => `Go in through the ${n}.`,
    s_area: (n) => `Keep walking into ${n}.`,
    s_aisle: (l) => `Turn into aisle ${l}.`,
    s_arrive: (c) => `You're at booth ${c}. It's highlighted on the map.`,
    s_arrivePlace: (n) => `You've reached ${n}.`,
    same: "You're already here.",
    clear: 'Clear route',
    share: 'Copy link',
    copied: 'Link copied',
    hide: 'Less',
    show: 'More',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Show whole floor',
    clearSearch: 'Clear search',
    groups: {
      entry: 'Entrances',
      wc: 'Toilets',
      info: 'Information',
      charge: 'Charging spots',
      stage: 'Stages & activities',
      other: 'Other',
    },
    tapHint: 'Tap a booth on the map, or search above.',
    noRoute: 'No route found. Try a different starting point.',
    events: 'Events',
    allEvents: 'All events',
    live: 'On now',
    upcoming: 'Coming up',
    past: 'Past',
    ended: (d) => `This event ended on ${d}. The map still works.`,
    openMap: 'Open map',
    notFound: "We can't find this event. Pick one from the event list.",
    noEvents: 'No events yet.',
    language: 'Language',
    floorPlan: 'Floor plan',
  },
};

export const nameIn = (lang: Lang) => (o: I18n) => o[lang] || o.th || o.en;

export const textFor = (s: Strings, event: EventFile, lang: Lang, key: TextKey) => event.text?.[key]?.[lang] ?? s[key];

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function fmtRange(start: string, end: string, lang: Lang): string {
  const f = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return start === end ? f.format(d(start)) : f.formatRange(d(start), d(end));
}
