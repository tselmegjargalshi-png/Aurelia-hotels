import { useState } from 'react';

/**
 * Responsive local image with WebP srcset, lazy loading and a graceful
 * fallback panel if the file is missing (see assets/ASSETS.md).
 */
const WIDTHS = [480, 800, 1080];
/** The demo build is published as a page with files beside it, so image URLs are relative. */
const BASE = __DEMO__ ? 'images/' : '/images/';

export function Img({
  src, alt, sizes = '(max-width: 720px) 100vw, 50vw', eager = false, className, ratio,
}: { src: string; alt: string; sizes?: string; eager?: boolean; className?: string; ratio?: string }) {
  const [failed, setFailed] = useState(!src);
  const style = ratio ? { aspectRatio: ratio } : undefined;
  if (failed) {
    return (
      <div className={['img-fallback', className].filter(Boolean).join(' ')} style={style} role="img" aria-label={alt || 'Image unavailable'}>
        <span aria-hidden="true">A</span>
      </div>
    );
  }
  return (
    <img
      className={className}
      style={style}
      src={`${BASE}${src}-800.webp`}
      srcSet={WIDTHS.map((w) => `${BASE}${src}-${w}.webp ${w}w`).join(', ')}
      sizes={sizes}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding={eager ? 'sync' : 'async'}
      fetchPriority={eager ? 'high' : undefined}
      onError={() => setFailed(true)}
    />
  );
}
