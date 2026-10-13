import type { Georef } from '$lib/core/geo';
import type { Point, Surroundings } from '$lib/core/types';

export type StreetView = { geo: Georef; surroundings: Surroundings | null; tileUrl: string; credit: string };
export type YouMark = { p: Point; accPx: number; leg: Point | null };
export type Turn = { deg: number; cx: number; cy: number };
export type CompassView = { on: boolean; northDeg: number; toggle: () => void };
