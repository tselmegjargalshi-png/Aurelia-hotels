import { useEffect, useMemo, useState } from 'react';
import { useRouter, withQuery } from '../lib/router.js';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useSeo } from '../lib/seo.js';
import { stayFromQuery, hasValidStay } from '../lib/stay.js';
import { SearchBar, useDestinations } from '../components/SearchBar.js';
import { HotelCard, HotelCardSkeleton } from '../components/HotelCard.js';
import { Icon } from '../components/Icon.js';
import { EmptyState, ErrorState, Modal, Notice } from '../components/ui.js';
import { formatStayDate, guestsLabel, plural } from '../lib/format.js';
import type { Amenity, HotelSummary } from '../../../shared/types.js';

interface SearchResponse { hotels: HotelSummary[]; propertyTypes: string[] }

const FILTER_KEYS = ['minPrice', 'maxPrice', 'stars', 'type', 'amenities', 'breakfast', 'freeCancellation', 'availableOnly'];

function useAmenities() {
  const [list, setList] = useState<Amenity[]>([]);
  useEffect(() => { api.get<{ amenities: Amenity[] }>('/api/amenities').then((r) => setList(r.amenities)).catch(() => setList([])); }, []);
  return list;
}

function Filters({ query, propertyTypes, amenities, setParam, toggleListParam, hasDates, idPrefix }: {
  query: URLSearchParams; propertyTypes: string[]; amenities: Amenity[]; hasDates: boolean; idPrefix: string;
  setParam: (k: string, v: string | null) => void; toggleListParam: (k: string, v: string) => void;
}) {
  const listOf = (k: string) => (query.get(k) ?? '').split(',').filter(Boolean);
  const [minP, setMinP] = useState(query.get('minPrice') ?? '');
  const [maxP, setMaxP] = useState(query.get('maxPrice') ?? '');
  useEffect(() => { setMinP(query.get('minPrice') ?? ''); setMaxP(query.get('maxPrice') ?? ''); }, [query]);
  const priceError = minP && maxP && Number(minP) > Number(maxP) ? 'Minimum must be below maximum.' : '';
  const applyPrice = () => { if (!priceError) { setParam('minPrice', minP || null); setParam('maxPrice', maxP || null); } };

  return (
    <div className="filters">
      <fieldset>
        <legend>Nightly price (USD)</legend>
        <div className="price-inputs">
          <label htmlFor={`${idPrefix}-min`} className="sr-only">Minimum price</label>
          <input id={`${idPrefix}-min`} inputMode="numeric" type="number" min={0} step={10} placeholder="Min" value={minP} onChange={(e) => setMinP(e.target.value)} onBlur={applyPrice} onKeyDown={(e) => e.key === 'Enter' && applyPrice()} />
          <span aria-hidden="true">–</span>
          <label htmlFor={`${idPrefix}-max`} className="sr-only">Maximum price</label>
          <input id={`${idPrefix}-max`} inputMode="numeric" type="number" min={0} step={10} placeholder="Max" value={maxP} onChange={(e) => setMaxP(e.target.value)} onBlur={applyPrice} onKeyDown={(e) => e.key === 'Enter' && applyPrice()} aria-invalid={priceError ? true : undefined} />
        </div>
        {priceError && <p className="field-error">{priceError}</p>}
        <p className="field-hint">Base rate per room per night.</p>
      </fieldset>
      {hasDates && (
        <fieldset>
          <legend>Availability</legend>
          <label className="check"><input type="checkbox" checked={query.get('availableOnly') === '1'} onChange={(e) => setParam('availableOnly', e.target.checked ? '1' : null)} /> Only show hotels available for my dates</label>
        </fieldset>
      )}
      <fieldset>
        <legend>Star rating</legend>
        {[5, 4].map((s) => (
          <label className="check" key={s}><input type="checkbox" checked={listOf('stars').includes(String(s))} onChange={() => toggleListParam('stars', String(s))} /> {s} stars</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Property type</legend>
        {propertyTypes.map((t) => (
          <label className="check" key={t}><input type="checkbox" checked={listOf('type').includes(t)} onChange={() => toggleListParam('type', t)} /> {t}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Stay options</legend>
        <label className="check"><input type="checkbox" checked={query.get('breakfast') === '1'} onChange={(e) => setParam('breakfast', e.target.checked ? '1' : null)} /> Breakfast included</label>
        <label className="check"><input type="checkbox" checked={query.get('freeCancellation') === '1'} onChange={(e) => setParam('freeCancellation', e.target.checked ? '1' : null)} /> Free cancellation available</label>
      </fieldset>
      <fieldset>
        <legend>Amenities</legend>
        {amenities.map((a) => (
          <label className="check" key={a.code}><input type="checkbox" checked={listOf('amenities').includes(a.code)} onChange={() => toggleListParam('amenities', a.code)} /> {a.label}</label>
        ))}
      </fieldset>
    </div>
  );
}

export function HotelsPage() {
  const { query, location, navigate } = useRouter();
  const stay = stayFromQuery(query);
  const datesValid = hasValidStay(stay);
  const destinations = useDestinations();
  const amenities = useAmenities();
  const [drawer, setDrawer] = useState(false);
  const destination = destinations.find((d) => d.slug === stay.destination);

  useSeo({ title: destination ? `Hotels in ${destination.name}` : 'Hotels', description: 'Search Aurelia demonstration hotels by destination, dates, guests, price and amenities.' });

  const results = useAsync(() => api.get<SearchResponse>(`/api/hotels${location.search}`), location.search);
  const [types, setTypes] = useState<string[]>([]);
  useEffect(() => { if (results.data) setTypes(results.data.propertyTypes); }, [results.data]);

  const update = (mut: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(location.search);
    mut(q);
    navigate(`/hotels${q.toString() ? `?${q}` : ''}`, { replace: true, scroll: false });
  };
  const setParam = (k: string, v: string | null) => update((q) => { if (v === null || v === '') q.delete(k); else q.set(k, v); });
  const toggleListParam = (k: string, v: string) => update((q) => {
    const cur = (q.get(k) ?? '').split(',').filter(Boolean);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    if (next.length) q.set(k, next.join(',')); else q.delete(k);
  });
  const clearFilters = () => update((q) => FILTER_KEYS.forEach((k) => q.delete(k)));
  const activeFilters = FILTER_KEYS.filter((k) => query.get(k)).length;
  const hotels = results.data?.hotels ?? [];
  const sort = query.get('sort') ?? 'recommended';

  const summary = useMemo(() => {
    const where = destination ? `in ${destination.name}` : 'across all destinations';
    if (!datesValid) return `Showing ${plural(hotels.length, 'hotel')} ${where}. Add dates to see live availability.`;
    return `${plural(hotels.length, 'hotel')} ${where} · ${formatStayDate(stay.checkIn, { weekday: undefined })} – ${formatStayDate(stay.checkOut, { weekday: undefined })} · ${guestsLabel(stay.adults, stay.children)}, ${plural(stay.rooms, 'room')}`;
  }, [hotels.length, destination, datesValid, stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.rooms]);

  const filterProps = { query, propertyTypes: types, amenities, setParam, toggleListParam, hasDates: datesValid };

  return (
    <div className="page-hotels">
      <section className="page-intro compact">
        <div className="container">
          <p className="eyebrow">Find your stay</p>
          <h1>{destination ? `Hotels in ${destination.name}` : 'All Aurelia hotels'}</h1>
          <SearchBar initial={stay} variant="compact"
            onSearch={(s) => update((q) => {
              for (const [k, v] of Object.entries({ destination: s.destination, checkIn: s.checkIn, checkOut: s.checkOut, adults: String(s.adults), children: s.children ? String(s.children) : '', rooms: String(s.rooms) })) {
                if (v) q.set(k, v); else q.delete(k);
              }
            })} />
        </div>
      </section>

      <div className="container results-layout">
        <aside className="filter-sidebar" aria-labelledby="filters-title">
          <div className="filter-head">
            <h2 id="filters-title">Filters</h2>
            {activeFilters > 0 && <button className="text-link" onClick={clearFilters}>Clear all</button>}
          </div>
          <Filters {...filterProps} idPrefix="side" />
        </aside>

        <section className="results" aria-labelledby="results-title">
          <div className="results-toolbar">
            <h2 id="results-title" className="sr-only">Results</h2>
            <p className="results-summary" role="status" aria-live="polite">{results.loading ? 'Searching…' : summary}</p>
            <div className="toolbar-actions">
              <button className="btn btn-outline btn-sm filter-toggle" onClick={() => setDrawer(true)} aria-haspopup="dialog">
                <Icon name="filter" size={16} /> Filters{activeFilters ? ` (${activeFilters})` : ''}
              </button>
              <label htmlFor="sort" className="sr-only">Sort by</label>
              <select id="sort" className="sort-select" value={sort} onChange={(e) => setParam('sort', e.target.value === 'recommended' ? null : e.target.value)}>
                <option value="recommended">Sort: Recommended</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="rating">Demo score</option>
              </select>
            </div>
          </div>

          {!datesValid && <Notice tone="info">Prices shown are starting base rates. Choose dates to check real availability for every night of your stay.</Notice>}

          {results.error ? (
            <ErrorState message={results.error.message} onRetry={results.reload} />
          ) : results.loading && !results.data ? (
            <div className="card-grid two">{Array.from({ length: 4 }, (_, i) => <HotelCardSkeleton key={i} />)}</div>
          ) : hotels.length === 0 ? (
            <EmptyState title="No hotels match these filters" action={<div className="empty-actions">
              {activeFilters > 0 && <button className="btn btn-primary" onClick={clearFilters}>Clear filters</button>}
              <button className="btn btn-outline" onClick={() => navigate(withQuery('/hotels', {}))}>Start a new search</button>
            </div>}>
              Try widening your price range, removing an amenity, or choosing different dates.
            </EmptyState>
          ) : (
            <div className={`card-grid two ${results.loading ? 'is-refreshing' : ''}`} aria-busy={results.loading}>
              {hotels.map((h) => <HotelCard key={h.id} hotel={h} stay={datesValid ? stay : null} headingLevel={3} />)}
            </div>
          )}
        </section>
      </div>

      <Modal open={drawer} onClose={() => setDrawer(false)} title="Filters" className="drawer">
        <Filters {...filterProps} idPrefix="drawer" />
        <div className="drawer-actions">
          <button className="btn btn-outline" onClick={clearFilters} disabled={!activeFilters}>Clear all</button>
          <button className="btn btn-primary" onClick={() => setDrawer(false)}>Show {plural(hotels.length, 'hotel')}</button>
        </div>
      </Modal>
    </div>
  );
}
