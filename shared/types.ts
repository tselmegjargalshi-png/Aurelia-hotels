/** API data shapes shared by server responses and client consumers. */
import type { PriceQuote } from './pricing.js';

export type Role = 'guest' | 'admin';

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
}

export interface Destination {
  id: number;
  slug: string;
  name: string;
  country: string;
  summary: string;
  image: string;
  hotelCount: number;
}

export interface ImageRef {
  id?: number;
  /** Base name in /images, e.g. "winelands-estate-exterior" */
  src: string;
  alt: string;
}

export interface Amenity {
  code: string;
  label: string;
}

export type AvailabilityStatus = 'available' | 'limited' | 'sold_out' | 'unsuitable' | 'unknown';

export interface HotelSummary {
  id: number;
  slug: string;
  name: string;
  destination: { slug: string; name: string; country: string };
  propertyType: string;
  stars: number;
  /** Demonstration score out of 10 — not real guest reviews. */
  demoRating: number;
  tagline: string;
  image: ImageRef;
  amenities: Amenity[];
  breakfastIncluded: boolean;
  freeCancellation: boolean;
  fromPrice: number;
  /** Only present when dates were supplied. */
  availability: AvailabilityStatus;
  /** Cheapest available rate for the requested stay, when dates were supplied. */
  availableFromPrice: number | null;
  featured: boolean;
}

export interface RoomTypeDTO {
  id: number;
  hotelId: number;
  slug: string;
  name: string;
  description: string;
  maxAdults: number;
  maxOccupancy: number;
  bed: string;
  sizeSqm: number;
  nightlyRate: number;
  inventory: number;
  mealPlan: string;
  refundable: boolean;
  cancellationTerms: string;
  amenities: string[];
  images: ImageRef[];
  active: boolean;
  /** Present when dates are supplied: rooms of this type free on every night. */
  unitsAvailable: number | null;
  availability: AvailabilityStatus;
}

export interface HotelDetail extends HotelSummary {
  overview: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  checkInTime: string;
  checkOutTime: string;
  cancellationPolicy: string;
  houseRules: string[];
  nearby: { name: string; distance: string }[];
  images: ImageRef[];
  rooms: RoomTypeDTO[];
}

export type ReservationStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show'
  | 'expired';

export type PaymentStatus = 'not_collected' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface ReservationDTO {
  id: number;
  code: string;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  paymentMode: 'test' | 'provider';
  hotel: { id: number; slug: string; name: string; destination: string; image: ImageRef; checkInTime: string; checkOutTime: string };
  room: { id: number; slug: string; name: string; refundable: boolean; cancellationTerms: string; mealPlan: string };
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  price: PriceQuote;
  guest: { firstName: string; lastName: string; email: string; phone: string | null };
  specialRequests: string | null;
  createdAt: string;
  cancellationRequest: { id: number; status: 'pending' | 'approved' | 'rejected'; reason: string | null; createdAt: string } | null;
  userId?: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
