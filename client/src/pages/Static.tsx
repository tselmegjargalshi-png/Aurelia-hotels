import { useEffect, useState, type FormEvent } from 'react';
import { Link, withQuery } from '../lib/router.js';
import { api, ApiError } from '../lib/api.js';
import { useSeo } from '../lib/seo.js';
import { useAuth } from '../lib/auth.js';
import { useDestinations } from '../components/SearchBar.js';
import { Img } from '../components/Img.js';
import { Icon } from '../components/Icon.js';
import { Notice, SectionHeading, TextArea, TextInput } from '../components/ui.js';
import { Faq, GENERAL_FAQ } from '../components/Faq.js';
import { OFFERS, BRAND, PRICING } from '../../../shared/config.js';
import { isEmail } from '../../../shared/validation.js';

export function DestinationsPage() {
  useSeo({ title: 'Destinations', description: 'From the Cape Winelands to Lake Lucerne, the Dolomites, the Aosta Valley and Kyushu.' });
  const destinations = useDestinations();
  return (
    <>
      <section className="page-intro">
        <div className="container narrow">
          <p className="eyebrow">Destinations</p>
          <h1>Where would you like to wake up?</h1>
          <p className="lede">Each Aurelia destination pairs a remarkable landscape with a small number of carefully run hotels.</p>
        </div>
      </section>
      <div className="container destination-list">
        {destinations.map((d, i) => (
          <article key={d.slug} className={`destination-row ${i % 2 ? 'is-reverse' : ''}`}>
            <Img src={d.image} alt={`${d.name}, ${d.country}`} ratio="3 / 2" sizes="(max-width: 900px) 100vw, 55vw" />
            <div>
              <p className="eyebrow">{d.country}</p>
              <h2>{d.name}</h2>
              <p className="lede">{d.summary}</p>
              <p className="muted">{d.hotelCount} Aurelia {d.hotelCount === 1 ? 'hotel' : 'hotels'}</p>
              <Link className="btn btn-outline" to={withQuery('/hotels', { destination: d.slug })}>View hotels <Icon name="arrow" size={16} /></Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function OffersPage() {
  useSeo({ title: 'Offers', description: 'Rule-based stay offers applied automatically at checkout — no codes, no fake discounts.' });
  return (
    <>
      <section className="page-intro">
        <div className="container narrow">
          <p className="eyebrow">Special offers</p>
          <h1>Fewer offers, honestly applied.</h1>
          <p className="lede">Offers are rules in our pricing engine, not marketing banners. If your stay qualifies, the best single offer is applied automatically and shown as its own line before you confirm.</p>
        </div>
      </section>
      <div className="container offers-page">
        {OFFERS.map((o, i) => (
          <article key={o.code} className="offer-card">
            <Img src={i === 0 ? 'room-valley-view-king' : 'lucerne-cliff-infinity-pool'} alt="" ratio="16 / 9" sizes="(max-width: 900px) 100vw, 50vw" />
            <div className="offer-body">
              <span className="offer-pct">{o.percentOff}% off</span>
              <h2>{o.title}</h2>
              <p>{o.summary}</p>
              <ul className="offer-rules">
                {o.minNights > 1 && <li>Minimum stay: {o.minNights} nights</li>}
                {o.minDaysInAdvance > 0 && <li>Check-in at least {o.minDaysInAdvance} days after booking</li>}
                <li>Applies to the room rate before taxes and fees</li>
                <li>Does not combine with other offers — the larger saving wins</li>
                <li>Available at every Aurelia hotel, on every room type</li>
              </ul>
              <Link to="/hotels" className="btn btn-primary">Find a qualifying stay</Link>
            </div>
          </article>
        ))}
        <Notice tone="info">Prices and offers are demonstration values for a fictional brand. {PRICING.taxLabel} and the {PRICING.feeLabel.toLowerCase()} are added after any discount.</Notice>
      </div>
    </>
  );
}

export function AboutPage() {
  useSeo({ title: 'About', description: 'The story and principles behind the Aurelia Hotels demonstration brand.' });
  return (
    <>
      <section className="about-hero">
        <Img src="aosta-chalet-exterior" alt="Stone chalets with warm lights beneath snowy peaks at dusk" eager sizes="100vw" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="container about-hero-copy">
          <p className="eyebrow on-dark">About Aurelia</p>
          <h1>Stay somewhere extraordinary — and know exactly what you booked.</h1>
        </div>
      </section>
      <section className="section">
        <div className="container narrow prose">
          <Notice tone="warn" title="A fictional brand">{BRAND.demoNotice}</Notice>
          <p className="lede">Aurelia was imagined as a small collection of hotels in places with a strong sense of landscape: vineyards beneath sandstone ridges, alpine lakes, pale Dolomite peaks, a hot-spring valley in Kyushu.</p>
          <p>The idea behind the brand is simple. Luxury should feel calm, and calm comes from clarity. That is why every room shows its size, bed, occupancy, meal plan and cancellation terms before you choose it; why taxes and fees are listed rather than buried; and why we never show a review we cannot verify.</p>
          <h2>What we stand for</h2>
          <div className="values">
            <div><h3>Place first</h3><p>Architecture, food and design that belong to where you are.</p></div>
            <div><h3>Quiet service</h3><p>Attentive without intrusion; flexible without fuss.</p></div>
            <div><h3>Honest booking</h3><p>Real availability, transparent prices, policies up front.</p></div>
          </div>
          <h2>For every kind of traveller</h2>
          <p>Couples looking for a long weekend, families who need a second bedroom, business travellers who need a quiet desk, and anyone crossing a continent for a view — each Aurelia stay is planned around how you actually travel.</p>
          <Link to="/hotels" className="btn btn-primary">Explore the collection</Link>
        </div>
      </section>
    </>
  );
}

export function ContactPage() {
  useSeo({ title: 'Contact & support', description: 'Questions about a stay? Reach the Aurelia support team (demo).' });
  const { user } = useAuth();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', subject: '', message: '', website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The session loads asynchronously; prefill once it arrives without overwriting typed input.
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name, email: f.email || user.email }));
  }, [user]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!isEmail(form.email)) e.email = 'Enter a valid email address.';
    if (form.subject.trim().length < 3) e.subject = 'Please add a subject.';
    if (form.message.trim().length < 20) e.message = 'Please write at least 20 characters.';
    if (form.message.length > 4000) e.message = 'Please keep your message under 4,000 characters.';
    return e;
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e); setStatus(null);
    if (Object.keys(e).length) { setTimeout(() => document.querySelector<HTMLElement>('.contact-form [aria-invalid="true"]')?.focus(), 0); return; }
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>('/api/contact', form);
      setStatus({ tone: 'ok', text: r.message });
      setForm({ ...form, subject: '', message: '' });
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setStatus({ tone: 'bad', text: `${err.message} Your message was not saved.` }); }
      else setStatus({ tone: 'bad', text: 'Your message could not be sent. Please try again.' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <section className="page-intro">
        <div className="container narrow">
          <p className="eyebrow">Contact &amp; support</p>
          <h1>How can we help?</h1>
          <p className="lede">Questions about a reservation, a special occasion or accessibility needs — write to us and a member of the team will reply.</p>
        </div>
      </section>
      <div className="container contact-grid">
        <form className="contact-form card-form" onSubmit={submit} noValidate aria-labelledby="contact-form-title">
          <h2 id="contact-form-title">Send a message</h2>
          <div className="form-grid">
            <TextInput label="Name" autoComplete="name" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextInput label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <TextInput label="Subject" value={form.subject} error={errors.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <TextArea label="Message" rows={6} value={form.message} error={errors.message} hint={`${form.message.trim().length} / 4000 characters (minimum 20)`} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div className="hp" aria-hidden="true"><label>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label></div>
          {status && <Notice tone={status.tone} role={status.tone === 'bad' ? 'alert' : 'status'}>{status.text}</Notice>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
          <p className="field-hint">Messages are stored in the demo admin inbox. Email delivery is not configured.</p>
        </form>
        <aside className="contact-aside">
          <div className="contact-card">
            <h2>Guest support <span className="badge badge-muted">Demo data</span></h2>
            <p><Icon name="phone" size={16} /> +1 (555) 010-0100 <small className="muted">(fictional number)</small></p>
            <p><Icon name="mail" size={16} /> support@aurelia.example <small className="muted">(not monitored)</small></p>
            <p><Icon name="clock" size={16} /> Daily, 08:00–22:00 (UTC)</p>
          </div>
          <div className="contact-card">
            <h2>Manage a booking</h2>
            <p>View your reservations, download details or request a cancellation from your account.</p>
            <Link to="/account/bookings" className="btn btn-outline btn-sm">My bookings</Link>
          </div>
        </aside>
      </div>
      <section className="section" id="faq" aria-labelledby="contact-faq">
        <div className="container narrow">
          <SectionHeading eyebrow="FAQ" title="Frequently asked questions" id="contact-faq" align="center" />
          <Faq items={GENERAL_FAQ} />
        </div>
      </section>
    </>
  );
}
