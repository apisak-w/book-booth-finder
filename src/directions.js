import { DOORS } from './config.js';
import { LANDMARKS } from './content.js';
import { hallAt } from './routing.js';

const STANDARD_CODE = /^[A-T]\d\d$/;

/** True for booths in the lettered aisle grid (not foyer zones / top row). */
export const isAisleBooth = (b) => STANDARD_CODE.test(b.c) && !!b.hall && b.y > 340;

/**
 * Written directions for a route.
 * @param s strings for the current language (STRINGS.th / STRINGS.en)
 * @param nameOf picks the right-language name from {th, en}
 */
export function buildSteps(route, start, dest, s, nameOf) {
  const steps = [s.s_start(nameOf(start))];
  const startHall = hallAt(start.x, start.y);

  const firstDoor = route.doorsUsed.length ? DOORS[route.doorsUsed[0]] : null;
  if (firstDoor && firstDoor.id !== start.id) {
    const lm = LANDMARKS.find((l) => l.id === firstDoor.id);
    if (lm) steps.push(s.s_door(nameOf(lm)));
  }

  const destHall = dest.kind === 'booth' ? dest.b.hall : hallAt(dest.lm.x, dest.lm.y);
  const entryHall = startHall || firstDoor?.hall || null;
  if (destHall && entryHall && entryHall !== destHall) steps.push(s.s_hall(destHall));

  if (dest.kind === 'booth') {
    const b = dest.b;
    if (isAisleBooth(b)) {
      steps.push(s.s_aisle(b.c[0]));
      const f = (b.cy - 284) / (1460 - 284); // 0 = back wall, 1 = lakeside wall
      steps.push(s.s_pos[f < 0.36 ? 'back' : f < 0.66 ? 'mid' : 'front']);
    }
    steps.push(s.s_arrive(b.c));
  } else {
    steps.push(s.s_arrivePlace(nameOf(dest.lm)));
  }
  return steps;
}
