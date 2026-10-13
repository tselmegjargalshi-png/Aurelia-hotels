/**
 * In-browser implementation of the Aurelia HTTP API, used only by the demo build.
 *
 * It answers the same routes, with the same response shapes and the same rules, as
 * server/src/routes/*. Pricing, validation and occupancy come from shared/, which the
 * real server also uses. The difference is where state lives: here it is one browser's
 * memory/localStorage (see state.ts), so nothing is shared between visitors and nothing
 * is production-grade.
 */
import { z } from 'zod';
import { BOOKING_RULES, BRAND, CURRENCY, OFFERS, PRICING } from '../../../shared/config.js';
import { addDays, isIsoDate, nightsBetween, stayNights, todayIso } from '../../../shared/dates.js';
import { quoteStay, type PriceQuote } from '../../../shared/pricing.js';
import { fitsOccupancy, isEmail, passwordProblem, validateStay } from '../../../shared/validation.js';
import type {
  Amenity, AvailabilityStatus, Destination, HotelDetail, HotelSummary, PublicUser, ReservationDTO, ReservationStatus, RoomTypeDTO,
} from '../../../shared/types.js';
import manifest from '../../../assets/image-manifest.json';
import {
  AMENITY_LIST, DESTINATION_LIST, bookingCode, getState, hashPassword, nextId, randomToken, saveState, sha256, verifyPassword,
  type CancelRec, type DemoState, type HotelRec, type ResRec, type RoomRec, type UserRec,
} from './state.js';

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>, public extra?: Record<string, unknown>) {
    super(message);
  }
}

interface Ctx { s: DemoState; params: Record<string, string>; query: URLSearchParams; body: unknown; user: PublicUser | null }
type Handler = (c: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];
function add(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/\/:([a-zA-Z]+)/g, (_, k: string) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ method, pattern, keys, handler });
}
const R = {
  get: (p: string, h: Handler) => add('GET', p, h),
  post: (p: string, h: Handler) => add('POST', p, h),
  put: (p: string, h: Handler) => add('PUT', p, h),
  patch: (p: string, h: Handler) => add('PATCH', p, h),
  delete: (p: string, h: Handler) => add('DELETE', p, h),
};

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
  throw new HttpError(400, 'VALIDATION_ERROR', 'Some details need attention.', fields);
}

const nowIso = () => new Date().toISOString();
const pub = (u: UserRec): PublicUser => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role });
const requireUser = (c: Ctx): PublicUser => {
  if (!c.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return c.user;
};
const requireAdmin = (c: Ctx): PublicUser => {
  const u = requireUser(c);
  if (u.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this area.');
  return u;
};
const audit = (s: DemoState, actorId: number | null, action: string, entity: string, entityId: number | null, details?: unknown) =>
  s.audit.push({ actorId, action, entity, entityId, details: details === undefined ? null : JSON.stringify(details), createdAt: nowIso() });

// ---------------------------------------------------------------- inventory
const holds = (r: ResRec) => r.status === 'confirmed' || r.status === 'checked_in';

interface Night { night: string; capacity: number; booked: number; free: number }
function nightly(s: DemoState, room: RoomRec, checkIn: string, checkOut: string): Night[] {
  return stayNights(checkIn, checkOut).map((night) => {
    const capacity = s.overrides.find((o) => o.roomId === room.id && o.night === night)?.units ?? room.inventory;
    const booked = s.reservations
      .filter((r) => holds(r) && r.roomId === room.id && r.checkIn <= night && night < r.checkOut)
      .reduce((n, r) => n + r.rooms, 0);
    return { night, capacity, booked, free: Math.max(0, capacity - booked) };
  });
}
const unitsFree = (s: DemoState, room: RoomRec, checkIn: string, checkOut: string) => {
  const n = nightly(s, room, checkIn, checkOut);
  return n.length ? Math.min(...n.map((x) => x.free)) : 0;
};
function statusFor(units: number, roomsRequested: number, fits: boolean): AvailabilityStatus {
  if (!fits) return 'unsuitable';
  if (units < roomsRequested || units === 0) return 'sold_out';
  if (units - roomsRequested <= 1) return 'limited';
  return 'available';
}

// ---------------------------------------------------------------- catalogue
interface StayParams { checkIn: string; checkOut: string; adults: number; children: number; rooms: number }
const int = (v: string | null, fallback: number) => (v === null || v === '' ? fallback : Number(v));
function stayFromQuery(q: URLSearchParams, today: string): StayParams | undefined {
  const checkIn = q.get('checkIn'); const checkOut = q.get('checkOut');
  if (!checkIn && !checkOut) return undefined;
  const stay = { checkIn: checkIn ?? '', checkOut: checkOut ?? '', adults: int(q.get('adults'), 2), children: int(q.get('children'), 0), rooms: int(q.get('rooms'), 1) };
  const errors = validateStay(stay, today);
  if (Object.keys(errors).length) throw new HttpError(400, 'INVALID_STAY', 'Please check your dates and guests.', errors as Record<string, string>);
  return stay;
}

const amenityLabel = (code: string): Amenity => ({ code, label: AMENITY_LIST.find((a) => a.code === code)?.label ?? code });
const amenityOrder = (code: string) => AMENITY_LIST.findIndex((a) => a.code === code);

function roomDTO(s: DemoState, r: RoomRec, stay?: StayParams): RoomTypeDTO {
  let units: number | null = null; let availability: AvailabilityStatus = 'unknown';
  if (stay) {
    units = unitsFree(s, r, stay.checkIn, stay.checkOut);
    availability = statusFor(units, stay.rooms, fitsOccupancy({ maxAdults: r.maxAdults, maxOccupancy: r.maxOccupancy }, stay.adults, stay.children, stay.rooms));
  }
  return {
    id: r.id, hotelId: r.hotelId, slug: r.slug, name: r.name, description: r.description, maxAdults: r.maxAdults,
    maxOccupancy: r.maxOccupancy, bed: r.bed, sizeSqm: r.sizeSqm, nightlyRate: r.nightlyRate, inventory: r.inventory,
    mealPlan: r.mealPlan, refundable: r.refundable, cancellationTerms: r.cancellationTerms, amenities: [...r.amenities],
    images: r.images.map((i) => ({ ...i })), active: r.active, unitsAvailable: units, availability,
  };
}

function summary(h: HotelRec, rooms: RoomTypeDTO[], stay?: StayParams): HotelSummary {
  const d = DESTINATION_LIST.find((x) => x.slug === h.destination)!;
  const fromPrice = rooms.length ? Math.min(...rooms.map((r) => r.nightlyRate)) : 0;
  let availability: AvailabilityStatus = 'unknown'; let availableFromPrice: number | null = null;
  if (stay) {
    const bookable = rooms.filter((r) => r.availability === 'available' || r.availability === 'limited');
    if (bookable.length) {
      availableFromPrice = Math.min(...bookable.map((r) => r.nightlyRate));
      availability = bookable.some((r) => r.availability === 'available') ? 'available' : 'limited';
    } else availability = rooms.some((r) => r.availability === 'sold_out') ? 'sold_out' : 'unsuitable';
  }
  return {
    id: h.id, slug: h.slug, name: h.name, tagline: h.tagline, destination: { slug: d.slug, name: d.name, country: d.country },
    propertyType: h.propertyType, stars: h.stars, demoRating: h.demoRating, image: h.images[0] ? { ...h.images[0] } : { src: '', alt: h.name },
    amenities: [...h.amenities].sort((a, b) => amenityOrder(a) - amenityOrder(b)).map(amenityLabel),
    breakfastIncluded: h.breakfastIncluded, freeCancellation: h.freeCancellation, fromPrice, availability, availableFromPrice, featured: h.featured,
  };
}
const activeRooms = (h: HotelRec) => [...h.rooms].filter((r) => r.active).sort((a, b) => a.nightlyRate - b.nightlyRate);

interface Filters {
  destination?: string; stay?: StayParams; minPrice?: number; maxPrice?: number; stars?: number[]; types?: string[]; amenities?: string[];
  breakfast?: boolean; freeCancellation?: boolean; availableOnly?: boolean; sort?: 'recommended' | 'price_asc' | 'price_desc' | 'rating';
}
function searchHotels(s: DemoState, f: Filters): HotelSummary[] {
  let list = s.hotels.filter((h) => h.active)
    .filter((h) => !f.destination || h.destination === f.destination)
    .filter((h) => !f.stars?.length || f.stars.includes(h.stars))
    .filter((h) => !f.types?.length || f.types.includes(h.propertyType))
    .filter((h) => !f.breakfast || h.breakfastIncluded)
    .filter((h) => !f.freeCancellation || h.freeCancellation)
    .filter((h) => !f.amenities?.length || f.amenities.every((a) => h.amenities.includes(a)))
    .map((h) => summary(h, activeRooms(h).map((r) => roomDTO(s, r, f.stay)), f.stay))
    .filter((h) => activeRooms(s.hotels.find((x) => x.id === h.id)!).length > 0);
  const price = (h: HotelSummary) => h.availableFromPrice ?? h.fromPrice;
  if (f.minPrice !== undefined) list = list.filter((h) => price(h) >= f.minPrice!);
  if (f.maxPrice !== undefined) list = list.filter((h) => price(h) <= f.maxPrice!);
  if (f.stay && f.availableOnly) list = list.filter((h) => h.availability === 'available' || h.availability === 'limited');
  const rank = (h: HotelSummary) => (h.availability === 'sold_out' || h.availability === 'unsuitable' ? 1 : 0);
  const sorters = {
    recommended: (a: HotelSummary, b: HotelSummary) => rank(a) - rank(b) || Number(b.featured) - Number(a.featured) || b.demoRating - a.demoRating,
    price_asc: (a: HotelSummary, b: HotelSummary) => rank(a) - rank(b) || price(a) - price(b),
    price_desc: (a: HotelSummary, b: HotelSummary) => rank(a) - rank(b) || price(b) - price(a),
    rating: (a: HotelSummary, b: HotelSummary) => rank(a) - rank(b) || b.demoRating - a.demoRating || b.stars - a.stars,
  };
  return list.sort(sorters[f.sort ?? 'recommended']);
}

function hotelDetail(s: DemoState, slug: string, stay?: StayParams, includeInactive = false): HotelDetail | null {
  const h = s.hotels.find((x) => x.slug === slug && (includeInactive || x.active));
  if (!h) return null;
  const rooms = (includeInactive ? [...h.rooms].sort((a, b) => a.nightlyRate - b.nightlyRate) : activeRooms(h)).map((r) => roomDTO(s, r, stay));
  return {
    ...summary(h, rooms.filter((r) => r.active), stay),
    overview: h.overview, description: h.description, address: h.address, latitude: h.latitude, longitude: h.longitude,
    checkInTime: h.checkInTime, checkOutTime: h.checkOutTime, cancellationPolicy: h.cancellationPolicy,
    houseRules: [...h.houseRules], nearby: h.nearby.map((n) => ({ ...n })), images: h.images.map((i) => ({ ...i })), rooms,
  };
}

// ---------------------------------------------------------------- reservations
function findRoom(s: DemoState, roomId: number): { h: HotelRec; r: RoomRec } | null {
  for (const h of s.hotels) { const r = h.rooms.find((x) => x.id === roomId); if (r) return { h, r }; }
  return null;
}

interface QuoteRequest { roomTypeId: number; checkIn: string; checkOut: string; rooms: number; adults: number; children: number }
function quote(s: DemoState, q: QuoteRequest, today: string): { quote: PriceQuote; unitsAvailable: number; h: HotelRec; r: RoomRec } {
  const errors = validateStay(q, today);
  if (Object.keys(errors).length) throw new HttpError(400, 'INVALID_STAY', 'Please check your dates and guests.', errors as Record<string, string>);
  const found = findRoom(s, q.roomTypeId);
  if (!found || !found.r.active || !found.h.active) throw new HttpError(404, 'ROOM_NOT_FOUND', 'This room type is not available for booking.');
  const { h, r } = found;
  if (!fitsOccupancy({ maxAdults: r.maxAdults, maxOccupancy: r.maxOccupancy }, q.adults, q.children, q.rooms)) {
    throw new HttpError(422, 'OCCUPANCY_EXCEEDED', `${r.name} sleeps up to ${r.maxOccupancy} guests (${r.maxAdults} adults) per room. Add rooms or choose a larger room type.`);
  }
  return { quote: quoteStay({ nightlyRate: r.nightlyRate, checkIn: q.checkIn, checkOut: q.checkOut, rooms: q.rooms, bookedOn: today }), unitsAvailable: unitsFree(s, r, q.checkIn, q.checkOut), h, r };
}

function toDTO(s: DemoState, r: ResRec, includeUserId = false): ReservationDTO {
  const h = s.hotels.find((x) => x.id === r.hotelId)!;
  const room = h.rooms.find((x) => x.id === r.roomId)!;
  const d = DESTINATION_LIST.find((x) => x.slug === h.destination)!;
  const offer = OFFERS.find((o) => o.code === r.discountCode);
  const cr = [...s.cancellations].filter((c) => c.reservationId === r.id).sort((a, b) => b.id - a.id)[0];
  return {
    id: r.id, code: r.code, status: r.status, paymentStatus: r.paymentStatus, paymentMode: 'test',
    hotel: { id: h.id, slug: h.slug, name: h.name, destination: `${d.name}, ${d.country}`, image: h.images[0] ? { ...h.images[0] } : { src: '', alt: h.name }, checkInTime: h.checkInTime, checkOutTime: h.checkOutTime },
    room: { id: room.id, slug: room.slug, name: room.name, refundable: room.refundable, cancellationTerms: room.cancellationTerms, mealPlan: room.mealPlan },
    checkIn: r.checkIn, checkOut: r.checkOut, rooms: r.rooms, adults: r.adults, children: r.children,
    price: {
      currency: CURRENCY.code, nights: nightsBetween(r.checkIn, r.checkOut), rooms: r.rooms, nightlyRate: r.nightlyRate, roomSubtotal: r.roomSubtotal,
      discount: offer ? { code: offer.code, title: offer.title, percentOff: offer.percentOff, amount: r.discountAmount } : null,
      discountedSubtotal: r.roomSubtotal - r.discountAmount, taxes: r.taxes, fees: r.fees, total: r.total,
    },
    guest: { ...r.guest }, specialRequests: r.specialRequests, createdAt: r.createdAt,
    cancellationRequest: cr ? { id: cr.id, status: cr.status, reason: cr.reason, createdAt: cr.createdAt } : null,
    ...(includeUserId ? { userId: r.userId } : {}),
  };
}

const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending_payment: ['cancelled'], confirmed: ['checked_in', 'cancelled', 'no_show'], checked_in: ['checked_out'],
  checked_out: [], cancelled: [], no_show: [], expired: [],
};

// ---------------------------------------------------------------- validation schemas (same rules as the server)
const email = z.string().trim().max(254).refine(isEmail, 'Enter a valid email address.');
const password = z.string().superRefine((v, ctx) => {
  const p = passwordProblem(v);
  if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p });
});
const name = z.string().trim().min(2, 'Please enter your name.').max(120);
const phone = z.string().trim().max(32).regex(/^[+()\d\s.-]*$/, 'Use digits, spaces and + ( ) - only.').nullable().optional();
const QuoteBody = z.object({
  roomTypeId: z.number().int().positive(), checkIn: z.string(), checkOut: z.string(),
  rooms: z.number().int(), adults: z.number().int(), children: z.number().int().default(0),
});
const ReservationBody = QuoteBody.extend({
  guest: z.object({
    firstName: z.string().trim().min(1, 'First name is required.').max(80),
    lastName: z.string().trim().min(1, 'Last name is required.').max(80),
    email, phone,
  }),
  specialRequests: z.string().trim().max(1000, 'Please keep requests under 1,000 characters.').nullable().optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the booking terms and policies.' }) }),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, 'Invalid checkout session.'),
  expectedTotal: z.number().int().nonnegative(),
});
const ContactBody = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().refine(isEmail, 'Enter a valid email address.'),
  subject: z.string().trim().min(3, 'Please add a subject.').max(160),
  message: z.string().trim().min(20, 'Please write at least 20 characters.').max(4000, 'Please keep your message under 4,000 characters.'),
  website: z.string().max(0, 'Invalid submission.').optional(),
});

// ---------------------------------------------------------------- public routes
R.get('/api/health', () => ({ ok: true }));
R.get('/api/config', () => ({
  brand: BRAND, currency: CURRENCY, pricing: PRICING, offers: OFFERS, bookingRules: BOOKING_RULES, paymentMode: 'test', paymentProvider: 'none',
}));
R.get('/api/destinations', ({ s }) => ({
  destinations: DESTINATION_LIST.map((d, i): Destination => ({
    id: i + 1, slug: d.slug, name: d.name, country: d.country, summary: d.summary, image: d.image,
    hotelCount: s.hotels.filter((h) => h.active && h.destination === d.slug).length,
  })),
}));
R.get('/api/amenities', () => ({ amenities: [...AMENITY_LIST].sort((a, b) => a.label.localeCompare(b.label)) }));

const list = (q: URLSearchParams, key: string) => q.getAll(key).flatMap((v) => v.split(',')).map((x) => x.trim()).filter(Boolean);
R.get('/api/hotels', ({ s, query }) => {
  const stay = stayFromQuery(query, todayIso());
  const sort = query.get('sort');
  const dollars = (k: string) => { const v = query.get(k); return v === null || v === '' ? undefined : Math.round(Number(v) * 100); };
  const filters: Filters = {
    destination: query.get('destination') || undefined, stay, minPrice: dollars('minPrice'), maxPrice: dollars('maxPrice'),
    stars: list(query, 'stars').map(Number).filter((n) => n >= 1 && n <= 5), types: list(query, 'type'), amenities: list(query, 'amenities'),
    breakfast: query.get('breakfast') === '1', freeCancellation: query.get('freeCancellation') === '1', availableOnly: query.get('availableOnly') === '1',
    sort: (['recommended', 'price_asc', 'price_desc', 'rating'] as const).find((x) => x === sort) ?? 'recommended',
  };
  for (const k of ['minPrice', 'maxPrice'] as const) {
    const v = filters[k];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new HttpError(400, 'INVALID_FILTER', 'Price filters must be positive numbers.');
  }
  return { hotels: searchHotels(s, filters), propertyTypes: [...new Set(searchHotels(s, {}).map((h) => h.propertyType))].sort(), stay: stay ?? null };
});
R.get('/api/hotels/:slug', ({ s, params, query }) => {
  const hotel = hotelDetail(s, params.slug!, stayFromQuery(query, todayIso()));
  if (!hotel) throw new HttpError(404, 'NOT_FOUND', 'We couldn’t find that hotel.');
  return { hotel };
});
R.post('/api/quote', ({ s, body }) => {
  const input = parse(QuoteBody, body);
  const { quote: price, unitsAvailable } = quote(s, input, todayIso());
  return { quote: price, unitsAvailable, available: unitsAvailable >= input.rooms };
});
R.post('/api/contact', ({ s, body }) => {
  const input = parse(ContactBody, body);
  s.messages.push({ id: nextId(s), name: input.name, email: input.email.toLowerCase(), subject: input.subject, message: input.message, createdAt: nowIso() });
  saveState();
  return { ok: true, delivery: 'stored', message: 'Your message was saved in this demo, on this device only. No email is sent and nobody receives it.' };
});
R.post('/api/newsletter', ({ s, body }) => {
  const { email: addr } = parse(z.object({ email: z.string().trim().refine(isEmail, 'Enter a valid email address.') }), body);
  if (!s.newsletter.includes(addr.toLowerCase())) s.newsletter.push(addr.toLowerCase());
  saveState();
  return { ok: true, message: 'Thank you. Your address is saved in this demo, on this device only. No emails are sent.' };
});

// ---------------------------------------------------------------- account routes
R.get('/api/auth/me', ({ user }) => ({ user }));
R.post('/api/auth/register', async ({ s, body }) => {
  const input = parse(z.object({ name, email, password }), body);
  if (s.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in instead.', { email: 'Already registered.' });
  }
  const u: UserRec = { id: nextId(s), email: input.email.toLowerCase(), name: input.name, phone: null, role: 'guest', hash: await hashPassword(input.password), createdAt: nowIso() };
  s.users.push(u); s.sessionUserId = u.id; saveState();
  return { user: pub(u) };
});
R.post('/api/auth/login', async ({ s, body }) => {
  const input = parse(z.object({ email: z.string().trim().max(254), password: z.string().max(200) }), body);
  const u = s.users.find((x) => x.email.toLowerCase() === input.email.toLowerCase());
  const ok = u ? await verifyPassword(input.password, u.hash) : false;
  if (!u || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  s.sessionUserId = u.id; saveState();
  return { user: pub(u) };
});
R.post('/api/auth/logout', ({ s }) => { s.sessionUserId = null; saveState(); return { ok: true }; });
R.post('/api/auth/forgot-password', async ({ s, body }) => {
  const input = parse(z.object({ email }), body);
  const u = s.users.find((x) => x.email.toLowerCase() === input.email.toLowerCase());
  let resetUrl: string | null = null;
  if (u) {
    const token = randomToken(32);
    s.resets.push({ tokenHash: await sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), used: false });
    resetUrl = `/reset-password?token=${token}`;
    saveState();
  }
  return {
    ok: true, message: 'If an account exists for that email, a reset link has been issued. It expires in 30 minutes.',
    demoResetUrl: resetUrl, demoNotice: 'Email delivery is not configured. In this demo the reset link is shown on screen instead.',
  };
});
R.post('/api/auth/reset-password', async ({ s, body }) => {
  const input = parse(z.object({ token: z.string().min(20).max(200), password }), body);
  const hash = await sha256(input.token);
  const row = s.resets.find((r) => r.tokenHash === hash);
  if (!row || row.used || row.expiresAt <= nowIso()) throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired. Please request a new one.');
  const u = s.users.find((x) => x.id === row.userId)!;
  u.hash = await hashPassword(input.password);
  row.used = true;
  if (s.sessionUserId === u.id) s.sessionUserId = null;
  saveState();
  return { ok: true, message: 'Your password has been updated. Please sign in.' };
});
R.patch('/api/account/profile', (c) => {
  const me = requireUser(c);
  const input = parse(z.object({ name, phone }), c.body);
  const u = c.s.users.find((x) => x.id === me.id)!;
  u.name = input.name; u.phone = input.phone || null; saveState();
  return { user: pub(u) };
});
R.post('/api/account/password', async (c) => {
  const me = requireUser(c);
  const input = parse(z.object({ currentPassword: z.string().max(200), newPassword: password }), c.body);
  const u = c.s.users.find((x) => x.id === me.id)!;
  if (!(await verifyPassword(input.currentPassword, u.hash))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Current password is incorrect.', { currentPassword: 'Current password is incorrect.' });
  }
  u.hash = await hashPassword(input.newPassword); saveState();
  return { ok: true };
});
R.get('/api/account/favorites', (c) => {
  const me = requireUser(c);
  const ids = new Set(c.s.favorites.filter((f) => f.userId === me.id).map((f) => f.hotelId));
  return { hotels: searchHotels(c.s, {}).filter((h) => ids.has(h.id)) };
});
R.get('/api/account/favorite-ids', (c) => ({ ids: c.user ? c.s.favorites.filter((f) => f.userId === c.user!.id).map((f) => f.hotelId) : [] }));
R.put('/api/account/favorites/:hotelId', (c) => {
  const me = requireUser(c);
  const hotelId = Number(c.params.hotelId);
  if (!c.s.hotels.some((h) => h.id === hotelId && h.active)) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
  if (!c.s.favorites.some((f) => f.userId === me.id && f.hotelId === hotelId)) c.s.favorites.push({ userId: me.id, hotelId });
  saveState();
  return { ok: true };
});
R.delete('/api/account/favorites/:hotelId', (c) => {
  const me = requireUser(c);
  c.s.favorites = c.s.favorites.filter((f) => !(f.userId === me.id && f.hotelId === Number(c.params.hotelId)));
  saveState();
  return { ok: true };
});

// Reservations. Everything is re-derived from state here, never taken from the browser: price,
// availability across every night, and occupancy. The idempotency key makes a repeat submit return the same booking.
R.post('/api/reservations', (c) => {
  const me = requireUser(c);
  const input = parse(ReservationBody, c.body);
  const s = c.s; const today = todayIso();
  const existing = s.reservations.find((r) => r.userId === me.id && r.idempotencyKey === input.idempotencyKey);
  if (existing) {
    const same = existing.roomId === input.roomTypeId && existing.checkIn === input.checkIn && existing.checkOut === input.checkOut && existing.rooms === input.rooms;
    if (!same) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout was already used for a different reservation. Please start again.');
    return { reservation: toDTO(s, existing), replayed: true, payment: null, __status: 200 };
  }
  const { quote: price, unitsAvailable: units, h, r } = quote(s, input, today);
  if (units < input.rooms) {
    throw new HttpError(409, 'NOT_AVAILABLE',
      units === 0 ? 'Sorry — this room type is no longer available for every night of your stay.' : `Only ${units} room${units === 1 ? '' : 's'} of this type remain for every night of your stay.`,
      undefined, { unitsAvailable: units });
  }
  if (price.total !== input.expectedTotal) {
    throw new HttpError(409, 'PRICE_CHANGED', 'The price for this stay has changed. Please review the updated total.', undefined, { quote: price });
  }
  let code = bookingCode();
  while (s.reservations.some((x) => x.code === code)) code = bookingCode();
  const at = nowIso();
  const rec: ResRec = {
    id: nextId(s), code, userId: me.id, hotelId: h.id, roomId: r.id, checkIn: input.checkIn, checkOut: input.checkOut, rooms: input.rooms,
    adults: input.adults, children: input.children, nightlyRate: price.nightlyRate, roomSubtotal: price.roomSubtotal,
    discountCode: price.discount?.code ?? null, discountAmount: price.discount?.amount ?? 0, taxes: price.taxes, fees: price.fees, total: price.total,
    // Test mode: confirmed as a demo booking, and payment is never marked as taken.
    status: 'confirmed', paymentStatus: 'not_collected',
    guest: { firstName: input.guest.firstName.trim(), lastName: input.guest.lastName.trim(), email: input.guest.email.trim().toLowerCase(), phone: input.guest.phone?.trim() || null },
    specialRequests: input.specialRequests?.trim() || null, idempotencyKey: input.idempotencyKey, createdAt: at, updatedAt: at,
  };
  s.reservations.push(rec);
  saveState();
  return { reservation: toDTO(s, rec), replayed: false, payment: null, __status: 201 };
});
const ownReservation = (c: Ctx, code: string) => {
  const me = requireUser(c);
  const r = c.s.reservations.find((x) => x.code === code && x.userId === me.id);
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Reservation not found.');
  return r;
};
R.get('/api/reservations', (c) => {
  const me = requireUser(c);
  return { reservations: c.s.reservations.filter((r) => r.userId === me.id).sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)).map((r) => toDTO(c.s, r)) };
});
R.get('/api/reservations/:code', (c) => ({ reservation: toDTO(c.s, ownReservation(c, c.params.code!)) }));
R.post('/api/reservations/:code/cancellation-request', (c) => {
  const r = ownReservation(c, c.params.code!);
  const { reason } = parse(z.object({ reason: z.string().trim().max(500).nullable().optional() }), c.body ?? {});
  const dto = toDTO(c.s, r);
  if (!['confirmed', 'pending_payment'].includes(r.status)) throw new HttpError(409, 'NOT_CANCELLABLE', 'This reservation can no longer be cancelled online.');
  if (r.checkIn <= todayIso()) throw new HttpError(409, 'NOT_CANCELLABLE', 'Cancellations on or after the arrival date must be arranged with the hotel directly.');
  if (dto.cancellationRequest?.status === 'pending') throw new HttpError(409, 'ALREADY_REQUESTED', 'A cancellation request is already being reviewed.');
  c.s.cancellations.push({ id: nextId(c.s), reservationId: r.id, userId: r.userId, reason: reason?.trim() || null, status: 'pending', adminNote: null, createdAt: nowIso(), resolvedAt: null });
  saveState();
  return { reservation: toDTO(c.s, r) };
});

// ---------------------------------------------------------------- admin routes
const STATUSES = ['pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'expired'] as const;
const slugRe = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour).');
const text = (min: number, max: number, msg = 'This field is required.') => z.string().trim().min(min, msg).max(max);
const HotelPatch = z.object({
  name: text(3, 120), tagline: text(3, 160), propertyType: text(3, 60), stars: z.number().int().min(1).max(5),
  overview: text(20, 600), description: text(20, 3000), address: text(5, 240), checkInTime: time, checkOutTime: time, cancellationPolicy: text(10, 600),
  houseRules: z.array(text(2, 200)).max(20), nearby: z.array(z.object({ name: text(2, 120), distance: text(1, 40) })).max(20),
  breakfastIncluded: z.boolean(), freeCancellation: z.boolean(), featured: z.boolean(), active: z.boolean(),
}).partial();
const HotelCreate = z.object({
  slug: slugRe, destination: z.string().min(1), name: text(3, 120), tagline: text(3, 160), propertyType: text(3, 60), stars: z.number().int().min(1).max(5),
  overview: text(20, 600), description: text(20, 3000), address: text(5, 240), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
});
const RoomFields = z.object({
  name: text(3, 120), description: text(10, 1000), maxAdults: z.number().int().min(1).max(12), maxOccupancy: z.number().int().min(1).max(16),
  bed: text(3, 120), sizeSqm: z.number().int().min(5).max(2000), nightlyRate: z.number().int().min(1000, 'Rate must be at least $10.').max(10_000_000),
  inventory: z.number().int().min(0).max(500), mealPlan: text(3, 120), refundable: z.boolean(), cancellationTerms: text(10, 600),
  amenities: z.array(text(2, 60)).max(30), active: z.boolean(),
});
const imageLibrary = () => (manifest as { name: string; status: string }[]).filter((m) => m.status === 'ok').map((m) => m.name).sort();

R.get('/api/admin/overview', (c) => {
  requireAdmin(c);
  const s = c.s; const t = todayIso(); const in7 = addDays(t, 7); const horizon = 14; const end = addDays(t, horizon);
  const n = (pred: (r: ResRec) => boolean) => s.reservations.filter(pred).length;
  const totals = {
    reservations: n((r) => r.status !== 'expired'),
    active: n((r) => ['confirmed', 'checked_in', 'pending_payment'].includes(r.status)),
    arrivalsToday: n((r) => r.status === 'confirmed' && r.checkIn === t),
    upcomingCheckIns: n((r) => r.status === 'confirmed' && r.checkIn >= t && r.checkIn < in7),
    upcomingCheckOuts: n((r) => ['confirmed', 'checked_in'].includes(r.status) && r.checkOut >= t && r.checkOut < in7),
    inHouse: n((r) => r.status === 'checked_in'),
    pendingCancellations: s.cancellations.filter((x) => x.status === 'pending').length,
    unreadMessages: s.messages.length,
  };
  const sum = (pred: (r: ResRec) => boolean) => s.reservations.filter(pred).reduce((a, r) => a + r.total, 0);
  const revenue = {
    booked: sum((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status)),
    realised: sum((r) => r.status === 'checked_out'),
    paid: sum((r) => r.paymentStatus === 'paid'),
  };
  const occupancy = [...s.hotels].filter((h) => h.active).sort((a, b) => a.name.localeCompare(b.name)).map((h) => {
    let cap = 0; let booked = 0;
    for (const r of h.rooms.filter((x) => x.active)) for (const nt of nightly(s, r, t, end)) { cap += nt.capacity; booked += Math.min(nt.booked, nt.capacity); }
    return { hotelId: h.id, hotel: h.name, roomNights: cap, booked, rate: cap ? booked / cap : 0 };
  });
  const recent = [...s.reservations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8).map((r) => toDTO(s, r, true));
  return { today: t, horizonNights: horizon, totals, revenue, occupancy, recent, paymentMode: 'test' };
});

R.get('/api/admin/hotels', (c) => {
  requireAdmin(c);
  const hotels = [...c.s.hotels].sort((a, b) => a.name.localeCompare(b.name)).map((h) => ({
    id: h.id, slug: h.slug, name: h.name, propertyType: h.propertyType, stars: h.stars, active: h.active ? 1 : 0, featured: h.featured ? 1 : 0,
    destination: DESTINATION_LIST.find((d) => d.slug === h.destination)!.name, roomTypes: h.rooms.length,
    units: h.rooms.filter((r) => r.active).reduce((a, r) => a + r.inventory, 0), image: h.images[0]?.src ?? null,
  }));
  const destinations = [...DESTINATION_LIST].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ slug: d.slug, name: d.name, country: d.country }));
  return { hotels, destinations };
});
R.get('/api/admin/hotels/:id', (c) => {
  requireAdmin(c);
  const h = c.s.hotels.find((x) => x.id === Number(c.params.id));
  if (!h) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
  return { hotel: { ...hotelDetail(c.s, h.slug, undefined, true)!, active: h.active }, allAmenities: [...AMENITY_LIST].sort((a, b) => a.label.localeCompare(b.label)), imageLibrary: imageLibrary() };
});
R.post('/api/admin/hotels', (c) => {
  const admin = requireAdmin(c);
  const input = parse(HotelCreate, c.body);
  if (!DESTINATION_LIST.some((d) => d.slug === input.destination)) throw new HttpError(400, 'VALIDATION_ERROR', 'Unknown destination.', { destination: 'Choose a destination.' });
  if (c.s.hotels.some((h) => h.slug === input.slug)) throw new HttpError(409, 'VALIDATION_ERROR', 'That URL slug is already used.', { slug: 'Already used.' });
  const id = nextId(c.s);
  c.s.hotels.push({
    id, slug: input.slug, destination: input.destination, name: input.name, tagline: input.tagline, propertyType: input.propertyType, stars: input.stars,
    demoRating: 0, overview: input.overview, description: input.description, address: input.address, latitude: input.latitude, longitude: input.longitude,
    checkInTime: '15:00', checkOutTime: '11:00', cancellationPolicy: 'Cancellation terms are shown on each room rate.', houseRules: [], nearby: [],
    breakfastIncluded: false, freeCancellation: false, featured: false, active: false, amenities: [], images: [], rooms: [],
  });
  audit(c.s, admin.id, 'hotel.create', 'hotel', id, { slug: input.slug }); saveState();
  return { id };
});
R.patch('/api/admin/hotels/:id', (c) => {
  const admin = requireAdmin(c);
  const h = c.s.hotels.find((x) => x.id === Number(c.params.id));
  if (!h) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
  const input = parse(HotelPatch, c.body);
  if (input.active === true && (!h.rooms.some((r) => r.active) || !h.images.length)) {
    throw new HttpError(409, 'INCOMPLETE', 'Add at least one active room type and one image before publishing.');
  }
  Object.assign(h, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  audit(c.s, admin.id, 'hotel.update', 'hotel', h.id, Object.keys(input)); saveState();
  return { ok: true };
});
R.put('/api/admin/hotels/:id/amenities', (c) => {
  const admin = requireAdmin(c);
  const h = c.s.hotels.find((x) => x.id === Number(c.params.id));
  if (!h) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
  const { codes } = parse(z.object({ codes: z.array(z.string()).max(40) }), c.body);
  for (const code of codes) if (!AMENITY_LIST.some((a) => a.code === code)) throw new HttpError(400, 'VALIDATION_ERROR', `Unknown amenity: ${code}`);
  h.amenities = [...codes]; audit(c.s, admin.id, 'hotel.amenities', 'hotel', h.id, codes); saveState();
  return { ok: true };
});
R.put('/api/admin/hotels/:id/images', (c) => {
  const admin = requireAdmin(c);
  const h = c.s.hotels.find((x) => x.id === Number(c.params.id));
  if (!h) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
  const { images } = parse(z.object({
    images: z.array(z.object({ src: z.string(), alt: text(10, 300, 'Write descriptive alt text (10+ characters).') })).min(1, 'Keep at least one image.').max(20),
  }), c.body);
  const lib = new Set(imageLibrary());
  for (const img of images) if (!lib.has(img.src)) throw new HttpError(400, 'VALIDATION_ERROR', `Image “${img.src}” is not in the local image library.`);
  h.images = images.map((i) => ({ id: nextId(c.s), src: i.src, alt: i.alt })); audit(c.s, admin.id, 'hotel.images', 'hotel', h.id, images.map((x) => x.src)); saveState();
  return { ok: true };
});

const peakFuture = (s: DemoState, room: RoomRec) => {
  const t = todayIso();
  const perNight = new Map<string, number>();
  for (const r of s.reservations.filter((x) => holds(x) && x.roomId === room.id && x.checkOut > t)) {
    for (const night of stayNights(r.checkIn, r.checkOut).filter((n) => n >= t)) perNight.set(night, (perNight.get(night) ?? 0) + r.rooms);
  }
  return Math.max(0, ...perNight.values());
};
R.post('/api/admin/hotels/:id/rooms', (c) => {
  const admin = requireAdmin(c);
  const h = c.s.hotels.find((x) => x.id === Number(c.params.id));
  const input = parse(RoomFields.extend({ slug: slugRe, imageSrc: z.string().optional() }), c.body);
  if (input.maxOccupancy < input.maxAdults) throw new HttpError(400, 'VALIDATION_ERROR', 'Max occupancy must be at least the adult limit.', { maxOccupancy: 'Must be ≥ max adults.' });
  if (!h) throw new HttpError(404, 'NOT_FOUND', 'Hotel not found.');
  if (h.rooms.some((r) => r.slug === input.slug)) throw new HttpError(409, 'VALIDATION_ERROR', 'Slug already used in this hotel.', { slug: 'Already used.' });
  const id = nextId(c.s);
  const { imageSrc, ...fields } = input;
  h.rooms.push({
    id, hotelId: h.id, ...fields, images: imageSrc && imageLibrary().includes(imageSrc) ? [{ id: nextId(c.s), src: imageSrc, alt: `${input.name} interior` }] : [],
  });
  audit(c.s, admin.id, 'room.create', 'room_type', id, { hotelId: h.id }); saveState();
  return { id };
});
R.patch('/api/admin/rooms/:id', (c) => {
  const admin = requireAdmin(c);
  const room = findRoom(c.s, Number(c.params.id))?.r;
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Room type not found.');
  const input = parse(RoomFields.partial(), c.body);
  if ((input.maxOccupancy ?? room.maxOccupancy) < (input.maxAdults ?? room.maxAdults)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Max occupancy must be at least the adult limit.', { maxOccupancy: 'Must be ≥ max adults.' });
  }
  if (input.inventory !== undefined) {
    const peak = peakFuture(c.s, room);
    if (input.inventory < peak) {
      throw new HttpError(409, 'INVENTORY_CONFLICT', `${peak} rooms of this type are already reserved on at least one upcoming night. Inventory cannot go below ${peak}.`, { inventory: `Minimum ${peak}` });
    }
  }
  Object.assign(room, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  audit(c.s, admin.id, 'room.update', 'room_type', room.id, input); saveState();
  return { ok: true };
});
R.get('/api/admin/rooms/:id/inventory', (c) => {
  requireAdmin(c);
  const from = c.query.get('from') ?? todayIso();
  if (!isIsoDate(from)) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid start date.');
  const room = findRoom(c.s, Number(c.params.id))?.r;
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Room type not found.');
  const nights = nightly(c.s, room, from, addDays(from, 28)).map((nt) => {
    const o = c.s.overrides.find((x) => x.roomId === room.id && x.night === nt.night);
    return { ...nt, overridden: !!o, note: o?.note ?? null };
  });
  return { room: { id: room.id, name: room.name, inventory: room.inventory }, nights };
});
R.put('/api/admin/rooms/:id/inventory/:night', (c) => {
  const admin = requireAdmin(c);
  const room = findRoom(c.s, Number(c.params.id))?.r;
  const night = c.params.night!;
  if (!isIsoDate(night)) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid date.');
  const { units, note } = parse(z.object({ units: z.number().int().min(0).max(500).nullable(), note: z.string().trim().max(120).nullable().optional() }), c.body);
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Room type not found.');
  const nt = nightly(c.s, room, night, addDays(night, 1))[0]!;
  if (units !== null && units < nt.booked) throw new HttpError(409, 'INVENTORY_CONFLICT', `${nt.booked} rooms are already reserved that night.`);
  c.s.overrides = c.s.overrides.filter((o) => !(o.roomId === room.id && o.night === night));
  if (units !== null) c.s.overrides.push({ roomId: room.id, night, units, note: note ?? null });
  audit(c.s, admin.id, 'inventory.override', 'room_type', room.id, { night, units }); saveState();
  return { ok: true };
});

R.get('/api/admin/reservations', (c) => {
  requireAdmin(c);
  const q = c.query; const s = c.s;
  const status = q.get('status'); const hotel = q.get('hotel'); const from = q.get('from'); const to = q.get('to'); const term = q.get('q')?.trim().toLowerCase();
  const rows = s.reservations
    .filter((r) => !status || !(STATUSES as readonly string[]).includes(status) || r.status === status)
    .filter((r) => !hotel || s.hotels.find((h) => h.id === r.hotelId)?.slug === hotel)
    .filter((r) => !from || !isIsoDate(from) || r.checkIn >= from)
    .filter((r) => !to || !isIsoDate(to) || r.checkIn <= to)
    .filter((r) => !term || r.code.toLowerCase().includes(term) || r.guest.email.toLowerCase().includes(term) || `${r.guest.firstName} ${r.guest.lastName}`.toLowerCase().includes(term))
    .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)).slice(0, 200);
  return { reservations: rows.map((r) => toDTO(s, r, true)), transitions: ALLOWED_TRANSITIONS };
});
R.get('/api/admin/reservations/:id', (c) => {
  requireAdmin(c);
  const r = c.s.reservations.find((x) => x.id === Number(c.params.id));
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Reservation not found.');
  const history = c.s.audit.filter((a) => a.entity === 'reservation' && a.entityId === r.id).map((a) => ({
    action: a.action, details: a.details, createdAt: a.createdAt, actor: c.s.users.find((u) => u.id === a.actorId)?.name ?? null,
  }));
  return { reservation: toDTO(c.s, r, true), payments: [], history, transitions: ALLOWED_TRANSITIONS[r.status] };
});
R.patch('/api/admin/reservations/:id/status', (c) => {
  const admin = requireAdmin(c);
  const { status } = parse(z.object({ status: z.enum(STATUSES) }), c.body);
  const r = c.s.reservations.find((x) => x.id === Number(c.params.id));
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Reservation not found.');
  if (!ALLOWED_TRANSITIONS[r.status].includes(status)) {
    throw new HttpError(409, 'INVALID_TRANSITION', `A ${r.status.replace('_', ' ')} reservation cannot be marked ${status.replace('_', ' ')}.`);
  }
  if ((status === 'checked_in' || status === 'no_show') && r.checkIn > todayIso()) {
    throw new HttpError(409, 'TOO_EARLY', 'Guests can only be checked in (or marked no-show) from the arrival date.');
  }
  const from = r.status;
  r.status = status; r.updatedAt = nowIso();
  if (status === 'cancelled') for (const x of c.s.cancellations) if (x.reservationId === r.id && x.status === 'pending') { x.status = 'approved'; x.resolvedAt = nowIso(); }
  audit(c.s, admin.id, 'reservation.status', 'reservation', r.id, { from, to: status }); saveState();
  return { reservation: toDTO(c.s, r, true) };
});
R.get('/api/admin/cancellation-requests', (c) => {
  requireAdmin(c);
  const status = c.query.get('status') ?? 'pending';
  const requests = [...c.s.cancellations].filter((x) => status === 'all' || x.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((x: CancelRec) => {
    const r = c.s.reservations.find((y) => y.id === x.reservationId)!;
    const h = c.s.hotels.find((y) => y.id === r.hotelId)!;
    const room = h.rooms.find((y) => y.id === r.roomId)!;
    return {
      id: x.id, status: x.status, reason: x.reason, adminNote: x.adminNote, createdAt: x.createdAt, resolvedAt: x.resolvedAt,
      reservationId: r.id, code: r.code, checkIn: r.checkIn, checkOut: r.checkOut, total: r.total, refundable: room.refundable ? 1 : 0,
      terms: room.cancellationTerms, hotel: h.name, guest: `${r.guest.firstName} ${r.guest.lastName}`,
    };
  });
  return { requests };
});
R.post('/api/admin/cancellation-requests/:id', (c) => {
  const admin = requireAdmin(c);
  const { approve, note } = parse(z.object({ approve: z.boolean(), note: z.string().max(500).nullable().optional() }), c.body);
  const req = c.s.cancellations.find((x) => x.id === Number(c.params.id));
  if (!req) throw new HttpError(404, 'NOT_FOUND', 'Cancellation request not found.');
  if (req.status !== 'pending') throw new HttpError(409, 'ALREADY_RESOLVED', 'This request has already been resolved.');
  const r = c.s.reservations.find((x) => x.id === req.reservationId)!;
  if (approve && !['confirmed', 'pending_payment'].includes(r.status)) throw new HttpError(409, 'NOT_CANCELLABLE', `Reservation is already ${r.status}.`);
  req.status = approve ? 'approved' : 'rejected'; req.adminNote = note?.trim() || null; req.resolvedAt = nowIso();
  if (approve) { r.status = 'cancelled'; r.updatedAt = nowIso(); }
  audit(c.s, admin.id, approve ? 'cancellation.approve' : 'cancellation.reject', 'cancellation_request', req.id, { reservationId: r.id }); saveState();
  return { reservation: toDTO(c.s, r, true) };
});

R.get('/api/admin/customers', (c) => {
  requireAdmin(c);
  const term = c.query.get('q')?.trim().toLowerCase();
  const customers = c.s.users.filter((u) => u.role === 'guest' && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name)).map((u) => {
      const rs = c.s.reservations.filter((r) => r.userId === u.id);
      return {
        id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, bookings: rs.length,
        value: rs.filter((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status)).reduce((a, r) => a + r.total, 0),
        lastStay: rs.length ? rs.map((r) => r.checkIn).sort().at(-1)! : null,
      };
    });
  return { customers };
});
R.get('/api/admin/customers/:id', (c) => {
  requireAdmin(c);
  const u = c.s.users.find((x) => x.id === Number(c.params.id) && x.role === 'guest');
  if (!u) throw new HttpError(404, 'NOT_FOUND', 'Customer not found.');
  const reservations = c.s.reservations.filter((r) => r.userId === u.id).sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)).map((r) => toDTO(c.s, r, true));
  const favorites = c.s.favorites.filter((f) => f.userId === u.id).map((f) => c.s.hotels.find((h) => h.id === f.hotelId)!).map((h) => ({ name: h.name, slug: h.slug }));
  return { customer: { id: u.id, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt }, reservations, favorites };
});
R.get('/api/admin/messages', (c) => {
  requireAdmin(c);
  return { messages: [...c.s.messages].sort((a, b) => b.id - a.id).slice(0, 100) };
});

// ---------------------------------------------------------------- dispatcher
export interface DemoResponse { status: number; json: unknown }

/** Answers one API call. The same shape as an HTTP response so client/src/lib/api.ts handles both alike. */
export async function demoFetch(method: string, path: string, body?: unknown): Promise<DemoResponse> {
  try {
    const s = await getState();
    const url = new URL(path, 'http://demo.local');
    let pathMatched = false;
    for (const route of routes) {
      const m = route.pattern.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]!); });
      const u = s.sessionUserId !== null ? s.users.find((x) => x.id === s.sessionUserId) : undefined;
      const result = await route.handler({ s, params, query: url.searchParams, body, user: u ? pub(u) : null }) as Record<string, unknown>;
      const status = typeof result?.__status === 'number' ? result.__status : 200;
      if (result && '__status' in result) delete result.__status;
      return { status, json: result };
    }
    return { status: pathMatched ? 405 : 404, json: { error: { code: pathMatched ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', message: 'Not found.' } } };
  } catch (err) {
    if (err instanceof HttpError) {
      return { status: err.status, json: { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), ...(err.extra ?? {}) } } };
    }
    console.error('[demo api]', err);
    return { status: 500, json: { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } } };
  }
}
