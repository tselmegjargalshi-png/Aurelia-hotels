import { Link, withQuery } from '../lib/router.js';
import type { RoomTypeDTO } from '../../../shared/types.js';
import { AVAILABILITY, formatMoney, plural } from '../lib/format.js';
import { stayParams, type StayState } from '../lib/stay.js';
import { Img } from './Img.js';
import { Icon } from './Icon.js';
import { Badge } from './ui.js';

export function RoomFacts({ room }: { room: RoomTypeDTO }) {
  return (
    <ul className="room-facts">
      <li><Icon name="users" size={16} /> Sleeps {room.maxOccupancy} (max {plural(room.maxAdults, 'adult')})</li>
      <li><Icon name="bed" size={16} /> {room.bed}</li>
      <li><Icon name="ruler" size={16} /> {room.sizeSqm} m²</li>
      <li><Icon name="coffee" size={16} /> {room.mealPlan}</li>
    </ul>
  );
}

export function RoomCard({ room, hotelSlug, stay, onChooseDates }: { room: RoomTypeDTO; hotelSlug: string; stay: StayState | null; onChooseDates: () => void }) {
  const av = AVAILABILITY[room.availability];
  const bookable = room.availability === 'available' || room.availability === 'limited';
  const detailHref = withQuery(`/hotels/${hotelSlug}/rooms/${room.slug}`, stay ? stayParams(stay) : {});
  const checkoutHref = stay ? withQuery('/checkout', { hotel: hotelSlug, room: room.slug, ...stayParams(stay) }) : '';
  const img = room.images[0];
  return (
    <article className={`room-card ${stay && !bookable ? 'is-unavailable' : ''}`} aria-labelledby={`room-${room.id}`}>
      <Link to={detailHref} className="room-card-media" tabIndex={-1} aria-hidden="true">
        <Img src={img?.src ?? ''} alt="" ratio="4 / 3" sizes="(max-width: 720px) 100vw, 320px" />
      </Link>
      <div className="room-card-body">
        <h3 id={`room-${room.id}`}><Link to={detailHref}>{room.name}</Link></h3>
        <p className="room-desc">{room.description}</p>
        <RoomFacts room={room} />
        <p className={`room-terms ${room.refundable ? 'is-flex' : ''}`}>
          <Icon name="shield" size={16} /> {room.refundable ? 'Free cancellation available' : 'Non-refundable rate'}
          <span className="sr-only">: {room.cancellationTerms}</span>
        </p>
      </div>
      <div className="room-card-aside">
        <div className="room-price">
          <p className="price"><strong>{formatMoney(room.nightlyRate)}</strong> <span className="price-unit">/ night</span></p>
          <p className="price-note">Base rate per room. Total with taxes &amp; fees shown at checkout.</p>
        </div>
        <div className="room-cta">
        {stay ? (
          <>
            <Badge tone={av.tone}>
              {room.availability === 'limited' && room.unitsAvailable !== null ? `Only ${plural(room.unitsAvailable, 'room')} left for these dates` : av.label}
            </Badge>
            {bookable
              ? <Link to={checkoutHref} className="btn btn-primary">Select room</Link>
              : <button className="btn btn-outline" disabled>{room.availability === 'unsuitable' ? 'Too small for your party' : 'Unavailable'}</button>}
          </>
        ) : (
          <button type="button" className="btn btn-outline" onClick={onChooseDates}>Choose dates</button>
        )}
        <Link to={detailHref} className="text-link">Room details</Link>
        </div>
      </div>
    </article>
  );
}
