import { Link } from '../../lib/router.js';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { ErrorState, PageLoading } from '../../components/ui.js';
import { formatMoney, formatStayDate, plural } from '../../lib/format.js';
import type { ReservationDTO } from '../../../../shared/types.js';
import { AdminShell } from './AdminShell.js';
import { StatusBadge } from '../account/BookingView.js';

interface Overview {
  today: string; horizonNights: number; paymentMode: 'test' | 'provider';
  totals: Record<'reservations' | 'active' | 'arrivalsToday' | 'upcomingCheckIns' | 'upcomingCheckOuts' | 'inHouse' | 'pendingCancellations' | 'unreadMessages', number>;
  revenue: { booked: number; realised: number; paid: number };
  occupancy: { hotelId: number; hotel: string; roomNights: number; booked: number; rate: number }[];
  recent: ReservationDTO[];
}

export function ReservationTable({ rows, compact }: { rows: ReservationDTO[]; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th scope="col">Reference</th><th scope="col">Guest</th><th scope="col">Hotel · Room</th><th scope="col">Stay</th><th scope="col">Status</th><th scope="col" className="num">Total</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/admin/reservations/${r.id}`} className="mono">{r.code}</Link></td>
              <td>{r.guest.firstName} {r.guest.lastName}{!compact && <><br /><span className="muted">{r.guest.email}</span></>}</td>
              <td>{r.hotel.name}<br /><span className="muted">{r.room.name} × {r.rooms}</span></td>
              <td>{formatStayDate(r.checkIn, { weekday: undefined, year: undefined })} → {formatStayDate(r.checkOut, { weekday: undefined, year: undefined })}<br /><span className="muted">{plural(r.price.nights, 'night')}</span></td>
              <td><StatusBadge status={r.status} />{r.cancellationRequest?.status === 'pending' && <span className="badge badge-warn">Cancel req.</span>}</td>
              <td className="num">{formatMoney(r.price.total, { cents: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminOverviewPage() {
  return <AdminShell title="Overview"><OverviewBody /></AdminShell>;
}

function OverviewBody() {
  const res = useAsync(() => api.get<Overview>('/api/admin/overview'), 'overview');
  if (res.loading) return <PageLoading />;
  if (res.error || !res.data) return <ErrorState message={res.error?.message ?? ''} onRetry={res.reload} />;
  const o = res.data;
  const tiles = [
    { label: 'Total reservations', value: o.totals.reservations, note: 'All time, excl. expired holds' },
    { label: 'Arrivals today', value: o.totals.arrivalsToday, note: formatStayDate(o.today) },
    { label: 'Check-ins · next 7 days', value: o.totals.upcomingCheckIns, note: 'Confirmed arrivals' },
    { label: 'Check-outs · next 7 days', value: o.totals.upcomingCheckOuts, note: 'Departures due' },
    { label: 'In house', value: o.totals.inHouse, note: 'Currently checked in' },
    { label: 'Cancellation requests', value: o.totals.pendingCancellations, note: 'Awaiting review', href: '/admin/reservations?tab=cancellations' },
  ];
  return (
    <div className="admin-stack">
      <section aria-label="Key figures" className="kpi-grid">
        {tiles.map((t) => (
          <div key={t.label} className="kpi">
            <span className="kpi-label">{t.label}</span>
            <strong className="kpi-value">{t.value}</strong>
            <span className="kpi-note">{t.href ? <Link to={t.href}>{t.note}</Link> : t.note}</span>
          </div>
        ))}
      </section>

      <div className="admin-two">
        <section className="admin-card" aria-labelledby="occ-title">
          <h2 id="occ-title">Occupancy · next {o.horizonNights} nights</h2>
          <p className="muted">Booked room-nights ÷ sellable room-nights (after inventory overrides).</p>
          <ul className="bar-list">
            {o.occupancy.map((h) => (
              <li key={h.hotelId}>
                <div className="bar-label"><span>{h.hotel}</span><span>{Math.round(h.rate * 100)}% <small className="muted">({h.booked}/{h.roomNights})</small></span></div>
                <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(h.rate * 100)} aria-label={`${h.hotel} occupancy`}>
                  <span style={{ width: `${Math.max(1, h.rate * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="admin-card" aria-labelledby="rev-title">
          <h2 id="rev-title">Revenue summary</h2>
          <dl className="rev-list">
            <div><dt>On the books</dt><dd>{formatMoney(o.revenue.booked, { cents: true })}</dd><p>Confirmed, in-house and completed stays (incl. demo taxes &amp; fees).</p></div>
            <div><dt>Realised</dt><dd>{formatMoney(o.revenue.realised, { cents: true })}</dd><p>Completed (checked-out) stays.</p></div>
            <div><dt>Collected via payment provider</dt><dd>{formatMoney(o.revenue.paid, { cents: true })}</dd>
              <p>{o.paymentMode === 'test' ? 'Payments are not connected — nothing has been collected. This figure only changes after verified provider confirmations.' : 'Sum of reservations confirmed as paid by the provider.'}</p></div>
          </dl>
        </section>
      </div>

      <section className="admin-card" aria-labelledby="recent-title">
        <div className="section-head-row"><h2 id="recent-title">Recent reservations</h2><Link to="/admin/reservations" className="text-link">All reservations</Link></div>
        <ReservationTable rows={o.recent} compact />
      </section>
    </div>
  );
}
