import { z } from 'zod';
import { HttpError, parse, type Router } from '../lib/http.js';
import { get, run, writeTransaction } from '../db/connection.js';
import { clearSession, createSession, requireUser } from '../lib/auth.js';
import { getDummyHash, hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { isEmail, passwordProblem } from '../../../shared/validation.js';
import { getFavoriteHotels } from '../services/catalog.js';
import {
  createReservation, getReservationForUser, listReservationsForUser, requestCancellation,
} from '../services/reservations.js';
import type { PublicUser } from '../../../shared/types.js';
import type { AppDeps } from './context.js';

const email = z.string().trim().max(254).refine(isEmail, 'Enter a valid email address.');
const password = z.string().superRefine((v, ctx) => {
  const p = passwordProblem(v);
  if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p });
});
const name = z.string().trim().min(2, 'Please enter your name.').max(120);
const phone = z.string().trim().max(32).regex(/^[+()\d\s.-]*$/, 'Use digits, spaces and + ( ) - only.').nullable().optional();

const ReservationBody = z.object({
  roomTypeId: z.number().int().positive(),
  checkIn: z.string(), checkOut: z.string(),
  rooms: z.number().int(), adults: z.number().int(), children: z.number().int().default(0),
  guest: z.object({
    firstName: z.string().trim().min(1, 'First name is required.').max(80),
    lastName: z.string().trim().min(1, 'Last name is required.').max(80),
    email,
    phone,
  }),
  specialRequests: z.string().trim().max(1000, 'Please keep requests under 1,000 characters.').nullable().optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the booking terms and policies.' }) }),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, 'Invalid checkout session.'),
  expectedTotal: z.number().int().nonnegative(),
});

export function accountRoutes(r: Router, deps: AppDeps) {
  const { db, env } = deps;

  r.get('/api/auth/me', ({ user }) => ({ user }));

  r.post('/api/auth/register', async ({ body, ip, res }) => {
    deps.limiters.auth.check(`register:${ip}`);
    const input = parse(z.object({ name, email, password }), body);
    if (get(db, 'SELECT 1 FROM users WHERE email = ?', input.email)) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in instead.', { email: 'Already registered.' });
    }
    const hash = await hashPassword(input.password);
    const id = Number(run(db, 'INSERT INTO users (email, name, password_hash) VALUES (?,?,?)', input.email.toLowerCase(), input.name, hash).lastInsertRowid);
    createSession(db, res, id, env.sessionTtlDays, env.cookieSecure);
    return { user: get<PublicUser>(db, 'SELECT id, email, name, phone, role FROM users WHERE id = ?', id) };
  });

  r.post('/api/auth/login', async ({ body, ip, res }) => {
    const input = parse(z.object({ email: z.string().trim().max(254), password: z.string().max(200) }), body);
    deps.limiters.auth.check(`login:${ip}`);
    deps.limiters.auth.check(`login:${input.email.toLowerCase()}`);
    const user = get<PublicUser & { password_hash: string }>(db, 'SELECT id, email, name, phone, role, password_hash FROM users WHERE email = ?', input.email);
    // Always run a hash comparison so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(input.password, user?.password_hash ?? await getDummyHash());
    if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    createSession(db, res, user.id, env.sessionTtlDays, env.cookieSecure);
    const { password_hash: _omit, ...publicUser } = user;
    return { user: publicUser };
  });

  r.post('/api/auth/logout', (ctx) => {
    clearSession(db, ctx, env.cookieSecure);
    return { ok: true };
  });

  r.post('/api/auth/forgot-password', ({ body, ip }) => {
    deps.limiters.auth.check(`forgot:${ip}`);
    const input = parse(z.object({ email }), body);
    const user = get<{ id: number }>(db, 'SELECT id FROM users WHERE email = ?', input.email);
    let resetUrl: string | undefined;
    if (user) {
      const token = randomToken(32);
      run(db, 'INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)',
        sha256(token), user.id, new Date(Date.now() + 30 * 60_000).toISOString());
      if (env.demoShowResetLinks) resetUrl = `/reset-password?token=${token}`;
    }
    return {
      ok: true,
      message: 'If an account exists for that email, a reset link has been issued. It expires in 30 minutes.',
      // DEMO ONLY: no email service is connected, so in development the link is returned here.
      ...(env.demoShowResetLinks ? { demoResetUrl: resetUrl ?? null, demoNotice: 'Email delivery is not configured. In this demo the reset link is shown on screen instead.' } : {}),
    };
  });

  r.post('/api/auth/reset-password', async ({ body, ip }) => {
    deps.limiters.auth.check(`reset:${ip}`);
    const input = parse(z.object({ token: z.string().min(20).max(200), password }), body);
    const hash = await hashPassword(input.password);
    writeTransaction(db, () => {
      const row = get<{ id: number; user_id: number; expires_at: string; used_at: string | null }>(db,
        'SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?', sha256(input.token));
      if (!row || row.used_at || row.expires_at <= new Date().toISOString()) {
        throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired. Please request a new one.');
      }
      run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, row.user_id);
      run(db, `UPDATE password_resets SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, row.id);
      run(db, 'DELETE FROM sessions WHERE user_id = ?', row.user_id); // sign out everywhere
    });
    return { ok: true, message: 'Your password has been updated. Please sign in.' };
  });

  // ----- Profile -----
  r.patch('/api/account/profile', (ctx) => {
    const user = requireUser(ctx);
    const input = parse(z.object({ name, phone }), ctx.body);
    run(db, 'UPDATE users SET name = ?, phone = ? WHERE id = ?', input.name, input.phone || null, user.id);
    return { user: get<PublicUser>(db, 'SELECT id, email, name, phone, role FROM users WHERE id = ?', user.id) };
  });

  r.post('/api/account/password', async (ctx) => {
    const user = requireUser(ctx);
    deps.limiters.auth.check(`pwchange:${user.id}`);
    const input = parse(z.object({ currentPassword: z.string().max(200), newPassword: password }), ctx.body);
    const row = get<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id = ?', user.id)!;
    if (!(await verifyPassword(input.currentPassword, row.password_hash))) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Current password is incorrect.', { currentPassword: 'Current password is incorrect.' });
    }
    run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(input.newPassword), user.id);
    run(db, 'DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, ctx.sessionTokenHash ?? '');
    return { ok: true };
  });

  // ----- Favorites -----
  r.get('/api/account/favorites', (ctx) => {
    const user = requireUser(ctx);
    return { hotels: getFavoriteHotels(db, user.id) };
  });
  r.get('/api/account/favorite-ids', (ctx) => {
    if (!ctx.user) return { ids: [] };
    return { ids: (db.prepare('SELECT hotel_id FROM favorites WHERE user_id = ?').all(ctx.user.id) as { hotel_id: number }[]).map((x) => x.hotel_id) };
  });
  r.put('/api/account/favorites/:hotelId', (ctx) => {
    const user = requireUser(ctx);
    const hotelId = Number(ctx.params.hotelId);
    if (!get(db, 'SELECT 1 FROM hotels WHERE id = ? AND active = 1', hotelId)) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
    run(db, 'INSERT OR IGNORE INTO favorites (user_id, hotel_id) VALUES (?,?)', user.id, hotelId);
    return { ok: true };
  });
  r.delete('/api/account/favorites/:hotelId', (ctx) => {
    const user = requireUser(ctx);
    run(db, 'DELETE FROM favorites WHERE user_id = ? AND hotel_id = ?', user.id, Number(ctx.params.hotelId));
    return { ok: true };
  });

  // ----- Reservations (owner only) -----
  r.post('/api/reservations', async (ctx) => {
    const user = requireUser(ctx);
    deps.limiters.booking.check(`book:${user.id}`);
    const input = parse(ReservationBody, ctx.body);
    const result = await createReservation(db, deps.payments, user.id, input, deps.today());
    ctx.res.statusCode = result.replayed ? 200 : 201;
    return result;
  });

  r.get('/api/reservations', (ctx) => ({ reservations: listReservationsForUser(db, requireUser(ctx).id) }));

  r.get('/api/reservations/:code', (ctx) => ({ reservation: getReservationForUser(db, ctx.params.code!, requireUser(ctx).id) }));

  r.post('/api/reservations/:code/cancellation-request', (ctx) => {
    const user = requireUser(ctx);
    const { reason } = parse(z.object({ reason: z.string().trim().max(500).nullable().optional() }), ctx.body ?? {});
    return { reservation: requestCancellation(db, ctx.params.code!, user.id, reason ?? null, deps.today()) };
  });
}
