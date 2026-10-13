import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { addDays } from '../../shared/dates.js';
import { StripeProvider } from '../src/services/payments/stripe.js';
import type { CreatePaymentInput } from '../src/services/payments/provider.js';
import { Client, TODAY, guestDetails, idemKey, roomId, startApp, type TestApp } from './helpers.js';

/**
 * A Stripe-shaped provider whose network call is faked. Signature verification
 * is the REAL StripeProvider implementation, so these tests prove a reservation
 * becomes "paid" only after a correctly signed provider event.
 */
const WHSEC = 'whsec_test_secret_for_unit_tests';
class FakeStripe extends StripeProvider {
  created: CreatePaymentInput[] = [];
  constructor() { super('sk_test_fake', WHSEC); }
  override async createPayment(input: CreatePaymentInput) {
    this.created.push(input);
    return { providerRef: `pi_fake_${this.created.length}`, clientSecret: `pi_fake_${this.created.length}_secret_x` };
  }
}

function sign(payload: string, secret = WHSEC, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

let app: TestApp;
let provider: FakeStripe;
before(async () => { provider = new FakeStripe(); app = await startApp({ payments: provider }); });
after(async () => { await app.close(); });

test('with a provider configured, a booking is held as pending — never marked paid by the server itself', async () => {
  const c = new Client(app.base);
  await c.register('Payer', 'payer@example.com');
  const id = roomId(app.db, 'aurelia-yufu-terrace', 'superior-room');
  const checkIn = addDays(TODAY, 30); const checkOut = addDays(TODAY, 32);
  const q = await c.post('/api/quote', { roomTypeId: id, checkIn, checkOut, rooms: 1, adults: 2, children: 0 });
  const r = await c.post('/api/reservations', { roomTypeId: id, checkIn, checkOut, rooms: 1, adults: 2, children: 0, guest: guestDetails, acceptTerms: true, idempotencyKey: idemKey(), expectedTotal: q.json.quote.total });
  assert.equal(r.status, 201);
  assert.equal(r.json.reservation.status, 'pending_payment');
  assert.equal(r.json.reservation.paymentStatus, 'pending');
  assert.equal(r.json.payment.clientSecret, 'pi_fake_1_secret_x');
  assert.equal(provider.created[0]!.amount, q.json.quote.total, 'amount comes from the server quote');

  const code = r.json.reservation.code;
  const event = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_fake_1', amount_received: q.json.quote.total } } });

  // Forged / unsigned webhook is rejected and changes nothing.
  const forged = await fetch(`${app.base}/api/payments/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(event, 'whsec_wrong') }, body: event });
  assert.equal(forged.status, 400);
  assert.equal((await c.get(`/api/reservations/${code}`)).json.reservation.paymentStatus, 'pending');

  // Correctly signed event → paid + confirmed.
  const ok = await fetch(`${app.base}/api/payments/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(event) }, body: event });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).result, 'paid');
  const after = (await c.get(`/api/reservations/${code}`)).json.reservation;
  assert.equal(after.paymentStatus, 'paid');
  assert.equal(after.status, 'confirmed');

  // Replayed event is ignored (idempotent).
  const replay = await fetch(`${app.base}/api/payments/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(event) }, body: event });
  assert.equal((await replay.json()).result, 'duplicate');
});

test('stale signatures are rejected', () => {
  const p = new StripeProvider('sk_test_x', WHSEC);
  const body = '{"id":"evt_old","type":"payment_intent.succeeded"}';
  const old = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(p.verifyWebhook(Buffer.from(body), { 'stripe-signature': sign(body, WHSEC, old) }), null);
  assert.ok(p.verifyWebhook(Buffer.from(body), { 'stripe-signature': sign(body) }));
});

test('payment events with a mismatched amount do not mark a reservation paid', async () => {
  const c = new Client(app.base);
  await c.register('Mismatch', 'mismatch@example.com');
  const id = roomId(app.db, 'aurelia-yufu-terrace', 'superior-room');
  const checkIn = addDays(TODAY, 40); const checkOut = addDays(TODAY, 41);
  const q = await c.post('/api/quote', { roomTypeId: id, checkIn, checkOut, rooms: 1, adults: 2, children: 0 });
  const r = await c.post('/api/reservations', { roomTypeId: id, checkIn, checkOut, rooms: 1, adults: 2, children: 0, guest: guestDetails, acceptTerms: true, idempotencyKey: idemKey(), expectedTotal: q.json.quote.total });
  const ref = `pi_fake_${provider.created.length}`;
  const event = JSON.stringify({ id: 'evt_mismatch', type: 'payment_intent.succeeded', data: { object: { id: ref, amount_received: 1 } } });
  const res = await fetch(`${app.base}/api/payments/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(event) }, body: event });
  assert.equal((await res.json()).result, 'amount_mismatch');
  assert.equal((await c.get(`/api/reservations/${r.json.reservation.code}`)).json.reservation.paymentStatus, 'pending');
});
