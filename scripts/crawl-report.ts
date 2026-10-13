// Data-quality report for crawled stores, so the owner can judge whether a store is ready to launch.
// Read-only: it only SELECTs from the local or configured DB and sends no network request.
// Usage: `npm run crawl:report -- --store <id>` or `npm run crawl:report -- --all` (every store, private included).
import { getDb, runScript } from '@/lib/db/client';
import { STORES } from '@/lib/stores';
import { formatReport, qualityReport } from '@/lib/crawl/quality';

function parseArgs(argv: string[]): { all: boolean; store: string | null } {
  let all = false;
  let store: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') all = true;
    else if (a === '--store') store = argv[++i] ?? null;
    else if (a.startsWith('--store=')) store = a.slice('--store='.length);
    else throw new Error(`unknown argument: ${a}`);
  }
  return { all, store };
}

async function main(): Promise<number> {
  const { all, store } = parseArgs(process.argv.slice(2));
  if (all === (store !== null)) {
    console.error('usage: npm run crawl:report -- --store <id> | --all');
    console.error(`stores: ${STORES.map((s) => s.id).join(', ')}`);
    return 2;
  }
  const ids = all ? STORES.map((s) => s.id) : [store!];
  if (!all && !STORES.some((s) => s.id === store)) {
    console.error(`unknown store: ${store}\nstores: ${STORES.map((s) => s.id).join(', ')}`);
    return 2;
  }
  const db = await getDb();
  const blocks: string[] = [];
  for (const id of ids) blocks.push(formatReport(await qualityReport(db, id)));
  console.log(blocks.join('\n\n'));
  return 0;
}

runScript(main);
