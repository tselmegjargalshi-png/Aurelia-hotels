import type { AvailabilityStatus, PaymentStatus, ReservationStatus } from '../../../shared/types.js';
export { formatMoney } from '../../../shared/pricing.js';
export { formatStayDate } from '../../../shared/dates.js';

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function guestsLabel(adults: number, children: number) {
  return [plural(adults, 'adult'), children ? plural(children, 'child', 'children') : ''].filter(Boolean).join(', ');
}

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: 'ok' | 'info' | 'warn' | 'muted' | 'bad' }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  checked_in: { label: 'Checked in', tone: 'info' },
  checked_out: { label: 'Completed', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  no_show: { label: 'No-show', tone: 'bad' },
  expired: { label: 'Expired (unpaid)', tone: 'muted' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  not_collected: 'Not collected — test booking (payments not connected)',
  pending: 'Awaiting payment confirmation',
  paid: 'Paid (confirmed by payment provider)',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

export const AVAILABILITY: Record<AvailabilityStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  available: { label: 'Available for your dates', tone: 'ok' },
  limited: { label: 'Limited availability', tone: 'warn' },
  sold_out: { label: 'Not available for your dates', tone: 'bad' },
  unsuitable: { label: 'No room fits your party', tone: 'bad' },
  unknown: { label: 'Add dates to check availability', tone: 'muted' },
};

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
