import type { DB } from './connection.js';

/**
 * Ordered, append-only schema migrations. Never edit an applied migration —
 * add a new one. See docs/DATABASE.md for the PostgreSQL equivalent.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_initial_schema',
    sql: /* sql */ `
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('guest', 'admin')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  id          INTEGER PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE TABLE destinations (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  country  TEXT NOT NULL,
  summary  TEXT NOT NULL,
  image    TEXT NOT NULL
);

CREATE TABLE hotels (
  id                  INTEGER PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  destination_id      INTEGER NOT NULL REFERENCES destinations(id),
  name                TEXT NOT NULL,
  tagline             TEXT NOT NULL,
  property_type       TEXT NOT NULL,
  stars               INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  demo_rating         REAL NOT NULL CHECK (demo_rating BETWEEN 0 AND 10),
  overview            TEXT NOT NULL,
  description         TEXT NOT NULL,
  address             TEXT NOT NULL,
  latitude            REAL NOT NULL,
  longitude           REAL NOT NULL,
  check_in_time       TEXT NOT NULL,
  check_out_time      TEXT NOT NULL,
  cancellation_policy TEXT NOT NULL,
  house_rules         TEXT NOT NULL DEFAULT '[]',
  nearby              TEXT NOT NULL DEFAULT '[]',
  breakfast_included  INTEGER NOT NULL DEFAULT 0 CHECK (breakfast_included IN (0, 1)),
  free_cancellation   INTEGER NOT NULL DEFAULT 0 CHECK (free_cancellation IN (0, 1)),
  featured            INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_hotels_destination ON hotels(destination_id);

CREATE TABLE hotel_images (
  id          INTEGER PRIMARY KEY,
  hotel_id    INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  src         TEXT NOT NULL,
  alt         TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_hotel_images_hotel ON hotel_images(hotel_id, sort_order);

CREATE TABLE amenities (
  id     INTEGER PRIMARY KEY,
  code   TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL
);

CREATE TABLE hotel_amenities (
  hotel_id    INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amenity_id  INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (hotel_id, amenity_id)
);

CREATE TABLE room_types (
  id                  INTEGER PRIMARY KEY,
  hotel_id            INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL,
  max_adults          INTEGER NOT NULL CHECK (max_adults >= 1),
  max_occupancy       INTEGER NOT NULL,
  bed                 TEXT NOT NULL,
  size_sqm            INTEGER NOT NULL CHECK (size_sqm > 0),
  nightly_rate        INTEGER NOT NULL CHECK (nightly_rate > 0),
  inventory           INTEGER NOT NULL CHECK (inventory >= 0),
  meal_plan           TEXT NOT NULL,
  refundable          INTEGER NOT NULL DEFAULT 1 CHECK (refundable IN (0, 1)),
  cancellation_terms  TEXT NOT NULL,
  amenities           TEXT NOT NULL DEFAULT '[]',
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (hotel_id, slug),
  CHECK (max_occupancy >= max_adults)
);

CREATE TABLE room_images (
  id            INTEGER PRIMARY KEY,
  room_type_id  INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  src           TEXT NOT NULL,
  alt           TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- Date-specific inventory: overrides the room type's default unit count on a given night
-- (e.g. rooms closed for maintenance). Absent row = default inventory.
CREATE TABLE inventory_overrides (
  room_type_id  INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  night         TEXT NOT NULL,
  units         INTEGER NOT NULL CHECK (units >= 0),
  note          TEXT,
  PRIMARY KEY (room_type_id, night)
);

CREATE TABLE reservations (
  id                INTEGER PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  hotel_id          INTEGER NOT NULL REFERENCES hotels(id),
  room_type_id      INTEGER NOT NULL REFERENCES room_types(id),
  check_in          TEXT NOT NULL,
  check_out         TEXT NOT NULL,
  rooms             INTEGER NOT NULL CHECK (rooms >= 1),
  adults            INTEGER NOT NULL CHECK (adults >= 1),
  children          INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
  currency          TEXT NOT NULL,
  nightly_rate      INTEGER NOT NULL,
  room_subtotal     INTEGER NOT NULL,
  discount_code     TEXT,
  discount_amount   INTEGER NOT NULL DEFAULT 0,
  taxes             INTEGER NOT NULL,
  fees              INTEGER NOT NULL,
  total             INTEGER NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending_payment','confirmed','checked_in','checked_out','cancelled','no_show','expired')),
  payment_status    TEXT NOT NULL CHECK (payment_status IN ('not_collected','pending','paid','failed','refunded')),
  payment_mode      TEXT NOT NULL CHECK (payment_mode IN ('test','provider')),
  hold_expires_at   TEXT,
  guest_first_name  TEXT NOT NULL,
  guest_last_name   TEXT NOT NULL,
  guest_email       TEXT NOT NULL,
  guest_phone       TEXT,
  special_requests  TEXT,
  idempotency_key   TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, idempotency_key),
  CHECK (check_out > check_in)
);
CREATE INDEX idx_reservations_user ON reservations(user_id, created_at);
CREATE INDEX idx_reservations_hotel_dates ON reservations(hotel_id, check_in);
CREATE INDEX idx_reservations_status ON reservations(status);

-- One row per reserved night: the inventory ledger the availability engine sums.
CREATE TABLE reservation_nights (
  reservation_id  INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_type_id    INTEGER NOT NULL REFERENCES room_types(id),
  night           TEXT NOT NULL,
  rooms           INTEGER NOT NULL CHECK (rooms >= 1),
  PRIMARY KEY (reservation_id, night)
);
CREATE INDEX idx_reservation_nights_room_night ON reservation_nights(room_type_id, night);

CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  reservation_id  INTEGER NOT NULL REFERENCES reservations(id),
  provider        TEXT NOT NULL,
  provider_ref    TEXT NOT NULL UNIQUE,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_payments_reservation ON payments(reservation_id);

CREATE TABLE payment_events (
  id                 INTEGER PRIMARY KEY,
  provider_event_id  TEXT NOT NULL UNIQUE,
  type               TEXT NOT NULL,
  received_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE cancellation_requests (
  id              INTEGER PRIMARY KEY,
  reservation_id  INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at     TEXT
);
-- At most one open request per reservation.
CREATE UNIQUE INDEX uq_cancellation_pending ON cancellation_requests(reservation_id) WHERE status = 'pending';

CREATE TABLE favorites (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id    INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, hotel_id)
);

CREATE TABLE contact_messages (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE newsletter_subscribers (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_log (
  id             INTEGER PRIMARY KEY,
  actor_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  entity         TEXT NOT NULL,
  entity_id      INTEGER,
  details        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`,
  },
];

export function migrate(db: DB): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id),
  );
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id);
      db.exec('COMMIT');
      ran.push(m.id);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return ran;
}
