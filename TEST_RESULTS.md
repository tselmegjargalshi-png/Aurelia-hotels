# Test results

Run on **12 October 2026** in a Linux container with Node.js 22.22.0 and Playwright Chromium.
Raw output is in `docs/test-logs/`.

## Completed successfully

| Check | Command | Result |
|---|---|---|
| Type check (server strict + client with React shim) | `npm run typecheck:offline` | ✅ passed |
| Unit + API integration tests (incl. 16 for the browser demo API) | `npm test` | ✅ **55 / 55** passed |
| Production build (client bundle + server compile) | `npm run build` | ✅ passed |
| Browser end-to-end tests (Chromium, desktop + mobile) | `npm run test:e2e` | ✅ **17 / 17** passed |
| Browser-only demo end-to-end (Chromium, desktop + mobile, reload persistence, reset) | `npm run test:e2e:demo` | ✅ **15 / 15** passed |
| Fresh install smoke test (`db:reset`, `npm start`, health, SSR meta, admin 401) | manual `curl` | ✅ passed |

### Unit and API tests (`shared/shared.test.ts`, `server/test/*.test.ts`)

Each API test boots the real HTTP app against a fresh temporary SQLite database.

**Dates, validation, pricing**
- Nights are check-out exclusive
- Check-out must be after check-in; past dates, minimum guests and rooms rejected; stay length cap
- Party must fit across the requested rooms
- Base quote with demo tax and fee; extended-stay (15%) beats plan-ahead (10%) and never stacks; plan-ahead only at 60+ days

**Catalogue and search**
- Home data loads; filters change results; sort by price and rating
- Invalid dates rejected by the server
- Hotel detail shows date-specific availability (seeded sell-out)
- Maintenance override closes a room type for those nights
- Server quote equals the shared pricing engine; occupancy limits enforced

**Booking flow**
- Booking requires sign-in
- Successful reservation persists, with honest test-mode payment state (`not_collected`)
- Tampered price is refused and nothing is saved
- Terms must be accepted; guest details validated
- Duplicate submission with the same idempotency key returns the same reservation
- Overlapping booking of fully booked inventory is rejected; an adjacent stay is allowed
- **Concurrent requests never oversell the last rooms**
- A multi-room request needs that many units on every night
- Guests cannot read other guests' reservations

**Cancellation and admin**
- Anonymous and guest users get 401/403 from admin APIs
- Cancellation request → admin approval → inventory released
- Status transitions follow the allowed state machine
- Admin cannot cut inventory below existing reservations; can update price
- Admin customer view does not expose password hashes

**Auth and security**
- Passwords hashed; wrong password rejected; logout ends the session
- Password reset link works once and revokes the old password
- Mutations without the client header are blocked (CSRF)
- Contact form server validation and honest delivery message
- Security headers present; login attempts throttled

**Payments (simulated provider events)**
- With a provider configured, a booking is held as `pending_payment`, never marked paid by the server itself
- Stale webhook signatures rejected
- Events with a mismatched amount do not mark a reservation paid

### End-to-end (`scripts/e2e.mjs`)

Home page loads with hero search · Date validation · Search by destination and dates ·
Filters change results · Gallery modal opens/closes with keyboard · Sold-out suite can't be
selected · Room selection → sign-in → checkout keeps the selection · Checkout totals match the
pricing engine, terms required · Submission → confirmation from the saved record · Booking
persists in My Bookings and the API · Cancellation request · Guest blocked from admin (UI and API) ·
Admin overview and cancellation approval · Contact form validation and honest success message ·
Mobile menu at 390px · No horizontal overflow at 390 / 768 / 1440px · No uncaught page errors.

Screenshots are saved to `docs/screenshots/`.

## Could not run

| Check | Why |
|---|---|
| `npm run typecheck` (full, with `@types/react`) | The npm registry was unreachable, so `@types/react` couldn't be installed (see `docs/test-logs/typecheck-full-unavailable.txt`). The offline shim doesn't check JSX attribute types. |
| ESLint | Not installable offline. Strict `tsc` with unused-code checks was used instead. |
| Stripe integration against Stripe | Needs test API keys and a webhook endpoint. Only simulated signed events were tested. |
| Email delivery | No email service is configured or implemented. |
| PostgreSQL | No database server available. The app uses `node:sqlite`. |
| Cross-browser (Firefox, Safari), screen-reader audit, load testing | Not available here. |


The browser-only demo (`demo-dist/`) was tested locally over HTTP. The hosted copy was published as an artifact and its file list was checked, but the hosted page itself was not opened or driven here.
