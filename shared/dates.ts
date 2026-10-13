/**
 * Date helpers for stay dates. Stay dates are calendar dates ("YYYY-MM-DD"),
 * handled in UTC so a night never shifts because of a browser's time zone.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtcMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of nights between check-in and check-out (check-out exclusive). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((toUtcMs(checkOut) - toUtcMs(checkIn)) / DAY_MS);
}

/** Every night of the stay, as the date the night begins. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const n = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

/** Today's calendar date. `now` is injectable for tests. */
export function todayIso(now: Date = new Date()): string {
  // Use the local calendar date of the machine (guest's browser or server).
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatStayDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!isIsoDate(iso)) return iso;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...opts,
  });
}
