import { useEffect, useState, type FormEvent } from 'react';
import { Link, useRouter } from '../../lib/router.js';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Img } from '../../components/Img.js';
import { Badge, ErrorState, Modal, Notice, PageLoading, Select, TextArea, TextInput } from '../../components/ui.js';
import { addDays, todayIso, formatStayDate } from '../../../../shared/dates.js';
import { formatMoney } from '../../lib/format.js';
import type { Amenity, HotelDetail, RoomTypeDTO } from '../../../../shared/types.js';
import { AdminShell } from './AdminShell.js';

interface HotelRow { id: number; slug: string; name: string; propertyType: string; stars: number; active: number; featured: number; destination: string; roomTypes: number; units: number; image: string | null }

export function AdminHotelsPage() {
  const res = useAsync(() => api.get<{ hotels: HotelRow[]; destinations: { slug: string; name: string; country: string }[] }>('/api/admin/hotels'), 'hotels');
  const [creating, setCreating] = useState(false);
  return (
    <AdminShell title="Hotels & rooms" actions={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>New hotel</button>}>
      {res.loading ? <PageLoading /> : res.error || !res.data ? <ErrorState message={res.error?.message ?? ''} onRetry={res.reload} /> : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th scope="col">Hotel</th><th scope="col">Destination</th><th scope="col">Type</th><th scope="col" className="num">Room types</th><th scope="col" className="num">Units</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{res.data.hotels.map((h) => (
                <tr key={h.id}>
                  <td className="with-thumb">{h.image && <Img src={h.image} alt="" sizes="64px" className="thumb" />}<Link to={`/admin/hotels/${h.id}`}>{h.name}</Link></td>
                  <td>{h.destination}</td><td>{h.propertyType} · {h.stars}★</td><td className="num">{h.roomTypes}</td><td className="num">{h.units}</td>
                  <td>{h.active ? <Badge tone="ok">Published</Badge> : <Badge tone="muted">Draft</Badge>} {h.featured ? <Badge tone="gold">Featured</Badge> : null}</td>
                  <td><Link to={`/admin/hotels/${h.id}`} className="btn btn-outline btn-sm">Manage</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <CreateHotel open={creating} onClose={() => setCreating(false)} destinations={res.data.destinations} />
        </>
      )}
    </AdminShell>
  );
}

function CreateHotel({ open, onClose, destinations }: { open: boolean; onClose: () => void; destinations: { slug: string; name: string; country: string }[] }) {
  const { navigate } = useRouter();
  const [f, setF] = useState({ name: '', slug: '', destination: '', tagline: '', propertyType: 'Boutique hotel', stars: 4, overview: '', description: '', address: '', latitude: '0', longitude: '0' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErrors({});
    try {
      const r = await api.post<{ id: number }>('/api/admin/hotels', { ...f, stars: Number(f.stars), latitude: Number(f.latitude), longitude: Number(f.longitude) });
      onClose(); navigate(`/admin/hotels/${r.id}`);
    } catch (err) { if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message }); }
  };
  const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <Modal open={open} onClose={onClose} title="New hotel" className="modal-wide">
      <form onSubmit={submit} noValidate className="admin-form">
        <p className="muted">New hotels start as drafts. Add images and at least one room type, then publish.</p>
        <div className="form-grid">
          <TextInput label="Name" value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || slugify(e.target.value) })} />
          <TextInput label="URL slug" value={f.slug} error={errors.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />
          <Select label="Destination" value={f.destination} error={errors.destination} onChange={(e) => setF({ ...f, destination: e.target.value })}>
            <option value="">Choose…</option>{destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}, {d.country}</option>)}
          </Select>
          <TextInput label="Property type" value={f.propertyType} error={errors.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })} />
          <TextInput label="Stars" type="number" min={1} max={5} value={f.stars} error={errors.stars} onChange={(e) => setF({ ...f, stars: Number(e.target.value) })} />
          <TextInput label="Tagline" value={f.tagline} error={errors.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} />
        </div>
        <TextInput label="Address" value={f.address} error={errors.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <div className="form-grid">
          <TextInput label="Latitude" value={f.latitude} error={errors.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} />
          <TextInput label="Longitude" value={f.longitude} error={errors.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} />
        </div>
        <TextArea label="Overview" rows={2} value={f.overview} error={errors.overview} onChange={(e) => setF({ ...f, overview: e.target.value })} />
        <TextArea label="Description" rows={4} value={f.description} error={errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {errors._ && <Notice tone="bad" role="alert">{errors._}</Notice>}
        <div className="row-actions"><button className="btn btn-primary">Create draft</button><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

interface EditData { hotel: HotelDetail & { active?: boolean }; allAmenities: Amenity[]; imageLibrary: string[] }

export function AdminHotelEditPage({ id }: { id: string }) {
  const res = useAsync(() => api.get<EditData>(`/api/admin/hotels/${id}`), id);
  const [tab, setTab] = useState<'details' | 'images' | 'amenities' | 'rooms' | 'inventory'>('details');
  const d = res.data;
  return (
    <AdminShell title={d?.hotel.name ?? 'Hotel'} actions={<>
      {d && <Link className="btn btn-outline btn-sm" to={`/hotels/${d.hotel.slug}`}>View public page</Link>}
      <Link className="btn btn-outline btn-sm" to="/admin/hotels">← All hotels</Link>
    </>}>
      {res.loading && !d ? <PageLoading /> : res.error || !d ? <ErrorState message={res.error?.message ?? ''} onRetry={res.reload} /> : (
        <>
          <div className="tabs" role="tablist" aria-label="Hotel sections">
            {(['details', 'images', 'amenities', 'rooms', 'inventory'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          {tab === 'details' && <DetailsForm id={id} hotel={d.hotel} onSaved={res.reload} />}
          {tab === 'images' && <ImagesForm id={id} hotel={d.hotel} library={d.imageLibrary} onSaved={res.reload} />}
          {tab === 'amenities' && <AmenitiesForm id={id} hotel={d.hotel} all={d.allAmenities} onSaved={res.reload} />}
          {tab === 'rooms' && <RoomsPanel hotelId={id} rooms={d.hotel.rooms} library={d.imageLibrary} onSaved={res.reload} />}
          {tab === 'inventory' && <InventoryPanel rooms={d.hotel.rooms} />}
        </>
      )}
    </AdminShell>
  );
}

function useSaver() {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null); setErrors({});
    try { await fn(); setMsg({ tone: 'ok', text: ok }); return true; }
    catch (e) { if (e instanceof ApiError) { setErrors(e.fields); setMsg({ tone: 'bad', text: e.message }); } return false; }
  };
  return { msg, errors, run };
}

function DetailsForm({ id, hotel, onSaved }: { id: string; hotel: HotelDetail & { active?: boolean }; onSaved: () => void }) {
  const [f, setF] = useState({
    name: hotel.name, tagline: hotel.tagline, propertyType: hotel.propertyType, stars: hotel.stars, overview: hotel.overview, description: hotel.description,
    address: hotel.address, checkInTime: hotel.checkInTime, checkOutTime: hotel.checkOutTime, cancellationPolicy: hotel.cancellationPolicy,
    houseRules: hotel.houseRules.join('\n'), breakfastIncluded: hotel.breakfastIncluded, freeCancellation: hotel.freeCancellation, featured: hotel.featured,
    active: hotel.active !== false,
  });
  const s = useSaver();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await s.run(() => api.patch(`/api/admin/hotels/${id}`, { ...f, stars: Number(f.stars), houseRules: f.houseRules.split('\n').map((x) => x.trim()).filter(Boolean) }), 'Hotel details saved.')) onSaved();
  };
  return (
    <form onSubmit={submit} noValidate className="admin-card admin-form">
      <div className="form-grid">
        <TextInput label="Name" value={f.name} error={s.errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextInput label="Tagline" value={f.tagline} error={s.errors.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} />
        <TextInput label="Property type" value={f.propertyType} error={s.errors.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })} />
        <TextInput label="Stars" type="number" min={1} max={5} value={f.stars} error={s.errors.stars} onChange={(e) => setF({ ...f, stars: Number(e.target.value) })} />
        <TextInput label="Check-in from" value={f.checkInTime} error={s.errors.checkInTime} onChange={(e) => setF({ ...f, checkInTime: e.target.value })} />
        <TextInput label="Check-out by" value={f.checkOutTime} error={s.errors.checkOutTime} onChange={(e) => setF({ ...f, checkOutTime: e.target.value })} />
      </div>
      <TextInput label="Address" value={f.address} error={s.errors.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      <TextArea label="Overview" rows={2} value={f.overview} error={s.errors.overview} onChange={(e) => setF({ ...f, overview: e.target.value })} />
      <TextArea label="Description" rows={5} value={f.description} error={s.errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <TextArea label="Cancellation policy" rows={2} value={f.cancellationPolicy} error={s.errors.cancellationPolicy} onChange={(e) => setF({ ...f, cancellationPolicy: e.target.value })} />
      <TextArea label="House rules (one per line)" rows={4} value={f.houseRules} error={s.errors.houseRules} onChange={(e) => setF({ ...f, houseRules: e.target.value })} />
      <fieldset className="check-row">
        <legend>Flags</legend>
        <label className="check"><input type="checkbox" checked={f.breakfastIncluded} onChange={(e) => setF({ ...f, breakfastIncluded: e.target.checked })} /> Breakfast included</label>
        <label className="check"><input type="checkbox" checked={f.freeCancellation} onChange={(e) => setF({ ...f, freeCancellation: e.target.checked })} /> Free cancellation offered</label>
        <label className="check"><input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Featured on home page</label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Published</label>
      </fieldset>
      {s.msg && <Notice tone={s.msg.tone} role="status">{s.msg.text}</Notice>}
      <button className="btn btn-primary">Save details</button>
    </form>
  );
}

function ImagesForm({ id, hotel, library, onSaved }: { id: string; hotel: HotelDetail; library: string[]; onSaved: () => void }) {
  const [list, setList] = useState(hotel.images.map((i) => ({ src: i.src, alt: i.alt })));
  const [add, setAdd] = useState('');
  const s = useSaver();
  const move = (i: number, d: number) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); setList(n); };
  return (
    <div className="admin-card admin-form">
      <p className="muted">Images come from the verified local library in <code>client/public/images</code> (generated by <code>npm run images</code>). The first image is the cover. Alt text is required.</p>
      <ol className="image-editor">
        {list.map((img, i) => (
          <li key={`${img.src}-${i}`}>
            <Img src={img.src} alt="" sizes="120px" className="thumb-lg" />
            <div className="image-editor-fields">
              <span className="mono">{img.src}{i === 0 && ' · cover'}</span>
              <label className="sr-only" htmlFor={`alt-${i}`}>Alt text</label>
              <input id={`alt-${i}`} value={img.alt} onChange={(e) => setList(list.map((x, j) => j === i ? { ...x, alt: e.target.value } : x))} placeholder="Describe the image" />
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-outline btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move image ${i + 1} up`}>↑</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move image ${i + 1} down`}>↓</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={`Remove image ${i + 1}`}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row-actions">
        <label className="inline-select">Add from library
          <select value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Choose image…</option>{library.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-outline btn-sm" disabled={!add} onClick={() => { setList([...list, { src: add, alt: '' }]); setAdd(''); }}>Add</button>
      </div>
      {s.msg && <Notice tone={s.msg.tone} role="status">{s.msg.text}</Notice>}
      <button className="btn btn-primary" onClick={async () => { if (await s.run(() => api.put(`/api/admin/hotels/${id}/images`, { images: list }), 'Images saved.')) onSaved(); }}>Save images</button>
    </div>
  );
}

function AmenitiesForm({ id, hotel, all, onSaved }: { id: string; hotel: HotelDetail; all: Amenity[]; onSaved: () => void }) {
  const [codes, setCodes] = useState(new Set(hotel.amenities.map((a) => a.code)));
  const s = useSaver();
  return (
    <div className="admin-card admin-form">
      <fieldset className="check-grid"><legend>Hotel amenities</legend>
        {all.map((a) => <label key={a.code} className="check"><input type="checkbox" checked={codes.has(a.code)} onChange={() => { const n = new Set(codes); if (n.has(a.code)) n.delete(a.code); else n.add(a.code); setCodes(n); }} /> {a.label}</label>)}
      </fieldset>
      {s.msg && <Notice tone={s.msg.tone} role="status">{s.msg.text}</Notice>}
      <button className="btn btn-primary" onClick={async () => { if (await s.run(() => api.put(`/api/admin/hotels/${id}/amenities`, { codes: [...codes] }), 'Amenities saved.')) onSaved(); }}>Save amenities</button>
    </div>
  );
}

type RoomForm = { slug: string; name: string; description: string; maxAdults: number; maxOccupancy: number; bed: string; sizeSqm: number; nightlyRate: string; inventory: number; mealPlan: string; refundable: boolean; cancellationTerms: string; amenities: string; active: boolean; imageSrc: string };
const blankRoom: RoomForm = { slug: '', name: '', description: '', maxAdults: 2, maxOccupancy: 2, bed: '1 king', sizeSqm: 30, nightlyRate: '250', inventory: 5, mealPlan: 'Breakfast included', refundable: true, cancellationTerms: 'Free cancellation until 48 hours before arrival (demo policy).', amenities: 'Air conditioning, Rain shower', active: true, imageSrc: '' };

function RoomEditor({ initial, isNew, library, onSubmit, onCancel }: { initial: RoomForm; isNew: boolean; library: string[]; onSubmit: (f: RoomForm) => Promise<boolean>; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form className="admin-form room-editor" noValidate onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await onSubmit(f); setBusy(false); if (ok && isNew) setF(blankRoom); }}>
      <div className="form-grid three">
        <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        {isNew && <TextInput label="Slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />}
        <TextInput label="Nightly rate (USD)" type="number" min={10} step="1" value={f.nightlyRate} onChange={(e) => setF({ ...f, nightlyRate: e.target.value })} />
        <TextInput label="Inventory (units)" type="number" min={0} value={f.inventory} onChange={(e) => setF({ ...f, inventory: Number(e.target.value) })} hint="Rooms of this type sold per night" />
        <TextInput label="Max adults" type="number" min={1} value={f.maxAdults} onChange={(e) => setF({ ...f, maxAdults: Number(e.target.value) })} />
        <TextInput label="Max occupancy" type="number" min={1} value={f.maxOccupancy} onChange={(e) => setF({ ...f, maxOccupancy: Number(e.target.value) })} />
        <TextInput label="Bed configuration" value={f.bed} onChange={(e) => setF({ ...f, bed: e.target.value })} />
        <TextInput label="Size (m²)" type="number" min={5} value={f.sizeSqm} onChange={(e) => setF({ ...f, sizeSqm: Number(e.target.value) })} />
        <TextInput label="Meal plan" value={f.mealPlan} onChange={(e) => setF({ ...f, mealPlan: e.target.value })} />
      </div>
      <TextArea label="Description" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <TextArea label="Cancellation terms" rows={2} value={f.cancellationTerms} onChange={(e) => setF({ ...f, cancellationTerms: e.target.value })} />
      <TextInput label="Room amenities (comma-separated)" value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} />
      {isNew && <Select label="Image" value={f.imageSrc} onChange={(e) => setF({ ...f, imageSrc: e.target.value })}><option value="">None</option>{library.map((l) => <option key={l} value={l}>{l}</option>)}</Select>}
      <div className="check-row">
        <label className="check"><input type="checkbox" checked={f.refundable} onChange={(e) => setF({ ...f, refundable: e.target.checked })} /> Refundable rate</label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Bookable</label>
      </div>
      <div className="row-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{isNew ? 'Create room type' : 'Save room type'}</button><button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function RoomsPanel({ hotelId, rooms, library, onSaved }: { hotelId: string; rooms: RoomTypeDTO[]; library: string[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const s = useSaver();
  const payload = (f: RoomForm) => ({
    name: f.name, description: f.description, maxAdults: f.maxAdults, maxOccupancy: f.maxOccupancy, bed: f.bed, sizeSqm: f.sizeSqm,
    nightlyRate: Math.round(Number(f.nightlyRate) * 100), inventory: f.inventory, mealPlan: f.mealPlan, refundable: f.refundable,
    cancellationTerms: f.cancellationTerms, amenities: f.amenities.split(',').map((x) => x.trim()).filter(Boolean), active: f.active,
  });
  const fieldMsg = () => Object.entries(s.errors).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return (
    <div className="admin-stack">
      {s.msg && <Notice tone={s.msg.tone} role="status">{s.msg.text}{s.msg.tone === 'bad' && fieldMsg() ? ` (${fieldMsg()})` : ''}</Notice>}
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th scope="col">Room type</th><th scope="col" className="num">Rate</th><th scope="col" className="num">Units</th><th scope="col">Occupancy</th><th scope="col">Terms</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rooms.map((r) => (
            <tr key={r.id}>
              <td>{r.name}<br /><span className="muted">{r.bed} · {r.sizeSqm} m²</span></td>
              <td className="num">{formatMoney(r.nightlyRate)}</td><td className="num">{r.inventory}</td>
              <td>{r.maxAdults} adults / {r.maxOccupancy} guests</td><td>{r.refundable ? 'Refundable' : 'Non-refundable'}</td>
              <td>{r.active ? <Badge tone="ok">Bookable</Badge> : <Badge tone="muted">Hidden</Badge>}</td>
              <td><button className="btn btn-outline btn-sm" onClick={() => setEditing(r.id)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {typeof editing === 'number' && (() => {
        const r = rooms.find((x) => x.id === editing)!;
        return (
          <section className="admin-card"><h2>Edit {r.name}</h2>
            <RoomEditor key={r.id} isNew={false} library={library} onCancel={() => setEditing(null)}
              initial={{ ...blankRoom, ...r, nightlyRate: String(r.nightlyRate / 100), amenities: r.amenities.join(', '), imageSrc: '' }}
              onSubmit={async (f) => { const ok = await s.run(() => api.patch(`/api/admin/rooms/${r.id}`, payload(f)), `${f.name} saved.`); if (ok) { setEditing(null); onSaved(); } return ok; }} />
          </section>
        );
      })()}
      {editing === 'new' ? (
        <section className="admin-card"><h2>New room type</h2>
          <RoomEditor initial={blankRoom} isNew library={library} onCancel={() => setEditing(null)}
            onSubmit={async (f) => { const ok = await s.run(() => api.post(`/api/admin/hotels/${hotelId}/rooms`, { ...payload(f), slug: f.slug, imageSrc: f.imageSrc || undefined }), `${f.name} created.`); if (ok) { setEditing(null); onSaved(); } return ok; }} />
        </section>
      ) : <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Add room type</button>}
    </div>
  );
}

interface InvNight { night: string; capacity: number; booked: number; free: number; overridden: boolean; note: string | null }

function InventoryPanel({ rooms }: { rooms: RoomTypeDTO[] }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? 0);
  const [from, setFrom] = useState(todayIso());
  const res = useAsync(() => api.get<{ room: { name: string; inventory: number }; nights: InvNight[] }>(`/api/admin/rooms/${roomId}/inventory?from=${from}`), `${roomId}|${from}`);
  const [sel, setSel] = useState<InvNight | null>(null);
  const [units, setUnits] = useState('');
  const [note, setNote] = useState('');
  const s = useSaver();
  useEffect(() => { setSel(null); }, [roomId, from]);
  if (!rooms.length) return <p className="muted">Add a room type first.</p>;
  const save = async (value: number | null) => {
    if (!sel) return;
    if (await s.run(() => api.put(`/api/admin/rooms/${roomId}/inventory/${sel.night}`, { units: value, note: note || null }), value === null ? 'Override removed — default inventory restored.' : `Inventory for ${sel.night} set to ${value}.`)) { setSel(null); res.reload(); }
  };
  return (
    <div className="admin-card admin-stack">
      <div className="row-actions">
        <label className="inline-select">Room type<select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <button className="btn btn-outline btn-sm" onClick={() => setFrom(addDays(from, -28))} disabled={from <= todayIso()}>← Previous 4 weeks</button>
        <button className="btn btn-outline btn-sm" onClick={() => setFrom(addDays(from, 28))}>Next 4 weeks →</button>
      </div>
      <p className="muted">Free / sellable units per night. Select a night to override its inventory (e.g. close rooms for maintenance). Overrides cannot go below rooms already reserved.</p>
      {s.msg && <Notice tone={s.msg.tone} role="status">{s.msg.text}</Notice>}
      {res.loading ? <PageLoading /> : res.error || !res.data ? <ErrorState message={res.error?.message ?? ''} onRetry={res.reload} /> : (
        <div className="inv-grid" role="grid" aria-label={`Inventory for ${res.data.room.name}`}>
          {res.data.nights.map((n) => (
            <button key={n.night} role="gridcell" className={`inv-cell ${n.free === 0 ? 'is-full' : n.free <= 1 ? 'is-low' : ''} ${n.overridden ? 'is-override' : ''} ${sel?.night === n.night ? 'is-selected' : ''}`}
              onClick={() => { setSel(n); setUnits(String(n.capacity)); setNote(n.note ?? ''); }}
              aria-label={`${formatStayDate(n.night)}: ${n.free} of ${n.capacity} free${n.overridden ? ', overridden' : ''}`}>
              <span className="inv-date">{formatStayDate(n.night, { weekday: 'short', month: 'short', day: 'numeric', year: undefined })}</span>
              <strong>{n.free}/{n.capacity}</strong>
              {n.overridden && <span className="inv-flag">override</span>}
            </button>
          ))}
        </div>
      )}
      {sel && (
        <div className="inv-editor">
          <strong>{formatStayDate(sel.night)}</strong> — {sel.booked} reserved, default {res.data?.room.inventory}
          <div className="row-actions">
            <label className="inline-select">Units<input type="number" min={sel.booked} value={units} onChange={(e) => setUnits(e.target.value)} /></label>
            <label className="inline-select">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Maintenance" /></label>
            <button className="btn btn-primary btn-sm" onClick={() => save(Number(units))}>Set override</button>
            {sel.overridden && <button className="btn btn-outline btn-sm" onClick={() => save(null)}>Remove override</button>}
          </div>
        </div>
      )}
    </div>
  );
}
