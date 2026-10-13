import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useRouter, withQuery } from '../lib/router.js';
import { useAuth } from '../lib/auth.js';
import { Icon } from './Icon.js';
import { Modal } from './ui.js';
import { BRAND } from '../../../shared/config.js';
import { DemoBanner } from '../demo/DemoBanner.js';

const NAV = [
  { to: '/destinations', label: 'Destinations' },
  { to: '/hotels', label: 'Hotels' },
  { to: '/offers', label: 'Offers' },
  { to: '/about', label: 'About' },
  { to: '/account/bookings', label: 'My Bookings' },
];

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className={`logo ${light ? 'logo-light' : ''}`} aria-label={`${BRAND.name} — home`}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M9.5 23 16 8l6.5 15M12 17.5h8" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
      </svg>
      <span className="logo-word">Aurelia<small>Hotels</small></span>
    </Link>
  );
}

function AccountMenu({ light }: { light: boolean }) {
  const { user, logout } = useAuth();
  const { navigate, location } = useRouter();
  const [open, setOpen] = useState(false);
  if (!user) {
    // Return the guest to the page they were on (e.g. a hotel or checkout) after signing in.
    const here = location.pathname + location.search;
    const keep = here !== '/' && !/^\/(sign-in|register|forgot-password|reset-password)/.test(location.pathname);
    return <Link to={keep ? withQuery('/sign-in', { next: here }) : '/sign-in'} className={`nav-link ${light ? 'on-dark' : ''}`}>Sign In</Link>;
  }
  return (
    <div className="account-menu" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button className={`nav-link account-trigger ${light ? 'on-dark' : ''}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Icon name="user" /> <span>{user.name.split(' ')[0]}</span> <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className="account-dropdown" onClick={() => setOpen(false)}>
          <Link to="/account/bookings">My bookings</Link>
          <Link to="/account/favorites">Saved hotels</Link>
          <Link to="/account/profile">Profile</Link>
          {user.role === 'admin' && <Link to="/admin">Admin dashboard</Link>}
          <button onClick={async () => { await logout(); navigate('/'); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { location } = useRouter();
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const overlayRoute = location.pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const light = overlayRoute && !scrolled;
  return (
    <header className={`site-header ${light ? 'is-overlay' : 'is-solid'} ${overlayRoute ? 'is-home' : ''}`}>
      <div className="container header-inner">
        <Logo light={light} />
        <nav className="main-nav" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className={`nav-link ${light ? 'on-dark' : ''}`}>{n.label}</NavLink>)}
        </nav>
        <div className="header-actions">
          <AccountMenu light={light} />
          <Link to="/hotels" className={`btn btn-sm ${light ? 'btn-light' : 'btn-primary'}`}>Book a stay</Link>
        </div>
        <button className={`icon-btn menu-btn ${light ? 'on-dark' : ''}`} aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
      </div>
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} className="mobile-menu" labelledBy="mobile-menu-title">
        <div className="mobile-menu-head">
          <span id="mobile-menu-title" className="eyebrow">Menu</span>
          <button className="icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}><Icon name="close" size={22} /></button>
        </div>
        <nav aria-label="Mobile">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className="mobile-link">{n.label}</NavLink>)}
          {user ? (
            <>
              <NavLink to="/account/favorites" className="mobile-link">Saved hotels</NavLink>
              <NavLink to="/account/profile" className="mobile-link">Profile</NavLink>
              {user.role === 'admin' && <NavLink to="/admin" className="mobile-link">Admin dashboard</NavLink>}
              <button className="mobile-link as-button" onClick={async () => { await logout(); setMenuOpen(false); navigate('/'); }}>Sign out</button>
            </>
          ) : <NavLink to="/sign-in" className="mobile-link">Sign In</NavLink>}
        </nav>
        <Link to="/hotels" className="btn btn-primary btn-block">Book a stay</Link>
        <p className="mobile-menu-note">{BRAND.tagline}</p>
      </Modal>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo light />
          <p>{BRAND.tagline}</p>
          <p className="footer-demo">{BRAND.demoNotice}</p>
        </div>
        <nav aria-label="Explore">
          <h2>Explore</h2>
          <Link to="/destinations">Destinations</Link>
          <Link to="/hotels">All hotels</Link>
          <Link to="/offers">Offers</Link>
          <Link to="/about">About Aurelia</Link>
        </nav>
        <nav aria-label="Guests">
          <h2>Guests</h2>
          <Link to="/account/bookings">My bookings</Link>
          <Link to="/contact">Contact &amp; support</Link>
          <Link to="/contact#faq">FAQ</Link>
          <Link to="/sign-in">Sign in</Link>
        </nav>
        <div>
          <h2>Demo platform</h2>
          <p className="footer-small">Payments are not connected. Bookings made here are stored test reservations — no charges, no real stays.</p>
          <p className="footer-small">Photography supplied by the project owner; see the asset manifest for usage notes.</p>
        </div>
      </div>
      <div className="container footer-base">
        <span>© {new Date().getFullYear()} Aurelia Hotels (fictional demo)</span>
        <span>Prices in USD. Taxes and fees shown are demonstration values.</span>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { location } = useRouter();
  const isAdmin = location.pathname.startsWith('/admin');
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      {__DEMO__ && <DemoBanner />}
      {!isAdmin && <Header />}
      <main id="main" tabIndex={-1}>{children}</main>
      {!isAdmin && <Footer />}
    </>
  );
}
