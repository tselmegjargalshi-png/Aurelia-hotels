import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreatePaymentInput, CreatedPayment, PaymentProvider, VerifiedPaymentEvent } from './provider.js';

/**
 * Stripe adapter (server side only).
 *
 * STATUS: prepared but NOT exercised against Stripe in this project — no
 * credentials were available. It creates PaymentIntents through Stripe's REST
 * API and verifies webhook signatures (Stripe-Signature, HMAC-SHA256 with a
 * 5-minute tolerance). The client-side card form (Stripe Elements) is not yet
 * wired into the checkout UI; see docs/PAYMENTS.md.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  constructor(private secretKey: string, private webhookSecret: string, private toleranceSec = 300) {}

  isConfigured() {
    return this.secretKey.startsWith('sk_') && this.webhookSecret.startsWith('whsec_');
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const body = new URLSearchParams({
      amount: String(input.amount),
      currency: input.currency.toLowerCase(),
      'metadata[reservation_code]': input.reservationCode,
      receipt_email: input.customerEmail,
      'automatic_payment_methods[enabled]': 'true',
    });
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `reservation-${input.reservationCode}`,
      },
      body,
    });
    const json = (await res.json()) as { id?: string; client_secret?: string; error?: { message?: string } };
    if (!res.ok || !json.id || !json.client_secret) {
      throw new Error(`Stripe error: ${json.error?.message ?? res.status}`);
    }
    return { providerRef: json.id, clientSecret: json.client_secret };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedPaymentEvent | null {
    const header = headers['stripe-signature'];
    if (typeof header !== 'string') return null;
    const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
    const timestamp = Number(parts.t);
    const signature = parts.v1;
    if (!timestamp || !signature) return null;
    if (Math.abs(Date.now() / 1000 - timestamp) > this.toleranceSec) return null;
    const expected = createHmac('sha256', this.webhookSecret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const event = JSON.parse(rawBody.toString('utf8')) as { id: string; type: string; data?: { object?: { id?: string; amount_received?: number } } };
    const obj = event.data?.object;
    const type = event.type === 'payment_intent.succeeded' ? 'payment_succeeded'
      : event.type === 'payment_intent.payment_failed' ? 'payment_failed' : 'other';
    return { eventId: event.id, type, providerRef: obj?.id ?? null, amount: obj?.amount_received ?? null };
  }
}
