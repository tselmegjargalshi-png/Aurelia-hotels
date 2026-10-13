import { useState } from 'react';
import { Link, useRouter, withQuery } from '../lib/router.js';
import { useSeo } from '../lib/seo.js';
import { hasValidStay, stayFromQuery, stayParams } from '../lib/stay.js';
import { useHotel } from './HotelDetail.js';
import { Img } from '../components/Img.js';
import { Lightbox } from '../components/Gallery.js';
import { RoomFacts } from '../components/RoomCard.js';
import { SearchBar } from '../components/SearchBar.js';
import { Icon } from '../components/Icon.js';
import { Badge, ErrorState, PageLoading } from '../components/ui.js';
import { AVAILABILITY, formatMoney, plural } from '../lib/format.js';
import { NotFoundPage } from './NotFound.js';

export function RoomDetailPage({ slug, roomSlug }: { slug: string; roomSlug: string }) {
  const { query, navigate, location } = useRouter();
  const stay = stayFromQuery(query);
  const valid = hasValidStay(stay);
  const hotel = useHotel(slug);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const h = hotel.data;
  const room = h?.rooms.find((r) => r.slug === roomSlug);
  useSeo({ title: room && h ? `${room.name} — ${h.name}` : 'Room', description: room?.description, image: room?.images[0]?.src });

  if (hotel.loading && !h) return <PageLoading label="Loading room…" />;
  if (hotel.error?.status === 404 || (h && !room)) return <NotFoundPage />;
  if (hotel.error && !h) return <div className="container section"><ErrorState message={hotel.error.message} onRetry={hotel.reload} /></div>;
  if (!h || !room) return null;

  const images = room.images.length ? room.images : h.images.slice(0, 1);
  const av = AVAILABILITY[room.availability];
  const bookable = room.availability === 'available' || room.availability === 'limited';

  return (
    <article className="room-detail container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/hotels">Hotels</Link><span aria-hidden="true">/</span>
        <Link to={withQuery(`/hotels/${h.slug}`, valid ? stayParams(stay) : {})}>{h.name}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{room.name}</span>
      </nav>
      <div className="room-detail-grid">
        <div>
          <button type="button" className="room-hero" onClick={() => setLightbox(0)} aria-label={`View photos of ${room.name}`}>
            <Img src={images[0]?.src ?? ''} alt={images[0]?.alt ?? room.name} eager ratio="3 / 2" sizes="(max-width: 900px) 100vw, 60vw" />
            {images.length > 1 && <span className="btn btn-light btn-sm gallery-all"><Icon name="expand" size={16} /> {images.length} photos</span>}
          </button>
          <Lightbox images={images} index={lightbox} onIndex={setLightbox} name={room.name} />
          <p className="eyebrow">{h.name}</p>
          <h1>{room.name}</h1>
          <p className="lede">{room.description}</p>
          <RoomFacts room={room} />
          <section className="detail-section" aria-labelledby="room-amenities">
            <h2 id="room-amenities">In the room</h2>
            <ul className="amenity-list">{room.amenities.map((a) => <li key={a}><Icon name="check" /> {a}</li>)}</ul>
          </section>
          <section className="detail-section" aria-labelledby="room-terms">
            <h2 id="room-terms">Rate &amp; cancellation</h2>
            <dl className="terms-list">
              <div><dt>Base nightly rate</dt><dd>{formatMoney(room.nightlyRate)} per room, before taxes &amp; fees</dd></div>
              <div><dt>Meal plan</dt><dd>{room.mealPlan}</dd></div>
              <div><dt>Cancellation</dt><dd>{room.cancellationTerms}</dd></div>
              <div><dt>Occupancy</dt><dd>Up to {plural(room.maxOccupancy, 'guest')} per room, including at most {plural(room.maxAdults, 'adult')}</dd></div>
            </dl>
          </section>
        </div>
        <aside className="detail-aside">
          <div className="booking-panel">
            <p className="eyebrow">Reserve this room</p>
            <h2 className="booking-panel-title">{formatMoney(room.nightlyRate)} <small>/ night</small></h2>
            <p className="price-note">Base rate per room. The full total — taxes, fees and any offer — is calculated at checkout.</p>
            <SearchBar initial={stay} variant="panel" onSearch={(s) => navigate(withQuery(location.pathname, stayParams(s)), { replace: true, scroll: false })} />
            {valid && (
              <div className="booking-panel-status" role="status">
                <Badge tone={av.tone}>{room.availability === 'limited' && room.unitsAvailable !== null ? `Only ${plural(room.unitsAvailable, 'room')} left` : av.label}</Badge>
                {bookable
                  ? <Link className="btn btn-primary btn-block" to={withQuery('/checkout', { hotel: h.slug, room: room.slug, ...stayParams(stay) })}>Continue to booking</Link>
                  : <p className="muted">Try other dates, or see <Link to={withQuery(`/hotels/${h.slug}`, stayParams(stay))}>other rooms</Link>.</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
