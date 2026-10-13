import { all, type DB } from '../db/connection.js';
import { stayNights } from '../../../shared/dates.js';
import type { AvailabilityStatus } from '../../../shared/types.js';

/**
 * Inventory model
 * ---------------
 * • room_types.inventory          default number of sellable units per night
 * • inventory_overrides           per-night override (e.g. 0 when closed for works)
 * • reservation_nights            ledger: one row per reserved night, with room count
 *
 * Units free on a night = (override ?? inventory) − Σ rooms held that night by
 * reservations that are confirmed, checked in, or awaiting payment within their hold.
 * A stay is bookable only if every night has at least the requested units free.
 */
export const HOLDING_STATUS_SQL = `(r.status IN ('confirmed','checked_in') OR (r.status = 'pending_payment' AND r.hold_expires_at > ?))`;

export interface NightAvailability { night: string; capacity: number; booked: number; free: number }

function placeholders(n: number) {
  return Array.from({ length: n }, () => '?').join(',');
}

/** Per-night breakdown for many room types at once. */
export function nightlyAvailability(
  db: DB, roomTypeIds: number[], checkIn: string, checkOut: string, nowIso = new Date().toISOString(),
): Map<number, NightAvailability[]> {
  const result = new Map<number, NightAvailability[]>();
  if (!roomTypeIds.length) return result;
  const nights = stayNights(checkIn, checkOut);
  const ids = placeholders(roomTypeIds.length);

  const inventory = all<{ id: number; inventory: number }>(
    db, `SELECT id, inventory FROM room_types WHERE id IN (${ids})`, ...roomTypeIds,
  );
  const overrides = all<{ room_type_id: number; night: string; units: number }>(
    db, `SELECT room_type_id, night, units FROM inventory_overrides WHERE room_type_id IN (${ids}) AND night >= ? AND night < ?`,
    ...roomTypeIds, checkIn, checkOut,
  );
  const booked = all<{ room_type_id: number; night: string; booked: number }>(
    db,
    `SELECT rn.room_type_id, rn.night, SUM(rn.rooms) AS booked
       FROM reservation_nights rn JOIN reservations r ON r.id = rn.reservation_id
      WHERE rn.room_type_id IN (${ids}) AND rn.night >= ? AND rn.night < ? AND ${HOLDING_STATUS_SQL}
      GROUP BY rn.room_type_id, rn.night`,
    ...roomTypeIds, checkIn, checkOut, nowIso,
  );

  const key = (id: number, night: string) => `${id}|${night}`;
  const overrideMap = new Map(overrides.map((o) => [key(o.room_type_id, o.night), o.units]));
  const bookedMap = new Map(booked.map((b) => [key(b.room_type_id, b.night), Number(b.booked)]));

  for (const rt of inventory) {
    result.set(rt.id, nights.map((night) => {
      const capacity = overrideMap.get(key(rt.id, night)) ?? rt.inventory;
      const b = bookedMap.get(key(rt.id, night)) ?? 0;
      return { night, capacity, booked: b, free: Math.max(0, capacity - b) };
    }));
  }
  return result;
}

/** Units free on EVERY night of the stay, per room type. */
export function unitsAvailable(
  db: DB, roomTypeIds: number[], checkIn: string, checkOut: string, nowIso?: string,
): Map<number, number> {
  const nightly = nightlyAvailability(db, roomTypeIds, checkIn, checkOut, nowIso);
  const out = new Map<number, number>();
  for (const [id, nights] of nightly) out.set(id, nights.length ? Math.min(...nights.map((n) => n.free)) : 0);
  return out;
}

export function statusFor(units: number, roomsRequested: number, fits: boolean): AvailabilityStatus {
  if (!fits) return 'unsuitable';
  if (units < roomsRequested || units === 0) return 'sold_out';
  if (units - roomsRequested <= 1) return 'limited';
  return 'available';
}
