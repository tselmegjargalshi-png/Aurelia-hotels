import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDatabase, type DB } from '../src/db/connection.js';
import { migrate } from '../src/db/migrations.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { RateLimiter } from '../src/lib/rateLimit.js';
import { env as baseEnv } from '../src/env.js';
import { NoPaymentProvider, type PaymentProvider } from '../src/services/payments/provider.js';
import type { AppDeps } from '../src/routes/context.js';

export const TODAY = '2026-10-12';
export const ADMIN = { email: 'admin@aurelia.demo', password: 'Test-Admin-Pass-1' };
export const GUEST = { email: 'guest@aurelia.demo', password: 'Test-Guest-Pass-1' };

export interface TestApp { base: string; db: DB; server: Server; deps: AppDeps; close: () => Promise<void> }

export async function startApp(opts: { payments?: PaymentProvider; limiters?: Partial<AppDeps['limiters']> } = {}): Promise<TestApp> {
  const db = openDatabase(':memory:');
  migrate(db);
  await seed(db, { adminEmail: ADMIN.email, adminPassword: ADMIN.password, guestPassword: GUEST.password, today: TODAY });
  const deps: AppDeps = {
    db,
    env: { ...baseEnv, isProduction: false, demoShowResetLinks: true, appOrigin: 'http://localhost' },
    payments: opts.payments ?? new NoPaymentProvider(),
    today: () => TODAY,
    limiters: {
      auth: new RateLimiter(1000, 60_000), booking: new RateLimiter(1000, 60_000), forms: new RateLimiter(1000, 60_000),
      ...opts.limiters,
    },
  };
  const server = createServer(createApp(deps));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`, db, server, deps,
    close: () => new Promise((r) => server.close(() => { db.close(); r(); })),
  };
}

/** Tiny API client with its own cookie jar (one per simulated browser). */
export class Client {
  cookie = '';
  constructor(private base: string) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Aurelia-Client': 'web' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!;
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = text ? JSON.parse(text) : null;
    return { status: res.status, json };
  }
  get(p: string) { return this.req('GET', p); }
  post(p: string, b?: unknown) { return this.req('POST', p, b ?? {}); }
  patch(p: string, b: unknown) { return this.req('PATCH', p, b); }
  put(p: string, b: unknown) { return this.req('PUT', p, b); }

  async login(creds: { email: string; password: string }) {
    const r = await this.post('/api/auth/login', creds);
    if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.json)}`);
    return r.json.user;
  }
  async register(name: string, email: string, password = 'Booking-Pass-123') {
    const r = await this.post('/api/auth/register', { name, email, password });
    if (r.status !== 200) throw new Error(`register failed: ${JSON.stringify(r.json)}`);
    return r.json.user;
  }
}

let keySeq = 0;
export function idemKey() {
  keySeq += 1;
  return `test-key-${Date.now()}-${keySeq}-abcdef`;
}

export function roomId(db: DB, hotel: string, room: string): number {
  return (db.prepare('SELECT rt.id FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = ? AND rt.slug = ?').get(hotel, room) as { id: number }).id;
}

export const guestDetails = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+44 20 0000 0000' };
