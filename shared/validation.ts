import { BOOKING_RULES } from './config.js';
import { isIsoDate, nightsBetween, todayIso } from './dates.js';

export interface StayQuery {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}

export type StayErrors = Partial<Record<keyof StayQuery, string>>;

/**
 * Validates a stay request. Used by the search form, the checkout page and —
 * authoritatively — by the server before any availability or price is computed.
 */
export function validateStay(q: Partial<StayQuery>, today: string = todayIso()): StayErrors {
  const errors: StayErrors = {};
  const { checkIn, checkOut } = q;
  const adults = Number(q.adults);
  const children = Number(q.children ?? 0);
  const rooms = Number(q.rooms);

  if (!isIsoDate(checkIn)) errors.checkIn = 'Choose a check-in date.';
  else if (checkIn < today) errors.checkIn = 'Check-in cannot be in the past.';
  else if (nightsBetween(today, checkIn) > BOOKING_RULES.maxDaysAhead)
    errors.checkIn = `Reservations open up to ${BOOKING_RULES.maxDaysAhead} days ahead.`;

  if (!isIsoDate(checkOut)) errors.checkOut = 'Choose a check-out date.';
  else if (isIsoDate(checkIn) && checkOut <= checkIn) errors.checkOut = 'Check-out must be after check-in.';
  else if (isIsoDate(checkIn) && nightsBetween(checkIn, checkOut) > BOOKING_RULES.maxNights)
    errors.checkOut = `Stays are limited to ${BOOKING_RULES.maxNights} nights online.`;

  if (!Number.isInteger(rooms) || rooms < 1) errors.rooms = 'At least one room is required.';
  else if (rooms > BOOKING_RULES.maxRoomsPerBooking)
    errors.rooms = `Book up to ${BOOKING_RULES.maxRoomsPerBooking} rooms online.`;

  if (!Number.isInteger(adults) || adults < 1) errors.adults = 'At least one adult is required.';
  else if (Number.isInteger(rooms) && rooms >= 1 && adults < rooms)
    errors.adults = 'Each room needs at least one adult.';

  if (!Number.isInteger(children) || children < 0) errors.children = 'Children cannot be negative.';

  if (!errors.adults && !errors.children && adults + children > BOOKING_RULES.maxGuestsPerBooking)
    errors.adults = `Online bookings are limited to ${BOOKING_RULES.maxGuestsPerBooking} guests.`;

  return errors;
}

export interface OccupancyLimits {
  maxAdults: number;
  maxOccupancy: number;
}

/** Can `rooms` units of a room type accommodate this party? */
export function fitsOccupancy(limits: OccupancyLimits, adults: number, children: number, rooms: number): boolean {
  return adults <= limits.maxAdults * rooms && adults + children <= limits.maxOccupancy * rooms && adults >= rooms;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim()) && value.length <= 254;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'Use at most 200 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Include at least one letter and one number.';
  return null;
}
