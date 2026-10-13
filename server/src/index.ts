import { createServer } from 'node:http';
import { env } from './env.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrations.js';
import { seed } from './db/seed.js';
import { seedPasswords } from './db/cli.js';
import { createApp } from './app.js';
import { defaultLimiters } from './routes/context.js';
import { createPaymentProvider } from './services/payments/index.js';
import { expireStaleHolds } from './services/reservations.js';
import { todayIso } from '../../shared/dates.js';

async function main() {
  const db = openDatabase(env.databasePath);
  const ran = migrate(db);
  if (ran.length) console.log(`[db] applied ${ran.join(', ')}`);
  // First run in development: populate the demonstration catalogue automatically.
  if (!env.isProduction && !db.prepare('SELECT 1 FROM hotels LIMIT 1').get()) {
    await seed(db, { adminEmail: env.adminSeedEmail, ...seedPasswords() });
    console.log('[db] seeded demonstration data');
  }

  const payments = createPaymentProvider(env);
  const app = createApp({ db, env, payments, today: () => todayIso(), limiters: defaultLimiters() });

  setInterval(() => {
    const n = expireStaleHolds(db);
    if (n) console.log(`[holds] expired ${n} unpaid reservation hold(s)`);
  }, 60_000).unref();

  const server = createServer(app);
  server.listen(env.port, env.host, () => {
    console.log(`Aurelia Hotels running at http://${env.host}:${env.port}`);
    console.log(`Payments: ${payments.isConfigured() ? payments.name : 'not connected — TEST BOOKING MODE (no charges)'}`);
  });

  const shutdown = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
