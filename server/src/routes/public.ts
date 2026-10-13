import { z } from 'zod';
import { HttpError, parse, type Router } from '../lib/http.js';
import { run, get } from '../db/connection.js';
import {
  getHotelDetail, listAmenities, listDestinations, searchHotels, type SearchFilters,
} from '../services/catalog.js';
import { quote } from '../services/reservations.js';
import { BOOKING_RULES, CURRENCY, OFFERS, PRICING, BRAND } from '../../../shared/config.js';
import { isEmail } from '../../../shared/validation.js';
import { stayFromQuery, type AppDeps } from './context.js';

const list = (q: URLSearchParams, key: string) =>
  q.getAll(key).flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);

const QuoteBody = z.object({
  roomTypeId: z.number().int().positive(),
  checkIn: z.string(), checkOut: z.string(),
  rooms: z.number().int(), adults: z.number().int(), children: z.number().int().default(0),
});

const ContactBody = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().refine(isEmail, 'Enter a valid email address.'),
  subject: z.string().trim().min(3, 'Please add a subject.').max(160),
  message: z.string().trim().min(20, 'Please write at least 20 characters.').max(4000, 'Please keep your message under 4,000 characters.'),
  website: z.string().max(0, 'Invalid submission.').optional(), // honeypot
});

export function publicRoutes(r: Router, deps: AppDeps) {
  const { db } = deps;

  r.get('/api/health', () => ({ ok: true }));

  r.get('/api/config', () => ({
    brand: BRAND, currency: CURRENCY, pricing: PRICING, offers: OFFERS, bookingRules: BOOKING_RULES,
    paymentMode: deps.payments.isConfigured() ? 'provider' : 'test',
    paymentProvider: deps.payments.name,
  }));

  r.get('/api/destinations', () => ({ destinations: listDestinations(db) }));
  r.get('/api/amenities', () => ({ amenities: listAmenities(db) }));

  r.get('/api/hotels', ({ query }) => {
    const stay = stayFromQuery(query, deps.today());
    const sort = query.get('sort');
    const dollars = (k: string) => { const v = query.get(k); return v === null || v === '' ? undefined : Math.round(Number(v) * 100); };
    const filters: SearchFilters = {
      destination: query.get('destination') || undefined,
      stay,
      minPrice: dollars('minPrice'),
      maxPrice: dollars('maxPrice'),
      stars: list(query, 'stars').map(Number).filter((n) => n >= 1 && n <= 5),
      types: list(query, 'type'),
      amenities: list(query, 'amenities'),
      breakfast: query.get('breakfast') === '1',
      freeCancellation: query.get('freeCancellation') === '1',
      availableOnly: query.get('availableOnly') === '1',
      sort: (['recommended', 'price_asc', 'price_desc', 'rating'] as const).find((s) => s === sort) ?? 'recommended',
    };
    for (const k of ['minPrice', 'maxPrice'] as const) {
      const v = filters[k];
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new HttpError(400, 'INVALID_FILTER', 'Price filters must be positive numbers.');
    }
    const hotels = searchHotels(db, filters);
    const propertyTypes = [...new Set(searchHotels(db, {}).map((h) => h.propertyType))].sort();
    return { hotels, propertyTypes, stay: stay ?? null };
  });

  r.get('/api/hotels/:slug', ({ params, query }) => {
    const hotel = getHotelDetail(db, params.slug!, stayFromQuery(query, deps.today()));
    if (!hotel) throw new HttpError(404, 'NOT_FOUND', 'We couldn’t find that hotel.');
    return { hotel };
  });

  r.post('/api/quote', ({ body }) => {
    const input = parse(QuoteBody, body);
    const { quote: price, unitsAvailable } = quote(db, input, deps.today());
    return { quote: price, unitsAvailable, available: unitsAvailable >= input.rooms };
  });

  r.post('/api/contact', ({ body, ip, user }) => {
    deps.limiters.forms.check(`contact:${ip}`);
    const input = parse(ContactBody, body);
    run(db, 'INSERT INTO contact_messages (user_id, name, email, subject, message) VALUES (?,?,?,?,?)',
      user?.id ?? null, input.name, input.email.toLowerCase(), input.subject, input.message);
    return {
      ok: true,
      delivery: 'stored',
      message: 'Your message has been saved to the Aurelia demo inbox. Email delivery is not configured, so no email confirmation will be sent.',
    };
  });

  r.post('/api/newsletter', ({ body, ip }) => {
    deps.limiters.forms.check(`newsletter:${ip}`);
    const { email } = parse(z.object({ email: z.string().trim().refine(isEmail, 'Enter a valid email address.') }), body);
    if (!get(db, 'SELECT 1 FROM newsletter_subscribers WHERE email = ?', email)) {
      run(db, 'INSERT INTO newsletter_subscribers (email) VALUES (?)', email.toLowerCase());
    }
    return { ok: true, message: 'Thank you — your address is saved. This demo does not send emails.' };
  });
}
