import { useRef, type RefObject } from 'react';
import { Link, useRouter, withQuery } from '../lib/router.js';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useSeo } from '../lib/seo.js';
import { hasValidStay, stayFromQuery, stayParams, type StayState } from '../lib/stay.js';
import { Gallery } from '../components/Gallery.js';
import { RoomCard } from '../components/RoomCard.js';
import { SearchBar } from '../components/SearchBar.js';
import { FavoriteButton } from '../components/HotelCard.js';
import { Icon } from '../components/Icon.js';
import { DemoScore, ErrorState, Notice, PageLoading, Stars, Badge } from '../components/ui.js';
import { AVAILABILITY, formatMoney, formatStayDate, guestsLabel, plural } from '../lib/format.js';
import type { HotelDetail } from '../../../shared/types.js';
import { NotFoundPage } from './NotFound.js';

export function useHotel(slug: string) {
  const { location } = useRouter();
  return useAsync(() => api.get<{ hotel: HotelDetail }>(`/api/hotels/${encodeURIComponent(slug)}${location.search}`).then((r) => r.hotel), `${slug}${location.search}`);
}

export function BookingPanel({ hotel, stay, panelRef }: { hotel: HotelDetail; stay: StayState; panelRef?: RefObject<HTMLDivElement | null> }) {
  const { navigate, location } = useRouter();
  const valid = hasValidStay(stay);
  const av = AVAILABILITY[hotel.availability];
  return (
    <div className="booking-panel" ref={panelRef} id="booking-panel" tabIndex={-1} aria-labelledby="booking-panel-title">
      <p className="eyebrow">Reserve</p>
      <h2 id="booking-panel-title" className="booking-panel-title">
        {valid && hotel.availableFromPrice ? <>From {formatMoney(hotel.availableFromPrice)} <small>/ night</small></> : <>Rates from {formatMoney(hotel.fromPrice)} <small>/ night</small></>}
      </h2>
      <p className="price-note">Base rate per room, before taxes &amp; fees.</p>
      <SearchBar initial={stay} variant="panel" onSearch={(s) => navigate(withQuery(location.pathname, stayParams(s)), { replace: true, scroll: false })} />
      {valid && (
        <div className="booking-panel-status" role="status">
          <Badge tone={av.tone}>{av.label}</Badge>
          <p>{formatStayDate(stay.checkIn)} → {formatStayDate(stay.checkOut)}<br />{guestsLabel(stay.adults, stay.children)} · {plural(stay.rooms, 'room')}</p>
          {(hotel.availability === 'available' || hotel.availability === 'limited') && <a href="#rooms" className="btn btn-primary btn-block">Choose a room</a>}
        </div>
      )}
    </div>
  );
}

export function HotelDetailPage({ slug }: { slug: string }) {
  const { query } = useRouter();
  const stay = stayFromQuery(query);
  const valid = hasValidStay(stay);
  const hotel = useHotel(slug);
  const panelRef = useRef<HTMLDivElement>(null);
  const h = hotel.data;
  useSeo({ title: h ? `${h.name} — ${h.tagline}` : 'Hotel', description: h?.overview, image: h?.images[0]?.src });

  if (hotel.loading && !h) return <PageLoading label="Loading hotel…" />;
  if (hotel.error?.status === 404) return <NotFoundPage />;
  if (hotel.error && !h) return <div className="container section"><ErrorState message={hotel.error.message} onRetry={hotel.reload} /></div>;
  if (!h) return null;

  const chooseDates = () => { panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); panelRef.current?.querySelector('input')?.focus(); };
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${h.latitude}&mlon=${h.longitude}#map=12/${h.latitude}/${h.longitude}`;

  return (
    <article className="hotel-detail">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/hotels">Hotels</Link><span aria-hidden="true">/</span>
          <Link to={withQuery('/hotels', { destination: h.destination.slug })}>{h.destination.name}</Link><span aria-hidden="true">/</span>
          <span aria-current="page">{h.name}</span>
        </nav>
        <header className="hotel-head">
          <div>
            <p className="eyebrow">{h.destination.name}, {h.destination.country} · {h.propertyType}</p>
            <h1>{h.name}</h1>
            <div className="hotel-head-meta">
              <Stars count={h.stars} /><DemoScore value={h.demoRating} />
              <span className="muted"><Icon name="pin" size={14} /> {h.address}</span>
            </div>
          </div>
          <FavoriteButton hotelId={h.id} hotelName={h.name} className="fav-inline" />
        </header>
        <Gallery images={h.images} name={h.name} />
      </div>

      <div className="container detail-layout">
        <div className="detail-main">
          <section aria-labelledby="overview-title" className="detail-section">
            <h2 id="overview-title">Overview</h2>
            <p className="lede">{h.overview}</p>
            <p>{h.description}</p>
          </section>

          <section aria-labelledby="amenities-title" className="detail-section">
            <h2 id="amenities-title">Amenities</h2>
            <ul className="amenity-list">
              {h.breakfastIncluded && <li><Icon name="coffee" /> Breakfast included on most rates</li>}
              {h.amenities.map((a) => <li key={a.code}><Icon name="check" /> {a.label}</li>)}
            </ul>
          </section>

          <section aria-labelledby="rooms-title" className="detail-section" id="rooms">
            <div className="section-head-row">
              <h2 id="rooms-title">Rooms &amp; suites</h2>
              {valid && <span className="muted">{formatStayDate(stay.checkIn, { weekday: undefined, year: undefined })} – {formatStayDate(stay.checkOut, { weekday: undefined, year: undefined })} · {plural(stay.rooms, 'room')}</span>}
            </div>
            {!valid && <Notice tone="info">Choose dates to see which rooms are available for every night of your stay.</Notice>}
            {valid && h.availability === 'sold_out' && <Notice tone="warn" title="Fully booked for these dates">Try different dates or another Aurelia hotel nearby.</Notice>}
            {valid && h.availability === 'unsuitable' && <Notice tone="warn" title="No single room type fits your party">Try adding another room in the guest selector.</Notice>}
            <div className="room-list">
              {h.rooms.map((r) => <RoomCard key={r.id} room={r} hotelSlug={h.slug} stay={valid ? stay : null} onChooseDates={chooseDates} />)}
            </div>
          </section>

          <section aria-labelledby="policies-title" className="detail-section">
            <h2 id="policies-title">Policies</h2>
            <div className="policy-grid">
              <div><h3><Icon name="clock" /> Check-in &amp; check-out</h3><p>Check-in from {h.checkInTime}<br />Check-out by {h.checkOutTime}</p></div>
              <div><h3><Icon name="shield" /> Cancellation</h3><p>{h.cancellationPolicy}</p></div>
              <div><h3><Icon name="info" /> House rules</h3><ul>{h.houseRules.map((r) => <li key={r}>{r}</li>)}</ul></div>
            </div>
          </section>

          <section aria-labelledby="location-title" className="detail-section">
            <h2 id="location-title">Location</h2>
            <div className="map-placeholder" role="img" aria-label={`Map placeholder for ${h.name}. Approximate coordinates ${h.latitude.toFixed(3)}, ${h.longitude.toFixed(3)}.`}>
              <div className="map-grid" aria-hidden="true" />
              <div className="map-pin" aria-hidden="true"><Icon name="pin" size={28} /></div>
              <div className="map-card">
                <strong>{h.name}</strong>
                <span>{h.address}</span>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-link">Open approximate area in OpenStreetMap <Icon name="arrow" size={14} /></a>
                <small>Interactive maps are not integrated in this demo; coordinates are approximate for a fictional property.</small>
              </div>
            </div>
            <h3 className="subhead">Nearby</h3>
            <ul className="nearby-list">
              {h.nearby.map((n) => <li key={n.name}><span>{n.name}</span><span className="muted">{n.distance}</span></li>)}
            </ul>
          </section>
        </div>
        <aside className="detail-aside">
          <BookingPanel hotel={h} stay={stay} panelRef={panelRef} />
        </aside>
      </div>
    </article>
  );
}
