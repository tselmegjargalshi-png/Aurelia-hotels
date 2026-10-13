#!/usr/bin/env node
/**
 * End-to-end browser tests for the browser-only demo build (demo-dist/).
 *
 * Serves demo-dist/ with a tiny static server (no API: the page answers its own calls) and drives
 * Chromium through the guest booking flow, persistence across reload, admin access and responsive layout.
 *
 *   npm run build:demo && npm run test:e2e:demo
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'demo-dist');
const shots = path.join(root, 'docs/screenshots-demo');
await mkdir(shots, { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = path.join(dist, p === '/' ? 'index.html' : p);
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try { const buf = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(buf); }
  catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const route = (r) => `${base}#${r}`;
const hashOf = (page) => new URL(page.url()).hash;

const results = [];
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (err) { results.push({ name, ok: false }); console.log(`  ✗ ${name}\n    ${String(err?.message ?? err).split('\n').slice(0, 6).join('\n    ')}`); }
}
async function scrollAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
}
async function signIn(page, email, password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  console.log(`Demo E2E against ${base}`);

  await step('Home page loads with hero search and the demo notice', async () => {
    await page.goto(base);
    await page.getByRole('heading', { level: 1, name: 'Discover Your Next Extraordinary Stay.' }).waitFor();
    assert.ok(await page.getByRole('search', { name: 'Search hotels' }).isVisible());
    assert.ok(await page.getByRole('note').filter({ hasText: 'Live demo' }).isVisible());
    // images are real files, not broken
    await page.waitForFunction(() => [...document.images].filter((i) => i.loading !== 'lazy').every((i) => i.complete && i.naturalWidth > 0));
    await scrollAll(page);
    await page.screenshot({ path: path.join(shots, 'demo-home.png'), fullPage: true });
  });

  await step('Date validation: check-out must be after check-in', async () => {
    await page.goto(route('/'));
    const form = page.getByRole('search', { name: 'Search hotels' });
    await form.getByLabel('Check-in').fill(day(10));
    await form.getByLabel('Check-out').fill(day(8));
    await form.getByRole('button', { name: /Search availability/ }).click();
    await page.getByText('Check-out must be after check-in.').waitFor();
    assert.equal(hashOf(page), '#/');
  });

  await step('Hotel search by destination and dates', async () => {
    const form = page.getByRole('search', { name: 'Search hotels' });
    await form.getByLabel('Destination').selectOption('dolomites');
    await form.getByLabel('Check-in').fill(day(30));
    await form.getByLabel('Check-out').fill(day(33));
    await form.getByRole('button', { name: /Search availability/ }).click();
    await page.waitForFunction(() => location.hash.startsWith('#/hotels?'));
    await page.getByRole('heading', { name: 'Hotels in The Dolomites' }).waitFor();
    await page.locator('.hotel-card:not(.skeleton-card)').first().waitFor();
    assert.equal(await page.locator('.hotel-card:not(.skeleton-card)').count(), 2);
    assert.ok(await page.getByText('Available for your dates').first().isVisible());
  });

  await step('Filters change the displayed results', async () => {
    await page.goto(route('/hotels'));
    await page.locator('.hotel-card:not(.skeleton-card)').first().waitFor();
    assert.equal(await page.locator('.hotel-card').count(), 6);
    await page.locator('.filter-sidebar').getByLabel('4 stars').check();
    await page.waitForFunction(() => location.hash.includes('stars=4'));
    await page.waitForFunction(() => document.querySelectorAll('.hotel-card').length === 2);
    await page.locator('.filter-sidebar').getByLabel('Hot-spring baths').check();
    await page.getByText('No hotels match these filters').waitFor();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.hotel-card').length === 6);
    await page.getByLabel('Sort by').selectOption('price_asc');
    await page.waitForFunction(() => document.querySelector('.hotel-card-title')?.textContent === 'Aurelia Courmayeur Chalet');
    const nums = (await page.locator('.hotel-card .price strong').allInnerTexts()).map((p) => Number(p.replace(/[^0-9]/g, '')));
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
  });

  await step('Hotel detail: gallery modal works with the keyboard; sold-out suite cannot be selected', async () => {
    await page.goto(route(`/hotels/aurelia-lucerne-cliffs?checkIn=${day(7)}&checkOut=${day(10)}&adults=2&rooms=1`));
    await page.getByRole('heading', { level: 1, name: 'Aurelia Lucerne Cliffs' }).waitFor();
    await page.getByRole('button', { name: /View all 4 photos/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /1 \/ 4/);
    await page.keyboard.press('ArrowRight');
    assert.match(await dialog.innerText(), /2 \/ 4/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    const pres = page.locator('.room-card', { hasText: 'Presidential Suite' });
    assert.ok(await pres.getByRole('button', { name: 'Unavailable' }).isDisabled());
    await page.getByRole('link', { name: 'Choose a room' }).first().click().catch(() => {});
    assert.ok(hashOf(page).startsWith('#/hotels/aurelia-lucerne-cliffs'), 'in-page anchor must not change the route');
  });

  let code = '';
  await step('Room → sign in → checkout keeps the selection; totals are right; terms required', async () => {
    await page.goto(route(`/hotels/aurelia-yufu-terrace?checkIn=${day(20)}&checkOut=${day(23)}&adults=2&rooms=1`));
    await page.locator('.room-card', { hasText: 'Superior Room' }).getByRole('link', { name: 'Select room' }).click();
    await page.getByRole('heading', { name: 'Sign in to complete your reservation' }).waitFor();
    await page.locator('.empty-state').getByRole('link', { name: 'Sign in' }).click();
    await signIn(page, 'guest@aurelia.demo', 'Aurelia-Guest-2026');
    await page.getByRole('heading', { name: 'Complete your reservation' }).waitFor();
    assert.equal(await page.locator('.price-breakdown .total dd').innerText(), '$1,306.80');
    await page.getByRole('button', { name: /Confirm test reservation/ }).click();
    await page.getByText('Please accept the booking terms and policies.').waitFor();
    await page.screenshot({ path: path.join(shots, 'demo-checkout.png'), fullPage: true });
  });

  await step('Submission → confirmation from the saved record; payment is not collected', async () => {
    await page.getByLabel(/I accept the cancellation terms/).check();
    await page.getByRole('button', { name: /Confirm test reservation/ }).click();
    await page.getByRole('heading', { name: 'Your test reservation is confirmed.' }).waitFor();
    code = hashOf(page).match(/AUR-[A-Z0-9]{6}/)[0];
    const text = await page.locator('main').innerText();
    assert.match(text, /Payment not collected/);
    assert.match(text, /\$1,306\.80/);
    assert.doesNotMatch(text, /\bPaid\b/);
  });

  await step('The booking survives a page reload (saved in this browser)', async () => {
    await page.goto(route('/account/bookings'));
    await page.reload();
    await page.getByText(code).waitFor();
  });

  await step('Cancellation request from the booking page', async () => {
    await page.goto(route(`/account/bookings/${code}`));
    await page.getByRole('button', { name: 'Request cancellation' }).click();
    await page.getByLabel('Reason (optional)').fill('Testing the flow');
    await page.getByRole('button', { name: 'Send cancellation request' }).click();
    await page.getByText('Your cancellation request has been sent').waitFor();
  });

  await step('A guest cannot open the admin dashboard', async () => {
    await page.goto(route('/admin'));
    await page.getByRole('heading', { name: 'Administrators only' }).waitFor();
  });

  await step('Admin: overview and cancellation approval', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const admin = await ctx.newPage();
    await admin.goto(route('/sign-in?next=%2Fadmin'));
    await signIn(admin, 'admin@aurelia.demo', 'Aurelia-Admin-2026');
    await admin.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await admin.locator('.kpi').first().waitFor();
    await admin.screenshot({ path: path.join(shots, 'demo-admin.png'), fullPage: true });
    // A fresh browser context has its own demo data: the guest's new booking is not here, but the seeded request is.
    await admin.goto(route('/admin/reservations?tab=cancellations'));
    await admin.locator('.request-list li').first().getByRole('button', { name: /Approve/ }).click();
    await admin.getByText(/request approved/).waitFor();
    await ctx.close();
  });

  await step('Contact form: validation and honest message', async () => {
    await page.goto(route('/contact'));
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Please add a subject.').waitFor();
    await page.getByLabel('Subject').fill('Arrival time');
    await page.getByLabel('Message', { exact: true }).fill('We will arrive late in the evening, around 23:00. Is that fine?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText(/No email is sent/).waitFor();
  });

  await step('Reset demo clears saved bookings', async () => {
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.waitForLoadState('load');
    await page.goto(route('/account/bookings'));
    // Reset rebuilds the data and signs everyone out; the guest's own booking is gone.
    await page.getByRole('heading', { name: /Sign in/i }).first().waitFor();
    await page.goto(route('/sign-in?next=%2Faccount%2Fbookings'));
    await signIn(page, 'guest@aurelia.demo', 'Aurelia-Guest-2026');
    await page.getByRole('heading', { name: /bookings/i }).first().waitFor();
    assert.equal(await page.getByText(code).count(), 0);
  });

  await step('Mobile (390px): menu works, no horizontal overflow at 390 / 768 / 1440', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await ctx.newPage();
    await m.goto(base);
    await m.getByRole('button', { name: 'Open menu' }).click();
    const menu = m.getByRole('dialog');
    await menu.waitFor();
    await menu.getByRole('link', { name: 'Hotels', exact: true }).click();
    await m.waitForFunction(() => location.hash === '#/hotels');
    await m.screenshot({ path: path.join(shots, 'demo-mobile.png') });
    await ctx.close();
    for (const width of [390, 768, 1440]) {
      const c = await browser.newContext({ viewport: { width, height: 900 } });
      const p = await c.newPage();
      for (const r of ['/', '/hotels', '/hotels/aurelia-winelands-estate', '/contact', '/about']) {
        await p.goto(route(r));
        await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(over <= 1, `horizontal overflow ${over}px at ${width}px on ${r}`);
      }
      await c.close();
    }
  });

  await step('No uncaught page errors', async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} demo end-to-end checks passed`);
process.exit(failed.length ? 1 : 0);
