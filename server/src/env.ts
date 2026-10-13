import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Server configuration. Secrets come only from the environment (or a local,
 * git-ignored .env file) and are never sent to the browser bundle.
 */
const envFile = path.resolve(process.cwd(), '.env');
if (existsSync(envFile) && !process.env.AURELIA_SKIP_ENV_FILE) process.loadEnvFile(envFile);

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4173),
  host: process.env.HOST ?? '127.0.0.1',
  /** Public origin of the site, used for canonical URLs and Origin checks. */
  appOrigin: process.env.APP_ORIGIN ?? `http://localhost:${process.env.PORT ?? 4173}`,
  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/aurelia.db'),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  cookieSecure: bool('COOKIE_SECURE', isProduction),
  /** Demo-only: return password-reset links in the API response because no email service exists. Forced off in production. */
  demoShowResetLinks: !isProduction && bool('DEMO_SHOW_RESET_LINKS', true),
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? 'none') as 'none' | 'stripe',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  adminSeedEmail: process.env.ADMIN_SEED_EMAIL ?? 'admin@aurelia.demo',
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD ?? '',
  guestSeedPassword: process.env.GUEST_SEED_PASSWORD ?? '',
  trustProxy: bool('TRUST_PROXY', false),
  /**
   * Emit schema.org Hotel JSON-LD on hotel pages. OFF by default because the demo
   * hotels are fictional — publishing them as structured data would present
   * invented businesses as real. Enable only with real, verified property data.
   */
  structuredData: bool('ENABLE_HOTEL_STRUCTURED_DATA', false),
  clientDist: path.resolve(process.cwd(), process.env.CLIENT_DIST ?? 'client/dist'),
};

export type Env = typeof env;
