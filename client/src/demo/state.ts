/**
 * Browser-only demo data store.
 *
 * The demo build has no server: this module holds the catalogue, accounts and
 * reservations in memory and mirrors them to localStorage when the browser allows
 * it. Nothing leaves the device. It is a demonstration of the booking logic, not a
 * reservation system: other visitors never see these bookings and availability is
 * not shared.
 */
import { AMENITIES, DEMO_CUSTOMERS, DESTINATIONS, HOTELS } from '../../../server/src/db/seed-data.js';
import { CURRENCY } from '../../../shared/config.js';
import { addDays, nightsBetween, todayIso } from '../../../shared/dates.js';
import { quoteStay } from '../../../shared/pricing.js';
import type { ImageRef, PaymentStatus, ReservationStatus, Role } from '../../../shared/types.js';

export interface UserRec {
  id: number; email: string; name: string; phone: string | null; role: Role; hash: string; createdAt: string;
}
export interface RoomRec {
  id: number; hotelId: number; slug: string; name: string; description: string; maxAdults: number; maxOccupancy: number;
  bed: string; sizeSqm: number; nightlyRate: number; inventory: number; mealPlan: string; refundable: boolean;
  cancellationTerms: string; amenities: string[]; images: ImageRef[]; active: boolean;
}
export interface HotelRec {
  id: number; slug: string; destination: string; name: string; tagline: string; propertyType: string; stars: number;
  demoRating: number; overview: string; description: string; address: string; latitude: number; longitude: number;
  checkInTime: string; checkOutTime: string; cancellationPolicy: string; houseRules: string[];
  nearby: { name: string; distance: string }[]; breakfastIncluded: boolean; freeCancellation: boolean; featured: boolean;
  active: boolean; amenities: string[]; images: ImageRef[]; rooms: RoomRec[];
}
export interface ResRec {
  id: number; code: string; userId: number; hotelId: number; roomId: number; checkIn: string; checkOut: string;
  rooms: number; adults: number; children: number; nightlyRate: number; roomSubtotal: number;
  discountCode: string | null; discountAmount: number; taxes: number; fees: number; total: number;
  status: ReservationStatus; paymentStatus: PaymentStatus;
  guest: { firstName: string; lastName: string; email: string; phone: string | null };
  specialRequests: string | null; idempotencyKey: string; createdAt: string; updatedAt: string;
}
export interface CancelRec {
  id: number; reservationId: number; userId: number; reason: string | null; status: 'pending' | 'approved' | 'rejected';
  adminNote: string | null; createdAt: string; resolvedAt: string | null;
}
export interface OverrideRec { roomId: number; night: string; units: number; note: string | null }
export interface DemoState {
  v: 1;
  baseDate: string;
  nextId: number;
  users: UserRec[];
  sessionUserId: number | null;
  hotels: HotelRec[];
  reservations: ResRec[];
  cancellations: CancelRec[];
  favorites: { userId: number; hotelId: number }[];
  overrides: OverrideRec[];
  messages: { id: number; name: string; email: string; subject: string; message: string; createdAt: string }[];
  newsletter: string[];
  resets: { tokenHash: string; userId: number; expiresAt: string; used: boolean }[];
  audit: { actorId: number | null; action: string; entity: string; entityId: number | null; details: string | null; createdAt: string }[];
}

const KEY = 'aurelia-demo-state-v1';
export const DEMO_ADMIN_EMAIL = 'admin@aurelia.demo';
export const DEMO_ADMIN_PASSWORD = 'Aurelia-Admin-2026';
export const DEMO_GUEST_EMAIL = 'guest@aurelia.demo';
export const DEMO_GUEST_PASSWORD = 'Aurelia-Guest-2026';

// ---------- password hashing (WebCrypto PBKDF2; the demo never stores plaintext) ----------
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ITER = 100_000;

async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iter, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await derive(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ (want[i] ?? 0);
  return diff === 0;
}
export async function sha256(value: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 24): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function bookingCode(): string {
  let out = '';
  for (const b of crypto.getRandomValues(new Uint8Array(6))) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `AUR-${out}`;
}

// ---------- persistence ----------
let memory: DemoState | null = null;
let storageOk = true;
export const demoStorageAvailable = () => storageOk;

function readStorage(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { storageOk = false; return null; }
}
export function saveState() {
  if (!memory) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(memory)); } catch { storageOk = false; }
}
export function resetDemoStorage() {
  memory = null;
  loading = null;
  try { window.localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export const nextId = (s: DemoState) => s.nextId++;

/** Seeded stays are relative to "today"; when the demo is reopened later, shift them so they stay current. */
function rebase(s: DemoState, today: string) {
  const delta = nightsBetween(s.baseDate, today);
  if (delta === 0) return;
  for (const r of s.reservations) { r.checkIn = addDays(r.checkIn, delta); r.checkOut = addDays(r.checkOut, delta); }
  for (const o of s.overrides) o.night = addDays(o.night, delta);
  s.baseDate = today;
}

async function build(today: string): Promise<DemoState> {
  const s: DemoState = {
    v: 1, baseDate: today, nextId: 1, users: [], sessionUserId: null, hotels: [], reservations: [], cancellations: [],
    favorites: [], overrides: [], messages: [], newsletter: [], resets: [], audit: [],
  };
  const stamp = new Date().toISOString();

  // Accounts. Demo customers get random, undisclosed passwords: they exist only as sample records.
  const [adminHash, guestHash, ...customerHashes] = await Promise.all([
    hashPassword(DEMO_ADMIN_PASSWORD), hashPassword(DEMO_GUEST_PASSWORD), ...DEMO_CUSTOMERS.map(() => hashPassword(randomToken(24))),
  ]);
  const addUser = (email: string, name: string, phone: string | null, hash: string, role: Role = 'guest') => {
    const u: UserRec = { id: nextId(s), email, name, phone, role, hash, createdAt: stamp };
    s.users.push(u);
    return u;
  };
  addUser(DEMO_ADMIN_EMAIL, 'Aurelia Demo Admin', null, adminHash!, 'admin');
  addUser(DEMO_GUEST_EMAIL, 'Demo Guest', '+1 555 0100', guestHash!);
  DEMO_CUSTOMERS.forEach((c, i) => addUser(c.email, c.name, c.phone, customerHashes[i]!));

  // Catalogue
  let imgId = 1;
  const img = ([src, alt]: [string, string]): ImageRef => ({ id: imgId++, src, alt });
  for (const h of HOTELS) {
    const hotelId = nextId(s);
    s.hotels.push({
      id: hotelId, slug: h.slug, destination: h.destination, name: h.name, tagline: h.tagline, propertyType: h.propertyType,
      stars: h.stars, demoRating: h.demoRating, overview: h.overview, description: h.description, address: h.address,
      latitude: h.lat, longitude: h.lng, checkInTime: h.checkIn, checkOutTime: h.checkOut, cancellationPolicy: h.cancellationPolicy,
      houseRules: [...h.houseRules], nearby: h.nearby.map((n) => ({ ...n })), breakfastIncluded: h.breakfast,
      freeCancellation: h.freeCancellation, featured: h.featured, active: true, amenities: [...h.amenities],
      images: h.images.map(img),
      rooms: h.rooms.map((r) => ({
        id: nextId(s), hotelId, slug: r.slug, name: r.name, description: r.description, maxAdults: r.maxAdults,
        maxOccupancy: r.maxOccupancy, bed: r.bed, sizeSqm: r.sizeSqm, nightlyRate: r.rate, inventory: r.inventory,
        mealPlan: r.mealPlan, refundable: r.refundable, cancellationTerms: r.terms, amenities: [...r.amenities],
        images: r.images.map(img), active: true,
      })),
    });
  }

  // Sample reservations (same set as the server seed), written relative to today.
  type Sample = [email: string, hotel: string, room: string, inOffset: number, nights: number, rooms: number, adults: number, children: number, status: ReservationStatus, bookedOffset: number];
  const samples: Sample[] = [
    ['emma.lindqvist@example.com', 'aurelia-lucerne-cliffs', 'deluxe-panorama-room', -12, 3, 1, 2, 0, 'checked_out', -60],
    ['daniel.okafor@example.com', 'aurelia-winelands-estate', 'junior-suite', -6, 4, 1, 2, 0, 'checked_out', -40],
    ['mei.tanaka@example.com', 'aurelia-yufu-terrace', 'deluxe-mountain-view-room', -2, 4, 1, 2, 1, 'checked_in', -30],
    ['lucas.moreau@example.com', 'aurelia-courmayeur-chalet', 'deluxe-room', -1, 3, 1, 2, 0, 'checked_in', -20],
    ['sofia.ricci@example.com', 'aurelia-brixen-spa-retreat', 'deluxe-spa-room', 0, 2, 1, 2, 0, 'confirmed', -14],
    ['guest@aurelia.demo', 'aurelia-alta-badia-lodge', 'superior-balcony-room', 1, 3, 1, 2, 0, 'confirmed', -10],
    ['emma.lindqvist@example.com', 'aurelia-winelands-estate', 'garden-room', 3, 5, 1, 2, 0, 'confirmed', -9],
    ['guest@aurelia.demo', 'aurelia-yufu-terrace', 'superior-room', 21, 3, 1, 2, 0, 'confirmed', -3],
    ['daniel.okafor@example.com', 'aurelia-lucerne-cliffs', 'executive-suite', 9, 2, 1, 2, 0, 'cancelled', -25],
    ['lucas.moreau@example.com', 'aurelia-lucerne-cliffs', 'presidential-suite', 7, 3, 1, 4, 0, 'confirmed', -45], // sell-out 1
    ['mei.tanaka@example.com', 'aurelia-alta-badia-lodge', 'family-room', 14, 3, 2, 4, 2, 'confirmed', -18], // sell-out 2 (with next)
    ['sofia.ricci@example.com', 'aurelia-alta-badia-lodge', 'family-room', 14, 3, 2, 4, 3, 'confirmed', -16],
    ['emma.lindqvist@example.com', 'aurelia-courmayeur-chalet', 'standard-room', -20, 2, 1, 1, 0, 'no_show', -50],
  ];
  const findRoom = (hotel: string, room: string) => {
    const h = s.hotels.find((x) => x.slug === hotel)!;
    return { h, r: h.rooms.find((x) => x.slug === room)! };
  };
  for (const [email, hotel, room, inOff, nights, rooms, adults, children, status, bookedOff] of samples) {
    const { h, r } = findRoom(hotel, room);
    const u = s.users.find((x) => x.email === email)!;
    const checkIn = addDays(today, inOff);
    const checkOut = addDays(checkIn, nights);
    const bookedOn = addDays(today, bookedOff);
    const q = quoteStay({ nightlyRate: r.nightlyRate, checkIn, checkOut, rooms, bookedOn });
    const [first, ...rest] = u.name.split(' ');
    let code = bookingCode();
    while (s.reservations.some((x) => x.code === code)) code = bookingCode();
    s.reservations.push({
      id: nextId(s), code, userId: u.id, hotelId: h.id, roomId: r.id, checkIn, checkOut, rooms, adults, children,
      nightlyRate: q.nightlyRate, roomSubtotal: q.roomSubtotal, discountCode: q.discount?.code ?? null,
      discountAmount: q.discount?.amount ?? 0, taxes: q.taxes, fees: q.fees, total: q.total, status, paymentStatus: 'not_collected',
      guest: { firstName: first!, lastName: rest.join(' ') || 'Guest', email: u.email, phone: u.phone },
      specialRequests: null, idempotencyKey: `seed-${code}`, createdAt: `${bookedOn}T10:00:00.000Z`, updatedAt: `${bookedOn}T10:00:00.000Z`,
    });
  }
  const pending = s.reservations.find((r) => r.guest.email === 'emma.lindqvist@example.com' && r.status === 'confirmed');
  if (pending) {
    s.cancellations.push({ id: nextId(s), reservationId: pending.id, userId: pending.userId, reason: 'Change of travel plans.', status: 'pending', adminNote: null, createdAt: stamp, resolvedAt: null });
  }
  // Courmayeur Family Suites closed for maintenance on nights +20…+22.
  const fs = findRoom('aurelia-courmayeur-chalet', 'family-suite').r;
  for (let i = 20; i <= 22; i++) s.overrides.push({ roomId: fs.id, night: addDays(today, i), units: 0, note: 'Maintenance (demo)' });
  return s;
}

let loading: Promise<DemoState> | null = null;
/** Loads (or builds) the demo state once; later calls return the same object. */
export function getState(): Promise<DemoState> {
  if (memory) return Promise.resolve(memory);
  loading ??= (async () => {
    const today = todayIso();
    const raw = readStorage();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed.v === 1 && Array.isArray(parsed.hotels) && parsed.hotels.length) {
          rebase(parsed, today);
          memory = parsed;
          saveState();
          return memory;
        }
      } catch { /* corrupted: rebuild */ }
    }
    memory = await build(today);
    saveState();
    return memory;
  })();
  return loading;
}

export const AMENITY_LIST = AMENITIES;
export const DESTINATION_LIST = DESTINATIONS;
export { CURRENCY };
