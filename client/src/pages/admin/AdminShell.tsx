import type { ReactNode } from 'react';
import { Link, NavLink, useRouter } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { useSeo } from '../../lib/seo.js';
import { Logo } from '../../components/Layout.js';
import { Icon } from '../../components/Icon.js';
import { EmptyState } from '../../components/ui.js';
import { RequireAuth } from '../account/Account.js';

const NAV = [
  { to: '/admin', label: 'Overview', icon: 'grid', exact: true },
  { to: '/admin/reservations', label: 'Reservations', icon: 'calendar' },
  { to: '/admin/hotels', label: 'Hotels & rooms', icon: 'bed' },
  { to: '/admin/customers', label: 'Customers', icon: 'users' },
  { to: '/admin/messages', label: 'Messages', icon: 'mail' },
];

/**
 * UI-level guard only — every admin API independently enforces the admin role
 * on the server (see server/src/lib/auth.ts → requireAdmin).
 */
export function AdminShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  useSeo({ title: `Admin · ${title}`, noindex: true });
  const { location } = useRouter();
  return (
    <RequireAuth next={location.pathname + location.search}>
      <AdminGate title={title} actions={actions}>{children}</AdminGate>
    </RequireAuth>
  );
}

function AdminGate({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  if (user?.role !== 'admin') {
    return (
      <div className="container narrow section">
        <EmptyState title="Administrators only" action={<Link to="/" className="btn btn-primary">Return to the site</Link>}>
          Your account doesn’t have access to the management dashboard.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="admin">
      <aside className="admin-side">
        <Logo light />
        <nav aria-label="Admin">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} exact={n.exact} className="admin-link"><Icon name={n.icon} /> {n.label}</NavLink>)}
        </nav>
        <div className="admin-side-foot">
          <Link to="/" className="admin-link"><Icon name="arrow" /> View site</Link>
          <button className="admin-link" onClick={async () => { await logout(); navigate('/'); }}><Icon name="logout" /> Sign out</button>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-banner" role="note"><Icon name="info" size={16} /> Demonstration dashboard · fictional data · payments not connected (no revenue is collected).</div>
        <header className="admin-head">
          <h1>{title}</h1>
          {actions && <div className="admin-actions">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}
