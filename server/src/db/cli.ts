import { rmSync, existsSync } from 'node:fs';
import { env } from '../env.js';
import { openDatabase } from './connection.js';
import { migrate } from './migrations.js';
import { seed } from './seed.js';

/** Demo-only fallback credentials (documented in README). Production requires explicit env values. */
export const DEMO_ADMIN_PASSWORD = 'Aurelia-Admin-2026';
export const DEMO_GUEST_PASSWORD = 'Aurelia-Guest-2026';

export function seedPasswords() {
  if (env.isProduction && (!env.adminSeedPassword || !env.guestSeedPassword)) {
    throw new Error('Set ADMIN_SEED_PASSWORD and GUEST_SEED_PASSWORD before seeding in production.');
  }
  return {
    adminPassword: env.adminSeedPassword || DEMO_ADMIN_PASSWORD,
    guestPassword: env.guestSeedPassword || DEMO_GUEST_PASSWORD,
  };
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'reset') {
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(env.databasePath + suffix)) rmSync(env.databasePath + suffix);
    console.log(`Removed ${env.databasePath}`);
  }
  const db = openDatabase(env.databasePath);
  const ran = migrate(db);
  console.log(ran.length ? `Applied migrations: ${ran.join(', ')}` : 'Schema up to date.');
  if (cmd === 'seed' || cmd === 'reset') {
    await seed(db, { adminEmail: env.adminSeedEmail, ...seedPasswords() });
    console.log('Seeded demonstration catalogue, demo accounts and sample bookings.');
  }
  db.close();
}

if (process.argv[1]?.match(/cli\.(ts|js)$/)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
