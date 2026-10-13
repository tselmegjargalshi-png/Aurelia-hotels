import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter, withQuery } from '../lib/router.js';
import { api } from '../lib/api.js';
import { addDays, todayIso } from '../../../shared/dates.js';
import { validateStay, type StayErrors } from '../../../shared/validation.js';
import { BOOKING_RULES } from '../../../shared/config.js';
import type { Destination } from '../../../shared/types.js';
import { stayParams, type StayState } from '../lib/stay.js';
import { guestsLabel, plural } from '../lib/format.js';
import { Icon } from './Icon.js';
import { Stepper } from './ui.js';

let destinationCache: Promise<Destination[]> | null = null;
export function loadDestinations() {
  destinationCache ??= api.get<{ destinations: Destination[] }>('/api/destinations').then((r) => r.destinations).catch((e) => { destinationCache = null; throw e; });
  return destinationCache;
}
export function useDestinations() {
  const [list, setList] = useState<Destination[]>([]);
  useEffect(() => { loadDestinations().then(setList).catch(() => setList([])); }, []);
  return list;
}

export function GuestPicker({ adults, children, rooms, onChange, error, compact }: {
  adults: number; children: number; rooms: number; onChange: (v: { adults: number; children: number; rooms: number }) => void; error?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className={`search-field guest-picker ${error ? 'has-error' : ''}`} ref={wrap}>
      <span className="search-label" id={`${panelId}-label`}>Guests</span>
      <button type="button" className="guest-trigger" aria-expanded={open} aria-controls={panelId} aria-describedby={error ? `${panelId}-err` : undefined} onClick={() => setOpen((o) => !o)}>
        <Icon name="users" />
        <span>{compact ? `${plural(adults + children, 'guest')} · ${plural(rooms, 'room')}` : `${guestsLabel(adults, children)} · ${plural(rooms, 'room')}`}</span>
      </button>
      {open && (
        <div className="guest-panel" id={panelId} role="group" aria-labelledby={`${panelId}-label`}>
          <Stepper label="Adults" hint="Ages 13+" value={adults} min={1} max={BOOKING_RULES.maxGuestsPerBooking} onChange={(v) => onChange({ adults: v, children, rooms: Math.min(rooms, v) })} />
          <Stepper label="Children" hint="Ages 0–12" value={children} min={0} max={10} onChange={(v) => onChange({ adults, children: v, rooms })} />
          <Stepper label="Rooms" value={rooms} min={1} max={Math.min(BOOKING_RULES.maxRoomsPerBooking, adults)} onChange={(v) => onChange({ adults, children, rooms: v })} />
          <p className="guest-note">Each room needs at least one adult.</p>
          <button type="button" className="btn btn-primary btn-sm btn-block" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
      {error && <p className="field-error" id={`${panelId}-err`}>{error}</p>}
    </div>
  );
}

export function SearchBar({ initial, variant = 'hero', onSearch }: { initial: StayState; variant?: 'hero' | 'compact' | 'panel'; onSearch?: (s: StayState) => void }) {
  const { navigate } = useRouter();
  const destinations = useDestinations();
  // (destination list is cached across instances)
  const [s, setS] = useState<StayState>(initial);
  const [errors, setErrors] = useState<StayErrors>({});
  const ids = useId();
  const today = todayIso();

  useEffect(() => { setS(initial); }, [initial.destination, initial.checkIn, initial.checkOut, initial.adults, initial.children, initial.rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<StayState>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (patch.checkIn && (!next.checkOut || next.checkOut <= patch.checkIn)) next.checkOut = addDays(patch.checkIn, 1);
      return next;
    });
    setErrors({});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const noDates = !s.checkIn && !s.checkOut;
    const errs = noDates ? {} : validateStay(s);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (onSearch) { onSearch(s); return; }
    navigate(withQuery('/hotels', { destination: s.destination || undefined, ...(noDates ? { adults: s.adults, children: s.children || undefined, rooms: s.rooms } : stayParams(s)) }));
  };

  const guestError = errors.adults ?? errors.children ?? errors.rooms;
  return (
    <form className={`search-bar search-${variant}`} onSubmit={submit} noValidate role="search" aria-label="Search hotels">
      {variant !== 'panel' && <div className="search-field">
        <label className="search-label" htmlFor={`${ids}-dest`}>Destination</label>
        <div className="search-control"><Icon name="pin" />
          <select id={`${ids}-dest`} value={s.destination} onChange={(e) => update({ destination: e.target.value })}>
            <option value="">All destinations</option>
            {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}, {d.country}</option>)}
          </select>
        </div>
      </div>}
      <div className={`search-field ${errors.checkIn ? 'has-error' : ''}`}>
        <label className="search-label" htmlFor={`${ids}-in`}>Check-in</label>
        <div className="search-control"><Icon name="calendar" />
          <input id={`${ids}-in`} type="date" min={today} max={addDays(today, BOOKING_RULES.maxDaysAhead)} value={s.checkIn}
            onChange={(e) => update({ checkIn: e.target.value })} aria-invalid={errors.checkIn ? true : undefined} aria-describedby={errors.checkIn ? `${ids}-in-err` : undefined} />
        </div>
        {errors.checkIn && <p className="field-error" id={`${ids}-in-err`}>{errors.checkIn}</p>}
      </div>
      <div className={`search-field ${errors.checkOut ? 'has-error' : ''}`}>
        <label className="search-label" htmlFor={`${ids}-out`}>Check-out</label>
        <div className="search-control"><Icon name="calendar" />
          <input id={`${ids}-out`} type="date" min={s.checkIn ? addDays(s.checkIn, 1) : addDays(today, 1)} value={s.checkOut}
            onChange={(e) => update({ checkOut: e.target.value })} aria-invalid={errors.checkOut ? true : undefined} aria-describedby={errors.checkOut ? `${ids}-out-err` : undefined} />
        </div>
        {errors.checkOut && <p className="field-error" id={`${ids}-out-err`}>{errors.checkOut}</p>}
      </div>
      <GuestPicker adults={s.adults} children={s.children} rooms={s.rooms} compact={variant === 'compact'} error={guestError}
        onChange={(v) => update(v)} />
      <button type="submit" className="btn btn-primary search-submit">
        <Icon name="search" /> <span>{variant === 'panel' ? 'Check availability' : 'Search availability'}</span>
      </button>
    </form>
  );
}
