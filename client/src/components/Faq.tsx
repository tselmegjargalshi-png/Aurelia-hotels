import { PRICING } from '../../../shared/config.js';

export const GENERAL_FAQ = [
  { q: 'Is Aurelia Hotels a real hotel company?', a: 'No. Aurelia is a fictional demonstration brand. The hotels, prices and scores are sample data, and no real stays are sold.' },
  { q: 'Will I be charged when I book?', a: 'No. Payment processing is not connected in this demo, so reservations are saved as test bookings and nothing is charged. A payment provider integration is prepared for a future production version.' },
  { q: 'How is availability checked?', a: 'Each room type has a set number of rooms. When you choose dates, every night of your stay is checked against existing reservations; a booking is accepted only if rooms are free on all of those nights.' },
  { q: 'What is included in the total price?', a: `The nightly room rate multiplied by nights and rooms, minus any qualifying offer, plus ${PRICING.taxLabel.toLowerCase()} and a ${PRICING.feeLabel.toLowerCase()}. All of these are demonstration values and are configurable.` },
  { q: 'Can I cancel a booking?', a: 'Yes — open the booking in My Bookings and submit a cancellation request before your arrival date. Each room shows its own cancellation terms before you book.' },
  { q: 'What does the “Demo score” mean?', a: 'It is an illustrative number for a fictional hotel. It is not based on real guest reviews, and Aurelia does not display reviews it cannot verify.' },
];

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="faq">
      {items.map((it) => (
        <details key={it.q}>
          <summary>{it.q}</summary>
          <p>{it.a}</p>
        </details>
      ))}
    </div>
  );
}
