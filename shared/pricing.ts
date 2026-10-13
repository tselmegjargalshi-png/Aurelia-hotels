import { CURRENCY, OFFERS, PRICING, type OfferCode } from './config.js';
import { nightsBetween } from './dates.js';

/** All money is integer minor units (cents) to avoid floating-point drift. */
export interface PriceQuote {
  currency: string;
  nights: number;
  rooms: number;
  nightlyRate: number;
  /** nightlyRate × nights × rooms */
  roomSubtotal: number;
  discount: { code: OfferCode; title: string; percentOff: number; amount: number } | null;
  /** roomSubtotal − discount */
  discountedSubtotal: number;
  taxes: number;
  fees: number;
  total: number;
}

export interface QuoteInput {
  nightlyRate: number;
  checkIn: string;
  checkOut: string;
  rooms: number;
  /** Date the booking is made — used for advance-purchase offers. */
  bookedOn: string;
}

export function bestOffer(nights: number, daysInAdvance: number) {
  const eligible = OFFERS.filter((o) => nights >= o.minNights && daysInAdvance >= o.minDaysInAdvance);
  return eligible.sort((a, b) => b.percentOff - a.percentOff)[0] ?? null;
}

export function quoteStay(input: QuoteInput): PriceQuote {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (!Number.isInteger(input.nightlyRate) || input.nightlyRate <= 0) throw new Error('Invalid nightly rate');
  if (nights < 1) throw new Error('Stay must be at least one night');
  if (!Number.isInteger(input.rooms) || input.rooms < 1) throw new Error('Invalid room count');

  const roomSubtotal = input.nightlyRate * nights * input.rooms;
  const offer = bestOffer(nights, nightsBetween(input.bookedOn, input.checkIn));
  const discountAmount = offer ? Math.round((roomSubtotal * offer.percentOff) / 100) : 0;
  const discountedSubtotal = roomSubtotal - discountAmount;
  const taxes = Math.round(discountedSubtotal * PRICING.taxRate);
  const fees = PRICING.destinationFeePerRoomNight * nights * input.rooms;

  return {
    currency: CURRENCY.code,
    nights,
    rooms: input.rooms,
    nightlyRate: input.nightlyRate,
    roomSubtotal,
    discount: offer
      ? { code: offer.code, title: offer.title, percentOff: offer.percentOff, amount: discountAmount }
      : null,
    discountedSubtotal,
    taxes,
    fees,
    total: discountedSubtotal + taxes + fees,
  };
}

const formatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(minor: number, opts: { cents?: boolean } = {}): string {
  const key = opts.cents ? 'c' : 'w';
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(CURRENCY.locale, {
      style: 'currency',
      currency: CURRENCY.code,
      minimumFractionDigits: opts.cents ? 2 : 0,
      maximumFractionDigits: opts.cents ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f.format(minor / 100);
}
