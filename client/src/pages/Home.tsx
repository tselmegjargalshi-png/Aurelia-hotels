import { useState, type FormEvent } from 'react';
import { Link, withQuery } from '../lib/router.js';
import { api, ApiError } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useSeo } from '../lib/seo.js';
import { SearchBar, useDestinations } from '../components/SearchBar.js';
import { HotelCard, HotelCardSkeleton } from '../components/HotelCard.js';
import { Img } from '../components/Img.js';
import { Icon } from '../components/Icon.js';
import { ErrorState, SectionHeading } from '../components/ui.js';
import { Faq, GENERAL_FAQ } from '../components/Faq.js';
import { OFFERS, BRAND } from '../../../shared/config.js';
import type { HotelSummary } from '../../../shared/types.js';
import { isEmail } from '../../../shared/validation.js';

const EMPTY_STAY = { destination: '', checkIn: '', checkOut: '', adults: 2, children: 0, rooms: 1 };

const COLLECTIONS: { key: string; label: string; blurb: string; pick: (h: HotelSummary) => boolean; query: Record<string, string> }[] = [
  { key: 'couples', label: 'Couples', blurb: 'Wine cellars, spas and quiet corners for two.', pick: (h) => h.amenities.some((a) => a.code === 'wine_cellar') || (h.stars === 5 && h.amenities.some((a) => a.code === 'spa')), query: { amenities: 'spa' } },
  { key: 'families', label: 'Families', blurb: 'Kids’ clubs, family rooms and space to roam.', pick: (h) => h.amenities.some((a) => a.code === 'kids_club'), query: { amenities: 'kids_club' } },
  { key: 'wellness', label: 'Wellness', blurb: 'Spas, pools and slow mornings.', pick: (h) => h.amenities.some((a) => a.code === 'spa') && h.amenities.some((a) => a.code === 'pool'), query: { amenities: 'spa,pool' } },
  { key: 'mountains', label: 'Mountains', blurb: 'Alpine lodges and ski-season chalets.', pick: (h) => h.amenities.some((a) => a.code === 'ski_storage'), query: { amenities: 'ski_storage' } },
];

const AMENITY_HIGHLIGHTS = [
  { icon: 'pool', title: 'Pools with a view', text: 'Infinity pools above lakes, valleys and vineyards.' },
  { icon: 'spa', title: 'Spa & wellness', text: 'Saunas, treatments and hot-spring baths.' },
  { icon: 'dish', title: 'Considered dining', text: 'Seasonal kitchens and serious wine cellars.' },
  { icon: 'bed', title: 'Restful rooms', text: 'Natural materials, deep beds, true quiet.' },
  { icon: 'pin', title: 'Local concierge', text: 'Trails, tables and transfers arranged for you.' },
  { icon: 'shield', title: 'Clear policies', text: 'Cancellation terms shown before you book.' },
];

function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) { setState({ tone: 'bad', msg: 'Please enter a valid email address.' }); return; }
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>('/api/newsletter', { email });
      setState({ tone: 'ok', msg: r.message }); setEmail('');
    } catch (err) {
      setState({ tone: 'bad', msg: err instanceof ApiError ? (err.fields.email ?? err.message) : 'Please try again.' });
    } finally { setBusy(false); }
  };
  return (
    <section className="newsletter" aria-labelledby="newsletter-title">
      <div className="container newsletter-inner">
        <div>
          <p className="eyebrow on-dark">The Aurelia Letter</p>
          <h2 id="newsletter-title">New destinations, quietly announced.</h2>
          <p>An occasional note on new properties and seasonal offers. (Demo: addresses are stored, no emails are sent.)</p>
        </div>
        <form onSubmit={submit} noValidate className="newsletter-form">
          <label htmlFor="newsletter-email" className="sr-only">Email address</label>
          <input id="newsletter-email" type="email" placeholder="Your email address" value={email} onChange={(e) => { setEmail(e.target.value); setState(null); }}
            aria-invalid={state?.tone === 'bad' ? true : undefined} aria-describedby="newsletter-status" autoComplete="email" />
          <button className="btn btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Subscribe'}</button>
          <p id="newsletter-status" role="status" className={`newsletter-status ${state?.tone ?? ''}`}>{state?.msg}</p>
        </form>
      </div>
    </section>
  );
}

export function HomePage() {
  useSeo({ title: `${BRAND.name} — ${BRAND.tagline}`, description: 'Exceptional destinations, thoughtfully designed stays and memorable experiences. A fictional demonstration hotel brand.', image: 'winelands-estate-exterior' });
  const destinations = useDestinations();
  const hotels = useAsync(() => api.get<{ hotels: HotelSummary[] }>('/api/hotels').then((r) => r.hotels), 'home');
  const [collection, setCollection] = useState(COLLECTIONS[0]!.key);
  const active = COLLECTIONS.find((c) => c.key === collection)!;
  const featured = (hotels.data ?? []).filter((h) => h.featured).slice(0, 3);
  // Prefer hotels not already shown in "Featured" so the two sections don't repeat each other.
  const shown = new Set(featured.map((h) => h.id));
  const recommended = (hotels.data ?? []).filter(active.pick)
    .sort((a, b) => Number(shown.has(a.id)) - Number(shown.has(b.id)) || b.demoRating - a.demoRating).slice(0, 3);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-media">
          <Img src="winelands-estate-exterior" alt="A whitewashed manor hotel with lit verandas and a terraced pool beneath mountains at dusk" eager sizes="100vw" />
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="container hero-content">
          <p className="eyebrow on-dark">{BRAND.tagline}</p>
          <h1 id="hero-title">Discover Your Next Extraordinary Stay.</h1>
          <p className="hero-lede">Exceptional destinations, thoughtfully designed stays, and memorable experiences.</p>
        </div>
        <div className="container hero-search">
          <SearchBar initial={EMPTY_STAY} variant="hero" />
          <p className="hero-demo-note"><Icon name="info" size={14} /> Demonstration platform — fictional hotels, test bookings only.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="destinations-title">
        <div className="container">
          <SectionHeading eyebrow="Destinations" title="Five landscapes, one standard of stay" id="destinations-title">
            From vineyard valleys to alpine lakes and volcanic hot-spring towns.
          </SectionHeading>
          <div className="destination-grid">
            {destinations.map((d, i) => (
              <Link key={d.slug} to={withQuery('/hotels', { destination: d.slug })} className={`destination-tile ${i === 0 ? 'is-wide' : ''}`}>
                <Img src={d.image} alt="" sizes={i === 0 ? '(max-width: 720px) 100vw, 50vw' : '(max-width: 720px) 100vw, 25vw'} />
                <span className="destination-copy">
                  <span className="destination-country">{d.country}</span>
                  <span className="destination-name">{d.name}</span>
                  <span className="destination-count">{d.hotelCount} {d.hotelCount === 1 ? 'hotel' : 'hotels'}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-stone" aria-labelledby="featured-title">
        <div className="container">
          <div className="section-head-row">
            <SectionHeading eyebrow="Featured hotels" title="Signature Aurelia stays" id="featured-title" />
            <Link to="/hotels" className="text-link">View all hotels <Icon name="arrow" size={16} /></Link>
          </div>
          {hotels.error ? <ErrorState message={hotels.error.message} onRetry={hotels.reload} /> : (
            <div className="card-grid">
              {hotels.loading ? Array.from({ length: 3 }, (_, i) => <HotelCardSkeleton key={i} />) : featured.map((h) => <HotelCard key={h.id} hotel={h} />)}
            </div>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="recommended-title">
        <div className="container">
          <SectionHeading eyebrow="Recommended stays" title="Chosen for how you travel" id="recommended-title" />
          <div className="tabs" role="tablist" aria-label="Traveller type">
            {COLLECTIONS.map((c) => (
              <button key={c.key} role="tab" id={`tab-${c.key}`} aria-selected={collection === c.key} aria-controls="collection-panel"
                className={`tab ${collection === c.key ? 'is-active' : ''}`} onClick={() => setCollection(c.key)}>{c.label}</button>
            ))}
          </div>
          <div id="collection-panel" role="tabpanel" aria-labelledby={`tab-${active.key}`}>
            <p className="collection-blurb">{active.blurb} <Link to={withQuery('/hotels', active.query)} className="text-link">See all matches</Link></p>
            <div className="card-grid">
              {hotels.loading ? Array.from({ length: 3 }, (_, i) => <HotelCardSkeleton key={i} />) : recommended.map((h) => <HotelCard key={h.id} hotel={h} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="section section-forest" aria-labelledby="offers-title">
        <div className="container offers-band">
          <div>
            <p className="eyebrow on-dark">Special offers</p>
            <h2 id="offers-title">Offers that apply themselves</h2>
            <p>No codes and no fine-print tricks: when your stay qualifies, the saving is calculated automatically and shown line by line before you book.</p>
            <Link to="/offers" className="btn btn-light">About our offers</Link>
          </div>
          <ul className="offer-list">
            {OFFERS.map((o) => (
              <li key={o.code}>
                <span className="offer-pct">{o.percentOff}%</span>
                <span><strong>{o.title}</strong>{o.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="amenities-title">
        <div className="container split">
          <div className="split-media"><Img src="restaurant-ornate-dining-room" alt="An ornate hotel dining room with a crystal chandelier and white-clothed tables" sizes="(max-width: 900px) 100vw, 50vw" /></div>
          <div>
            <SectionHeading eyebrow="Hotel amenities" title="Everything considered, nothing overdone" id="amenities-title" />
            <ul className="amenity-grid">
              {AMENITY_HIGHLIGHTS.map((a) => (
                <li key={a.title}><Icon name={a.icon} size={22} /><div><strong>{a.title}</strong><span>{a.text}</span></div></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section section-stone" aria-labelledby="experience-title">
        <div className="container split split-reverse">
          <div className="split-media"><Img src="kyushu-terrace-infinity-pool" alt="An infinity pool with loungers overlooking a green volcano and a hot-spring town" sizes="(max-width: 900px) 100vw, 50vw" /></div>
          <div>
            <SectionHeading eyebrow="The guest experience" title="Effortless from first search to final morning" id="experience-title" />
            <ol className="principles">
              <li><strong>Real availability.</strong> Rooms are checked night by night against live inventory before any booking is accepted.</li>
              <li><strong>Transparent pricing.</strong> The nightly rate, taxes, fees and any offer are shown separately — the total you see is the total you confirm.</li>
              <li><strong>Policies up front.</strong> Cancellation terms and house rules sit beside every room, not behind a link.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="section brand-band" aria-labelledby="brand-title">
        <div className="container narrow center">
          <p className="eyebrow">About Aurelia</p>
          <h2 id="brand-title">A small collection of places worth the journey.</h2>
          <p className="lede">Aurelia is a fictional hospitality brand built to demonstrate a complete, honest booking experience: editorial design on the surface, a careful reservation engine underneath.</p>
          <Link to="/about" className="text-link">Our story <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      <Newsletter />

      <section className="section" aria-labelledby="faq-title">
        <div className="container narrow">
          <SectionHeading eyebrow="FAQ" title="Good to know" id="faq-title" align="center" />
          <Faq items={GENERAL_FAQ} />
        </div>
      </section>
    </>
  );
}
