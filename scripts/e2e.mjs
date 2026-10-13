#!/usr/bin/env node
/**
 * End-to-end browser tests (Playwright library + node:assert).
 *
 * Starts the real server against a fresh temporary SQLite database, drives
 * Chromium through the guest booking flow, admin access control, mobile
 * navigation, form validation and responsive layout, and saves screenshots
 * to docs/screenshots/.
 *
 *   npm run build:client && npm run test:e2e
 *
 * Browser: uses Playwright's Chromium. Set CHROMIUM_PATH to use a specific binary.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'docs/screenshots');
mkdirSync(shots, { recursive: true });
const port = 4500 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const dbDir = mkdtempSync(path.join(tmpdir(), 'aurelia-e2e-'));

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

const server = spawn(path.join(root, 'node_modules/.bin/tsx'), ['server/src/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATABASE_PATH: path.join(dbDir, 'e2e.db'), APP_ORIGIN: base, NODE_ENV: 'development', AURELIA_SKIP_ENV_FILE: '1', NODE_OPTIONS: '--disable-warning=ExperimentalWarning' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - started }); console.log(`  ✓ ${name}`); }
  catch (err) { results.push({ name, ok: false, err }); console.log(`  ✗ ${name}\n    ${String(err?.message ?? err).split('\n').slice(0, 6).join('\n    ')}`); }
}

async function scrollAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
}

async function login(page, email, password, next = '/account/bookings') {
  await page.goto(`${base}/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
}

try {
  await waitForServer();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  console.log(`E2E against ${base}`);

  await step('Home page loads with hero search', async () => {
    await page.goto(base);
    await assert.doesNotReject(page.getByRole('heading', { level: 1, name: 'Discover Your Next Extraordinary Stay.' }).waitFor());
    assert.ok(await page.getByRole('search', { name: 'Search hotels' }).isVisible());
    assert.equal(await page.title(), 'Aurelia Hotels — Stay Somewhere Extraordinary.');
    await scrollAll(page);
    await page.screenshot({ path: path.join(shots, 'desktop-home.png'), fullPage: true });
  });

  await step('Date validation: check-out must be after check-in', async () => {
    await page.goto(base);
    const form = page.getByRole('search', { name: 'Search hotels' });
    await form.getByLabel('Check-in').fill(day(10));
    await form.getByLabel('Check-out').fill(day(8));
    await form.getByRole('button', { name: /Search availability/ }).click();
    await page.getByText('Check-out must be after check-in.').waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
  });

  await step('Hotel search by destination and dates', async () => {
    await page.goto(base);
    const form = page.getByRole('search', { name: 'Search hotels' });
    await form.getByLabel('Destination').selectOption('dolomites');
    await form.getByLabel('Check-in').fill(day(30));
    await form.getByLabel('Check-out').fill(day(33));
    await form.getByRole('button', { name: /Search availability/ }).click();
    await page.waitForURL(/\/hotels\?/);
    await page.getByRole('heading', { name: 'Hotels in The Dolomites' }).waitFor();
    await page.locator('.hotel-card:not(.skeleton-card)').first().waitFor();
    assert.equal(await page.locator('.hotel-card:not(.skeleton-card)').count(), 2);
    assert.ok(await page.getByText('Available for your dates').first().isVisible());
  });

  await step('Filters change the displayed results', async () => {
    await page.goto(`${base}/hotels`);
    await page.locator('.hotel-card:not(.skeleton-card)').first().waitFor();
    assert.equal(await page.locator('.hotel-card').count(), 6);
    await page.locator('.filter-sidebar').getByLabel('4 stars').check();
    await page.waitForURL(/stars=4/);
    await page.waitForFunction(() => document.querySelectorAll('.hotel-card').length === 2);
    await page.locator('.filter-sidebar').getByLabel('Hot-spring baths').check();
    await page.getByText('No hotels match these filters').waitFor();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.hotel-card').length === 6);
    await page.getByLabel('Sort by').selectOption('price_asc');
    await page.waitForURL(/sort=price_asc/);
    await page.waitForFunction(() => document.querySelector('.hotel-card-title')?.textContent === 'Aurelia Courmayeur Chalet', null, { timeout: 5000 });
    const prices = await page.locator('.hotel-card .price strong').allInnerTexts();
    const nums = prices.map((p) => Number(p.replace(/[^0-9]/g, '')));
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
    await page.screenshot({ path: path.join(shots, 'desktop-hotels.png'), fullPage: false });
  });

  await step('Hotel detail: gallery modal opens and closes with keyboard', async () => {
    await page.goto(`${base}/hotels/aurelia-lucerne-cliffs?checkIn=${day(7)}&checkOut=${day(10)}&adults=2&rooms=1`);
    await page.getByRole('heading', { level: 1, name: 'Aurelia Lucerne Cliffs' }).waitFor();
    await page.getByRole('button', { name: /View all 4 photos/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /1 \/ 4/);
    await page.keyboard.press('ArrowRight');
    assert.match(await dialog.innerText(), /2 \/ 4/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  });

  await step('Availability: seeded sold-out suite cannot be selected; others can', async () => {
    const pres = page.locator('.room-card', { hasText: 'Presidential Suite' });
    assert.ok(await pres.getByRole('button', { name: 'Unavailable' }).isDisabled());
    assert.ok(await page.locator('.room-card', { hasText: 'Superior Lake Room' }).getByRole('link', { name: 'Select room' }).isVisible());
    await page.screenshot({ path: path.join(shots, 'desktop-hotel-detail.png'), fullPage: false });
  });

  let bookingCode = '';
  await step('Room selection → sign-in → checkout keeps the selection', async () => {
    await page.goto(`${base}/hotels/aurelia-yufu-terrace?checkIn=${day(20)}&checkOut=${day(23)}&adults=2&rooms=1`);
    await page.locator('.room-card', { hasText: 'Superior Room' }).getByRole('link', { name: 'Select room' }).click();
    await page.getByRole('heading', { name: 'Sign in to complete your reservation' }).waitFor();
    await page.locator('.empty-state').getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill('guest@aurelia.demo');
    await page.getByLabel('Password').fill('Aurelia-Guest-2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/checkout\?/);
    await page.getByRole('heading', { name: 'Complete your reservation' }).waitFor();
  });

  await step('Checkout: totals match the pricing engine; terms required', async () => {
    const totalText = await page.locator('.price-breakdown .total dd').innerText();
    // 3 nights × $380 = $1,140; tax 12% = $136.80; fee 3 × $10 = $30 → $1,306.80
    assert.equal(totalText, '$1,306.80');
    assert.match(await page.locator('.price-breakdown').innerText(), /\$380\.00 × 3 nights × 1 room\s+\$1,140\.00/);
    await page.getByRole('button', { name: /Confirm test reservation/ }).click();
    await page.getByText('Please accept the booking terms and policies.').waitFor();
    assert.equal(new URL(page.url()).pathname, '/checkout');
    await page.screenshot({ path: path.join(shots, 'desktop-checkout.png'), fullPage: true });
  });

  await step('Reservation submission → confirmation from saved record', async () => {
    await page.getByLabel(/I accept the cancellation terms/).check();
    await page.getByRole('button', { name: /Confirm test reservation/ }).click();
    await page.waitForURL(/\/bookings\/AUR-[A-Z0-9]{6}\/confirmation/);
    await page.getByRole('heading', { name: 'Your test reservation is confirmed.' }).waitFor();
    bookingCode = page.url().match(/AUR-[A-Z0-9]{6}/)[0];
    const text = await page.locator('main').innerText();
    assert.match(text, /Payment not collected/);
    assert.match(text, /\$1,306\.80/);
    assert.doesNotMatch(text, /\bPaid\b/);
    await page.screenshot({ path: path.join(shots, 'desktop-confirmation.png'), fullPage: true });
  });

  await step('Booking persists in My Bookings and via API', async () => {
    await page.goto(`${base}/account/bookings`);
    await page.getByText(bookingCode).waitFor();
    const api = await page.evaluate(async (code) => (await fetch(`/api/reservations/${code}`)).json(), bookingCode);
    assert.equal(api.reservation.status, 'confirmed');
    assert.equal(api.reservation.paymentStatus, 'not_collected');
  });

  await step('Cancellation request from booking detail', async () => {
    await page.goto(`${base}/account/bookings/${bookingCode}`);
    await page.getByRole('button', { name: 'Request cancellation' }).click();
    await page.getByLabel('Reason (optional)').fill('Testing the flow');
    await page.getByRole('button', { name: 'Send cancellation request' }).click();
    await page.getByText('Your cancellation request has been sent').waitFor();
  });

  await step('Guest cannot access the admin dashboard (UI and API)', async () => {
    await page.goto(`${base}/admin`);
    await page.getByRole('heading', { name: 'Administrators only' }).waitFor();
    const status = await page.evaluate(async () => (await fetch('/api/admin/overview')).status);
    assert.equal(status, 403);
    const anon = await (await fetch(`${base}/api/admin/overview`)).status;
    assert.equal(anon, 401);
  });

  await step('Admin dashboard: overview, cancellation approval', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await ctx.newPage();
    await login(admin, 'admin@aurelia.demo', 'Aurelia-Admin-2026', '/admin');
    await admin.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await admin.getByText('Collected via payment provider').waitFor();
    await admin.locator('.kpi').first().waitFor();
    await admin.screenshot({ path: path.join(shots, 'desktop-admin-overview.png'), fullPage: true });
    await admin.goto(`${base}/admin/reservations?tab=cancellations`);
    const card = admin.locator('.request-list li', { hasText: bookingCode });
    await card.getByRole('button', { name: /Approve/ }).click();
    await admin.getByText(`${bookingCode}: request approved`).waitFor();
    await admin.goto(`${base}/admin/hotels`);
    await admin.getByRole('link', { name: 'Aurelia Alta Badia Lodge' }).click();
    await admin.getByRole('tab', { name: 'Inventory' }).click();
    await admin.locator('.inv-cell').first().waitFor();
    await admin.screenshot({ path: path.join(shots, 'desktop-admin-inventory.png'), fullPage: true });
    await ctx.close();
  });

  await step('Contact form validation and honest success message', async () => {
    await page.goto(`${base}/contact`);
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Please add a subject.').waitFor();
    assert.ok(await page.getByText('Please write at least 20 characters.').isVisible());
    await page.getByLabel('Subject').fill('Arrival time');
    await page.getByLabel('Message', { exact: true }).fill('We will arrive late in the evening, around 23:00. Is that fine?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText(/saved to the Aurelia demo inbox/).waitFor();
  });

  await step('Mobile navigation menu works (390px)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await ctx.newPage();
    await m.goto(base);
    await m.getByRole('button', { name: 'Open menu' }).click();
    const menu = m.getByRole('dialog');
    await menu.waitFor();
    await m.screenshot({ path: path.join(shots, 'mobile-menu.png') });
    await menu.getByRole('link', { name: 'Hotels', exact: true }).click();
    await m.waitForURL(/\/hotels$/);
    await menu.waitFor({ state: 'detached' });
    await m.getByRole('button', { name: /Filters/ }).click();
    await m.getByRole('dialog', { name: 'Filters' }).waitFor();
    await m.screenshot({ path: path.join(shots, 'mobile-filters.png') });
    await ctx.close();
  });

  await step('No horizontal overflow at 390 / 768 / 1440 px', async () => {
    const paths = ['/', '/hotels', `/hotels/aurelia-winelands-estate?checkIn=${day(12)}&checkOut=${day(14)}&adults=2&rooms=1`,
      '/hotels/aurelia-winelands-estate/rooms/junior-suite', '/destinations', '/offers', '/about', '/contact', '/sign-in', '/admin'];
    const problems = [];
    for (const width of [390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const p = await ctx.newPage();
      for (const route of paths) {
        await p.goto(base + route, { waitUntil: 'networkidle' });
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) problems.push(`${width}px ${route}: +${over}px`);
        if (width === 390 && (route === '/' || route.includes('winelands-estate?'))) {
          await scrollAll(p);
          await p.screenshot({ path: path.join(shots, `mobile-${route === '/' ? 'home' : 'hotel-detail'}.png`), fullPage: true });
        }
      }
      await ctx.close();
    }
    assert.deepEqual(problems, []);
  });

  await step('No uncaught page errors', async () => { assert.deepEqual(consoleErrors, []); });

  await browser.close();
} catch (err) {
  console.error(err);
  results.push({ name: 'harness', ok: false, err });
} finally {
  server.kill('SIGTERM');
  rmSync(dbDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} end-to-end checks passed`);
process.exit(failed.length ? 1 : 0);
