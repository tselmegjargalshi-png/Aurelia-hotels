/**
 * Payment integration boundary.
 *
 * Reservation logic never talks to a payment API directly — it asks the
 * configured PaymentProvider. Card data never touches this server: a real
 * provider (e.g. Stripe) collects it in its own hosted fields and only tells
 * us, via a signature-verified webhook, that a payment succeeded. A
 * reservation is marked `paid` only from that verified event.
 */
export interface CreatePaymentInput {
  reservationCode: string;
  amount: number; // minor units
  currency: string;
  customerEmail: string;
}

export interface CreatedPayment {
  providerRef: string;
  /** Opaque secret for the provider's client SDK (never a card number). */
  clientSecret: string;
}

export interface VerifiedPaymentEvent {
  eventId: string;
  type: 'payment_succeeded' | 'payment_failed' | 'other';
  providerRef: string | null;
  amount: number | null;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when credentials are missing — the app then runs in test-booking mode. */
  isConfigured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Returns null if the signature is invalid. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedPaymentEvent | null;
}

export class NoPaymentProvider implements PaymentProvider {
  readonly name = 'none';
  isConfigured() { return false; }
  async createPayment(): Promise<CreatedPayment> {
    throw new Error('No payment provider is configured.');
  }
  verifyWebhook() { return null; }
}
