import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageRef } from '../../../shared/types.js';
import { Img } from './Img.js';
import { Icon } from './Icon.js';
import { Modal } from './ui.js';

/** Editorial mosaic + accessible full-screen viewer (keyboard arrows, Escape, swipe). */
export function Gallery({ images, name }: { images: ImageRef[]; name: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const shown = images.slice(0, 5);
  if (!images.length) return <div className="gallery-empty"><Img src="" alt={`${name} — image unavailable`} ratio="16 / 7" /></div>;
  return (
    <div className="gallery">
      <div className={`gallery-mosaic count-${shown.length}`}>
        {shown.map((img, i) => (
          <button key={`${img.src}-${i}`} type="button" className={`gallery-tile ${i === 0 ? 'is-lead' : ''}`} onClick={() => setIndex(i)}
            aria-label={`View photo ${i + 1} of ${images.length}: ${img.alt}`}>
            <Img src={img.src} alt="" eager={i === 0} sizes={i === 0 ? '(max-width: 720px) 100vw, 60vw' : '25vw'} />
          </button>
        ))}
        <button type="button" className="btn btn-light btn-sm gallery-all" onClick={() => setIndex(0)}>
          <Icon name="expand" size={16} /> View all {images.length} photos
        </button>
      </div>
      <Lightbox images={images} index={index} onIndex={setIndex} name={name} />
    </div>
  );
}

export function Lightbox({ images, index, onIndex, name }: { images: ImageRef[]; index: number | null; onIndex: (i: number | null) => void; name: string }) {
  const startX = useRef<number | null>(null);
  const count = images.length;
  const go = useCallback((d: number) => { if (index !== null) onIndex((index + d + count) % count); }, [index, count, onIndex]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, go]);

  const img = index !== null ? images[index] : undefined;
  return (
    <Modal open={index !== null} onClose={() => onIndex(null)} className="lightbox" labelledBy="lightbox-caption">
      {img && (
        <>
          <div className="lightbox-bar">
            <span aria-live="polite">{(index ?? 0) + 1} / {count}</span>
            <button className="icon-btn on-dark" onClick={() => onIndex(null)} aria-label="Close gallery"><Icon name="close" size={22} /></button>
          </div>
          <div className="lightbox-stage"
            onPointerDown={(e) => { startX.current = e.clientX; }}
            onPointerUp={(e) => { if (startX.current !== null) { const dx = e.clientX - startX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } startX.current = null; }}>
            <button className="icon-btn on-dark lightbox-nav prev" onClick={() => go(-1)} aria-label="Previous photo"><Icon name="chevron-left" size={28} /></button>
            <Img key={`${img.src}-${index}`} src={img.src} alt={img.alt} eager sizes="100vw" className="lightbox-img" />
            <button className="icon-btn on-dark lightbox-nav next" onClick={() => go(1)} aria-label="Next photo"><Icon name="chevron-right" size={28} /></button>
          </div>
          <p className="lightbox-caption" id="lightbox-caption">{name} — {img.alt}</p>
        </>
      )}
    </Modal>
  );
}
