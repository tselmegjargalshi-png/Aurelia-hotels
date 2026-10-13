import { useState } from 'react';
import { Link } from '../../lib/router.js';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { EmptyState, ErrorState, PageLoading } from '../../components/ui.js';
import { formatDateTime, formatMoney, formatStayDate } from '../../lib/format.js';
import type { ReservationDTO } from '../../../../shared/types.js';
import { AdminShell } from './AdminShell.js';
import { ReservationTable } from './Overview.js';

interface CustomerRow { id: number; name: string; email: string; createdAt: string; bookings: number; value: number; lastStay: string | null }

export function AdminCustomersPage() {
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const res = useAsync(() => api.get<{ customers: CustomerRow[] }>(`/api/admin/customers?q=${encodeURIComponent(q)}`).then((r) => r.customers), q);
  return (
    <AdminShell title="Customers">
      <form className="admin-filters" role="search" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); }}>
        <label>Search<input type="search" value={term} placeholder="Name or email" onChange={(e) => setTerm(e.target.value)} /></label>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>
      <p className="muted">Only the data needed to manage stays is shown. Demo customers use reserved example.com addresses.</p>
      {res.loading ? <PageLoading /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : !res.data?.length ? <EmptyState title="No customers found" /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col" className="num">Bookings</th><th scope="col" className="num">Booked value</th><th scope="col">Latest stay</th><th scope="col">Joined</th></tr></thead>
            <tbody>{res.data.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/admin/customers/${c.id}`}>{c.name}</Link></td><td>{c.email}</td><td className="num">{c.bookings}</td>
                <td className="num">{formatMoney(c.value, { cents: true })}</td><td>{c.lastStay ? formatStayDate(c.lastStay, { weekday: undefined }) : '—'}</td><td>{formatDateTime(c.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

export function AdminCustomerDetailPage({ id }: { id: string }) {
  const res = useAsync(() => api.get<{ customer: { id: number; name: string; email: string; phone: string | null; createdAt: string }; reservations: ReservationDTO[]; favorites: { name: string; slug: string }[] }>(`/api/admin/customers/${id}`), id);
  const d = res.data;
  return (
    <AdminShell title={d?.customer.name ?? 'Customer'} actions={<Link to="/admin/customers" className="btn btn-outline btn-sm">← All customers</Link>}>
      {res.loading ? <PageLoading /> : res.error || !d ? <ErrorState message={res.error?.message ?? ''} onRetry={res.reload} /> : (
        <div className="admin-stack">
          <section className="admin-card">
            <dl className="summary-facts">
              <div><dt>Email</dt><dd>{d.customer.email}</dd></div>
              <div><dt>Phone</dt><dd>{d.customer.phone ?? '—'}</dd></div>
              <div><dt>Joined</dt><dd>{formatDateTime(d.customer.createdAt)}</dd></div>
              <div><dt>Saved hotels</dt><dd>{d.favorites.length ? d.favorites.map((f) => f.name).join(', ') : '—'}</dd></div>
            </dl>
          </section>
          <section className="admin-card">
            <h2>Booking history</h2>
            {d.reservations.length ? <ReservationTable rows={d.reservations} compact /> : <p className="muted">No bookings yet.</p>}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

export function AdminMessagesPage() {
  const res = useAsync(() => api.get<{ messages: { id: number; name: string; email: string; subject: string; message: string; createdAt: string }[] }>('/api/admin/messages').then((r) => r.messages), 'msgs');
  return (
    <AdminShell title="Messages">
      <p className="muted">Contact-form submissions saved by the site. Email delivery is not configured, so replies must be sent manually.</p>
      {res.loading ? <PageLoading /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : !res.data?.length ? <EmptyState title="No messages yet" /> : (
        <ul className="request-list">{res.data.map((m) => (
          <li key={m.id} className="admin-card">
            <div className="request-head"><strong>{m.subject}</strong><span className="muted">{formatDateTime(m.createdAt)}</span></div>
            <p className="muted">{m.name} · {m.email}</p>
            <p className="pre">{m.message}</p>
          </li>
        ))}</ul>
      )}
    </AdminShell>
  );
}
