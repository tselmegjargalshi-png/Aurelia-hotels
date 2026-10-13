import type { DB } from '../db/connection.js';
import type { Env } from '../env.js';
import type { PaymentProvider } from '../services/payments/index.js';
import { RateLimiter } from '../lib/rateLimit.js';
import { HttpError } from '../lib/http.js';
import { validateStay } from '../../../shared/validation.js';
import type { StayParams } from '../services/catalog.js';

export interface AppDeps {
  db: DB;
  env: Env;
  payments: PaymentProvider;
  /** Injectable "today" (YYYY-MM-DD) for deterministic tests. */
  today: () => string;
  limiters: {
    auth: RateLimiter;
    booking: RateLimiter;
    forms: RateLimiter;
  };
}

export function defaultLimiters(): AppDeps['limiters'] {
  return {
    auth: new RateLimiter(10, 15 * 60_000),
    booking: new RateLimiter(20, 10 * 60_000),
    forms: new RateLimiter(8, 10 * 60_000),
  };
}

const int = (v: string | null, fallback: number) => (v === null || v === '' ? fallback : Number(v));

/** Parses stay parameters from a query string. Returns undefined when no dates were supplied. */
export function stayFromQuery(q: URLSearchParams, today: string): StayParams | undefined {
  const checkIn = q.get('checkIn');
  const checkOut = q.get('checkOut');
  if (!checkIn && !checkOut) return undefined;
  const stay = {
    checkIn: checkIn ?? '', checkOut: checkOut ?? '',
    adults: int(q.get('adults'), 2), children: int(q.get('children'), 0), rooms: int(q.get('rooms'), 1),
  };
  const errors = validateStay(stay, today);
  if (Object.keys(errors).length) throw new HttpError(400, 'INVALID_STAY', 'Please check your dates and guests.', errors as Record<string, string>);
  return stay;
}
