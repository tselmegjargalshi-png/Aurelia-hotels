import { all, get, run, writeTransaction, type DB } from '../db/connection.js';
import { HttpError } from '../lib/http.js';
import { bookingCode } from '../lib/crypto.js';
import { quoteStay, type PriceQuote } from '../../../shared/pricing.js';
import { stayNights, todayIso } from '../../../shared/dates.js';
import { fitsOccupancy, validateStay } from '../../../shared/validation.js';
import { BOOKING_RULES, CURRENCY, OFFERS } from '../../../shared/config.js';
import type { PaymentStatus, ReservationDTO, ReservationStatus } from '../../../shared/types.js';
import { unitsAvailable } from './availability.js';
import type { PaymentProvider } from './payments/index.js';

export interface QuoteRequest { roomTypeId: number; checkIn: string; checkOut: string; rooms: number; adults: number; children: number }

interface RoomForBooking {
  id: number; hotel_id: number; name: string; nightly_rate: number; max_adults: number; max_occupancy: number; active: number; hotel_active: number;
}

function loadRoom(db: DB, roomTypeId: number): RoomForBooking {
  const room = get<RoomForBooking>(
    db,
    `SELECT rt.id, rt.hotel_id, rt.name, rt.nightly_rate, rt.max_adults, rt.max_occupancy, rt.active, h.active AS hotel_active
       FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE rt.id = ?`, roomTypeId,
  );
  if (!room || !room.active || !room.hotel_active) throw new HttpError(404, 'ROOM_NOT_FOUND', 'This room type is not available for booking.');
  return room;
}

/** Server-authoritative validation + availability + price for a prospective stay. */
export function quote(db: DB, q: QuoteRequest, today = todayIso()): { quote: PriceQuote; unitsAvailable: number; room: RoomForBooking } {
  const errors = validateStay(q, today);
  if (Object.keys(errors).length) throw new HttpError(400, 'INVALID_STAY', 'Please check your dates and guests.', errors as Record<string, string>);
  const room = loadRoom(db, q.roomTypeId);
  if (!fitsOccupancy({ maxAdults: room.max_adults, maxOccupancy: room.max_occupancy }, q.adults, q.children, q.rooms)) {
    throw new HttpError(422, 'OCCUPANCY_EXCEEDED',
      `${room.name} sleeps up to ${room.max_occupancy} guests (${room.max_adults} adults) per room. Add rooms or choose a larger room type.`);
  }
  const units = unitsAvailable(db, [room.id], q.checkIn, q.checkOut).get(room.id) ?? 0;
  return { quote: quoteStay({ nightlyRate: room.nightly_rate, checkIn: q.checkIn, checkOut: q.checkOut, rooms: q.rooms, bookedOn: today }), unitsAvailable: units, room };
}

export interface CreateReservationInput extends QuoteRequest {
  guest: { firstName: string; lastName: string; email: string; phone?: string | null };
  specialRequests?: string | null;
  acceptTerms: true;
  idempotencyKey: string;
  /** The total the guest saw. If the server's price differs, we refuse and return the new quote. */
  expectedTotal: number;
}

export async function createReservation(
  db: DB, payments: PaymentProvider, userId: number, input: CreateReservationInput, today = todayIso(),
): Promise<{ reservation: ReservationDTO; replayed: boolean; payment: { clientSecret: string; provider: string } | null }> {
  const useProvider = payments.isConfigured();

  const outcome = writeTransaction(db, () => {
    // Idempotency: the same checkout submitted twice returns the first reservation.
    const existing = get<{ id: number; room_type_id: number; check_in: string; check_out: string; rooms: number }>(
      db, 'SELECT id, room_type_id, check_in, check_out, rooms FROM reservations WHERE user_id = ? AND idempotency_key = ?',
      userId, input.idempotencyKey,
    );
    if (existing) {
      const same = existing.room_type_id === input.roomTypeId && existing.check_in === input.checkIn
        && existing.check_out === input.checkOut && existing.rooms === input.rooms;
      if (!same) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout was already used for a different reservation. Please start again.');
      return { id: existing.id, replayed: true };
    }

    // Everything below re-derives price and availability on the server inside the write lock.
    const { quote: price, unitsAvailable: units, room } = quote(db, input, today);
    if (units < input.rooms) {
      throw new HttpError(409, 'NOT_AVAILABLE',
        units === 0 ? 'Sorry — this room type is no longer available for every night of your stay.'
          : `Only ${units} room${units === 1 ? '' : 's'} of this type remain for every night of your stay.`,
        undefined, { unitsAvailable: units });
    }
    if (price.total !== input.expectedTotal) {
      throw new HttpError(409, 'PRICE_CHANGED', 'The price for this stay has changed. Please review the updated total.', undefined, { quote: price });
    }

    const holdExpires = useProvider ? new Date(Date.now() + BOOKING_RULES.paymentHoldMinutes * 60_000).toISOString() : null;
    let code = bookingCode();
    while (get(db, 'SELECT 1 FROM reservations WHERE code = ?', code)) code = bookingCode();

    const info = run(db,
      `INSERT INTO reservations (code, user_id, hotel_id, room_type_id, check_in, check_out, rooms, adults, children, currency,
         nightly_rate, room_subtotal, discount_code, discount_amount, taxes, fees, total, status, payment_status, payment_mode,
         hold_expires_at, guest_first_name, guest_last_name, guest_email, guest_phone, special_requests, idempotency_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code, userId, room.hotel_id, room.id, input.checkIn, input.checkOut, input.rooms, input.adults, input.children, CURRENCY.code,
      price.nightlyRate, price.roomSubtotal, price.discount?.code ?? null, price.discount?.amount ?? 0, price.taxes, price.fees, price.total,
      useProvider ? 'pending_payment' : 'confirmed', useProvider ? 'pending' : 'not_collected', useProvider ? 'provider' : 'test',
      holdExpires, input.guest.firstName.trim(), input.guest.lastName.trim(), input.guest.email.trim().toLowerCase(),
      input.guest.phone?.trim() || null, input.specialRequests?.trim() || null, input.idempotencyKey,
    );
    const id = Number(info.lastInsertRowid);
    const insertNight = db.prepare('INSERT INTO reservation_nights (reservation_id, room_type_id, night, rooms) VALUES (?,?,?,?)');
    for (const night of stayNights(input.checkIn, input.checkOut)) insertNight.run(id, room.id, night, input.rooms);
    return { id, replayed: false };
  });

  let payment: { clientSecret: string; provider: string } | null = null;
  const reservation = getReservationById(db, outcome.id)!;
  if (useProvider && !outcome.replayed) {
    try {
      const created = await payments.createPayment({
        reservationCode: reservation.code, amount: reservation.price.total, currency: reservation.price.currency, customerEmail: reservation.guest.email,
      });
      run(db, 'INSERT INTO payments (reservation_id, provider, provider_ref, amount, currency, status) VALUES (?,?,?,?,?,?)',
        outcome.id, payments.name, created.providerRef, reservation.price.total, reservation.price.currency, 'pending');
      payment = { clientSecret: created.clientSecret, provider: payments.name };
    } catch (err) {
      // Release the held inventory: the stay is not confirmed without payment.
      run(db, `UPDATE reservations SET status = 'expired', payment_status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, outcome.id);
      console.error('[payments] createPayment failed', err);
      throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'We could not start the payment. Your reservation was not created. Please try again.');
    }
  }
  return { reservation, replayed: outcome.replayed, payment };
}

interface ReservationRow {
  id: number; code: string; user_id: number; status: ReservationStatus; payment_status: PaymentStatus; payment_mode: 'test' | 'provider';
  check_in: string; check_out: string; rooms: number; adults: number; children: number; currency: string; nightly_rate: number;
  room_subtotal: number; discount_code: string | null; discount_amount: number; taxes: number; fees: number; total: number;
  guest_first_name: string; guest_last_name: string; guest_email: string; guest_phone: string | null; special_requests: string | null; created_at: string;
  h_id: number; h_slug: string; h_name: string; h_check_in: string; h_check_out: string; d_name: string; d_country: string;
  rt_id: number; rt_slug: string; rt_name: string; rt_refundable: number; rt_terms: string; rt_meal: string;
  img_src: string | null; img_alt: string | null;
  cr_id: number | null; cr_status: 'pending' | 'approved' | 'rejected' | null; cr_reason: string | null; cr_created: string | null;
}

export const RESERVATION_SELECT = `
  SELECT r.*, h.id AS h_id, h.slug AS h_slug, h.name AS h_name, h.check_in_time AS h_check_in, h.check_out_time AS h_check_out,
         d.name AS d_name, d.country AS d_country,
         rt.id AS rt_id, rt.slug AS rt_slug, rt.name AS rt_name, rt.refundable AS rt_refundable, rt.cancellation_terms AS rt_terms, rt.meal_plan AS rt_meal,
         (SELECT src FROM hotel_images WHERE hotel_id = h.id ORDER BY sort_order, id LIMIT 1) AS img_src,
         (SELECT alt FROM hotel_images WHERE hotel_id = h.id ORDER BY sort_order, id LIMIT 1) AS img_alt,
         cr.id AS cr_id, cr.status AS cr_status, cr.reason AS cr_reason, cr.created_at AS cr_created
    FROM reservations r
    JOIN hotels h ON h.id = r.hotel_id
    JOIN destinations d ON d.id = h.destination_id
    JOIN room_types rt ON rt.id = r.room_type_id
    LEFT JOIN cancellation_requests cr ON cr.id = (SELECT id FROM cancellation_requests WHERE reservation_id = r.id ORDER BY id DESC LIMIT 1)`;

export function toReservationDTO(r: ReservationRow, includeUserId = false): ReservationDTO {
  const offer = OFFERS.find((o) => o.code === r.discount_code);
  return {
    id: r.id, code: r.code, status: r.status, paymentStatus: r.payment_status, paymentMode: r.payment_mode,
    hotel: { id: r.h_id, slug: r.h_slug, name: r.h_name, destination: `${r.d_name}, ${r.d_country}`,
      image: { src: r.img_src ?? '', alt: r.img_alt ?? r.h_name }, checkInTime: r.h_check_in, checkOutTime: r.h_check_out },
    room: { id: r.rt_id, slug: r.rt_slug, name: r.rt_name, refundable: !!r.rt_refundable, cancellationTerms: r.rt_terms, mealPlan: r.rt_meal },
    checkIn: r.check_in, checkOut: r.check_out, rooms: r.rooms, adults: r.adults, children: r.children,
    price: {
      currency: r.currency, nights: stayNights(r.check_in, r.check_out).length, rooms: r.rooms, nightlyRate: r.nightly_rate,
      roomSubtotal: r.room_subtotal,
      discount: offer ? { code: offer.code, title: offer.title, percentOff: offer.percentOff, amount: r.discount_amount } : null,
      discountedSubtotal: r.room_subtotal - r.discount_amount, taxes: r.taxes, fees: r.fees, total: r.total,
    },
    guest: { firstName: r.guest_first_name, lastName: r.guest_last_name, email: r.guest_email, phone: r.guest_phone },
    specialRequests: r.special_requests, createdAt: r.created_at,
    cancellationRequest: r.cr_id ? { id: r.cr_id, status: r.cr_status!, reason: r.cr_reason, createdAt: r.cr_created! } : null,
    ...(includeUserId ? { userId: r.user_id } : {}),
  };
}

export function getReservationById(db: DB, id: number, includeUserId = false): ReservationDTO | null {
  const row = get<ReservationRow>(db, `${RESERVATION_SELECT} WHERE r.id = ?`, id);
  return row ? toReservationDTO(row, includeUserId) : null;
}

/** Ownership-checked lookup: guests only ever see their own reservations. */
export function getReservationForUser(db: DB, code: string, userId: number): ReservationDTO {
  const row = get<ReservationRow>(db, `${RESERVATION_SELECT} WHERE r.code = ? AND r.user_id = ?`, code, userId);
  // Same 404 whether the code doesn't exist or belongs to someone else — no enumeration.
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Reservation not found.');
  return toReservationDTO(row);
}

export function listReservationsForUser(db: DB, userId: number): ReservationDTO[] {
  return all<ReservationRow>(db, `${RESERVATION_SELECT} WHERE r.user_id = ? ORDER BY r.check_in DESC`, userId).map((r) => toReservationDTO(r));
}

export function requestCancellation(db: DB, code: string, userId: number, reason: string | null, today = todayIso()) {
  return writeTransaction(db, () => {
    const r = getReservationForUser(db, code, userId);
    if (!['confirmed', 'pending_payment'].includes(r.status)) throw new HttpError(409, 'NOT_CANCELLABLE', 'This reservation can no longer be cancelled online.');
    if (r.checkIn <= today) throw new HttpError(409, 'NOT_CANCELLABLE', 'Cancellations on or after the arrival date must be arranged with the hotel directly.');
    if (r.cancellationRequest?.status === 'pending') throw new HttpError(409, 'ALREADY_REQUESTED', 'A cancellation request is already being reviewed.');
    run(db, 'INSERT INTO cancellation_requests (reservation_id, user_id, reason) VALUES (?,?,?)', r.id, userId, reason?.trim() || null);
    return getReservationForUser(db, code, userId);
  });
}

/** Admin status transitions. Anything not listed is rejected. */
export const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending_payment: ['cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
  expired: [],
};

export function changeStatus(db: DB, id: number, next: ReservationStatus, actorId: number, today = todayIso()): ReservationDTO {
  return writeTransaction(db, () => {
    const r = getReservationById(db, id);
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Reservation not found.');
    if (!ALLOWED_TRANSITIONS[r.status].includes(next)) {
      throw new HttpError(409, 'INVALID_TRANSITION', `A ${r.status.replace('_', ' ')} reservation cannot be marked ${next.replace('_', ' ')}.`);
    }
    if ((next === 'checked_in' || next === 'no_show') && r.checkIn > today) {
      throw new HttpError(409, 'TOO_EARLY', 'Guests can only be checked in (or marked no-show) from the arrival date.');
    }
    run(db, `UPDATE reservations SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, next, id);
    if (next === 'cancelled') {
      run(db, `UPDATE cancellation_requests SET status = 'approved', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE reservation_id = ? AND status = 'pending'`, id);
    }
    audit(db, actorId, 'reservation.status', 'reservation', id, { from: r.status, to: next });
    return getReservationById(db, id, true)!;
  });
}

export function resolveCancellation(db: DB, requestId: number, approve: boolean, note: string | null, actorId: number) {
  return writeTransaction(db, () => {
    const req = get<{ id: number; reservation_id: number; status: string }>(db, 'SELECT id, reservation_id, status FROM cancellation_requests WHERE id = ?', requestId);
    if (!req) throw new HttpError(404, 'NOT_FOUND', 'Cancellation request not found.');
    if (req.status !== 'pending') throw new HttpError(409, 'ALREADY_RESOLVED', 'This request has already been resolved.');
    run(db, `UPDATE cancellation_requests SET status = ?, admin_note = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      approve ? 'approved' : 'rejected', note?.trim() || null, requestId);
    if (approve) {
      const r = getReservationById(db, req.reservation_id)!;
      if (!['confirmed', 'pending_payment'].includes(r.status)) throw new HttpError(409, 'NOT_CANCELLABLE', `Reservation is already ${r.status}.`);
      run(db, `UPDATE reservations SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, req.reservation_id);
      // Payment refunds must be issued through the payment provider; we never mark "refunded" ourselves.
    }
    audit(db, actorId, approve ? 'cancellation.approve' : 'cancellation.reject', 'cancellation_request', requestId, { reservationId: req.reservation_id });
    return getReservationById(db, req.reservation_id, true)!;
  });
}

/** Marks unpaid holds past their expiry as expired (they already stop counting against inventory). */
export function expireStaleHolds(db: DB, nowIso = new Date().toISOString()): number {
  const info = run(db, `UPDATE reservations SET status = 'expired', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                         WHERE status = 'pending_payment' AND hold_expires_at <= ?`, nowIso);
  return Number(info.changes);
}

/** Applies a signature-verified provider event. Idempotent per provider event id. */
export function applyPaymentEvent(db: DB, ev: { eventId: string; type: string; providerRef: string | null; amount: number | null }) {
  return writeTransaction(db, () => {
    const seen = get(db, 'SELECT 1 FROM payment_events WHERE provider_event_id = ?', ev.eventId);
    if (seen) return 'duplicate';
    run(db, 'INSERT INTO payment_events (provider_event_id, type) VALUES (?, ?)', ev.eventId, ev.type);
    if (!ev.providerRef) return 'ignored';
    const p = get<{ id: number; reservation_id: number; amount: number }>(db, 'SELECT id, reservation_id, amount FROM payments WHERE provider_ref = ?', ev.providerRef);
    if (!p) return 'unknown_payment';
    if (ev.type === 'payment_succeeded') {
      if (ev.amount !== null && ev.amount !== p.amount) return 'amount_mismatch';
      run(db, `UPDATE payments SET status = 'succeeded', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, p.id);
      run(db, `UPDATE reservations SET payment_status = 'paid',
                 status = CASE WHEN status = 'pending_payment' THEN 'confirmed' ELSE status END,
                 hold_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, p.reservation_id);
      return 'paid';
    }
    if (ev.type === 'payment_failed') {
      run(db, `UPDATE payments SET status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, p.id);
      run(db, `UPDATE reservations SET payment_status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, p.reservation_id);
      return 'failed';
    }
    return 'ignored';
  });
}

export function audit(db: DB, actorId: number | null, action: string, entity: string, entityId: number | null, details?: unknown) {
  run(db, 'INSERT INTO audit_log (actor_user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    actorId, action, entity, entityId, details === undefined ? null : JSON.stringify(details));
}
