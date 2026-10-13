import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type MouseEvent, type AnchorHTMLAttributes } from 'react';

/**
 * A small History-API router (React Router could not be installed offline).
 * Supports path params, query strings, link interception and scroll restoration.
 */
interface Location { pathname: string; search: string; hash: string }
interface RouterValue {
  location: Location;
  query: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

/**
 * The browser-only demo is published as a single page whose URL path can't be changed, so
 * routes live in the URL hash ("#/hotels?stars=5"). The normal build uses real paths.
 */
function readLocation(): Location {
  if (__DEMO__) {
    const raw = window.location.hash.replace(/^#/, '');
    const u = new URL(raw.startsWith('/') ? raw : '/' + raw, 'http://demo.local');
    return { pathname: u.pathname, search: u.search, hash: '' };
  }
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(readLocation);

  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    // In-page anchors ("#rooms", "#main") must not be mistaken for routes in hash mode.
    const onAnchor = (e: globalThis.MouseEvent) => {
      if (!__DEMO__) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      const href = a?.getAttribute('href');
      if (!a || !href || href.startsWith('#/') || href === '#') return;
      e.preventDefault();
      const el = document.getElementById(href.slice(1));
      el?.scrollIntoView({ behavior: 'smooth' });
      el?.focus?.({ preventScroll: true });
    };
    document.addEventListener('click', onAnchor);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
      document.removeEventListener('click', onAnchor);
    };
  }, []);

  const navigate = useCallback((to: string, opts: { replace?: boolean; scroll?: boolean } = {}) => {
    if (__DEMO__) {
      const cur = readLocation();
      const target = new URL(to, 'http://demo.local' + cur.pathname + cur.search);
      const nextRoute = target.pathname + target.search;
      if (nextRoute === cur.pathname + cur.search) return;
      window.history[opts.replace ? 'replaceState' : 'pushState']({}, '', '#' + nextRoute);
      setLocation(readLocation());
      if (opts.scroll ?? target.pathname !== cur.pathname) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) { window.location.href = to; return; }
    const next = url.pathname + url.search + url.hash;
    if (next === window.location.pathname + window.location.search + window.location.hash) return;
    const samePath = url.pathname === window.location.pathname;
    window.history[opts.replace ? 'replaceState' : 'pushState']({}, '', next);
    setLocation(readLocation());
    if (opts.scroll ?? !samePath) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const value = useMemo(() => ({ location, query: new URLSearchParams(location.search), navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter outside RouterProvider');
  return ctx;
}

export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k: string) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  const m = re.exec(pathname);
  if (!m) return null;
  const params: Record<string, string> = {};
  keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]!); });
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={__DEMO__ ? '#' + to : to} onClick={handle} {...rest}>{children}</a>;
}

export function NavLink({ to, exact, className, ...rest }: LinkProps & { exact?: boolean }) {
  const { location } = useRouter();
  const path = to.split('?')[0]!;
  const active = exact ? location.pathname === path : location.pathname === path || location.pathname.startsWith(path + '/');
  return <Link to={to} className={[className, active ? 'is-active' : ''].filter(Boolean).join(' ')} aria-current={active ? 'page' : undefined} {...rest} />;
}

/** Build a URL with query params, dropping empty values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined | string[]>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length) q.set(k, v.join(',')); continue; }
    q.set(k, v === true ? '1' : String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
