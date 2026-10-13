import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, withQuery } from '../../lib/router.js';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { useAuth } from '../../lib/auth.js';
import { useSeo } from '../../lib/seo.js';
import { HotelCard } from '../../components/HotelCard.js';
import { Img } from '../../components/Img.js';
import { EmptyState, ErrorState, Notice, PageLoading, TextArea, TextInput } from '../../components/ui.js';
import { formatMoney, formatStayDate, plural } from '../../lib/format.js';
import { todayIso } from '../../../../shared/dates.js';
import { passwordProblem } from '../../../../shared/validation.js';
import type { HotelSummary, PublicUser, ReservationDTO } from '../../../../shared/types.js';
import { BookingView, StatusBadge } from './BookingView.js';

export function RequireAuth({ children, next }: { children: ReactNode; next: string }) {
  const { user, ready } = useAuth();
  if (!ready) return <PageLoading />;
  if (!user) {
    return (
      <div className="container narrow section">
        <EmptyState title="Please sign in" action={<div className="empty-actions">
          <Link className="btn btn-primary" to={withQuery('/sign-in', { next })}>Sign in</Link>
          <Link className="btn btn-outline" to={withQuery('/register', { next })}>Create an account</Link>
        </div>}>Sign in to see your bookings, saved hotels and profile.</EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="container account">
      <div className="account-head">
        <p className="eyebrow">Your account{user ? ` · ${user.name}` : ''}</p>
        <h1>{title}</h1>
        <nav className="subnav" aria-label="Account">
          <NavLink to="/account/bookings">My bookings</NavLink>
          <NavLink to="/account/favorites">Saved hotels</NavLink>
          <NavLink to="/account/profile">Profile</NavLink>
        </nav>
      </div>
      {children}
    </div>
  );
}

function BookingRow({ r }: { r: ReservationDTO }) {
  return (
    <li className="booking-row">
      <Img src={r.hotel.image.src} alt="" ratio="4 / 3" sizes="160px" />
      <div className="booking-row-main">
        <p className="eyebrow">{r.hotel.destination}</p>
        <h3><Link to={`/account/bookings/${r.code}`}>{r.hotel.name}</Link></h3>
        <p className="muted">{r.room.name} · {plural(r.rooms, 'room')} · {plural(r.price.nights, 'night')}</p>
        <p>{formatStayDate(r.checkIn, { weekday: undefined })} – {formatStayDate(r.checkOut, { weekday: undefined })}</p>
      </div>
      <div className="booking-row-side">
        <StatusBadge status={r.status} />
        {r.cancellationRequest?.status === 'pending' && <span className="badge badge-warn">Cancellation requested</span>}
        <strong>{formatMoney(r.price.total, { cents: true })}</strong>
        <span className="mono muted">{r.code}</span>
      </div>
    </li>
  );
}

export function MyBookingsPage() {
  useSeo({ title: 'My bookings', noindex: true });
  return <RequireAuth next="/account/bookings"><MyBookings /></RequireAuth>;
}

function MyBookings() {
  const res = useAsync(() => api.get<{ reservations: ReservationDTO[] }>('/api/reservations').then((r) => r.reservations), 'mine');
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const today = todayIso();
  const list = res.data ?? [];
  const groups = {
    upcoming: list.filter((r) => ['confirmed', 'pending_payment', 'checked_in'].includes(r.status) && r.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    past: list.filter((r) => r.status === 'checked_out' || r.status === 'no_show' || (r.status === 'confirmed' && r.checkOut < today)),
    cancelled: list.filter((r) => r.status === 'cancelled' || r.status === 'expired'),
  };
  return (
    <AccountShell title="My bookings">
      {res.loading ? <PageLoading /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : (
        <>
          <div className="tabs" role="tablist" aria-label="Booking groups">
            {(['upcoming', 'past', 'cancelled'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
                {t[0]!.toUpperCase() + t.slice(1)} ({groups[t].length})
              </button>
            ))}
          </div>
          {groups[tab].length === 0
            ? <EmptyState title={tab === 'upcoming' ? 'No upcoming stays' : `No ${tab} bookings`} action={tab === 'upcoming' ? <Link to="/hotels" className="btn btn-primary">Find a hotel</Link> : undefined} />
            : <ul className="booking-list" role="tabpanel">{groups[tab].map((r) => <BookingRow key={r.id} r={r} />)}</ul>}
        </>
      )}
    </AccountShell>
  );
}

export function BookingDetailPage({ code }: { code: string }) {
  useSeo({ title: `Booking ${code}`, noindex: true });
  return <RequireAuth next={`/account/bookings/${code}`}><BookingDetail code={code} /></RequireAuth>;
}

function BookingDetail({ code }: { code: string }) {
  const res = useAsync(() => api.get<{ reservation: ReservationDTO }>(`/api/reservations/${encodeURIComponent(code)}`).then((r) => r.reservation), code);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (res.loading) return <PageLoading />;
  if (res.error?.status === 404) return <AccountShell title="Booking"><EmptyState title="Reservation not found" action={<Link className="btn btn-primary" to="/account/bookings">Back to my bookings</Link>} /></AccountShell>;
  if (res.error || !res.data) return <AccountShell title="Booking"><ErrorState message={res.error?.message ?? ''} onRetry={res.reload} /></AccountShell>;
  const r = res.data;
  const canRequest = ['confirmed', 'pending_payment'].includes(r.status) && r.checkIn > todayIso() && r.cancellationRequest?.status !== 'pending';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const out = await api.post<{ reservation: ReservationDTO }>(`/api/reservations/${r.code}/cancellation-request`, { reason: reason || null });
      res.setData(out.reservation);
      setMsg({ tone: 'ok', text: 'Your cancellation request has been sent to the hotel team for review.' });
      setConfirming(false);
    } catch (err) {
      setMsg({ tone: 'bad', text: err instanceof ApiError ? err.message : 'Could not send the request.' });
    } finally { setBusy(false); }
  };

  return (
    <AccountShell title={`Booking ${r.code}`}>
      <Link to="/account/bookings" className="text-link">← All bookings</Link>
      <BookingView r={r} />
      <section className="detail-section" aria-labelledby="cancel-title">
        <h2 id="cancel-title">Cancellation</h2>
        {msg && <Notice tone={msg.tone} role="status">{msg.text}</Notice>}
        {r.cancellationRequest && (
          <Notice tone={r.cancellationRequest.status === 'rejected' ? 'bad' : r.cancellationRequest.status === 'approved' ? 'ok' : 'warn'} title={`Request ${r.cancellationRequest.status}`}>
            Submitted {formatStayDate(r.cancellationRequest.createdAt.slice(0, 10))}{r.cancellationRequest.reason ? ` — “${r.cancellationRequest.reason}”` : ''}
          </Notice>
        )}
        {canRequest ? (
          confirming ? (
            <form onSubmit={submit} className="cancel-form">
              <p>Terms for this rate: {r.room.cancellationTerms}</p>
              <TextArea label="Reason (optional)" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="row-actions">
                <button className="btn btn-danger" disabled={busy}>{busy ? 'Sending…' : 'Send cancellation request'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>Keep my booking</button>
              </div>
            </form>
          ) : <button className="btn btn-outline" onClick={() => setConfirming(true)}>Request cancellation</button>
        ) : !r.cancellationRequest && <p className="muted">Online cancellation isn’t available for this booking’s status or dates. Please contact the hotel.</p>}
      </section>
    </AccountShell>
  );
}

export function FavoritesPage() {
  useSeo({ title: 'Saved hotels', noindex: true });
  return <RequireAuth next="/account/favorites"><Favorites /></RequireAuth>;
}
function Favorites() {
  const { favorites } = useAuth();
  const res = useAsync(() => api.get<{ hotels: HotelSummary[] }>('/api/account/favorites').then((r) => r.hotels), 'favs');
  const list = (res.data ?? []).filter((h) => favorites.has(h.id));
  return (
    <AccountShell title="Saved hotels">
      {res.loading ? <PageLoading /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : list.length === 0
        ? <EmptyState title="No saved hotels yet" action={<Link className="btn btn-primary" to="/hotels">Browse hotels</Link>}>Tap the heart on any hotel to save it here.</EmptyState>
        : <div className="card-grid">{list.map((h) => <HotelCard key={h.id} hotel={h} />)}</div>}
    </AccountShell>
  );
}

export function ProfilePage() {
  useSeo({ title: 'Profile', noindex: true });
  return <RequireAuth next="/account/profile"><Profile /></RequireAuth>;
}
function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  useEffect(() => { if (user) { setName((n) => n || user.name); setPhone((p) => p || (user.phone ?? '')); } }, [user]);
  const [pErr, setPErr] = useState<Record<string, string>>({});
  const [pMsg, setPMsg] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [pwMsg, setPwMsg] = useState('');

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault(); setPErr({}); setPMsg('');
    try {
      const r = await api.patch<{ user: PublicUser }>('/api/account/profile', { name, phone: phone || null });
      setUser(r.user); setPMsg('Profile saved.');
    } catch (err) { if (err instanceof ApiError) setPErr({ ...err.fields, _: err.message }); }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault(); setPwErr({}); setPwMsg('');
    const problem = passwordProblem(pw.newPassword);
    if (problem) { setPwErr({ newPassword: problem }); return; }
    try {
      await api.post('/api/account/password', pw);
      setPw({ currentPassword: '', newPassword: '' }); setPwMsg('Password updated. Other sessions were signed out.');
    } catch (err) { if (err instanceof ApiError) setPwErr({ ...err.fields, _: err.message }); }
  };
  return (
    <AccountShell title="Profile">
      <div className="two-col">
        <form onSubmit={saveProfile} className="card-form" noValidate>
          <h2>Personal details</h2>
          <TextInput label="Email" value={user?.email ?? ''} disabled hint="Email changes are not supported in this demo." />
          <TextInput label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={pErr.name} autoComplete="name" />
          <TextInput label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} error={pErr.phone} autoComplete="tel" type="tel" />
          {pMsg && <Notice tone="ok" role="status">{pMsg}</Notice>}
          <button className="btn btn-primary">Save details</button>
        </form>
        <form onSubmit={savePw} className="card-form" noValidate>
          <h2>Change password</h2>
          <TextInput label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} error={pwErr.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <TextInput label="New password" type="password" autoComplete="new-password" value={pw.newPassword} error={pwErr.newPassword} hint="At least 10 characters, with a letter and a number." onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          {pwMsg && <Notice tone="ok" role="status">{pwMsg}</Notice>}
          <button className="btn btn-outline">Update password</button>
        </form>
      </div>
    </AccountShell>
  );
}
