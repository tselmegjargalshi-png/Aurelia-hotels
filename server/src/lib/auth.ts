import type { ServerResponse } from 'node:http';
import { get, run, type DB } from '../db/connection.js';
import { HttpError, parseCookies, serializeCookie, type Ctx } from './http.js';
import { randomToken, sha256 } from './crypto.js';
import type { PublicUser } from '../../../shared/types.js';

export const SESSION_COOKIE = 'aurelia_sid';

/**
 * Sessions: an opaque random token in an HttpOnly, SameSite=Lax cookie. Only
 * the SHA-256 of the token is stored, so a database leak does not leak sessions.
 */
export function createSession(db: DB, res: ServerResponse, userId: number, ttlDays: number, secure: boolean) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  run(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha256(token), userId, expires);
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge: ttlDays * 86_400, secure }));
}

export function clearSession(db: DB, ctx: Ctx, secure: boolean) {
  if (ctx.sessionTokenHash) run(db, 'DELETE FROM sessions WHERE token_hash = ?', ctx.sessionTokenHash);
  ctx.res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure }));
}

export function loadUser(db: DB, ctx: Ctx) {
  const token = parseCookies(ctx.req.headers.cookie)[SESSION_COOKIE];
  if (!token) return;
  const hash = sha256(token);
  const row = get<PublicUser & { expires_at: string }>(db,
    `SELECT u.id, u.email, u.name, u.phone, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, hash);
  if (!row) return;
  if (row.expires_at <= new Date().toISOString()) {
    run(db, 'DELETE FROM sessions WHERE token_hash = ?', hash);
    return;
  }
  ctx.sessionTokenHash = hash;
  ctx.user = { id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role };
}

export function requireUser(ctx: Ctx): PublicUser {
  if (!ctx.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return ctx.user;
}

/** Server-side authorization for every admin operation — the UI check is only cosmetic. */
export function requireAdmin(ctx: Ctx): PublicUser {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this area.');
  return user;
}
