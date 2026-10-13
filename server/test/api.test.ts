import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../shared/dates.js';
import { quoteStay } from '../../shared/pricing.js';
import { RateLimiter } from '../src/lib/rateLimit.js';
import { ADMIN, Client, GUEST, TODAY, guestDetails, idemKey, roomId, startApp, type TestApp } from './helpers.js';

let app: TestApp;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const d = (n: number) => addDays(TODAY, n);

async function book(c: Client, body: Record<string, unknown>) {
  const q = await c.post('/api/quote', {
    roomTypeId: body.roomTypeId, checkIn: body.checkIn, checkOut: body.checkOut, rooms: body.rooms ?? 1, adults: body.adults ?? 2, children: body.children ?? 0,
  });
  const expectedTotal = q.json?.quote?.total ?? 1;
  return c.post('/api/reservations', {
    rooms: 1, adults: 2, children: 0, guest: guestDetails, acceptTerms: true, idempotencyKey: idemKey(), expectedTotal, ...body,
  });
}

describe('catalogue & search', () => {
  test('home data loads: destinations and hotels', async () => {
    const c = new Client(app.base);
    const dest = await c.get('/api/destinations');
    assert.equal(dest.status, 200);
    assert.equal(dest.json.destinations.length, 5);
    const hotels = await c.get('/api/hotels');
    assert.equal(hotels.json.hotels.length, 6);
  });

  test('filters change results', async () => {
    const c = new Client(app.base);
    const byDest = await c.get('/api/hotels?destination=dolomites');
    assert.deepEqual(byDest.json.hotels.map((h: { slug: string }) => h.slug).sort(), ['aurelia-alta-badia-lodge', 'aurelia-brixen-spa-retreat']);
    const fourStar = await c.get('/api/hotels?stars=4');
    assert.ok(fourStar.json.hotels.every((h: { stars: number }) => h.stars === 4));
    assert.equal(fourStar.json.hotels.length, 2);
    const amen = await c.get('/api/hotels?amenities=hot_spring');
    assert.deepEqual(amen.json.hotels.map((h: { slug: string }) => h.slug), ['aurelia-yufu-terrace']);
    const freeCancel = await c.get('/api/hotels?freeCancellation=1');
    assert.ok(!freeCancel.json.hotels.some((h: { slug: string }) => h.slug === 'aurelia-brixen-spa-retreat'));
    const cheap = await c.get('/api/hotels?maxPrice=300');
    assert.ok(cheap.json.hotels.length > 0 && cheap.json.hotels.every((h: { fromPrice: number }) => h.fromPrice <= 30000));
    const type = await c.get('/api/hotels?type=Chalet');
    assert.deepEqual(type.json.hotels.map((h: { slug: string }) => h.slug), ['aurelia-courmayeur-chalet']);
  });

  test('sort by price ascending and by rating', async () => {
    const c = new Client(app.base);
    const asc = await c.get('/api/hotels?sort=price_asc');
    const prices = asc.json.hotels.map((h: { fromPrice: number }) => h.fromPrice);
    assert.deepEqual(prices, [...prices].sort((a: number, b: number) => a - b));
    const rated = await c.get('/api/hotels?sort=rating');
    assert.equal(rated.json.hotels[0].slug, 'aurelia-lucerne-cliffs');
  });

  test('invalid dates are rejected by the server', async () => {
    const c = new Client(app.base);
    const r = await c.get(`/api/hotels?checkIn=${d(5)}&checkOut=${d(3)}&adults=2&rooms=1`);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.fields.checkOut, 'Check-out must be after check-in.');
    const past = await c.get(`/api/hotels?checkIn=${d(-2)}&checkOut=${d(1)}`);
    assert.equal(past.status, 400);
    const zeroAdults = await c.get(`/api/hotels?checkIn=${d(2)}&checkOut=${d(3)}&adults=0`);
    assert.equal(zeroAdults.status, 400);
  });

  test('hotel detail loads with date-specific availability (seeded sell-out)', async () => {
    const c = new Client(app.base);
    const during = await c.get(`/api/hotels/aurelia-lucerne-cliffs?checkIn=${d(7)}&checkOut=${d(10)}&adults=2&rooms=1`);
    assert.equal(during.status, 200);
    const pres = during.json.hotel.rooms.find((r: { slug: string }) => r.slug === 'presidential-suite');
    assert.equal(pres.unitsAvailable, 0);
    assert.equal(pres.availability, 'sold_out');
    const after = await c.get(`/api/hotels/aurelia-lucerne-cliffs?checkIn=${d(10)}&checkOut=${d(12)}&adults=2&rooms=1`);
    assert.equal(after.json.hotel.rooms.find((r: { slug: string }) => r.slug === 'presidential-suite').unitsAvailable, 1);
    const missing = await c.get('/api/hotels/not-a-hotel');
    assert.equal(missing.status, 404);
  });

  test('inventory override (maintenance) closes a room type for those nights', async () => {
    const c = new Client(app.base);
    const r = await c.get(`/api/hotels/aurelia-courmayeur-chalet?checkIn=${d(21)}&checkOut=${d(23)}&adults=2&rooms=1`);
    assert.equal(r.json.hotel.rooms.find((x: { slug: string }) => x.slug === 'family-suite').unitsAvailable, 0);
  });

  test('server quote equals the shared pricing engine', async () => {
    const c = new Client(app.base);
    const id = roomId(app.db, 'aurelia-winelands-estate', 'deluxe-vineyard-room');
    const r = await c.post('/api/quote', { roomTypeId: id, checkIn: d(10), checkOut: d(16), rooms: 2, adults: 3, children: 1 });
    assert.equal(r.status, 200);
    const expected = quoteStay({ nightlyRate: 42000, checkIn: d(10), checkOut: d(16), rooms: 2, bookedOn: TODAY });
    assert.deepEqual(r.json.quote, expected);
    assert.equal(r.json.quote.discount.code, 'EXTENDED_STAY');
  });

  test('occupancy limits are enforced', async () => {
    const c = new Client(app.base);
    const id = roomId(app.db, 'aurelia-winelands-estate', 'garden-room');
    const r = await c.post('/api/quote', { roomTypeId: id, checkIn: d(10), checkOut: d(12), rooms: 1, adults: 3, children: 0 });
    assert.equal(r.status, 422);
    assert.equal(r.json.error.code, 'OCCUPANCY_EXCEEDED');
  });
});

describe('booking flow', () => {
  test('booking requires sign-in', async () => {
    const c = new Client(app.base);
    const r = await book(c, { roomTypeId: roomId(app.db, 'aurelia-yufu-terrace', 'superior-room'), checkIn: d(30), checkOut: d(32) });
    assert.equal(r.status, 401);
  });

  test('successful reservation persists, with honest test-mode payment state', async () => {
    const c = new Client(app.base);
    await c.register('Ada Lovelace', 'ada.booker@example.com');
    const id = roomId(app.db, 'aurelia-yufu-terrace', 'superior-room');
    const r = await book(c, { roomTypeId: id, checkIn: d(30), checkOut: d(33) });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const res = r.json.reservation;
    assert.match(res.code, /^AUR-[A-Z0-9]{6}$/);
    assert.equal(res.status, 'confirmed');
    assert.equal(res.paymentStatus, 'not_collected');
    assert.equal(res.paymentMode, 'test');
    assert.equal(r.json.payment, null);
    // Persisted: retrievable, and the nightly ledger has one row per night.
    const mine = await c.get('/api/reservations');
    assert.ok(mine.json.reservations.some((x: { code: string }) => x.code === res.code));
    const nights = app.db.prepare('SELECT COUNT(*) n FROM reservation_nights WHERE reservation_id = ?').get(res.id) as { n: number };
    assert.equal(nights.n, 3);
    const one = await c.get(`/api/reservations/${res.code}`);
    assert.equal(one.json.reservation.price.total, res.price.total);
  });

  test('tampered price is refused and nothing is saved', async () => {
    const c = new Client(app.base);
    await c.register('Price Tamperer', 'tamper@example.com');
    const before = (app.db.prepare('SELECT COUNT(*) n FROM reservations').get() as { n: number }).n;
    const r = await c.post('/api/reservations', {
      roomTypeId: roomId(app.db, 'aurelia-yufu-terrace', 'superior-room'), checkIn: d(40), checkOut: d(41), rooms: 1, adults: 2, children: 0,
      guest: guestDetails, acceptTerms: true, idempotencyKey: idemKey(), expectedTotal: 100,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'PRICE_CHANGED');
    assert.ok(r.json.error.quote.total > 100);
    const afterCount = (app.db.prepare('SELECT COUNT(*) n FROM reservations').get() as { n: number }).n;
    assert.equal(afterCount, before);
  });

  test('terms must be accepted and guest details validated', async () => {
    const c = new Client(app.base);
    await c.register('No Terms', 'noterms@example.com');
    const r = await book(c, { roomTypeId: roomId(app.db, 'aurelia-yufu-terrace', 'superior-room'), checkIn: d(42), checkOut: d(43), acceptTerms: false, guest: { ...guestDetails, email: 'nope' } });
    assert.equal(r.status, 400);
    assert.ok(r.json.error.fields.acceptTerms);
    assert.ok(r.json.error.fields['guest.email']);
  });

  test('duplicate submission with the same idempotency key returns the same reservation', async () => {
    const c = new Client(app.base);
    await c.register('Double Clicker', 'double@example.com');
    const id = roomId(app.db, 'aurelia-yufu-terrace', 'junior-suite');
    const q = await c.post('/api/quote', { roomTypeId: id, checkIn: d(50), checkOut: d(52), rooms: 1, adults: 2, children: 0 });
    const body = { roomTypeId: id, checkIn: d(50), checkOut: d(52), rooms: 1, adults: 2, children: 0, guest: guestDetails, acceptTerms: true, idempotencyKey: idemKey(), expectedTotal: q.json.quote.total };
    const [a, b] = await Promise.all([c.post('/api/reservations', body), c.post('/api/reservations', body)]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 201]);
    assert.equal(a.json.reservation.code, b.json.reservation.code);
    const n = (app.db.prepare('SELECT COUNT(*) n FROM reservations WHERE idempotency_key = ?').get(body.idempotencyKey) as { n: number }).n;
    assert.equal(n, 1);
  });

  test('overlapping booking of fully-booked inventory is rejected; adjacent stay is allowed', async () => {
    const c = new Client(app.base);
    await c.register('Overlap Tester', 'overlap@example.com');
    const pres = roomId(app.db, 'aurelia-lucerne-cliffs', 'presidential-suite'); // 1 unit, held nights +7…+9
    const overlap = await book(c, { roomTypeId: pres, checkIn: d(9), checkOut: d(11) });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.json.error.code, 'NOT_AVAILABLE');
    const adjacent = await book(c, { roomTypeId: pres, checkIn: d(10), checkOut: d(12) }); // arrives on the morning the other leaves
    assert.equal(adjacent.status, 201, JSON.stringify(adjacent.json));
    const again = await book(c, { roomTypeId: pres, checkIn: d(11), checkOut: d(13) });
    assert.equal(again.status, 409);
  });

  test('concurrent requests never oversell the last rooms', async () => {
    const pool = await Promise.all(Array.from({ length: 7 }, async (_, i) => {
      const c = new Client(app.base);
      await c.register(`Racer ${i}`, `racer${i}@example.com`);
      return c;
    }));
    const fam = roomId(app.db, 'aurelia-alta-badia-lodge', 'family-room'); // 4 units
    const results = await Promise.all(pool.map((c) => book(c, { roomTypeId: fam, checkIn: d(60), checkOut: d(63), adults: 2 })));
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 409).length;
    assert.equal(ok, 4);
    assert.equal(rejected, 3);
    const hotel = await new Client(app.base).get(`/api/hotels/aurelia-alta-badia-lodge?checkIn=${d(60)}&checkOut=${d(63)}&adults=2&rooms=1`);
    assert.equal(hotel.json.hotel.rooms.find((r: { slug: string }) => r.slug === 'family-room').unitsAvailable, 0);
  });

  test('multi-room request needs that many units on every night', async () => {
    const c = new Client(app.base);
    await c.register('Group Booker', 'group@example.com');
    const fam = roomId(app.db, 'aurelia-alta-badia-lodge', 'family-room');
    // Seed has 4/4 sold on +14…+16; a stay +12…+15 touches those nights.
    const r = await book(c, { roomTypeId: fam, checkIn: d(12), checkOut: d(15), rooms: 2, adults: 4 });
    assert.equal(r.status, 409);
  });

  test('guests cannot read other guests’ reservations', async () => {
    const owner = new Client(app.base);
    await owner.register('Owner', 'owner@example.com');
    const made = await book(owner, { roomTypeId: roomId(app.db, 'aurelia-yufu-terrace', 'superior-room'), checkIn: d(70), checkOut: d(71) });
    const intruder = new Client(app.base);
    await intruder.register('Intruder', 'intruder@example.com');
    const r = await intruder.get(`/api/reservations/${made.json.reservation.code}`);
    assert.equal(r.status, 404);
    const cancel = await intruder.post(`/api/reservations/${made.json.reservation.code}/cancellation-request`, { reason: 'x' });
    assert.equal(cancel.status, 404);
  });
});

describe('cancellation & admin', () => {
  test('anonymous and guest users cannot reach admin APIs', async () => {
    const anon = new Client(app.base);
    assert.equal((await anon.get('/api/admin/overview')).status, 401);
    const guest = new Client(app.base);
    await guest.login(GUEST);
    for (const p of ['/api/admin/overview', '/api/admin/reservations', '/api/admin/customers', '/api/admin/hotels']) {
      assert.equal((await guest.get(p)).status, 403, p);
    }
    assert.equal((await guest.patch('/api/admin/rooms/1', { nightlyRate: 100 })).status, 403);
    const admin = new Client(app.base);
    await admin.login(ADMIN);
    const ov = await admin.get('/api/admin/overview');
    assert.equal(ov.status, 200);
    assert.ok(ov.json.totals.reservations > 0);
    assert.equal(ov.json.revenue.paid, 0, 'test mode must never report collected payments');
  });

  test('cancellation request → admin approval → inventory released', async () => {
    const guest = new Client(app.base);
    await guest.register('Canceller', 'cancel@example.com');
    const pres = roomId(app.db, 'aurelia-lucerne-cliffs', 'presidential-suite');
    const made = await book(guest, { roomTypeId: pres, checkIn: d(80), checkOut: d(82) });
    assert.equal(made.status, 201);
    const code = made.json.reservation.code;
    const req = await guest.post(`/api/reservations/${code}/cancellation-request`, { reason: 'Plans changed' });
    assert.equal(req.status, 200);
    assert.equal(req.json.reservation.cancellationRequest.status, 'pending');
    assert.equal((await guest.post(`/api/reservations/${code}/cancellation-request`, {})).status, 409);

    const admin = new Client(app.base);
    await admin.login(ADMIN);
    const list = await admin.get('/api/admin/cancellation-requests');
    const pending = list.json.requests.find((x: { code: string }) => x.code === code);
    assert.ok(pending);
    const approved = await admin.post(`/api/admin/cancellation-requests/${pending.id}`, { approve: true, note: 'Approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.reservation.status, 'cancelled');
    const avail = await guest.get(`/api/hotels/aurelia-lucerne-cliffs?checkIn=${d(80)}&checkOut=${d(82)}&adults=2&rooms=1`);
    assert.equal(avail.json.hotel.rooms.find((r: { slug: string }) => r.slug === 'presidential-suite').unitsAvailable, 1);
  });

  test('status transitions follow the allowed state machine', async () => {
    const admin = new Client(app.base);
    await admin.login(ADMIN);
    const all = await admin.get('/api/admin/reservations?status=checked_out');
    const done = all.json.reservations[0];
    const bad = await admin.patch(`/api/admin/reservations/${done.id}/status`, { status: 'confirmed' });
    assert.equal(bad.status, 409);
    const future = (await admin.get('/api/admin/reservations?status=confirmed')).json.reservations.find((r: { checkIn: string }) => r.checkIn > TODAY);
    const early = await admin.patch(`/api/admin/reservations/${future.id}/status`, { status: 'checked_in' });
    assert.equal(early.status, 409);
    const arriving = (await admin.get('/api/admin/reservations?status=confirmed')).json.reservations.find((r: { checkIn: string }) => r.checkIn === TODAY);
    const ok = await admin.patch(`/api/admin/reservations/${arriving.id}/status`, { status: 'checked_in' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.reservation.status, 'checked_in');
  });

  test('admin cannot reduce inventory below existing reservations; can update price', async () => {
    const admin = new Client(app.base);
    await admin.login(ADMIN);
    const fam = roomId(app.db, 'aurelia-alta-badia-lodge', 'family-room');
    const r = await admin.patch(`/api/admin/rooms/${fam}`, { inventory: 1 });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'INVENTORY_CONFLICT');
    const price = await admin.patch(`/api/admin/rooms/${fam}`, { nightlyRate: 45000 });
    assert.equal(price.status, 200);
    const hotel = await admin.get('/api/hotels/aurelia-alta-badia-lodge');
    assert.equal(hotel.json.hotel.rooms.find((x: { slug: string }) => x.slug === 'family-room').nightlyRate, 45000);
    const inv = await admin.get(`/api/admin/rooms/${fam}/inventory?from=${d(14)}`);
    assert.equal(inv.json.nights[0].free, 0);
    const close = await admin.put(`/api/admin/rooms/${fam}/inventory/${d(14)}`, { units: 0 });
    assert.equal(close.status, 409, 'cannot close a night that already has reservations');
  });

  test('admin customer view does not expose password hashes', async () => {
    const admin = new Client(app.base);
    await admin.login(ADMIN);
    const list = await admin.get('/api/admin/customers');
    assert.ok(list.json.customers.length > 0);
    assert.ok(!JSON.stringify(list.json).includes('scrypt$'));
    const one = await admin.get(`/api/admin/customers/${list.json.customers[0].id}`);
    assert.equal(one.status, 200);
    assert.ok(!('password_hash' in one.json.customer));
  });
});

describe('auth & security', () => {
  test('passwords are hashed, wrong password rejected, logout ends session', async () => {
    const c = new Client(app.base);
    await c.register('Hash Check', 'hash@example.com', 'Plaintext-Never-99');
    const row = app.db.prepare('SELECT password_hash FROM users WHERE email = ?').get('hash@example.com') as { password_hash: string };
    assert.ok(row.password_hash.startsWith('scrypt$'));
    assert.ok(!row.password_hash.includes('Plaintext-Never-99'));
    assert.equal((await c.get('/api/auth/me')).json.user.email, 'hash@example.com');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).json.user, null);
    const bad = await new Client(app.base).post('/api/auth/login', { email: 'hash@example.com', password: 'wrong-password-1' });
    assert.equal(bad.status, 401);
    const unknown = await new Client(app.base).post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-1' });
    assert.equal(unknown.json.error.message, bad.json.error.message, 'no account enumeration');
  });

  test('password reset (demo link) works once and revokes old password', async () => {
    const c = new Client(app.base);
    await c.register('Forgetful', 'forgetful@example.com', 'Original-Pass-1');
    const f = await c.post('/api/auth/forgot-password', { email: 'forgetful@example.com' });
    const token = new URL(f.json.demoResetUrl, 'http://x').searchParams.get('token');
    const reset = await c.post('/api/auth/reset-password', { token, password: 'Brand-New-Pass-2' });
    assert.equal(reset.status, 200);
    assert.equal((await c.post('/api/auth/reset-password', { token, password: 'Another-Pass-3' })).status, 400);
    assert.equal((await new Client(app.base).post('/api/auth/login', { email: 'forgetful@example.com', password: 'Original-Pass-1' })).status, 401);
    assert.equal((await new Client(app.base).post('/api/auth/login', { email: 'forgetful@example.com', password: 'Brand-New-Pass-2' })).status, 200);
  });

  test('mutations without the client header are blocked (CSRF)', async () => {
    const res = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(GUEST) });
    assert.equal(res.status, 403);
    const evil = new Client(app.base);
    const r = await evil.req('POST', '/api/auth/login', GUEST, { Origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  });

  test('contact form: server validation and honest delivery message', async () => {
    const c = new Client(app.base);
    const bad = await c.post('/api/contact', { name: 'A', email: 'x', subject: '', message: 'short' });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.error.fields.name && bad.json.error.fields.email && bad.json.error.fields.subject && bad.json.error.fields.message);
    const ok = await c.post('/api/contact', { name: 'Grace Hopper', email: 'grace@example.com', subject: 'Late arrival', message: 'We expect to arrive after midnight — is that OK?' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.delivery, 'stored');
    assert.match(ok.json.message, /not configured/);
  });

  test('security headers are present', async () => {
    const res = await fetch(`${app.base}/api/health`);
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('rate limiting', () => {
  test('login attempts are throttled', async () => {
    const limited = await startApp({ limiters: { auth: new RateLimiter(3, 60_000) } });
    try {
      const c = new Client(limited.base);
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await c.post('/api/auth/login', { email: 'x@example.com', password: 'bad-pass-1' })).status);
      assert.deepEqual(codes, [401, 401, 401, 429, 429]);
    } finally { await limited.close(); }
  });
});
