import { Link } from '../lib/router.js';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useAuth } from '../lib/auth.js';
import { useSeo } from '../lib/seo.js';
import { Icon } from '../components/Icon.js';
import { EmptyState, ErrorState, Notice, PageLoading } from '../components/ui.js';
import { BookingView } from './account/BookingView.js';
import type { ReservationDTO } from '../../../shared/types.js';

/**
 * The confirmation is rendered from the reservation as re-read from the
 * server — never from client state — so it can only appear for a saved booking.
 */
export function ConfirmationPage({ code }: { code: string }) {
  useSeo({ title: 'Reservation confirmation', noindex: true });
  const { user, ready } = useAuth();
  const res = useAsync(() => api.get<{ reservation: ReservationDTO }>(`/api/reservations/${encodeURIComponent(code)}`).then((r) => r.reservation), `${code}|${user?.id ?? ''}`);

  if (!ready || res.loading) return <PageLoading label="Loading your reservation…" />;
  if (!user) return <div className="container narrow section"><EmptyState title="Sign in to view this reservation" action={<Link className="btn btn-primary" to={`/sign-in?next=/bookings/${code}/confirmation`}>Sign in</Link>} /></div>;
  if (res.error?.status === 404) return <div className="container narrow section"><EmptyState title="Reservation not found" action={<Link className="btn btn-primary" to="/account/bookings">My bookings</Link>}>We couldn’t find a reservation with that reference on your account.</EmptyState></div>;
  if (res.error || !res.data) return <div className="container section"><ErrorState message={res.error?.message ?? 'Unknown error'} onRetry={res.reload} /></div>;

  const r = res.data;
  const confirmed = r.status === 'confirmed';
  return (
    <div className="container confirmation">
      <div className="confirmation-head" role="status">
        <span className={`confirm-mark ${confirmed ? '' : 'is-pending'}`} aria-hidden="true"><Icon name={confirmed ? 'check' : 'clock'} size={28} /></span>
        <p className="eyebrow">{confirmed ? 'Reservation saved' : 'Reservation received'}</p>
        <h1>{confirmed ? 'Your test reservation is confirmed.' : r.status === 'pending_payment' ? 'Awaiting payment confirmation.' : 'Reservation status: ' + r.status}</h1>
        <p className="lede">Reference <strong className="mono">{r.code}</strong>. It is saved to your account and the room is held for your dates.</p>
      </div>
      {r.paymentMode === 'test' && (
        <Notice tone="warn" title="This is a test booking">
          Payment processing is not connected, so no payment was taken and the status “payment not collected” is accurate. Aurelia is a fictional brand — this reservation does not secure a real stay. No confirmation email is sent.
        </Notice>
      )}
      <BookingView r={r} />
      <div className="confirmation-actions">
        <Link className="btn btn-primary" to={`/account/bookings/${r.code}`}>Manage booking</Link>
        <Link className="btn btn-outline" to="/hotels">Explore more hotels</Link>
      </div>
    </div>
  );
}
