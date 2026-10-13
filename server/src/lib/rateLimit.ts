import { HttpError } from './http.js';

/**
 * Fixed-window, in-memory rate limiter. Adequate for a single process; a
 * multi-instance deployment should move this to a shared store (e.g. Redis).
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit: number, private windowMs: number) {}

  check(key: string, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return;
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpError(429, 'RATE_LIMITED', `Too many attempts. Please try again in ${retry} seconds.`, undefined, { retryAfter: retry });
    }
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }

  reset() { this.hits.clear(); }
}
