import { addDays, todayIso } from '../../../shared/dates.js';
import { validateStay, type StayQuery } from '../../../shared/validation.js';

/** Stay parameters carried in the URL between search, hotel and checkout pages. */
export interface StayState extends StayQuery { destination: string }

export function stayFromQuery(q: URLSearchParams): StayState {
  const num = (k: string, d: number) => { const v = q.get(k); const n = v === null ? d : Number(v); return Number.isFinite(n) ? n : d; };
  return {
    destination: q.get('destination') ?? '',
    checkIn: q.get('checkIn') ?? '',
    checkOut: q.get('checkOut') ?? '',
    adults: num('adults', 2),
    children: num('children', 0),
    rooms: num('rooms', 1),
  };
}

/** True when the query carries a complete, valid stay. */
export function hasValidStay(s: StayQuery): boolean {
  return !!s.checkIn && !!s.checkOut && Object.keys(validateStay(s)).length === 0;
}

export function stayParams(s: StayQuery) {
  return { checkIn: s.checkIn || undefined, checkOut: s.checkOut || undefined, adults: s.adults, children: s.children || undefined, rooms: s.rooms };
}

export function suggestedDates() {
  const t = todayIso();
  return { checkIn: addDays(t, 14), checkOut: addDays(t, 17) };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
