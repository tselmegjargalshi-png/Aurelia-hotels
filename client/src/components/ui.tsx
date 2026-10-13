import { useEffect, useId, useRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon.js';

export function Field({ label, error, hint, children, id, className }: { label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; id?: string; className?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [error ? `${fid}-err` : '', hint ? `${fid}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', error ? 'has-error' : '', className].filter(Boolean).join(' ')}>
      <label htmlFor={fid}>{label}</label>
      {children({ id: fid, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && <p className="field-hint" id={`${fid}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${fid}-err`}>{error}</p>}
    </div>
  );
}

export function TextInput({ label, error, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} className={className} id={rest.id}>{(p) => <input {...rest} {...p} />}</Field>;
}
export function Select({ label, error, children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return <Field label={label} error={error} className={className} id={rest.id}>{(p) => <select {...rest} {...p}>{children}</select>}</Field>;
}
export function TextArea({ label, error, hint, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} className={className} id={rest.id}>{(p) => <textarea {...rest} {...p} />}</Field>;
}

export function Stepper({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="stepper" role="group" aria-labelledby={id}>
      <div>
        <span id={id} className="stepper-label">{label}</span>
        {hint && <span className="stepper-hint">{hint}</span>}
      </div>
      <div className="stepper-controls">
        <button type="button" className="icon-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}><Icon name="minus" /></button>
        <output aria-live="polite" aria-label={`${label}: ${value}`}>{value}</output>
        <button type="button" className="icon-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}><Icon name="plus" /></button>
      </div>
    </div>
  );
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="stars" aria-label={`${count}-star property`} title={`${count}-star property`}>
      {Array.from({ length: count }, (_, i) => <Icon key={i} name="star" size={12} filled />)}
    </span>
  );
}

/** Clearly marks illustrative scores as demonstration data, not real reviews. */
export function DemoScore({ value }: { value: number }) {
  return (
    <span className="demo-score" title="Illustrative score for this fictional demo hotel — not based on real guest reviews.">
      <strong>{value.toFixed(1)}</strong>
      <span>Demo score</span>
    </span>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: 'ok' | 'info' | 'warn' | 'bad' | 'muted' | 'gold'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ tone = 'info', title, children, role }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children?: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className={`notice notice-${tone}`} role={role}>
      <Icon name={tone === 'ok' ? 'check' : 'info'} />
      <div>{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">A</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <h2>Something didn’t load</h2>
      <p>{message}</p>
      {onRetry && <button className="btn btn-outline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return <div className="page-loading"><Spinner label={label} /><span>{label}</span></div>;
}

/** Accessible modal dialog: focus trap, Escape to close, focus restored on close. */
export function Modal({ open, onClose, title, children, className, labelledBy }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; className?: string; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute('disabled'));
    (focusables()[0] ?? node)?.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!; const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={['modal', className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? (title ? titleId : undefined)} tabIndex={-1}>
        {title && (
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, children, id, align = 'left' }: { eyebrow?: string; title: string; children?: ReactNode; id?: string; align?: 'left' | 'center' }) {
  return (
    <div className={`section-heading align-${align}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {children && <p className="lede">{children}</p>}
    </div>
  );
}
