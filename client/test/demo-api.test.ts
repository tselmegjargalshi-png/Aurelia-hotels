/**
 * Tests for the browser-only demo API (client/src/demo). They run it in Node, where there is no
 * localStorage, so state is in memory, exactly as in a browser that blocks storage.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { demoFetch } from '../src/demo/mockApi.js';
import { DEMO_GUEST_EMAIL, DEMO_GUEST_PASSWORD, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from '../src/demo/state.js';
import { addDays, todayIso } from '../../shared/dates.js';

const day = (n: number) => addDays(todayIso(), n);
const call = (method: string, path: string, body?: unknown) => demoFetch(method, path, body);
type J = Record<string, any>;
const login = (email: string, password: string) => call('POST', '/api/auth/login', { email, password });
const logout = () => call('POST', '/api/auth/logout');

async function roomId(hotel: string, room: string, q = ''): Promise<number> {
  const { json } = await call('GET', `/api/hotels/${hotel}${q}`);
  return (json as J).hotel.rooms.find((r: J) => r.slug === room).id;
}
let key = 0;
const idem = () => `demo-test-key-${String(++key).padStart(8, '0')}-abcdef`;
const guest = { firstName: 'Test', lastName: 'Guest', email: 'test@example.com', phone: null };

async function book(roomTypeId: number, checkIn: string, checkOut: string, extra: J = {}) {
  const quote = await call('POST', '/api/quote', { roomTypeId, checkIn, checkOut, rooms: 1, adults: 2, children: 0, ...extra });
  const total = (quote.json as J).quote?.total ?? 0;
  return call('POST', '/api/reservations', {
    roomTypeId, checkIn, checkOut, rooms: 1, adults: 2, children: 0, guest, acceptTerms: true, idempotencyKey: idem(), expectedTotal: total, ...extra,
  });
}

describe('demo API', () => {
  test('catalogue loads and filters change results', async () => {
    const all = (await call('GET', '/api/hotels')).json as J;
    assert.equal(all.hotels.length, 6);
    const four = (await call('GET', '/api/hotels?stars=4')).json as J;
    assert.ok(four.hotels.length > 0 && four.hotels.length < 6);
    assert.ok(four.hotels.every((h: J) => h.stars === 4));
    const cheap = (await call('GET', '/api/hotels?sort=price_asc')).json as J;
    const prices = cheap.hotels.map((h: J) => h.fromPrice);
    assert.deepEqual(prices, [...prices].sort((a: number, b: number) => a - b));
  });

  test('invalid dates are rejected', async () => {
    const r = await call('GET', `/api/hotels?checkIn=${day(10)}&checkOut=${day(8)}`);
    assert.equal(r.status, 400);
    assert.match((r.json as J).error.fields.checkOut, /after check-in/);
  });

  test('seeded sell-out is unavailable for its nights, available for others', async () => {
    const sold = await roomId('aurelia-lucerne-cliffs', 'presidential-suite', `?checkIn=${day(7)}&checkOut=${day(10)}&adults=2&rooms=1`);
    const hotel = ((await call('GET', `/api/hotels/aurelia-lucerne-cliffs?checkIn=${day(7)}&checkOut=${day(10)}&adults=2&rooms=1`)).json as J).hotel;
    assert.equal(hotel.rooms.find((r: J) => r.id === sold).availability, 'sold_out');
    const later = ((await call('GET', `/api/hotels/aurelia-lucerne-cliffs?checkIn=${day(40)}&checkOut=${day(43)}&adults=2&rooms=1`)).json as J).hotel;
    assert.notEqual(later.rooms.find((r: J) => r.id === sold).availability, 'sold_out');
  });

  test('booking requires sign-in; password is checked', async () => {
    await logout();
    const id = await roomId('aurelia-yufu-terrace', 'superior-room');
    assert.equal((await book(id, day(30), day(33))).status, 401);
    assert.equal((await login(DEMO_GUEST_EMAIL, 'wrong-password-1')).status, 401);
    assert.equal((await login(DEMO_GUEST_EMAIL, DEMO_GUEST_PASSWORD)).status, 200);
  });

  test('quote matches the pricing engine; reservation saved as test booking, payment never marked paid', async () => {
    const id = await roomId('aurelia-yufu-terrace', 'superior-room');
    const q = (await call('POST', '/api/quote', { roomTypeId: id, checkIn: day(30), checkOut: day(33), rooms: 1, adults: 2, children: 0 })).json as J;
    // 3 × $380 = 1140.00; tax 12% = 136.80; fee 3 × 10.00 = 30.00 → 1306.80
    assert.equal(q.quote.total, 130680);
    const r = await book(id, day(30), day(33));
    assert.equal(r.status, 201);
    const res = (r.json as J).reservation;
    assert.equal(res.status, 'confirmed');
    assert.equal(res.paymentStatus, 'not_collected');
    assert.equal(res.paymentMode, 'test');
    assert.equal((await call('GET', `/api/reservations/${res.code}`)).status, 200);
  });

  test('tampered price is refused and nothing is saved', async () => {
    const id = await roomId('aurelia-yufu-terrace', 'superior-room');
    const before = ((await call('GET', '/api/reservations')).json as J).reservations.length;
    const r = await call('POST', '/api/reservations', {
      roomTypeId: id, checkIn: day(50), checkOut: day(52), rooms: 1, adults: 2, children: 0, guest, acceptTerms: true, idempotencyKey: idem(), expectedTotal: 100,
    });
    assert.equal(r.status, 409);
    assert.equal((r.json as J).error.code, 'PRICE_CHANGED');
    assert.equal(((await call('GET', '/api/reservations')).json as J).reservations.length, before);
  });

  test('terms must be accepted', async () => {
    const id = await roomId('aurelia-yufu-terrace', 'superior-room');
    const r = await call('POST', '/api/reservations', {
      roomTypeId: id, checkIn: day(60), checkOut: day(62), rooms: 1, adults: 2, children: 0, guest, acceptTerms: false, idempotencyKey: idem(), expectedTotal: 1,
    });
    assert.equal(r.status, 400);
  });

  test('same idempotency key returns the same reservation', async () => {
    const id = await roomId('aurelia-brixen-spa-retreat', 'deluxe-spa-room');
    const q = (await call('POST', '/api/quote', { roomTypeId: id, checkIn: day(70), checkOut: day(72), rooms: 1, adults: 2, children: 0 })).json as J;
    const body = { roomTypeId: id, checkIn: day(70), checkOut: day(72), rooms: 1, adults: 2, children: 0, guest, acceptTerms: true, idempotencyKey: idem(), expectedTotal: q.quote.total };
    const a = (await call('POST', '/api/reservations', body)).json as J;
    const b = await call('POST', '/api/reservations', body);
    assert.equal(b.status, 200);
    assert.equal((b.json as J).replayed, true);
    assert.equal((b.json as J).reservation.code, a.reservation.code);
  });

  test('overlap on fully booked inventory is rejected; an adjacent stay is allowed', async () => {
    // Presidential Suite (1 unit) is held on nights +7…+9 by seed data.
    const pres = await roomId('aurelia-lucerne-cliffs', 'presidential-suite');
    const overlap = await book(pres, day(8), day(11));
    assert.equal(overlap.status, 409);
    assert.equal((overlap.json as J).error.code, 'NOT_AVAILABLE');
    const adjacent = await book(pres, day(10), day(12));
    assert.equal(adjacent.status, 201);
    // Now that unit is held on +10, +11 as well: a stay touching +11 conflicts.
    assert.equal((await book(pres, day(11), day(13))).status, 409);
  });

  test('every night must be free: maintenance closure blocks the whole stay', async () => {
    const fs = await roomId('aurelia-courmayeur-chalet', 'family-suite');
    assert.equal((await book(fs, day(19), day(21), { adults: 2 })).status, 409); // night +20 is closed
    assert.equal((await book(fs, day(23), day(25), { adults: 2 })).status, 201);
  });

  test('occupancy limits are enforced', async () => {
    const id = await roomId('aurelia-yufu-terrace', 'superior-room');
    const r = await call('POST', '/api/quote', { roomTypeId: id, checkIn: day(30), checkOut: day(32), rooms: 1, adults: 4, children: 0 });
    assert.equal(r.status, 422);
  });

  test('cancellation request → admin approval releases inventory', async () => {
    const list = ((await call('GET', '/api/reservations')).json as J).reservations as J[];
    const mine = list.find((r) => r.hotel.slug === 'aurelia-brixen-spa-retreat' && r.checkIn === day(70))!;
    const req = await call('POST', `/api/reservations/${mine.code}/cancellation-request`, { reason: 'Test' });
    assert.equal(req.status, 200);
    assert.equal((req.json as J).reservation.cancellationRequest.status, 'pending');
    await logout();
    assert.equal((await call('GET', '/api/admin/overview')).status, 401);
    await login(DEMO_GUEST_EMAIL, DEMO_GUEST_PASSWORD);
    assert.equal((await call('GET', '/api/admin/overview')).status, 403);
    await logout();
    assert.equal((await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD)).status, 200);
    const reqs = ((await call('GET', '/api/admin/cancellation-requests')).json as J).requests as J[];
    const target = reqs.find((x) => x.code === mine.code)!;
    const done = await call('POST', `/api/admin/cancellation-requests/${target.id}`, { approve: true });
    assert.equal((done.json as J).reservation.status, 'cancelled');
    // The room is bookable again for those nights.
    await logout(); await login(DEMO_GUEST_EMAIL, DEMO_GUEST_PASSWORD);
    const again = await roomId('aurelia-brixen-spa-retreat', 'deluxe-spa-room', `?checkIn=${day(70)}&checkOut=${day(72)}`);
    assert.equal((await book(again, day(70), day(72))).status, 201);
  });

  test('admin: status machine and inventory floor', async () => {
    await logout(); await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const rs = ((await call('GET', '/api/admin/reservations?status=confirmed')).json as J).reservations as J[];
    const future = rs.find((r) => r.checkIn > todayIso())!;
    assert.equal((await call('PATCH', `/api/admin/reservations/${future.id}/status`, { status: 'checked_out' })).status, 409);
    assert.equal((await call('PATCH', `/api/admin/reservations/${future.id}/status`, { status: 'checked_in' })).status, 409); // too early
    const pres = await roomId('aurelia-lucerne-cliffs', 'presidential-suite');
    assert.equal((await call('PATCH', `/api/admin/rooms/${pres}`, { inventory: 0 })).status, 409);
    assert.equal((await call('PATCH', `/api/admin/rooms/${pres}`, { nightlyRate: 150000 })).status, 200);
  });

  test('admin customer view never exposes password hashes', async () => {
    const list = ((await call('GET', '/api/admin/customers')).json as J).customers as J[];
    assert.ok(list.length >= 6);
    const detail = (await call('GET', `/api/admin/customers/${list[0]!.id}`)).json as J;
    assert.doesNotMatch(JSON.stringify(detail) + JSON.stringify(list), /pbkdf2|hash/i);
  });

  test('contact form validates and is honest about delivery', async () => {
    const bad = await call('POST', '/api/contact', { name: 'A', email: 'nope', subject: '', message: 'short' });
    assert.equal(bad.status, 400);
    const ok = await call('POST', '/api/contact', { name: 'Ana Test', email: 'ana@example.com', subject: 'Arrival', message: 'We arrive late in the evening, around 23:00.' });
    assert.equal(ok.status, 200);
    assert.match((ok.json as J).message, /No email is sent/);
  });

  test('registration hashes the password and signs in; reset link works once', async () => {
    await logout();
    const reg = await call('POST', '/api/auth/register', { name: 'New Person', email: 'new.person@example.com', password: 'Correct-horse-42' });
    assert.equal(reg.status, 200);
    await logout();
    const fp = (await call('POST', '/api/auth/forgot-password', { email: 'new.person@example.com' })).json as J;
    const token = new URL(fp.demoResetUrl, 'http://x').searchParams.get('token')!;
    assert.equal((await call('POST', '/api/auth/reset-password', { token, password: 'Another-secret-77' })).status, 200);
    assert.equal((await call('POST', '/api/auth/reset-password', { token, password: 'Third-secret-88' })).status, 400);
    assert.equal((await login('new.person@example.com', 'Correct-horse-42')).status, 401);
    assert.equal((await login('new.person@example.com', 'Another-secret-77')).status, 200);
  });
});
