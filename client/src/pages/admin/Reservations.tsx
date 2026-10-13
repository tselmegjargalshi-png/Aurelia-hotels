import { useState } from 'react';
import { Link, useRouter } from '../../lib/router.js';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { EmptyState, ErrorState, Notice, PageLoading, Badge } from '../../components/ui.js';
import { PriceBreakdown } from '../../components/PriceBreakdown.js';
import { RESERVATION_STATUS, PAYMENT_STATUS, formatDateTime, formatMoney, formatStayDate, guestsLabel, plural } from '../../lib/format.js';
import type { ReservationDTO, ReservationStatus } from '../../../../shared/types.js';
import { AdminShell } from './AdminShell.js';
import { ReservationTable } from './Overview.js';
import { StatusBadge } from '../account/BookingView.js';

interface CancelReq { id: number; status: string; reason: string | null; createdAt: string; reservationId: number; code: string; checkIn: string; checkOut: string; total: number; refundable: number; terms: string; hotel: string; guest: string; adminNote: string | null }

export function AdminReservationsPage() {
  const { query } = useRouter();
  const tab = query.get('tab') === 'cancellations' ? 'cancellations' : 'all';
  return (
    <AdminShell title="Reservations">
      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected={tab === 'all'} className={`tab ${tab === 'all' ? 'is-active' : ''}`} to="/admin/reservations">All reservations</Link>
        <Link role="tab" aria-selected={tab === 'cancellations'} className={`tab ${tab === 'cancellations' ? 'is-active' : ''}`} to="/admin/reservations?tab=cancellations">Cancellation requests</Link>
      </div>
      {tab === 'all' ? <ReservationList /> : <CancellationQueue />}
    </AdminShell>
  );
}

function ReservationList() {
  const { query, navigate, location } = useRouter();
  const hotels = useAsync(() => api.get<{ hotels: { slug: string; name: string }[] }>('/api/admin/hotels').then((r) => r.hotels), 'hotel-opts');
  const res = useAsync(() => api.get<{ reservations: ReservationDTO[] }>(`/api/admin/reservations${location.search}`).then((r) => r.reservations), location.search);
  const [term, setTerm] = useState(query.get('q') ?? '');
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(location.search);
    if (v) q.set(k, v); else q.delete(k);
    navigate(`/admin/reservations${q.toString() ? `?${q}` : ''}`, { replace: true, scroll: false });
  };
  return (
    <div className="admin-stack">
      <form className="admin-filters" onSubmit={(e) => { e.preventDefault(); set('q', term.trim()); }} role="search">
        <label>Search<input type="search" placeholder="Reference, guest name or email" value={term} onChange={(e) => setTerm(e.target.value)} /></label>
        <label>Status
          <select value={query.get('status') ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(RESERVATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>Hotel
          <select value={query.get('hotel') ?? ''} onChange={(e) => set('hotel', e.target.value)}>
            <option value="">All hotels</option>
            {(hotels.data ?? []).map((h) => <option key={h.slug} value={h.slug}>{h.name}</option>)}
          </select>
        </label>
        <label>Check-in from<input type="date" value={query.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} /></label>
        <label>to<input type="date" value={query.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} /></label>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>
      {res.loading ? <PageLoading /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} />
        : !res.data?.length ? <EmptyState title="No reservations match" />
        : <><p className="muted" role="status">{plural(res.data.length, 'reservation')}</p><ReservationTable rows={res.data} /></>}
    </div>
  );
}

function CancellationQueue() {
  const [status, setStatus] = useState('pending');
  const res = useAsync(() => api.get<{ requests: CancelReq[] }>(`/api/admin/cancellation-requests?status=${status}`).then((r) => r.requests), status);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const act = async (id: number, approve: boolean) => {
    setMsg(null);
    try {
      const r = await api.post<{ reservation: ReservationDTO }>(`/api/admin/cancellation-requests/${id}`, { approve, note: notes[id] || null });
      setMsg({ tone: 'ok', text: `${r.reservation.code}: request ${approve ? 'approved — reservation cancelled and inventory released' : 'rejected'}.` });
      res.reload();
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Action failed.' }); }
  };
  return (
    <div className="admin-stack">
      <label className="inline-select">Show
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option>
        </select>
      </label>
      {msg && <Notice tone={msg.tone} role="status">{msg.text}</Notice>}
      {res.loading ? <PageLoading /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : !res.data?.length ? <EmptyState title="No requests" /> : (
        <ul className="request-list">
          {res.data.map((c) => (
            <li key={c.id} className="admin-card">
              <div className="request-head">
                <div>
                  <Link to={`/admin/reservations/${c.reservationId}`} className="mono">{c.code}</Link> · {c.guest} · {c.hotel}
                  <p className="muted">{formatStayDate(c.checkIn)} → {formatStayDate(c.checkOut)} · {formatMoney(c.total, { cents: true })} · requested {formatDateTime(c.createdAt)}</p>
                </div>
                <Badge tone={c.status === 'pending' ? 'warn' : c.status === 'approved' ? 'ok' : 'bad'}>{c.status}</Badge>
              </div>
              {c.reason && <p>“{c.reason}”</p>}
              <p className="muted">Rate terms: {c.terms} {c.refundable ? '' : '(non-refundable)'}</p>
              {c.status === 'pending' ? (
                <div className="request-actions">
                  <label className="sr-only" htmlFor={`note-${c.id}`}>Note to guest</label>
                  <input id={`note-${c.id}`} placeholder="Optional note" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
                  <button className="btn btn-danger btn-sm" onClick={() => act(c.id, true)}>Approve &amp; cancel</button>
                  <button className="btn btn-outline btn-sm" onClick={() => act(c.id, false)}>Reject</button>
                </div>
              ) : c.adminNote && <p className="muted">Note: {c.adminNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Detail { reservation: ReservationDTO & { userId: number }; transitions: ReservationStatus[]; payments: { provider: string; providerRef: string; amount: number; status: string; createdAt: string }[]; history: { action: string; details: string | null; createdAt: string; actor: string | null }[] }

export function AdminReservationDetailPage({ id }: { id: string }) {
  const res = useAsync(() => api.get<Detail>(`/api/admin/reservations/${id}`), id);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const change = async (status: ReservationStatus) => {
    if (status === 'cancelled' && !window.confirm('Cancel this reservation and release its inventory?')) return;
    setBusy(true); setMsg(null);
    try {
      await api.patch(`/api/admin/reservations/${id}/status`, { status });
      setMsg({ tone: 'ok', text: `Status updated to “${RESERVATION_STATUS[status].label}”.` });
      res.reload();
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Update failed.' }); }
    finally { setBusy(false); }
  };
  const d = res.data;
  return (
    <AdminShell title={d ? `Reservation ${d.reservation.code}` : 'Reservation'} actions={<Link to="/admin/reservations" className="btn btn-outline btn-sm">← All reservations</Link>}>
      {res.loading && !d ? <PageLoading /> : res.error || !d ? <ErrorState message={res.error?.message ?? ''} onRetry={res.reload} /> : (
        <div className="admin-two">
          <section className="admin-card">
            <div className="request-head"><h2>{d.reservation.hotel.name}</h2><StatusBadge status={d.reservation.status} /></div>
            <dl className="summary-facts">
              <div><dt>Room</dt><dd>{d.reservation.room.name} × {d.reservation.rooms}</dd></div>
              <div><dt>Stay</dt><dd>{formatStayDate(d.reservation.checkIn)} → {formatStayDate(d.reservation.checkOut)} ({plural(d.reservation.price.nights, 'night')})</dd></div>
              <div><dt>Guests</dt><dd>{guestsLabel(d.reservation.adults, d.reservation.children)}</dd></div>
              <div><dt>Lead guest</dt><dd>{d.reservation.guest.firstName} {d.reservation.guest.lastName} · {d.reservation.guest.email}{d.reservation.guest.phone ? ` · ${d.reservation.guest.phone}` : ''}</dd></div>
              <div><dt>Account</dt><dd><Link to={`/admin/customers/${d.reservation.userId}`}>View customer</Link></dd></div>
              {d.reservation.specialRequests && <div><dt>Requests</dt><dd>{d.reservation.specialRequests}</dd></div>}
              <div><dt>Payment</dt><dd>{PAYMENT_STATUS[d.reservation.paymentStatus]}</dd></div>
              <div><dt>Created</dt><dd>{formatDateTime(d.reservation.createdAt)}</dd></div>
            </dl>
            <h3 className="subhead">Update status</h3>
            {msg && <Notice tone={msg.tone} role="status">{msg.text}</Notice>}
            {d.transitions.length ? (
              <div className="row-actions">
                {d.transitions.map((t) => <button key={t} className={`btn btn-sm ${t === 'cancelled' || t === 'no_show' ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => change(t)}>Mark {RESERVATION_STATUS[t].label.toLowerCase()}</button>)}
              </div>
            ) : <p className="muted">No further status changes are permitted for this reservation.</p>}
            <p className="field-hint">Check-in and no-show are only allowed from the arrival date. Refunds for paid bookings must be issued in the payment provider.</p>
          </section>
          <section className="admin-card">
            <h2>Price</h2>
            <PriceBreakdown quote={d.reservation.price} />
            <h3 className="subhead">Payments</h3>
            {d.payments.length ? <ul>{d.payments.map((p) => <li key={p.providerRef}>{p.provider} · {p.providerRef} · {formatMoney(p.amount, { cents: true })} · {p.status}</li>)}</ul> : <p className="muted">No payment records (test booking).</p>}
            <h3 className="subhead">History</h3>
            {d.history.length ? <ul className="history">{d.history.map((h, i) => <li key={i}>{formatDateTime(h.createdAt)} — {h.actor ?? 'System'}: {h.action} {h.details && <code>{h.details}</code>}</li>)}</ul> : <p className="muted">No admin changes yet.</p>}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
