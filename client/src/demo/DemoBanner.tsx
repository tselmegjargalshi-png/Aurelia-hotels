import { useEffect, useRef } from 'react';
import { demoStorageAvailable, resetDemoStorage } from './state.js';

/**
 * Shown only in the browser-only demo build. Says plainly what this version is:
 * everything runs inside this page, and nothing is sent anywhere or paid for.
 */
export function DemoBanner() {
  const ref = useRef<HTMLDivElement>(null);

  // The home header is fixed over the hero; keep it just below the banner until the banner scrolls away.
  useEffect(() => {
    const update = () => {
      const bottom = ref.current ? Math.max(0, ref.current.getBoundingClientRect().bottom) : 0;
      document.documentElement.style.setProperty('--demo-h', `${bottom}px`);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--demo-h');
    };
  }, []);

  const reset = () => {
    resetDemoStorage();
    window.location.hash = '#/';
    window.location.reload();
  };
  return (
    <div className="demo-banner" role="note" ref={ref}>
      <p>
        <strong>Live demo.</strong>{' '}
        Aurelia Hotels is fictional. Bookings, accounts and changes stay in this browser{demoStorageAvailable() ? '' : ' tab (storage is blocked, so they reset on reload)'}; no payment is taken and no email is sent.
      </p>
      <button type="button" onClick={reset}>Reset demo</button>
    </div>
  );
}
