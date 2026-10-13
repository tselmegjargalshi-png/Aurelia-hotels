import { z } from 'zod';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { HttpError, parse, type Router } from '../lib/http.js';
import { all, get, run, writeTransaction, type SqlParam } from '../db/connection.js';
import { requireAdmin } from '../lib/auth.js';
import { getHotelDetail } from '../services/catalog.js';
import { nightlyAvailability, HOLDING_STATUS_SQL } from '../services/availability.js';
import {
  ALLOWED_TRANSITIONS, RESERVATION_SELECT, audit, changeStatus, getReservationById, resolveCancellation, toReservationDTO,
} from '../services/reservations.js';
import { addDays, isIsoDate } from '../../../shared/dates.js';
import type { ReservationStatus } from '../../../shared/types.js';
import type { AppDeps } from './context.js';

const STATUSES = ['pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'expired'] as const;
const slug = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour).');
const text = (min: number, max: number, msg = 'This field is required.') => z.string().trim().min(min, msg).max(max);

const HotelPatch = z.object({
  name: text(3, 120), tagline: text(3, 160), propertyType: text(3, 60), stars: z.number().int().min(1).max(5),
  overview: text(20, 600), description: text(20, 3000), address: text(5, 240),
  checkInTime: time, checkOutTime: time, cancellationPolicy: text(10, 600),
  houseRules: z.array(text(2, 200)).max(20), nearby: z.array(z.object({ name: text(2, 120), distance: text(1, 40) })).max(20),
  breakfastIncluded: z.boolean(), freeCancellation: z.boolean(), featured: z.boolean(), active: z.boolean(),
}).partial();

const HotelCreate = z.object({
  slug, destination: z.string().min(1), name: text(3, 120), tagline: text(3, 160), propertyType: text(3, 60),
  stars: z.number().int().min(1).max(5), overview: text(20, 600), description: text(20, 3000), address: text(5, 240),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
});

const RoomFields = z.object({
  name: text(3, 120), description: text(10, 1000), maxAdults: z.number().int().min(1).max(12), maxOccupancy: z.number().int().min(1).max(16),
  bed: text(3, 120), sizeSqm: z.number().int().min(5).max(2000),
  nightlyRate: z.number().int().min(1000, 'Rate must be at least $10.').max(10_000_000),
  inventory: z.number().int().min(0).max(500), mealPlan: text(3, 120), refundable: z.boolean(), cancellationTerms: text(10, 600),
  amenities: z.array(text(2, 60)).max(30), active: z.boolean(),
});

export function adminRoutes(r: Router, deps: AppDeps) {
  const { db } = deps;
  const today = () => deps.today();

  function imageLibrary(): string[] {
    const dirs = [path.join(deps.env.clientDist, 'images'), path.resolve(process.cwd(), 'client/public/images')];
    const dir = dirs.find((d) => existsSync(d));
    if (!dir) return [];
    return readdirSync(dir).filter((f) => f.endsWith('-800.webp')).map((f) => f.replace(/-800\.webp$/, '')).sort();
  }

  // ---------- Overview ----------
  r.get('/api/admin/overview', (ctx) => {
    requireAdmin(ctx);
    const t = today();
    const in7 = addDays(t, 7);
    const horizon = 14;
    const end = addDays(t, horizon);
    const count = (sql: string, ...p: SqlParam[]) => Number(get<{ n: number }>(db, sql, ...p)?.n ?? 0);

    const totals = {
      reservations: count(`SELECT COUNT(*) n FROM reservations WHERE status NOT IN ('expired')`),
      active: count(`SELECT COUNT(*) n FROM reservations WHERE status IN ('confirmed','checked_in','pending_payment')`),
      arrivalsToday: count(`SELECT COUNT(*) n FROM reservations WHERE status = 'confirmed' AND check_in = ?`, t),
      upcomingCheckIns: count(`SELECT COUNT(*) n FROM reservations WHERE status = 'confirmed' AND check_in >= ? AND check_in < ?`, t, in7),
      upcomingCheckOuts: count(`SELECT COUNT(*) n FROM reservations WHERE status IN ('confirmed','checked_in') AND check_out >= ? AND check_out < ?`, t, in7),
      inHouse: count(`SELECT COUNT(*) n FROM reservations WHERE status = 'checked_in'`),
      pendingCancellations: count(`SELECT COUNT(*) n FROM cancellation_requests WHERE status = 'pending'`),
      unreadMessages: count(`SELECT COUNT(*) n FROM contact_messages`),
    };

    const revenue = get<{ booked: number; realised: number; paid: number }>(db,
      `SELECT COALESCE(SUM(CASE WHEN status IN ('confirmed','checked_in','checked_out') THEN total END),0) AS booked,
              COALESCE(SUM(CASE WHEN status = 'checked_out' THEN total END),0) AS realised,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total END),0) AS paid
         FROM reservations`)!;

    // Occupancy for the next 14 nights: booked room-nights ÷ sellable room-nights.
    const hotels = all<{ id: number; name: string }>(db, 'SELECT id, name FROM hotels WHERE active = 1 ORDER BY name');
    const rooms = all<{ id: number; hotel_id: number }>(db, 'SELECT id, hotel_id FROM room_types WHERE active = 1');
    const nightly = nightlyAvailability(db, rooms.map((x) => x.id), t, end);
    const occupancy = hotels.map((h) => {
      let cap = 0; let booked = 0;
      for (const rt of rooms.filter((x) => x.hotel_id === h.id)) {
        for (const n of nightly.get(rt.id) ?? []) { cap += n.capacity; booked += Math.min(n.booked, n.capacity); }
      }
      return { hotelId: h.id, hotel: h.name, roomNights: cap, booked, rate: cap ? booked / cap : 0 };
    });

    const recent = all<Parameters<typeof toReservationDTO>[0]>(db, `${RESERVATION_SELECT} ORDER BY r.created_at DESC LIMIT 8`).map((x) => toReservationDTO(x, true));
    return { today: t, horizonNights: horizon, totals, revenue, occupancy, recent, paymentMode: deps.payments.isConfigured() ? 'provider' : 'test' };
  });

  // ---------- Hotels ----------
  r.get('/api/admin/hotels', (ctx) => {
    requireAdmin(ctx);
    const hotels = all(db,
      `SELECT h.id, h.slug, h.name, h.property_type AS propertyType, h.stars, h.active, h.featured, d.name AS destination,
              (SELECT COUNT(*) FROM room_types WHERE hotel_id = h.id) AS roomTypes,
              (SELECT COALESCE(SUM(inventory),0) FROM room_types WHERE hotel_id = h.id AND active = 1) AS units,
              (SELECT src FROM hotel_images WHERE hotel_id = h.id ORDER BY sort_order LIMIT 1) AS image
         FROM hotels h JOIN destinations d ON d.id = h.destination_id ORDER BY h.name`);
    const destinations = all(db, 'SELECT slug, name, country FROM destinations ORDER BY name');
    return { hotels, destinations };
  });

  r.get('/api/admin/hotels/:id', (ctx) => {
    requireAdmin(ctx);
    const row = get<{ slug: string; active: number }>(db, 'SELECT slug, active FROM hotels WHERE id = ?', Number(ctx.params.id));
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
    const hotel = { ...getHotelDetail(db, row.slug, undefined, true)!, active: !!row.active };
    const allAmenities = all(db, 'SELECT code, label FROM amenities ORDER BY label');
    return { hotel, allAmenities, imageLibrary: imageLibrary() };
  });

  r.post('/api/admin/hotels', (ctx) => {
    const admin = requireAdmin(ctx);
    const input = parse(HotelCreate, ctx.body);
    const dest = get<{ id: number }>(db, 'SELECT id FROM destinations WHERE slug = ?', input.destination);
    if (!dest) throw new HttpError(400, 'VALIDATION_ERROR', 'Unknown destination.', { destination: 'Choose a destination.' });
    if (get(db, 'SELECT 1 FROM hotels WHERE slug = ?', input.slug)) throw new HttpError(409, 'VALIDATION_ERROR', 'That URL slug is already used.', { slug: 'Already used.' });
    const id = Number(run(db,
      `INSERT INTO hotels (slug, destination_id, name, tagline, property_type, stars, demo_rating, overview, description, address, latitude, longitude,
         check_in_time, check_out_time, cancellation_policy, active)
       VALUES (?,?,?,?,?,?,0,?,?,?,?,?,'15:00','11:00','Cancellation terms are shown on each room rate.',0)`,
      input.slug, dest.id, input.name, input.tagline, input.propertyType, input.stars, input.overview, input.description, input.address, input.latitude, input.longitude,
    ).lastInsertRowid);
    audit(db, admin.id, 'hotel.create', 'hotel', id, { slug: input.slug });
    return { id };
  });

  r.patch('/api/admin/hotels/:id', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = Number(ctx.params.id);
    if (!get(db, 'SELECT 1 FROM hotels WHERE id = ?', id)) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
    const input = parse(HotelPatch, ctx.body);
    const map: Record<string, [string, (v: never) => SqlParam]> = {
      name: ['name', (v: string) => v], tagline: ['tagline', (v: string) => v], propertyType: ['property_type', (v: string) => v],
      stars: ['stars', (v: number) => v], overview: ['overview', (v: string) => v], description: ['description', (v: string) => v],
      address: ['address', (v: string) => v], checkInTime: ['check_in_time', (v: string) => v], checkOutTime: ['check_out_time', (v: string) => v],
      cancellationPolicy: ['cancellation_policy', (v: string) => v], houseRules: ['house_rules', (v: string[]) => JSON.stringify(v)],
      nearby: ['nearby', (v: unknown[]) => JSON.stringify(v)], breakfastIncluded: ['breakfast_included', (v: boolean) => (v ? 1 : 0)],
      freeCancellation: ['free_cancellation', (v: boolean) => (v ? 1 : 0)], featured: ['featured', (v: boolean) => (v ? 1 : 0)],
      active: ['active', (v: boolean) => (v ? 1 : 0)],
    };
    const sets: string[] = []; const params: SqlParam[] = [];
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined || !map[k]) continue;
      sets.push(`${map[k][0]} = ?`); params.push(map[k][1](v as never));
    }
    if (input.active === true) {
      const hasRooms = get(db, 'SELECT 1 FROM room_types WHERE hotel_id = ? AND active = 1', id);
      const hasImage = get(db, 'SELECT 1 FROM hotel_images WHERE hotel_id = ?', id);
      if (!hasRooms || !hasImage) throw new HttpError(409, 'INCOMPLETE', 'Add at least one active room type and one image before publishing.');
    }
    if (sets.length) {
      run(db, `UPDATE hotels SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ...params, id);
      audit(db, admin.id, 'hotel.update', 'hotel', id, Object.keys(input));
    }
    return { ok: true };
  });

  r.put('/api/admin/hotels/:id/amenities', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const { codes } = parse(z.object({ codes: z.array(z.string()).max(40) }), ctx.body);
    writeTransaction(db, () => {
      if (!get(db, 'SELECT 1 FROM hotels WHERE id = ?', id)) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
      run(db, 'DELETE FROM hotel_amenities WHERE hotel_id = ?', id);
      for (const code of codes) {
        const a = get<{ id: number }>(db, 'SELECT id FROM amenities WHERE code = ?', code);
        if (!a) throw new HttpError(400, 'VALIDATION_ERROR', `Unknown amenity: ${code}`);
        run(db, 'INSERT INTO hotel_amenities (hotel_id, amenity_id) VALUES (?,?)', id, a.id);
      }
      audit(db, admin.id, 'hotel.amenities', 'hotel', id, codes);
    });
    return { ok: true };
  });

  r.put('/api/admin/hotels/:id/images', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const { images } = parse(z.object({
      images: z.array(z.object({ src: z.string(), alt: text(10, 300, 'Write descriptive alt text (10+ characters).') })).min(1, 'Keep at least one image.').max(20),
    }), ctx.body);
    const library = new Set(imageLibrary());
    for (const img of images) if (!library.has(img.src)) throw new HttpError(400, 'VALIDATION_ERROR', `Image “${img.src}” is not in the local image library.`);
    writeTransaction(db, () => {
      if (!get(db, 'SELECT 1 FROM hotels WHERE id = ?', id)) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
      run(db, 'DELETE FROM hotel_images WHERE hotel_id = ?', id);
      images.forEach((img, i) => run(db, 'INSERT INTO hotel_images (hotel_id, src, alt, sort_order) VALUES (?,?,?,?)', id, img.src, img.alt, i));
      audit(db, admin.id, 'hotel.images', 'hotel', id, images.map((x) => x.src));
    });
    return { ok: true };
  });

  // ---------- Room types & inventory ----------
  /** Peak number of rooms held on any future night — inventory may not go below this. */
  function peakFutureBookings(roomId: number) {
    return Number(get<{ peak: number }>(db,
      `SELECT COALESCE(MAX(n),0) AS peak FROM (
         SELECT SUM(rn.rooms) n FROM reservation_nights rn JOIN reservations r ON r.id = rn.reservation_id
          WHERE rn.room_type_id = ? AND rn.night >= ? AND ${HOLDING_STATUS_SQL} GROUP BY rn.night)`,
      roomId, today(), new Date().toISOString())?.peak ?? 0);
  }

  r.post('/api/admin/hotels/:id/rooms', (ctx) => {
    const admin = requireAdmin(ctx);
    const hotelId = Number(ctx.params.id);
    const input = parse(RoomFields.extend({ slug, imageSrc: z.string().optional() }), ctx.body);
    if (input.maxOccupancy < input.maxAdults) throw new HttpError(400, 'VALIDATION_ERROR', 'Max occupancy must be at least the adult limit.', { maxOccupancy: 'Must be ≥ max adults.' });
    if (!get(db, 'SELECT 1 FROM hotels WHERE id = ?', hotelId)) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
    if (get(db, 'SELECT 1 FROM room_types WHERE hotel_id = ? AND slug = ?', hotelId, input.slug)) throw new HttpError(409, 'VALIDATION_ERROR', 'Slug already used in this hotel.', { slug: 'Already used.' });
    const id = Number(run(db,
      `INSERT INTO room_types (hotel_id, slug, name, description, max_adults, max_occupancy, bed, size_sqm, nightly_rate, inventory, meal_plan, refundable, cancellation_terms, amenities, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      hotelId, input.slug, input.name, input.description, input.maxAdults, input.maxOccupancy, input.bed, input.sizeSqm, input.nightlyRate,
      input.inventory, input.mealPlan, input.refundable ? 1 : 0, input.cancellationTerms, JSON.stringify(input.amenities), input.active ? 1 : 0,
    ).lastInsertRowid);
    if (input.imageSrc && imageLibrary().includes(input.imageSrc)) {
      run(db, 'INSERT INTO room_images (room_type_id, src, alt, sort_order) VALUES (?,?,?,0)', id, input.imageSrc, `${input.name} interior`);
    }
    audit(db, admin.id, 'room.create', 'room_type', id, { hotelId });
    return { id };
  });

  r.patch('/api/admin/rooms/:id', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const input = parse(RoomFields.partial(), ctx.body);
    return writeTransaction(db, () => {
      const cur = get<{ max_adults: number; max_occupancy: number }>(db, 'SELECT max_adults, max_occupancy FROM room_types WHERE id = ?', id);
      if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Room type not found.');
      const maxAdults = input.maxAdults ?? cur.max_adults;
      const maxOcc = input.maxOccupancy ?? cur.max_occupancy;
      if (maxOcc < maxAdults) throw new HttpError(400, 'VALIDATION_ERROR', 'Max occupancy must be at least the adult limit.', { maxOccupancy: 'Must be ≥ max adults.' });
      if (input.inventory !== undefined) {
        const peak = peakFutureBookings(id);
        if (input.inventory < peak) {
          throw new HttpError(409, 'INVENTORY_CONFLICT', `${peak} rooms of this type are already reserved on at least one upcoming night. Inventory cannot go below ${peak}.`, { inventory: `Minimum ${peak}` });
        }
      }
      const cols: Record<string, string> = {
        name: 'name', description: 'description', maxAdults: 'max_adults', maxOccupancy: 'max_occupancy', bed: 'bed', sizeSqm: 'size_sqm',
        nightlyRate: 'nightly_rate', inventory: 'inventory', mealPlan: 'meal_plan', refundable: 'refundable', cancellationTerms: 'cancellation_terms',
        amenities: 'amenities', active: 'active',
      };
      const sets: string[] = []; const params: SqlParam[] = [];
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined) continue;
        sets.push(`${cols[k]} = ?`);
        params.push(typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) ? JSON.stringify(v) : (v as SqlParam));
      }
      if (sets.length) run(db, `UPDATE room_types SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
      audit(db, admin.id, 'room.update', 'room_type', id, input);
      return { ok: true };
    });
  });

  r.get('/api/admin/rooms/:id/inventory', (ctx) => {
    requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const from = ctx.query.get('from') ?? today();
    if (!isIsoDate(from)) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid start date.');
    const room = get<{ id: number; name: string; inventory: number }>(db, 'SELECT id, name, inventory FROM room_types WHERE id = ?', id);
    if (!room) throw new HttpError(404, 'NOT_FOUND', 'Room type not found.');
    const nights = nightlyAvailability(db, [id], from, addDays(from, 28)).get(id) ?? [];
    const overrides = new Map(all<{ night: string; note: string | null }>(db, 'SELECT night, note FROM inventory_overrides WHERE room_type_id = ?', id).map((o) => [o.night, o.note]));
    return { room, nights: nights.map((n) => ({ ...n, overridden: overrides.has(n.night), note: overrides.get(n.night) ?? null })) };
  });

  r.put('/api/admin/rooms/:id/inventory/:night', (ctx) => {
    const admin = requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const night = ctx.params.night!;
    if (!isIsoDate(night)) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid date.');
    const { units, note } = parse(z.object({ units: z.number().int().min(0).max(500).nullable(), note: z.string().trim().max(120).nullable().optional() }), ctx.body);
    return writeTransaction(db, () => {
      if (!get(db, 'SELECT 1 FROM room_types WHERE id = ?', id)) throw new HttpError(404, 'NOT_FOUND', 'Room type not found.');
      const n = nightlyAvailability(db, [id], night, addDays(night, 1)).get(id)![0]!;
      if (units !== null && units < n.booked) throw new HttpError(409, 'INVENTORY_CONFLICT', `${n.booked} rooms are already reserved that night.`);
      if (units === null) run(db, 'DELETE FROM inventory_overrides WHERE room_type_id = ? AND night = ?', id, night);
      else run(db, 'INSERT INTO inventory_overrides (room_type_id, night, units, note) VALUES (?,?,?,?) ON CONFLICT(room_type_id, night) DO UPDATE SET units = excluded.units, note = excluded.note', id, night, units, note ?? null);
      audit(db, admin.id, 'inventory.override', 'room_type', id, { night, units });
      return { ok: true };
    });
  });

  // ---------- Reservations ----------
  r.get('/api/admin/reservations', (ctx) => {
    requireAdmin(ctx);
    const q = ctx.query;
    const where: string[] = ['1=1']; const params: SqlParam[] = [];
    const status = q.get('status');
    if (status && (STATUSES as readonly string[]).includes(status)) { where.push('r.status = ?'); params.push(status); }
    const hotel = q.get('hotel');
    if (hotel) { where.push('h.slug = ?'); params.push(hotel); }
    const from = q.get('from'); const to = q.get('to');
    if (from && isIsoDate(from)) { where.push('r.check_in >= ?'); params.push(from); }
    if (to && isIsoDate(to)) { where.push('r.check_in <= ?'); params.push(to); }
    const term = q.get('q')?.trim();
    if (term) {
      where.push(`(r.code LIKE ? OR r.guest_email LIKE ? OR (r.guest_first_name || ' ' || r.guest_last_name) LIKE ?)`);
      const like = `%${term.replace(/[%_]/g, '')}%`;
      params.push(like, like, like);
    }
    const rows = all<Parameters<typeof toReservationDTO>[0]>(db, `${RESERVATION_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.check_in DESC LIMIT 200`, ...params);
    return { reservations: rows.map((x) => toReservationDTO(x, true)), transitions: ALLOWED_TRANSITIONS };
  });

  r.get('/api/admin/reservations/:id', (ctx) => {
    requireAdmin(ctx);
    const reservation = getReservationById(db, Number(ctx.params.id), true);
    if (!reservation) throw new HttpError(404, 'NOT_FOUND', 'Reservation not found.');
    const payments = all(db, 'SELECT provider, provider_ref AS providerRef, amount, status, created_at AS createdAt FROM payments WHERE reservation_id = ?', reservation.id);
    const history = all(db, `SELECT a.action, a.details, a.created_at AS createdAt, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
                              WHERE (a.entity = 'reservation' AND a.entity_id = ?) ORDER BY a.id`, reservation.id);
    return { reservation, payments, history, transitions: ALLOWED_TRANSITIONS[reservation.status] };
  });

  r.patch('/api/admin/reservations/:id/status', (ctx) => {
    const admin = requireAdmin(ctx);
    const { status } = parse(z.object({ status: z.enum(STATUSES) }), ctx.body);
    return { reservation: changeStatus(db, Number(ctx.params.id), status as ReservationStatus, admin.id, today()) };
  });

  r.get('/api/admin/cancellation-requests', (ctx) => {
    requireAdmin(ctx);
    const status = ctx.query.get('status') ?? 'pending';
    const rows = all(db,
      `SELECT cr.id, cr.status, cr.reason, cr.admin_note AS adminNote, cr.created_at AS createdAt, cr.resolved_at AS resolvedAt,
              r.id AS reservationId, r.code, r.check_in AS checkIn, r.check_out AS checkOut, r.total, rt.refundable, rt.cancellation_terms AS terms,
              h.name AS hotel, r.guest_first_name || ' ' || r.guest_last_name AS guest
         FROM cancellation_requests cr JOIN reservations r ON r.id = cr.reservation_id
         JOIN hotels h ON h.id = r.hotel_id JOIN room_types rt ON rt.id = r.room_type_id
        WHERE (? = 'all' OR cr.status = ?) ORDER BY cr.created_at DESC`, status, status);
    return { requests: rows };
  });

  r.post('/api/admin/cancellation-requests/:id', (ctx) => {
    const admin = requireAdmin(ctx);
    const { approve, note } = parse(z.object({ approve: z.boolean(), note: z.string().max(500).nullable().optional() }), ctx.body);
    return { reservation: resolveCancellation(db, Number(ctx.params.id), approve, note ?? null, admin.id) };
  });

  // ---------- Customers (minimal personal data) ----------
  r.get('/api/admin/customers', (ctx) => {
    requireAdmin(ctx);
    const term = ctx.query.get('q')?.trim();
    const like = term ? `%${term.replace(/[%_]/g, '')}%` : '%';
    const customers = all(db,
      `SELECT u.id, u.name, u.email, u.created_at AS createdAt,
              COUNT(r.id) AS bookings,
              COALESCE(SUM(CASE WHEN r.status IN ('confirmed','checked_in','checked_out') THEN r.total END),0) AS value,
              MAX(r.check_in) AS lastStay
         FROM users u LEFT JOIN reservations r ON r.user_id = u.id
        WHERE u.role = 'guest' AND (u.name LIKE ? OR u.email LIKE ?)
        GROUP BY u.id ORDER BY u.name LIMIT 200`, like, like);
    return { customers };
  });

  r.get('/api/admin/customers/:id', (ctx) => {
    requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const customer = get(db, `SELECT id, name, email, phone, created_at AS createdAt FROM users WHERE id = ? AND role = 'guest'`, id);
    if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Customer not found.');
    const reservations = all<Parameters<typeof toReservationDTO>[0]>(db, `${RESERVATION_SELECT} WHERE r.user_id = ? ORDER BY r.check_in DESC`, id).map((x) => toReservationDTO(x, true));
    const favorites = all(db, 'SELECT h.name, h.slug FROM favorites f JOIN hotels h ON h.id = f.hotel_id WHERE f.user_id = ?', id);
    return { customer, reservations, favorites };
  });

  r.get('/api/admin/messages', (ctx) => {
    requireAdmin(ctx);
    return { messages: all(db, 'SELECT id, name, email, subject, message, created_at AS createdAt FROM contact_messages ORDER BY id DESC LIMIT 100') };
  });
}
