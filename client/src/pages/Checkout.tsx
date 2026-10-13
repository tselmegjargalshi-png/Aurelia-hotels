import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useRouter, withQuery } from '../lib/router.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useSeo } from '../lib/seo.js';
import { hasValidStay, newIdempotencyKey, stayFromQuery, stayParams } from '../lib/stay.js';
import { useHotel } from './HotelDetail.js';
import { PriceBreakdown } from '../components/PriceBreakdown.js';
import { Img } from '../components/Img.js';
import { Icon } from '../components/Icon.js';
import { EmptyState, ErrorState, Notice, PageLoading, Stepper, TextArea, TextInput } from '../components/ui.js';
import { formatMoney, formatStayDate, guestsLabel, plural } from '../lib/format.js';
import { BOOKING_RULES } from '../../../shared/config.js';
import { isEmail } from '../../../shared/validation.js';
import type { PriceQuote } from '../../../shared/pricing.js';
import type { ReservationDTO } from '../../../shared/types.js';

interface QuoteResponse { quote: PriceQuote; unitsAvailable: number; available: boolean }
type GuestForm = { firstName: string; lastName: string; email: string; phone: string; specialRequests: string };

export function CheckoutPage() {
  useSeo({ title: 'Complete your reservation', noindex: true });
  const { query, navigate, location } = useRouter();
  const { user, ready } = useAuth();
  const hotelSlug = query.get('hotel') ?? '';
  const roomSlug = query.get('room') ?? '';
  const stay = stayFromQuery(query);
  const validStay = hasValidStay(stay);
  const hotel = useHotel(hotelSlug);
  const room = hotel.data?.rooms.find((r) => r.slug === roomSlug);

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string>('');
  const [quoting, setQuoting] = useState(false);
  const [guest, setGuest] = useState<GuestForm>({ firstName: '', lastName: '', email: '', phone: '', specialRequests: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ title: string; text: string } | null>(null);
  const [priceNotice, setPriceNotice] = useState('');
  const idempotencyKey = useRef(newIdempotencyKey());
  const errorRef = useRef<HTMLDivElement>(null);

  // Prefill guest details from the signed-in account.
  useEffect(() => {
    if (!user) return;
    setGuest((g) => g.email ? g : { ...g, firstName: user.name.split(' ')[0] ?? '', lastName: user.name.split(' ').slice(1).join(' '), email: user.email, phone: user.phone ?? '' });
  }, [user]);

  // Authoritative server quote whenever the stay or room changes.
  const quoteKey = `${room?.id}|${stay.checkIn}|${stay.checkOut}|${stay.rooms}|${stay.adults}|${stay.children}`;
  useEffect(() => {
    if (!room || !validStay) return;
    let live = true;
    setQuoting(true); setQuoteError('');
    api.post<QuoteResponse>('/api/quote', { roomTypeId: room.id, checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: stay.rooms, adults: stay.adults, children: stay.children })
      .then((q) => { if (live) setQuote(q); })
      .catch((e: unknown) => { if (live) { setQuote(null); setQuoteError(e instanceof ApiError ? e.message : 'Could not price this stay.'); } })
      .finally(() => { if (live) setQuoting(false); });
    return () => { live = false; };
  }, [quoteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParty = (patch: Partial<{ adults: number; children: number; rooms: number }>) => {
    const next = { ...stay, ...patch };
    if (next.rooms > next.adults) next.rooms = next.adults;
    navigate(withQuery('/checkout', { hotel: hotelSlug, room: roomSlug, ...stayParams(next) }), { replace: true, scroll: false });
  };

  const validateGuest = () => {
    const e: Record<string, string> = {};
    if (!guest.firstName.trim()) e.firstName = 'First name is required.';
    if (!guest.lastName.trim()) e.lastName = 'Last name is required.';
    if (!isEmail(guest.email)) e.email = 'Enter a valid email address.';
    if (guest.phone && !/^[+()\d\s.-]{6,32}$/.test(guest.phone)) e.phone = 'Use digits, spaces and + ( ) - only.';
    if (guest.specialRequests.length > 1000) e.specialRequests = 'Please keep requests under 1,000 characters.';
    if (!accept) e.acceptTerms = 'Please accept the booking terms and policies.';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (submitting || !room || !quote) return;
    const e = validateGuest();
    setErrors(e);
    setSubmitError(null);
    if (Object.keys(e).length) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ reservation: ReservationDTO }>('/api/reservations', {
        roomTypeId: room.id, checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: stay.rooms, adults: stay.adults, children: stay.children,
        guest: { firstName: guest.firstName, lastName: guest.lastName, email: guest.email, phone: guest.phone || null },
        specialRequests: guest.specialRequests || null, acceptTerms: true, idempotencyKey: idempotencyKey.current, expectedTotal: quote.quote.total,
      });
      // Only navigate to confirmation once the server has saved the reservation.
      navigate(`/bookings/${res.reservation.code}/confirmation`);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.code === 'PRICE_CHANGED' && apiErr.data.quote) {
        setQuote({ ...quote, quote: apiErr.data.quote as PriceQuote });
        setPriceNotice('The total for this stay has been updated. Please review it and confirm again.');
      } else if (apiErr?.code === 'NOT_AVAILABLE') {
        setSubmitError({ title: 'No longer available', text: apiErr.message });
      } else if (apiErr?.status === 401) {
        setSubmitError({ title: 'Please sign in again', text: 'Your session has ended. Sign in to complete this reservation — nothing has been booked yet.' });
      } else if (apiErr?.fields && Object.keys(apiErr.fields).length) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(apiErr.fields)) mapped[k.replace('guest.', '')] = v;
        setErrors(mapped);
        setSubmitError({ title: 'Please check your details', text: apiErr.message });
      } else {
        setSubmitError({ title: 'Reservation not completed', text: `${apiErr?.message ?? 'Something went wrong.'} No reservation was created.` });
      }
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  };

  const maxRooms = useMemo(() => Math.min(BOOKING_RULES.maxRoomsPerBooking, stay.adults), [stay.adults]);

  if (!ready || (hotel.loading && !hotel.data)) return <PageLoading label="Preparing checkout…" />;
  if (!user) {
    const next = location.pathname + location.search;
    return (
      <div className="container narrow section">
        <EmptyState title="Sign in to complete your reservation" action={<div className="empty-actions">
          <Link className="btn btn-primary" to={withQuery('/sign-in', { next })}>Sign in</Link>
          <Link className="btn btn-outline" to={withQuery('/register', { next })}>Create an account</Link>
        </div>}>Your room selection will be kept. An account lets you view, manage and request cancellation of your bookings.</EmptyState>
      </div>
    );
  }
  if (hotel.error) return <div className="container section"><ErrorState message={hotel.error.message} onRetry={hotel.reload} /></div>;
  if (!hotel.data || !room) return <div className="container section"><EmptyState title="Room not found" action={<Link className="btn btn-primary" to="/hotels">Browse hotels</Link>}>This room type may no longer be offered.</EmptyState></div>;
  if (!validStay) return <div className="container section"><EmptyState title="Choose your dates first" action={<Link className="btn btn-primary" to={`/hotels/${hotelSlug}`}>Back to {hotel.data.name}</Link>}>Checkout needs valid check-in and check-out dates.</EmptyState></div>;

  const h = hotel.data;
  const q = quote?.quote;
  const unavailable = quote && !quote.available;

  return (
    <div className="checkout container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to={withQuery(`/hotels/${h.slug}`, stayParams(stay))}><Icon name="chevron-left" size={14} /> Back to {h.name}</Link>
      </nav>
      <h1>Complete your reservation</h1>
      <ol className="steps" aria-label="Checkout steps">
        <li className="is-done">Your stay</li><li className="is-current" aria-current="step">Guest details</li><li>Review &amp; confirm</li>
      </ol>
      <Notice tone="warn" title="Test booking — payment not connected">
        This demo stores a real reservation in its database and holds inventory, but no payment provider is connected. No card is requested and nothing is charged.
      </Notice>

      <form className="checkout-grid" onSubmit={submit} noValidate>
        <div className="checkout-main">
          <section className="checkout-section" aria-labelledby="stay-title">
            <h2 id="stay-title"><span className="step-num">1</span> Your stay</h2>
            <div className="stay-dates">
              <div><span className="muted">Check-in</span><strong>{formatStayDate(stay.checkIn)}</strong><span className="muted">from {h.checkInTime}</span></div>
              <div><span className="muted">Check-out</span><strong>{formatStayDate(stay.checkOut)}</strong><span className="muted">by {h.checkOutTime}</span></div>
              <Link className="text-link" to={withQuery(`/hotels/${h.slug}`, stayParams(stay))}>Change dates</Link>
            </div>
            <div className="party-grid">
              <Stepper label="Adults" value={stay.adults} min={1} max={room.maxAdults * stay.rooms} onChange={(v) => setParty({ adults: v })} />
              <Stepper label="Children" value={stay.children} min={0} max={Math.max(0, room.maxOccupancy * stay.rooms - stay.adults)} onChange={(v) => setParty({ children: v })} />
              <Stepper label="Rooms" value={stay.rooms} min={1} max={maxRooms} onChange={(v) => setParty({ rooms: v })} hint={quote ? `${plural(quote.unitsAvailable, 'room')} of this type free for all nights` : undefined} />
            </div>
            <p className="field-hint">{room.name} sleeps up to {room.maxOccupancy} per room (max {plural(room.maxAdults, 'adult')}).</p>
            {quoteError && <Notice tone="bad" role="alert">{quoteError}</Notice>}
            {unavailable && <Notice tone="bad" role="alert" title="Not available">Only {plural(quote.unitsAvailable, 'room')} of this type {quote.unitsAvailable === 1 ? 'is' : 'are'} free for every night. Reduce rooms or <Link to={withQuery(`/hotels/${h.slug}`, stayParams(stay))}>choose another room</Link>.</Notice>}
          </section>

          <section className="checkout-section" aria-labelledby="guest-title">
            <h2 id="guest-title"><span className="step-num">2</span> Lead guest details</h2>
            <div className="form-grid">
              <TextInput label="First name" autoComplete="given-name" value={guest.firstName} error={errors.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} required />
              <TextInput label="Last name" autoComplete="family-name" value={guest.lastName} error={errors.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} required />
              <TextInput label="Email" type="email" autoComplete="email" value={guest.email} error={errors.email} hint="Used for this reservation only." onChange={(e) => setGuest({ ...guest, email: e.target.value })} required />
              <TextInput label="Phone (optional)" type="tel" autoComplete="tel" value={guest.phone} error={errors.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
            </div>
            <TextArea label="Special requests (optional)" rows={3} value={guest.specialRequests} error={errors.specialRequests} hint="Requests are passed to the hotel and are subject to availability." onChange={(e) => setGuest({ ...guest, specialRequests: e.target.value })} />
          </section>

          <section className="checkout-section" aria-labelledby="review-title">
            <h2 id="review-title"><span className="step-num">3</span> Review policies &amp; confirm</h2>
            <dl className="terms-list">
              <div><dt>Cancellation</dt><dd>{room.cancellationTerms}</dd></div>
              <div><dt>Meal plan</dt><dd>{room.mealPlan}</dd></div>
              <div><dt>House rules</dt><dd>{h.houseRules.join(' · ')}</dd></div>
              <div><dt>Payment</dt><dd>Not collected. Payment processing is not connected in this demonstration; a provider integration is prepared but inactive.</dd></div>
            </dl>
            <label className={`check terms-check ${errors.acceptTerms ? 'has-error' : ''}`}>
              <input type="checkbox" checked={accept} onChange={(e) => { setAccept(e.target.checked); setErrors((x) => ({ ...x, acceptTerms: '' })); }}
                aria-invalid={errors.acceptTerms ? true : undefined} aria-describedby={errors.acceptTerms ? 'terms-err' : undefined} />
              <span>I accept the cancellation terms, house rules and the demo booking conditions, and understand this is a test reservation for a fictional hotel.</span>
            </label>
            {errors.acceptTerms && <p className="field-error" id="terms-err">{errors.acceptTerms}</p>}
          </section>
        </div>

        <aside className="checkout-summary" aria-labelledby="summary-title">
          <div className="summary-card">
            <Img src={room.images[0]?.src ?? h.image.src} alt="" ratio="16 / 9" sizes="400px" />
            <div className="summary-body">
              <h2 id="summary-title" className="eyebrow">Booking summary</h2>
              <p className="summary-hotel">{h.name}</p>
              <p className="summary-room">{room.name}</p>
              <dl className="summary-facts">
                <div><dt>Dates</dt><dd>{formatStayDate(stay.checkIn, { weekday: undefined })} – {formatStayDate(stay.checkOut, { weekday: undefined })}</dd></div>
                <div><dt>Nights</dt><dd>{q?.nights ?? '—'}</dd></div>
                <div><dt>Rooms</dt><dd>{stay.rooms}</dd></div>
                <div><dt>Guests</dt><dd>{guestsLabel(stay.adults, stay.children)}</dd></div>
                <div><dt>Price per night</dt><dd>{formatMoney(room.nightlyRate, { cents: true })} per room</dd></div>
              </dl>
              <div aria-live="polite" aria-busy={quoting}>
                {priceNotice && <Notice tone="warn" role="status">{priceNotice}</Notice>}
                {q ? <PriceBreakdown quote={q} /> : <p className="muted">{quoting ? 'Calculating…' : 'Price unavailable for this selection.'}</p>}
              </div>
              <p className="field-hint">Tax and fee values are configurable demonstration rates. The server recalculates the price before saving.</p>
              <div ref={errorRef} tabIndex={-1}>
                {submitError && <Notice tone="bad" role="alert" title={submitError.title}>{submitError.text}</Notice>}
              </div>
              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting || quoting || !q || !!unavailable} aria-busy={submitting}>
                {submitting ? 'Saving reservation…' : q ? `Confirm test reservation · ${formatMoney(q.total, { cents: true })}` : 'Confirm test reservation'}
              </button>
              <p className="secure-note"><Icon name="shield" size={14} /> No payment details are requested or stored.</p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
