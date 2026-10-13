import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteStay, bestOffer } from './pricing.js';
import { validateStay, fitsOccupancy } from './validation.js';
import { nightsBetween, stayNights, addDays, isIsoDate } from './dates.js';

const TODAY = '2026-10-12';

test('dates: nights and stay nights are check-out exclusive', () => {
  assert.equal(nightsBetween('2026-10-20', '2026-10-23'), 3);
  assert.deepEqual(stayNights('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-02-28'), true);
});

test('validation: check-out must be after check-in', () => {
  const e = validateStay({ checkIn: '2026-10-20', checkOut: '2026-10-20', adults: 2, children: 0, rooms: 1 }, TODAY);
  assert.equal(e.checkOut, 'Check-out must be after check-in.');
  const e2 = validateStay({ checkIn: '2026-10-20', checkOut: '2026-10-19', adults: 2, children: 0, rooms: 1 }, TODAY);
  assert.ok(e2.checkOut);
});

test('validation: past dates, minimum guests and rooms', () => {
  const e = validateStay({ checkIn: '2026-10-01', checkOut: '2026-10-03', adults: 0, children: -1, rooms: 0 }, TODAY);
  assert.ok(e.checkIn && e.adults && e.children && e.rooms);
  const ok = validateStay({ checkIn: TODAY, checkOut: '2026-10-13', adults: 1, children: 0, rooms: 1 }, TODAY);
  assert.deepEqual(ok, {});
  const perRoom = validateStay({ checkIn: TODAY, checkOut: '2026-10-14', adults: 1, children: 2, rooms: 2 }, TODAY);
  assert.equal(perRoom.adults, 'Each room needs at least one adult.');
});

test('validation: stay length cap', () => {
  const e = validateStay({ checkIn: '2026-11-01', checkOut: '2026-12-15', adults: 2, children: 0, rooms: 1 }, TODAY);
  assert.match(e.checkOut ?? '', /30 nights/);
});

test('occupancy: party must fit across requested rooms', () => {
  const room = { maxAdults: 2, maxOccupancy: 3 };
  assert.equal(fitsOccupancy(room, 2, 1, 1), true);
  assert.equal(fitsOccupancy(room, 3, 0, 1), false);
  assert.equal(fitsOccupancy(room, 3, 2, 2), true);
  assert.equal(fitsOccupancy(room, 2, 2, 1), false);
});

test('pricing: base quote with demo tax and fee, no offer', () => {
  const q = quoteStay({ nightlyRate: 42_000, checkIn: '2026-10-20', checkOut: '2026-10-23', rooms: 2, bookedOn: TODAY });
  assert.equal(q.nights, 3);
  assert.equal(q.roomSubtotal, 42_000 * 3 * 2); // 252,000
  assert.equal(q.discount, null);
  assert.equal(q.taxes, Math.round(252_000 * 0.12)); // 30,240
  assert.equal(q.fees, 1000 * 3 * 2); // 6,000
  assert.equal(q.total, 252_000 + 30_240 + 6_000);
});

test('pricing: extended stay offer (15%) beats plan-ahead (10%), never stacks', () => {
  const q = quoteStay({ nightlyRate: 30_000, checkIn: '2027-01-10', checkOut: '2027-01-16', rooms: 1, bookedOn: TODAY });
  assert.equal(q.nights, 6);
  assert.equal(q.discount?.code, 'EXTENDED_STAY');
  assert.equal(q.discount?.amount, 27_000);
  assert.equal(q.discountedSubtotal, 180_000 - 27_000);
  assert.equal(q.total, q.discountedSubtotal + q.taxes + q.fees);
});

test('pricing: plan-ahead applies at 60+ days only', () => {
  assert.equal(bestOffer(2, 59), null);
  assert.equal(bestOffer(2, 60)?.code, 'PLAN_AHEAD');
});
