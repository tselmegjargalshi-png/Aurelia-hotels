# Aurelia Hotels

*Stay Somewhere Extraordinary.*

A premium hotel website and booking platform: an editorial hospitality front end,
a real reservation engine with date-by-date inventory, accounts, and an admin
dashboard. It all runs locally on one Node.js process with a SQLite database.

> **Demonstration project.** Aurelia Hotels and its six properties are fictional.
> Prices, guest scores ("Demo score"), taxes and fees are sample values and are
> labelled that way in the UI. No real stays are sold and **no payment is taken**
> unless a payment provider is configured (see [Payments](#payments)).
> This is a working, tested application, but it is **not production-ready**
> (see [Known limitations](#known-limitations)).

---

## Live demo (nothing to install)

`npm run build:demo` produces `demo-dist/`: the same interface with the server replaced by an
in-browser stand-in (`client/src/demo/`). It uses the same pricing, validation and availability
rules, and answers the same API routes, so the whole flow works from a single page: search, book,
My Bookings, cancellation requests, favourites, and the admin dashboard
(use the demo accounts below, shown on the sign-in page).

What this version is, and is not:

- Data lives in **one browser** (localStorage, with an in-memory fallback). Other visitors never see your bookings,
  and availability is not shared. **It is not a reservation system.** Use the Node server for persistence.
- Passwords are hashed with PBKDF2 (WebCrypto) and kept in the browser. There is no real authentication boundary:
  anyone using the page can read the page's own storage, so never type a real password.
- No payment is taken and no email is sent. The banner says so, and **Reset demo** restores the sample data.
- Routes live in the URL hash (`#/hotels`), so the page works as a single file.

`demo-dist/page.html` (CSS and JS inlined) plus `demo-dist/images/` can be hosted on any static host.
`npm run test:e2e:demo` drives it in Chromium.

---

## Quick start

Requirements: **Node.js ≥ 22.13** (uses the built-in `node:sqlite` module). No database server is needed.

```bash
npm install            # needs network access to the npm registry
cp .env.example .env   # optional — defaults work for local development
npm run build          # bundle the client + compile the server
npm start              # http://localhost:4173
```

The database (`data/aurelia.db`) is created, migrated and seeded automatically on first start.

For development with rebuild-on-change and server restart:

```bash
npm run dev
```

### Demo accounts (development only)

| Role  | Email                | Password             |
|-------|----------------------|----------------------|
| Admin | `admin@aurelia.demo` | `Aurelia-Admin-2026` |
| Guest | `guest@aurelia.demo` | `Aurelia-Guest-2026` |

You can also register a new account. The sample customers in the admin
dashboard have random, undisclosed passwords. In production, seeding refuses to
run unless `ADMIN_SEED_PASSWORD` and `GUEST_SEED_PASSWORD` are set.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Watch-build the client, restart the API on change |
| `npm run build` | Production client bundle (esbuild) + server compile (tsc) |
| `npm start` | Run the compiled server (serves API + client) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Schema migrations, seed data, wipe and reseed |
| `npm run images` | Re-process `assets/source/*.jpg` into responsive WebP/JPEG |
| `npm run typecheck` | Full type check (needs `@types/react`, installed by `npm install`) |
| `npm run typecheck:offline` | Type check with the bundled React type shim (see below) |
| `npm test` | Unit + API integration tests (`node:test`) |
| `npm run test:e2e` | Browser tests in Chromium (Playwright); run `npm run build:client` first |
| `npm run build:demo` / `test:e2e:demo` | Build and test the browser-only demo (`demo-dist/`) |

---

## What's inside

### Pages

| Area | Routes |
|---|---|
| Home | `/` — hero search, destinations, featured hotels, recommended stays, offers, amenities, guest experience, brand, newsletter, FAQ |
| Discovery | `/destinations`, `/hotels` (search, filters, sort), `/offers` |
| Hotel | `/hotels/:slug` — gallery modal, overview, amenities, rooms with live availability, policies, house rules, nearby, location |
| Room | `/hotels/:slug/rooms/:room` |
| Booking | `/checkout` → `/bookings/:code/confirmation` |
| Account | `/sign-in`, `/register`, `/forgot-password`, `/reset-password`, `/account` (profile), `/account/bookings`, `/account/bookings/:code`, `/account/favorites` |
| Info | `/about`, `/contact` |
| Admin | `/admin` (overview), `/admin/reservations`, `/admin/hotels`, `/admin/customers`, `/admin/messages` |

### Booking and inventory model

- Each **room type** has an `inventory` (number of identical units). Admins can
  override a single night (fewer units, or closed for maintenance) in `inventory_overrides`.
- Each reservation writes one row per night to **`reservation_nights`**. A night's
  availability is `inventory (or override) − rooms held by active reservations`
  (confirmed, checked-in, or pending-payment within its 30-minute hold window).
  A guest's cancellation *request* keeps the rooms held until an admin approves it.
- A booking succeeds only if **every night** in `[check-in, check-out)` has enough
  units for the number of rooms requested. Check-out day is not a night, so
  back-to-back stays don't collide.
- Creation runs inside a SQLite **`BEGIN IMMEDIATE`** write transaction: check
  and insert are atomic, so concurrent requests can't oversell. This is covered by a
  concurrency test.
- The server **recalculates the price** from the database and rejects a request
  whose expected total differs, so nothing is saved at a tampered price.
- **Idempotency key** per checkout (unique per user): a double-click or retry
  returns the same reservation instead of creating a second one. The submit button is also disabled while submitting.
- Occupancy (max adults / total guests per room × rooms) is validated on the server.
- Status changes follow a state machine (`ALLOWED_TRANSITIONS` in `reservations.ts`):
  `confirmed → checked_in → checked_out`, `confirmed → cancelled | no_show`,
  `pending_payment → confirmed` (verified payment only) `| cancelled | expired`.
  Cancellation requests live in their own table (`pending → approved | rejected`).

### Pricing (`shared/pricing.ts`, `shared/config.ts`)

Currency, the demo tax rate (12%), the demo destination fee ($10 per room per night) and
offers are all configured in `shared/config.ts`. Amounts are integer cents. The same
engine produces the client's preview and the server's authoritative quote.
Offers are real rules the engine applies: *5+ nights → 15%*, *booked 60+ days ahead → 10%*.
Only the single best eligible offer applies, so offers never stack, and no "was" prices are invented.

### Payments

Payments are kept separate from reservation logic behind `PaymentProvider`
(`server/src/services/payments/`).

- **`PAYMENT_PROVIDER=none` (default):** bookings are saved as *confirmed test
  reservations* with `payment_status = not_collected`. The UI says plainly that no payment
  was taken and that payment processing isn't connected.
- **`PAYMENT_PROVIDER=stripe`:** creates a Stripe Checkout Session via the REST API
  and holds inventory as `pending_payment` for 30 minutes. `POST /api/payments/webhook`
  verifies the `Stripe-Signature` HMAC (with timestamp tolerance) and checks amount
  and currency before marking a reservation `paid`. Without a verified event, a
  reservation is never marked paid. **This path is unit-tested with simulated signed events but
  has not been run against Stripe.** It needs test keys and a webhook endpoint.
- Card details never touch this server. Secret keys live only in server env vars.

### Security measures implemented

- Passwords hashed with **scrypt** (`node:crypto`, per-user salt, constant-time compare).
- Sessions: random tokens stored **hashed**, `httpOnly` + `SameSite=Lax` cookie,
  `Secure` in production, server-side expiry, revoked on logout and password reset.
- Password reset: single-use hashed tokens with a 30-minute expiry. Old sessions are revoked on use.
- **Authorization on the server:** every `/api/admin/*` route requires `role = admin`;
  reservation reads and cancellations check ownership (other guests get 404).
- **CSRF:** mutations require the `X-Aurelia-Client: web` header plus a matching `Origin`.
- **Rate limiting** (in-memory): auth 10 per 15 min, bookings 20 per 10 min, contact/newsletter 8 per 10 min.
- **Zod validation** of every request body and query on the server. Errors are safe and don't leak stack traces.
- Security headers: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Data minimization: admin customer views never return password hashes or tokens.

### SEO and accessibility

- The server injects a per-route `<title>`, meta description, canonical URL and Open Graph tags into the HTML,
  so crawlers see them without running JavaScript. The client updates them as you navigate.
- Hotel `schema.org` JSON-LD is implemented but **off by default**
  (`ENABLE_HOTEL_STRUCTURED_DATA`), because the hotels are fictional. It never
  includes ratings or reviews.
- Semantic landmarks, one `h1` per page, labelled form fields, `aria-live` status
  messages, a focus-trapped gallery modal (arrows / Esc / swipe), visible focus
  rings, skip link, 44px touch targets, and `prefers-reduced-motion` support.
- Responsive images: WebP at 480/800/1080 widths with a JPEG fallback, `srcset`/`sizes`,
  lazy loading below the fold, and a styled fallback if an image fails.

### Images

The 12 photographs in `assets/source/` were **supplied by the project owner**. They're processed
by `npm run images` into `client/public/images/`, and `assets/image-manifest.json` lists each one
with its category. Two exterior photos showed a real hotel's name on signage, and that signage is
**blurred** so the fictional brand isn't mixed up with a real business.
Before any public use, confirm you have the rights to these photos.
The set has **no spa or lobby photography**, so those categories aren't shown. Add files to
`assets/source/` and the manifest to extend it.

The location section shows a map placeholder with an "Open approximate area in
OpenStreetMap" link. No map API is integrated.

---

## Architecture

```
client/            React 19 SPA (TypeScript, plain modern CSS with design tokens)
  src/components/  Layout, SearchBar, HotelCard, RoomCard, Gallery, PriceBreakdown, Img, Faq, ui
  src/pages/       Home, Hotels, HotelDetail, RoomDetail, Checkout, Confirmation, Auth, Static, account/*, admin/*
  src/lib/         api client, auth context, router, SEO, formatting
shared/            Types, dates, validation, pricing engine, commercial config (used by both sides)
server/src/
  app.ts           HTTP app: routing, security headers, CSRF, static files, SEO injection
  routes/          public, account, payments, admin (admin = server-enforced role check)
  services/        catalog (search), availability, reservations (transactional), payments/*
  db/              node:sqlite connection, versioned migrations, seed data, CLI
  lib/             auth/sessions, crypto, rate limiting, HTTP helpers
server/test/       API integration tests (in-memory server + temp DB)
scripts/           client build (esbuild), dev runner, image pipeline, e2e runner
```

**Database tables:** `users` (role), `sessions`, `password_resets`, `destinations`, `hotels`,
`hotel_images`, `amenities`, `hotel_amenities`, `room_types`, `room_images`,
`inventory_overrides`, `reservations`, `reservation_nights`, `payments`, `payment_events`,
`cancellation_requests`, `favorites`, `contact_messages`, `newsletter_subscribers`, `audit_log`.
The schema is in `server/src/db/migrations.ts` and uses foreign keys, `CHECK` constraints,
unique constraints (e.g. one pending cancellation per reservation, unique idempotency key per user)
and indexes on the hot lookup paths.
There is no `reviews` table: no review system exists, so there are no reviews to show.

### Why these technology choices

This project was built in an environment **without npm registry access**, with only
React, zod, esbuild, TypeScript, tsx, sharp and Playwright installed already. As a result:

- **esbuild instead of Vite** for the client bundle. Swapping in Vite is mechanical,
  since `client/index.html` and `client/src/main.tsx` are standard.
- **`node:sqlite` instead of PostgreSQL + Prisma.** No database server was available.
  The data-access layer is plain SQL in one place. To move to PostgreSQL: port
  `migrations.ts` (types are standard), replace `BEGIN IMMEDIATE` with a transaction
  that takes `SELECT … FOR UPDATE` on the affected `room_types` row (or a
  per-night inventory table), and swap `connection.ts` for `pg`.
- **A small built-in router and HTTP layer instead of Express/react-router**, for the same reason.
- **`typecheck:offline`** uses a minimal React type shim (`client/types-offline/`)
  because `@types/react` couldn't be installed. It checks the app's logic and data flow
  but not JSX attribute types. After `npm install`, run `npm run typecheck` for full checking.
- **No ESLint**, because it couldn't be installed. `tsc` runs in strict mode with
  `noUnusedLocals`/`noUnusedParameters` as the static check.

---

## Test results

See **[TEST_RESULTS.md](TEST_RESULTS.md)** for the full list. In summary, everything was run on 12 Oct 2026:

- `npm run typecheck:offline`: passed
- `npm test`: **55/55 passed**, including 16 for the browser demo API (pricing, dates, validation, search, availability,
  overlap rejection, concurrency, idempotency, tampering, ownership, admin access,
  state machine, auth, CSRF, rate limiting, payment webhook verification)
- `npm run build`: passed
- `npm run test:e2e`: **17/17 passed** in Chromium (desktop + 390px mobile), with screenshots in `docs/screenshots/`
- `npm run test:e2e:demo`: **15/15 passed** against the browser-only demo build

## Known limitations

- **Not production-ready.** It hasn't had a security review, load testing, backups or monitoring.
- **No payments are processed** by default. The Stripe integration has never run against Stripe itself.
- **No email delivery.** Password-reset links are shown in the browser in development.
  Contact messages and newsletter sign-ups are saved and visible to admins, and the UI says that
  no email is sent.
- **SQLite on a single process.** The rate limiter and sessions are per-process.
  Horizontal scaling needs PostgreSQL and a shared store (e.g. Redis).
- **Expired payment holds** are released lazily (on the next availability or booking check), not by a scheduler.
- **One room type per reservation.** Mixed-room bookings would need a `reservation_rooms` table.
- **Admin image management** picks from the processed local image library. There are no uploads.
- **No map integration**, only a placeholder and an external link.
- **Full React type checking and linting** have not been run (see above).
- Taxes and fees are fictional, flat values, not jurisdiction rules.
