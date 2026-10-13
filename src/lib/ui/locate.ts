import type { Landmark } from '$lib/core/types';

export type LocState = 'idle' | 'asking' | 'on' | 'denied' | 'unavailable';
export type LocView = {
  state: LocState;
  weak: boolean;
  farKm: number | null;
  outside: { entrance: Landmark; meters: number; minutes: number; inside: number | null } | null;
  hall: { choices: string[]; guess: string | null } | null;
  onStart: () => void;
  onStop: () => void;
  onInside: () => void;
  onHall: (id: string) => void;
  onList: () => void;
};
