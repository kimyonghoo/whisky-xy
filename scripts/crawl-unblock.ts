// Clears a persisted crawl block, after the owner has checked the store (spec 3.5).
// Only touches the crawl_state row in the local or configured DB; sends no request to any store.
// Usage: `npm run crawl:unblock -- --store <id>`.
import { getDb, runScript } from '@/lib/db/client';
import { STORES } from '@/lib/stores';
import { clearBlock } from '@/lib/crawl/block-state';

function parseStore(argv: string[]): string | null {
  let store: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') store = argv[++i] ?? null;
    else if (a.startsWith('--store=')) store = a.slice('--store='.length);
    else throw new Error(`unknown argument: ${a}`);
  }
  return store;
}

async function main(): Promise<number> {
  const store = parseStore(process.argv.slice(2));
  if (!store || !STORES.some((s) => s.id === store)) {
    console.error(store ? `unknown store: ${store}` : 'usage: npm run crawl:unblock -- --store <id>');
    console.error(`stores: ${STORES.map((s) => s.id).join(', ')}`);
    return 2;
  }
  const db = await getDb();
  const cleared = await clearBlock(db, store);
  console.log(
    cleared
      ? `${store}: cleared block (${cleared.reason}) since ${cleared.at.toISOString()}; the next crawl run requests it again`
      : `${store}: no block recorded; nothing changed`,
  );
  return 0;
}

runScript(main);
