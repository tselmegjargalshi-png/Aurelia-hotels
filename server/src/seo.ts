import type { DB } from './db/connection.js';
import { get } from './db/connection.js';
import type { Env } from './env.js';
import { BRAND } from '../../shared/config.js';

/**
 * Server-rendered <head> metadata for the SPA shell, so crawlers and link
 * previews see the right title/description/OG image without running JS.
 * The client updates the same tags on navigation (see client/src/lib/seo.ts).
 */
interface Meta { title: string; description: string; image?: string; noindex?: boolean; jsonLd?: object }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATIC: Record<string, Meta> = {
  '/': { title: `${BRAND.name} — ${BRAND.tagline}`, description: 'Exceptional destinations, thoughtfully designed stays and effortless reservations. A fictional demonstration hotel brand.', image: 'winelands-estate-exterior' },
  '/hotels': { title: `Hotels | ${BRAND.name}`, description: 'Search Aurelia demonstration hotels by destination, dates, guests and amenities.' },
  '/destinations': { title: `Destinations | ${BRAND.name}`, description: 'From the Cape Winelands to Lake Lucerne, the Dolomites and Kyushu.' },
  '/offers': { title: `Offers | ${BRAND.name}`, description: 'Rule-based stay offers that apply automatically at checkout.' },
  '/about': { title: `About | ${BRAND.name}`, description: 'The story and principles behind the Aurelia Hotels demonstration brand.' },
  '/contact': { title: `Contact | ${BRAND.name}`, description: 'Questions about a stay? Reach the Aurelia support team (demo).' },
};

export function metaFor(pathname: string, db: DB, env: Env): Meta {
  if (/^\/(admin|account|checkout|bookings|sign-in|register|forgot-password|reset-password)/.test(pathname)) {
    return { title: BRAND.name, description: BRAND.tagline, noindex: true };
  }
  const m = /^\/hotels\/([a-z0-9-]+)(?:\/rooms\/([a-z0-9-]+))?\/?$/.exec(pathname);
  if (m) {
    const h = get<{ name: string; overview: string; address: string; image: string | null; tagline: string }>(db,
      `SELECT h.name, h.overview, h.address, h.tagline, (SELECT src FROM hotel_images WHERE hotel_id = h.id ORDER BY sort_order LIMIT 1) AS image
         FROM hotels h WHERE h.slug = ? AND h.active = 1`, m[1]!);
    if (h) {
      const room = m[2] ? get<{ name: string; description: string }>(db,
        'SELECT rt.name, rt.description FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id WHERE h.slug = ? AND rt.slug = ? AND rt.active = 1', m[1]!, m[2]) : undefined;
      return {
        title: room ? `${room.name} — ${h.name} | ${BRAND.name}` : `${h.name} — ${h.tagline} | ${BRAND.name}`,
        description: room ? room.description : h.overview,
        image: h.image ?? undefined,
        // Deliberately no ratings/reviews in structured data — the demo has no real reviews.
        jsonLd: env.structuredData ? { '@context': 'https://schema.org', '@type': 'Hotel', name: h.name, description: h.overview, address: h.address } : undefined,
      };
    }
  }
  return STATIC[pathname.replace(/\/$/, '') || '/'] ?? STATIC['/']!;
}

export function renderHead(meta: Meta, pathname: string, env: Env): string {
  const url = `${env.appOrigin}${pathname === '/' ? '' : pathname}`;
  const image = meta.image ? `${env.appOrigin}/images/${meta.image}.jpg` : `${env.appOrigin}/images/winelands-estate-exterior.jpg`;
  return [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${BRAND.name}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    meta.noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
}
