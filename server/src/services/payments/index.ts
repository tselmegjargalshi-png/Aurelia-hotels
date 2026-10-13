import type { Env } from '../../env.js';
import { NoPaymentProvider, type PaymentProvider } from './provider.js';
import { StripeProvider } from './stripe.js';

export function createPaymentProvider(env: Pick<Env, 'paymentProvider' | 'stripeSecretKey' | 'stripeWebhookSecret'>): PaymentProvider {
  if (env.paymentProvider === 'stripe') {
    const stripe = new StripeProvider(env.stripeSecretKey, env.stripeWebhookSecret);
    if (stripe.isConfigured()) return stripe;
    console.warn('[payments] PAYMENT_PROVIDER=stripe but keys are missing or malformed — falling back to test-booking mode.');
  }
  return new NoPaymentProvider();
}

export type { PaymentProvider } from './provider.js';
