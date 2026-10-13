import { all, get, type DB } from '../db/connection.js';
import { fitsOccupancy } from '../../../shared/validation.js';
import type {
  Amenity, AvailabilityStatus, Destination, HotelDetail, HotelSummary, ImageRef, RoomTypeDTO,
} from '../../../shared/types.js';
import { statusFor, unitsAvailable } from './availability.js';

export interface StayParams { checkIn: string; checkOut: string; adults: number; children: number; rooms: number }

interface HotelRow {
  id: number; slug: string; name: string; tagline: string; property_type: string; stars: number; demo_rating: number;
  overview: string; description: string; address: string; latitude: number; longitude: number;
  check_in_time: string; check_out_time: string; cancellation_policy: string; house_rules: string; nearby: string;
  breakfast_included: number; free_cancellation: number; featured: number; active: number;
  d_slug: string; d_name: string; d_country: string;
}
export interface RoomRow {
  id: number; hotel_id: number; slug: string; name: string; description: string; max_adults: number; max_occupancy: number;
  bed: string; size_sqm: number; nightly_rate: number; inventory: number; meal_plan: string; refundable: number;
  cancellation_terms: string; amenities: string; active: number;
}

const HOTEL_SELECT = `SELECT h.*, d.slug AS d_slug, d.name AS d_name, d.country AS d_country
  FROM hotels h JOIN destinations d ON d.id = h.destination_id`;

export function listDestinations(db: DB): Destination[] {
  return all<Destination & { hotelCount: number }>(
    db,
    `SELECT d.id, d.slug, d.name, d.country, d.summary, d.image,
            (SELECT COUNT(*) FROM hotels h WHERE h.destination_id = d.id AND h.active = 1) AS hotelCount
       FROM destinations d ORDER BY d.id`,
  );
}

export function listAmenities(db: DB): Amenity[] {
  return all<Amenity>(db, 'SELECT code, label FROM amenities ORDER BY label');
}

function hotelImages(db: DB, ids: number[]): Map<number, ImageRef[]> {
  const map = new Map<number, ImageRef[]>();
  if (!ids.length) return map;
  const rows = all<{ id: number; hotel_id: number; src: string; alt: string }>(
    db, `SELECT id, hotel_id, src, alt FROM hotel_images WHERE hotel_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`, ...ids,
  );
  for (const r of rows) {
    const list = map.get(r.hotel_id) ?? [];
    list.push({ id: r.id, src: r.src, alt: r.alt });
    map.set(r.hotel_id, list);
  }
  return map;
}

function hotelAmenities(db: DB, ids: number[]): Map<number, Amenity[]> {
  const map = new Map<number, Amenity[]>();
  if (!ids.length) return map;
  const rows = all<{ hotel_id: number; code: string; label: string }>(
    db,
    `SELECT ha.hotel_id, a.code, a.label FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
      WHERE ha.hotel_id IN (${ids.map(() => '?').join(',')}) ORDER BY a.id`, ...ids,
  );
  for (const r of rows) {
    const list = map.get(r.hotel_id) ?? [];
    list.push({ code: r.code, label: r.label });
    map.set(r.hotel_id, list);
  }
  return map;
}

export function roomRows(db: DB, hotelIds: number[], includeInactive = false): RoomRow[] {
  if (!hotelIds.length) return [];
  return all<RoomRow>(
    db,
    `SELECT * FROM room_types WHERE hotel_id IN (${hotelIds.map(() => '?').join(',')}) ${includeInactive ? '' : 'AND active = 1'}
      ORDER BY hotel_id, nightly_rate`, ...hotelIds,
  );
}

function roomImages(db: DB, roomIds: number[]): Map<number, ImageRef[]> {
  const map = new Map<number, ImageRef[]>();
  if (!roomIds.length) return map;
  const rows = all<{ id: number; room_type_id: number; src: string; alt: string }>(
    db, `SELECT id, room_type_id, src, alt FROM room_images WHERE room_type_id IN (${roomIds.map(() => '?').join(',')}) ORDER BY sort_order, id`, ...roomIds,
  );
  for (const r of rows) {
    const list = map.get(r.room_type_id) ?? [];
    list.push({ id: r.id, src: r.src, alt: r.alt });
    map.set(r.room_type_id, list);
  }
  return map;
}

export function toRoomDTO(r: RoomRow, images: ImageRef[], units: number | null, status: AvailabilityStatus): RoomTypeDTO {
  return {
    id: r.id, hotelId: r.hotel_id, slug: r.slug, name: r.name, description: r.description,
    maxAdults: r.max_adults, maxOccupancy: r.max_occupancy, bed: r.bed, sizeSqm: r.size_sqm,
    nightlyRate: r.nightly_rate, inventory: r.inventory, mealPlan: r.meal_plan, refundable: !!r.refundable,
    cancellationTerms: r.cancellation_terms, amenities: JSON.parse(r.amenities) as string[], images,
    active: !!r.active, unitsAvailable: units, availability: status,
  };
}

function roomsWithAvailability(db: DB, rows: RoomRow[], stay?: StayParams): RoomTypeDTO[] {
  const images = roomImages(db, rows.map((r) => r.id));
  const units = stay ? unitsAvailable(db, rows.map((r) => r.id), stay.checkIn, stay.checkOut) : null;
  return rows.map((r) => {
    if (!stay || !units) return toRoomDTO(r, images.get(r.id) ?? [], null, 'unknown');
    const u = units.get(r.id) ?? 0;
    const fits = fitsOccupancy({ maxAdults: r.max_adults, maxOccupancy: r.max_occupancy }, stay.adults, stay.children, stay.rooms);
    return toRoomDTO(r, images.get(r.id) ?? [], u, statusFor(u, stay.rooms, fits));
  });
}

function toSummary(h: HotelRow, images: ImageRef[], amenities: Amenity[], rooms: RoomTypeDTO[], stay?: StayParams): HotelSummary {
  const fromPrice = rooms.length ? Math.min(...rooms.map((r) => r.nightlyRate)) : 0;
  let availability: AvailabilityStatus = 'unknown';
  let availableFromPrice: number | null = null;
  if (stay) {
    const bookable = rooms.filter((r) => r.availability === 'available' || r.availability === 'limited');
    if (bookable.length) {
      availableFromPrice = Math.min(...bookable.map((r) => r.nightlyRate));
      availability = bookable.some((r) => r.availability === 'available') ? 'available' : 'limited';
    } else {
      availability = rooms.some((r) => r.availability === 'sold_out') ? 'sold_out' : 'unsuitable';
    }
  }
  return {
    id: h.id, slug: h.slug, name: h.name, tagline: h.tagline,
    destination: { slug: h.d_slug, name: h.d_name, country: h.d_country },
    propertyType: h.property_type, stars: h.stars, demoRating: h.demo_rating,
    image: images[0] ?? { src: '', alt: h.name },
    amenities, breakfastIncluded: !!h.breakfast_included, freeCancellation: !!h.free_cancellation,
    fromPrice, availability, availableFromPrice, featured: !!h.featured,
  };
}

export interface SearchFilters {
  destination?: string;
  stay?: StayParams;
  minPrice?: number;
  maxPrice?: number;
  stars?: number[];
  types?: string[];
  amenities?: string[];
  breakfast?: boolean;
  freeCancellation?: boolean;
  availableOnly?: boolean;
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'rating';
}

export function searchHotels(db: DB, f: SearchFilters): HotelSummary[] {
  const where: string[] = ['h.active = 1'];
  const params: (string | number)[] = [];
  if (f.destination) { where.push('d.slug = ?'); params.push(f.destination); }
  if (f.stars?.length) { where.push(`h.stars IN (${f.stars.map(() => '?').join(',')})`); params.push(...f.stars); }
  if (f.types?.length) { where.push(`h.property_type IN (${f.types.map(() => '?').join(',')})`); params.push(...f.types); }
  if (f.breakfast) where.push('h.breakfast_included = 1');
  if (f.freeCancellation) where.push('h.free_cancellation = 1');
  if (f.amenities?.length) {
    where.push(`(SELECT COUNT(*) FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                 WHERE ha.hotel_id = h.id AND a.code IN (${f.amenities.map(() => '?').join(',')})) = ?`);
    params.push(...f.amenities, f.amenities.length);
  }
  const hotels = all<HotelRow>(db, `${HOTEL_SELECT} WHERE ${where.join(' AND ')}`, ...params);
  const ids = hotels.map((h) => h.id);
  const images = hotelImages(db, ids);
  const amenities = hotelAmenities(db, ids);
  const rooms = roomsWithAvailability(db, roomRows(db, ids), f.stay);
  const byHotel = new Map<number, RoomTypeDTO[]>();
  for (const r of rooms) byHotel.set(r.hotelId, [...(byHotel.get(r.hotelId) ?? []), r]);

  let list = hotels
    .map((h) => toSummary(h, images.get(h.id) ?? [], amenities.get(h.id) ?? [], byHotel.get(h.id) ?? [], f.stay))
    .filter((h) => (byHotel.get(h.id) ?? []).length > 0);

  const price = (h: HotelSummary) => h.availableFromPrice ?? h.fromPrice;
  if (f.minPrice !== undefined) list = list.filter((h) => price(h) >= f.minPrice!);
  if (f.maxPrice !== undefined) list = list.filter((h) => price(h) <= f.maxPrice!);
  if (f.stay && f.availableOnly) list = list.filter((h) => h.availability === 'available' || h.availability === 'limited');

  const bookableRank = (h: HotelSummary) => (h.availability === 'sold_out' || h.availability === 'unsuitable' ? 1 : 0);
  const sorters: Record<NonNullable<SearchFilters['sort']>, (a: HotelSummary, b: HotelSummary) => number> = {
    recommended: (a, b) => bookableRank(a) - bookableRank(b) || Number(b.featured) - Number(a.featured) || b.demoRating - a.demoRating,
    price_asc: (a, b) => bookableRank(a) - bookableRank(b) || price(a) - price(b),
    price_desc: (a, b) => bookableRank(a) - bookableRank(b) || price(b) - price(a),
    rating: (a, b) => bookableRank(a) - bookableRank(b) || b.demoRating - a.demoRating || b.stars - a.stars,
  };
  return list.sort(sorters[f.sort ?? 'recommended']);
}

export function getHotelDetail(db: DB, slug: string, stay?: StayParams, includeInactive = false): HotelDetail | null {
  const h = get<HotelRow>(db, `${HOTEL_SELECT} WHERE h.slug = ? ${includeInactive ? '' : 'AND h.active = 1'}`, slug);
  if (!h) return null;
  const images = hotelImages(db, [h.id]).get(h.id) ?? [];
  const amenities = hotelAmenities(db, [h.id]).get(h.id) ?? [];
  const rooms = roomsWithAvailability(db, roomRows(db, [h.id], includeInactive), stay);
  return {
    ...toSummary(h, images, amenities, rooms.filter((r) => r.active), stay),
    overview: h.overview, description: h.description, address: h.address,
    latitude: h.latitude, longitude: h.longitude, checkInTime: h.check_in_time, checkOutTime: h.check_out_time,
    cancellationPolicy: h.cancellation_policy,
    houseRules: JSON.parse(h.house_rules) as string[],
    nearby: JSON.parse(h.nearby) as { name: string; distance: string }[],
    images, rooms,
  };
}

export function getFavoriteHotels(db: DB, userId: number): HotelSummary[] {
  const ids = new Set(all<{ hotel_id: number }>(db, 'SELECT hotel_id FROM favorites WHERE user_id = ?', userId).map((r) => r.hotel_id));
  return searchHotels(db, {}).filter((h) => ids.has(h.id));
}
