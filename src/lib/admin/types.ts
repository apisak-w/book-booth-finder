import type { Area, GeoPin, I18n, Landmark, Point } from '../core/types';

export type AdminEvent = { id: string; name: I18n; start: string; end: string };
export type AdminVenue = {
  id: string;
  name: I18n;
  timezone: string;
  metersPerPx: number;
  walls: Point[][];
  areas: Area[];
  pins: GeoPin[];
  entrances: Landmark[];
  events: AdminEvent[];
};
