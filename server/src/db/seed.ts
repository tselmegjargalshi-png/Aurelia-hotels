import { get, run, writeTransaction, type DB } from './connection.js';
import { AMENITIES, DEMO_CUSTOMERS, DESTINATIONS, HOTELS } from './seed-data.js';
import { hashPassword, randomToken, bookingCode } from '../lib/crypto.js';
import { addDays, stayNights, todayIso } from '../../../shared/dates.js';
import { quoteStay } from '../../../shared/pricing.js';
import { CURRENCY } from '../../../shared/config.js';

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  guestPassword: string;
  /** Add sample reservations so availability and the admin dashboard have data. */
  withSampleBookings?: boolean;
  today?: string;
}

/** Idempotent catalogue + account seed. Safe to run more than once. */
export async function seed(db: DB, opts: SeedOptions) {
  const today = opts.today ?? todayIso();
  const adminHash = await hashPassword(opts.adminPassword);
  const guestHash = await hashPassword(opts.guestPassword);
  // Demo customers get random, undisclosed passwords: they exist only as sample records.
  const customerHashes = await Promise.all(DEMO_CUSTOMERS.map(() => hashPassword(randomToken(24))));

  writeTransaction(db, () => {
    if (get(db, 'SELECT 1 FROM hotels LIMIT 1')) return; // catalogue already present

    for (const a of AMENITIES) run(db, 'INSERT INTO amenities (code, label) VALUES (?, ?)', a.code, a.label);
    const amenityId = (code: string) => get<{ id: number }>(db, 'SELECT id FROM amenities WHERE code = ?', code)!.id;

    for (const d of DESTINATIONS) {
      run(db, 'INSERT INTO destinations (slug, name, country, summary, image) VALUES (?,?,?,?,?)', d.slug, d.name, d.country, d.summary, d.image);
    }
    for (const h of HOTELS) {
      const dest = get<{ id: number }>(db, 'SELECT id FROM destinations WHERE slug = ?', h.destination)!;
      const hotelId = Number(run(db,
        `INSERT INTO hotels (slug, destination_id, name, tagline, property_type, stars, demo_rating, overview, description, address,
           latitude, longitude, check_in_time, check_out_time, cancellation_policy, house_rules, nearby, breakfast_included,
           free_cancellation, featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        h.slug, dest.id, h.name, h.tagline, h.propertyType, h.stars, h.demoRating, h.overview, h.description, h.address,
        h.lat, h.lng, h.checkIn, h.checkOut, h.cancellationPolicy, JSON.stringify(h.houseRules), JSON.stringify(h.nearby),
        h.breakfast ? 1 : 0, h.freeCancellation ? 1 : 0, h.featured ? 1 : 0,
      ).lastInsertRowid);
      h.images.forEach(([src, alt], i) => run(db, 'INSERT INTO hotel_images (hotel_id, src, alt, sort_order) VALUES (?,?,?,?)', hotelId, src, alt, i));
      for (const code of h.amenities) run(db, 'INSERT INTO hotel_amenities (hotel_id, amenity_id) VALUES (?,?)', hotelId, amenityId(code));
      for (const r of h.rooms) {
        const roomId = Number(run(db,
          `INSERT INTO room_types (hotel_id, slug, name, description, max_adults, max_occupancy, bed, size_sqm, nightly_rate, inventory,
             meal_plan, refundable, cancellation_terms, amenities) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          hotelId, r.slug, r.name, r.description, r.maxAdults, r.maxOccupancy, r.bed, r.sizeSqm, r.rate, r.inventory,
          r.mealPlan, r.refundable ? 1 : 0, r.terms, JSON.stringify(r.amenities),
        ).lastInsertRowid);
        r.images.forEach(([src, alt], i) => run(db, 'INSERT INTO room_images (room_type_id, src, alt, sort_order) VALUES (?,?,?,?)', roomId, src, alt, i));
      }
    }
  });

  writeTransaction(db, () => {
    if (!get(db, 'SELECT 1 FROM users WHERE email = ?', opts.adminEmail)) {
      run(db, `INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,'admin')`, opts.adminEmail, 'Aurelia Demo Admin', adminHash);
    }
    if (!get(db, 'SELECT 1 FROM users WHERE email = ?', 'guest@aurelia.demo')) {
      run(db, `INSERT INTO users (email, name, phone, password_hash) VALUES (?,?,?,?)`, 'guest@aurelia.demo', 'Demo Guest', '+1 555 0100', guestHash);
    }
    DEMO_CUSTOMERS.forEach((c, i) => {
      if (!get(db, 'SELECT 1 FROM users WHERE email = ?', c.email)) {
        run(db, 'INSERT INTO users (email, name, phone, password_hash) VALUES (?,?,?,?)', c.email, c.name, c.phone, customerHashes[i]!);
      }
    });
  });

  if (opts.withSampleBookings !== false) seedSampleBookings(db, today);
}

/**
 * Sample reservations relative to `today`, written through the same nightly
 * ledger the booking engine uses. Includes past, current and future stays and
 * two deliberate sell-outs so availability logic is visible in the UI.
 */
function seedSampleBookings(db: DB, today: string) {
  writeTransaction(db, () => {
    if (get(db, 'SELECT 1 FROM reservations LIMIT 1')) return;
    const room = (hotel: string, slug: string) => get<{ id: number; hotel_id: number; nightly_rate: number }>(db,
      'SELECT rt.id, rt.hotel_id, rt.nightly_rate FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = ? AND rt.slug = ?', hotel, slug)!;
    const user = (email: string) => get<{ id: number; name: string; email: string; phone: string | null }>(db, 'SELECT id, name, email, phone FROM users WHERE email = ?', email)!;

    type Sample = [email: string, hotel: string, room: string, inOffset: number, nights: number, rooms: number, adults: number, children: number, status: string, bookedOffset: number];
    const samples: Sample[] = [
      ['emma.lindqvist@example.com', 'aurelia-lucerne-cliffs', 'deluxe-panorama-room', -12, 3, 1, 2, 0, 'checked_out', -60],
      ['daniel.okafor@example.com', 'aurelia-winelands-estate', 'junior-suite', -6, 4, 1, 2, 0, 'checked_out', -40],
      ['mei.tanaka@example.com', 'aurelia-yufu-terrace', 'deluxe-mountain-view-room', -2, 4, 1, 2, 1, 'checked_in', -30],
      ['lucas.moreau@example.com', 'aurelia-courmayeur-chalet', 'deluxe-room', -1, 3, 1, 2, 0, 'checked_in', -20],
      ['sofia.ricci@example.com', 'aurelia-brixen-spa-retreat', 'deluxe-spa-room', 0, 2, 1, 2, 0, 'confirmed', -14],
      ['guest@aurelia.demo', 'aurelia-alta-badia-lodge', 'superior-balcony-room', 1, 3, 1, 2, 0, 'confirmed', -10],
      ['emma.lindqvist@example.com', 'aurelia-winelands-estate', 'garden-room', 3, 5, 1, 2, 0, 'confirmed', -9],
      ['guest@aurelia.demo', 'aurelia-yufu-terrace', 'superior-room', 21, 3, 1, 2, 0, 'confirmed', -3],
      ['daniel.okafor@example.com', 'aurelia-lucerne-cliffs', 'executive-suite', 9, 2, 1, 2, 0, 'cancelled', -25],
      // Deliberate sell-out 1: the single Presidential Suite, nights +7…+9
      ['lucas.moreau@example.com', 'aurelia-lucerne-cliffs', 'presidential-suite', 7, 3, 1, 4, 0, 'confirmed', -45],
      // Deliberate sell-out 2: all four Alta Badia Family Rooms, nights +14…+16
      ['mei.tanaka@example.com', 'aurelia-alta-badia-lodge', 'family-room', 14, 3, 2, 4, 2, 'confirmed', -18],
      ['sofia.ricci@example.com', 'aurelia-alta-badia-lodge', 'family-room', 14, 3, 2, 4, 3, 'confirmed', -16],
      ['emma.lindqvist@example.com', 'aurelia-courmayeur-chalet', 'standard-room', -20, 2, 1, 1, 0, 'no_show', -50],
    ];

    const insertNight = db.prepare('INSERT INTO reservation_nights (reservation_id, room_type_id, night, rooms) VALUES (?,?,?,?)');
    for (const [email, hotel, slug, inOff, nights, rooms, adults, children, status, bookedOff] of samples) {
      const rt = room(hotel, slug);
      const u = user(email);
      const checkIn = addDays(today, inOff);
      const checkOut = addDays(checkIn, nights);
      const bookedOn = addDays(today, bookedOff);
      const q = quoteStay({ nightlyRate: rt.nightly_rate, checkIn, checkOut, rooms, bookedOn });
      const [first, ...rest] = u.name.split(' ');
      let code = bookingCode();
      while (get(db, 'SELECT 1 FROM reservations WHERE code = ?', code)) code = bookingCode();
      const id = Number(run(db,
        `INSERT INTO reservations (code, user_id, hotel_id, room_type_id, check_in, check_out, rooms, adults, children, currency,
           nightly_rate, room_subtotal, discount_code, discount_amount, taxes, fees, total, status, payment_status, payment_mode,
           guest_first_name, guest_last_name, guest_email, guest_phone, idempotency_key, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'not_collected','test',?,?,?,?,?,?)`,
        code, u.id, rt.hotel_id, rt.id, checkIn, checkOut, rooms, adults, children, CURRENCY.code,
        q.nightlyRate, q.roomSubtotal, q.discount?.code ?? null, q.discount?.amount ?? 0, q.taxes, q.fees, q.total, status,
        first!, rest.join(' ') || 'Guest', u.email, u.phone, `seed-${code}`, `${bookedOn}T10:00:00.000Z`,
      ).lastInsertRowid);
      for (const night of stayNights(checkIn, checkOut)) insertNight.run(id, rt.id, night, rooms);
    }

    // A pending cancellation request for the admin queue.
    const pending = get<{ id: number; user_id: number }>(db,
      `SELECT r.id, r.user_id FROM reservations r JOIN users u ON u.id = r.user_id WHERE u.email = 'emma.lindqvist@example.com' AND r.status = 'confirmed' LIMIT 1`);
    if (pending) run(db, 'INSERT INTO cancellation_requests (reservation_id, user_id, reason) VALUES (?,?,?)', pending.id, pending.user_id, 'Change of travel plans.');

    // Date-specific inventory: Courmayeur Family Suites closed for maintenance, nights +20…+22.
    const fs = room('aurelia-courmayeur-chalet', 'family-suite');
    for (let i = 20; i <= 22; i++) run(db, 'INSERT INTO inventory_overrides (room_type_id, night, units, note) VALUES (?,?,0,?)', fs.id, addDays(today, i), 'Maintenance (demo)');
  });
}
