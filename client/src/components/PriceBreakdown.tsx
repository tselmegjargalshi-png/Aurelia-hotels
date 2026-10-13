import type { PriceQuote } from '../../../shared/pricing.js';
import { PRICING } from '../../../shared/config.js';
import { formatMoney, plural } from '../lib/format.js';

/** One consistent breakdown used on checkout, confirmation and booking detail. */
export function PriceBreakdown({ quote }: { quote: PriceQuote }) {
  const m = (v: number) => formatMoney(v, { cents: true });
  return (
    <dl className="price-breakdown">
      <div><dt>{m(quote.nightlyRate)} × {plural(quote.nights, 'night')} × {plural(quote.rooms, 'room')}</dt><dd>{m(quote.roomSubtotal)}</dd></div>
      {quote.discount && (
        <div className="is-discount"><dt>{quote.discount.title} (−{quote.discount.percentOff}%)</dt><dd>−{m(quote.discount.amount)}</dd></div>
      )}
      <div><dt>{PRICING.taxLabel}</dt><dd>{m(quote.taxes)}</dd></div>
      <div><dt>{PRICING.feeLabel}</dt><dd>{m(quote.fees)}</dd></div>
      <div className="total"><dt>Total ({quote.currency})</dt><dd>{m(quote.total)}</dd></div>
    </dl>
  );
}
