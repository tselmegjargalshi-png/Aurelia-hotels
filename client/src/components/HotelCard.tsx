import { useState } from 'react';
import { Link, useRouter, withQuery } from '../lib/router.js';
import { useAuth } from '../lib/auth.js';
import { ApiError } from '../lib/api.js';
import type { HotelSummary } from '../../../shared/types.js';
import { AVAILABILITY, formatMoney } from '../lib/format.js';
import { stayParams, type StayState } from '../lib/stay.js';
import { Img } from './Img.js';
import { Icon } from './Icon.js';
import { Badge, DemoScore, Stars } from './ui.js';

export function FavoriteButton({ hotelId, hotelName, className }: { hotelId: number; hotelName: string; className?: string }) {
  const { user, favorites, toggleFavorite } = useAuth();
  const { navigate, location } = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const saved = favorites.has(hotelId);
  const onClick = async () => {
    if (!user) { navigate(withQuery('/sign-in', { next: location.pathname + location.search, reason: 'favorite' })); return; }
    setBusy(true);
    try {
      const now = await toggleFavorite(hotelId);
      setMsg(now ? `${hotelName} saved` : `${hotelName} removed from saved hotels`);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not update saved hotels.');
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={['fav-btn', saved ? 'is-saved' : '', className].filter(Boolean).join(' ')} onClick={onClick} disabled={busy}
        aria-pressed={saved} aria-label={saved ? `Remove ${hotelName} from saved hotels` : `Save ${hotelName}`}>
        <Icon name="heart" filled={saved} />
      </button>
      <span className="sr-only" role="status">{msg}</span>
    </>
  );
}

export function HotelCard({ hotel, stay, headingLevel = 3 }: { hotel: HotelSummary; stay?: StayState | null; headingLevel?: 2 | 3 }) {
  const href = withQuery(`/hotels/${hotel.slug}`, stay ? stayParams(stay) : {});
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const av = AVAILABILITY[hotel.availability];
  const unavailable = hotel.availability === 'sold_out' || hotel.availability === 'unsuitable';
  const price = hotel.availableFromPrice ?? hotel.fromPrice;
  return (
    <article className={`hotel-card ${unavailable ? 'is-unavailable' : ''}`}>
      <div className="hotel-card-media">
        <Link to={href} tabIndex={-1} aria-hidden="true"><Img src={hotel.image.src} alt="" ratio="4 / 3" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" /></Link>
        <FavoriteButton hotelId={hotel.id} hotelName={hotel.name} />
        {hotel.featured && <span className="ribbon">Featured</span>}
      </div>
      <div className="hotel-card-body">
        <p className="eyebrow">{hotel.destination.name}, {hotel.destination.country}</p>
        <H className="hotel-card-title"><Link to={href}>{hotel.name}</Link></H>
        <div className="hotel-card-meta">
          <Stars count={hotel.stars} />
          <span className="dot" aria-hidden="true">·</span>
          <span>{hotel.propertyType}</span>
          <DemoScore value={hotel.demoRating} />
        </div>
        <p className="hotel-card-tagline">{hotel.tagline}</p>
        <ul className="amenity-chips" aria-label="Key amenities">
          {hotel.breakfastIncluded && <li><Icon name="coffee" size={14} /> Breakfast included</li>}
          {hotel.freeCancellation && <li><Icon name="shield" size={14} /> Free cancellation options</li>}
          {hotel.amenities.slice(0, hotel.breakfastIncluded && hotel.freeCancellation ? 1 : 2).map((a) => <li key={a.code}>{a.label}</li>)}
        </ul>
        <div className="hotel-card-foot">
          <div className="price-block">
            {hotel.availability !== 'unknown' && <Badge tone={av.tone}>{av.label}</Badge>}
            <p className="price"><span className="price-from">{unavailable ? 'Rates from' : 'From'}</span> <strong>{formatMoney(price)}</strong> <span className="price-unit">/ night</span></p>
            <p className="price-note">Base rate per room, before taxes &amp; fees</p>
          </div>
          <Link to={href} className="btn btn-outline btn-sm">View details <Icon name="arrow" size={16} /></Link>
        </div>
      </div>
    </article>
  );
}

export function HotelCardSkeleton() {
  return (
    <div className="hotel-card skeleton-card" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '4 / 3' }} />
      <div className="hotel-card-body">
        <div className="skeleton line short" /><div className="skeleton line" /><div className="skeleton line" /><div className="skeleton line short" />
      </div>
    </div>
  );
}
