/**
 * Commercial configuration shared by the client (display) and the server
 * (authoritative calculation). Change values here — never hard-code them in UI.
 *
 * All tax/fee values below are FICTIONAL DEMONSTRATION VALUES. Real hotels
 * need jurisdiction-specific tax rules from a qualified source.
 */
export const CURRENCY = {
  code: 'USD',
  locale: 'en-US',
} as const;

export const PRICING = {
  /** Demonstration tax rate applied to the discounted room subtotal. */
  taxRate: 0.12,
  /** Demonstration destination fee, per room per night, in minor units (cents). */
  destinationFeePerRoomNight: 1000,
  /** Labels shown to guests so the demo nature is always disclosed. */
  taxLabel: 'Taxes (demo rate 12%)',
  feeLabel: 'Destination fee (demo, $10 per room / night)',
} as const;

/**
 * Real, rule-based offers. The pricing engine actually applies these — the UI
 * never shows a discount that the server would not also compute. Only the single
 * best eligible offer applies (offers do not stack).
 */
export const OFFERS = [
  {
    code: 'EXTENDED_STAY',
    title: 'The Long Weekend, Lengthened',
    summary: 'Stay five nights or more and save 15% on the room rate.',
    percentOff: 15,
    minNights: 5,
    minDaysInAdvance: 0,
  },
  {
    code: 'PLAN_AHEAD',
    title: 'Plan Ahead',
    summary: 'Arrive 60 or more days after booking and save 10% on the room rate.',
    percentOff: 10,
    minNights: 1,
    minDaysInAdvance: 60,
  },
] as const;

export type OfferCode = (typeof OFFERS)[number]['code'];

export const BOOKING_RULES = {
  maxNights: 30,
  maxDaysAhead: 365,
  maxRoomsPerBooking: 5,
  maxGuestsPerBooking: 16,
  /** Minutes inventory is held while a real payment is pending. */
  paymentHoldMinutes: 30,
} as const;

export const BRAND = {
  name: 'Aurelia Hotels',
  tagline: 'Stay Somewhere Extraordinary.',
  demoNotice:
    'Aurelia Hotels is a fictional demonstration brand. Hotels, prices and ratings are sample data; no real stays are sold.',
} as const;
