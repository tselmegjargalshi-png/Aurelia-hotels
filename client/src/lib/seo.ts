import { useEffect } from 'react';
import { BRAND } from '../../../shared/config.js';

/**
 * Keeps <title>, description, canonical and Open Graph tags in sync on client
 * navigation. The server renders the same tags for the first load (server/src/seo.ts).
 */
function setMeta(selector: string, attr: 'content' | 'href', value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector);
  if (!el) { el = create(); document.head.appendChild(el); }
  el.setAttribute(attr, value);
}

export function useSeo(opts: { title: string; description?: string; image?: string; noindex?: boolean }) {
  const { title, description, image, noindex } = opts;
  useEffect(() => {
    const full = title.includes(BRAND.name) ? title : `${title} | ${BRAND.name}`;
    document.title = full;
    const url = window.location.origin + window.location.pathname;
    const meta = (name: string, prop = false) => () => { const m = document.createElement('meta'); m.setAttribute(prop ? 'property' : 'name', name); return m; };
    if (description) {
      setMeta('meta[name="description"]', 'content', description, meta('description'));
      setMeta('meta[property="og:description"]', 'content', description, meta('og:description', true));
    }
    setMeta('meta[property="og:title"]', 'content', full, meta('og:title', true));
    setMeta('meta[property="og:url"]', 'content', url, meta('og:url', true));
    if (image) setMeta('meta[property="og:image"]', 'content', `${window.location.origin}/images/${image}.jpg`, meta('og:image', true));
    setMeta('link[rel="canonical"]', 'href', url, () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; });
    const robots = document.head.querySelector('meta[name="robots"]');
    if (noindex) setMeta('meta[name="robots"]', 'content', 'noindex, nofollow', meta('robots'));
    else robots?.remove();
  }, [title, description, image, noindex]);
}
