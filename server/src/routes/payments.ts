import { HttpError, type Router } from '../lib/http.js';
import { applyPaymentEvent } from '../services/reservations.js';
import type { AppDeps } from './context.js';

/**
 * Provider webhooks. The raw body is needed for signature verification, so this
 * route opts out of JSON parsing. A reservation becomes `paid` ONLY here.
 */
export function paymentRoutes(r: Router, deps: AppDeps) {
  r.post('/api/payments/webhook', (ctx) => {
    if (!deps.payments.isConfigured()) throw new HttpError(404, 'NOT_FOUND', 'No payment provider is configured.');
    const event = deps.payments.verifyWebhook(ctx.rawBody ?? Buffer.alloc(0), ctx.req.headers);
    if (!event) throw new HttpError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    return { received: true, result: applyPaymentEvent(deps.db, event) };
  }, { raw: true });
}
