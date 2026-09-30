import { test, expect } from 'bun:test';
import { validateNewEvent } from '../tools/pipeline/lib/new-event';

const ok = {
  id: 'fair-2027',
  plan: 'package.json',
  nameTh: 'งาน',
  nameEn: 'Fair',
  start: '2027-01-01',
  end: '2027-01-03',
  venue: 'qsncc-lg-5-8',
};

test('a valid new event passes and returns the event file', () => {
  const r = validateNewEvent(ok);
  expect(r.problems).toEqual([]);
  expect(r.event?.id).toBe('fair-2027');
});

test('bad id, missing flags, reversed dates, unknown venue and missing plan are all reported before anything is written', () => {
  const r = validateNewEvent({
    ...ok,
    id: '../Bad Id',
    nameEn: undefined,
    start: '2027-02-01',
    venue: 'nowhere',
    plan: 'nope.jpg',
  });
  const text = r.problems.join('\n');
  expect(text).toContain('--name-en is required');
  expect(text).toContain('nope.jpg');
  expect(text).toContain('venue "nowhere"');
  expect(r.event).toBeUndefined();
  expect(validateNewEvent({ ...ok, id: '../Bad Id' }).problems.join('\n')).toContain('id');
  expect(validateNewEvent({ ...ok, end: '2026-12-31' }).problems.join('\n')).toContain('dates');
});
