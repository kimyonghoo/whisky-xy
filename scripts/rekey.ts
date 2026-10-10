// Recompute listings.bottle_key with the current bottleKey() and remap kr_links.
// Idempotent; safe to re-run. Usage: `npm run rekey` (uses DATABASE_URL, else local PGlite).
import { getDb, runScript } from '@/lib/db/client';
import { rekeyAll } from '@/lib/rekey';

async function main(): Promise<number> {
  const db = await getDb();
  const report = await rekeyAll(db, (msg) => console.log(msg));
  console.log(JSON.stringify(report, null, 2));
  return 0;
}

runScript(main);
