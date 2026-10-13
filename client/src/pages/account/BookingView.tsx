import type { ReservationDTO } from '../../../../shared/types.js';
import { Link } from '../../lib/router.js';
import { PriceBreakdown } from '../../components/PriceBreakdown.js';
import { Img } from '../../components/Img.js';
import { Badge } from '../../components/ui.js';
import { PAYMENT_STATUS, RESERVATION_STATUS, formatDateTime, formatStayDate, guestsLabel, plural } from '../../lib/format.js';

export function StatusBadge({ status }: { status: ReservationDTO['status'] }) {
  const s = RESERVATION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Full reservation summary, used by confirmation and booking-detail pages. */
export function BookingView({ r }: { r: ReservationDTO }) {
  return (
    <div className="booking-view">
      <div className="booking-view-head">
        <Img src={r.hotel.image.src} alt={r.hotel.image.alt} ratio="16 / 9" sizes="(max-width: 720px) 100vw, 480px" />
        <div>
          <p className="eyebrow">{r.hotel.destination}</p>
          <h2><Link to={`/hotels/${r.hotel.slug}`}>{r.hotel.name}</Link></h2>
          <p className="summary-room">{r.room.name}</p>
          <div className="booking-badges"><StatusBadge status={r.status} /><Badge tone={r.paymentStatus === 'paid' ? 'ok' : 'muted'}>{r.paymentStatus === 'not_collected' ? 'Payment not collected' : PAYMENT_STATUS[r.paymentStatus]}</Badge></div>
        </div>
      </div>
      <div className="booking-view-grid">
        <dl className="summary-facts">
          <div><dt>Booking reference</dt><dd className="mono">{r.code}</dd></div>
          <div><dt>Check-in</dt><dd>{formatStayDate(r.checkIn)} · from {r.hotel.checkInTime}</dd></div>
          <div><dt>Check-out</dt><dd>{formatStayDate(r.checkOut)} · by {r.hotel.checkOutTime}</dd></div>
          <div><dt>Nights</dt><dd>{r.price.nights}</dd></div>
          <div><dt>Rooms</dt><dd>{plural(r.rooms, 'room')}</dd></div>
          <div><dt>Guests</dt><dd>{guestsLabel(r.adults, r.children)}</dd></div>
          <div><dt>Lead guest</dt><dd>{r.guest.firstName} {r.guest.lastName}<br /><span className="muted">{r.guest.email}</span></dd></div>
          <div><dt>Meal plan</dt><dd>{r.room.mealPlan}</dd></div>
          {r.specialRequests && <div><dt>Special requests</dt><dd>{r.specialRequests}</dd></div>}
          <div><dt>Booked</dt><dd>{formatDateTime(r.createdAt)}</dd></div>
        </dl>
        <div>
          <h3 className="subhead">Price</h3>
          <PriceBreakdown quote={r.price} />
          <p className="field-hint">Payment status: {PAYMENT_STATUS[r.paymentStatus]}.</p>
          <h3 className="subhead">Cancellation terms</h3>
          <p>{r.room.cancellationTerms}</p>
        </div>
      </div>
    </div>
  );
}
