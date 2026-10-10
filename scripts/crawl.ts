import { getDb, runScript } from '@/lib/db/client';
import { STORES } from '@/lib/stores';
import { runCrawl } from '@/lib/crawl/run';
import { sendTelegram } from '@/lib/alerts/telegram';

async function main(): Promise<number> {
  const only = (process.env.CRAWL_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const stores = only.length ? STORES.filter((s) => only.includes(s.id)) : STORES;
  if (stores.length === 0) throw new Error(`CRAWL_ONLY matched no stores: ${only.join(',')}`);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const notify = async (text: string) => {
    if (token && chatIds.length) await sendTelegram(token, chatIds, text);
    else console.log(`[alert]\n${text}`);
  };

  const db = await getDb();
  const report = await runCrawl({ db, stores, notify, siteUrl: process.env.SITE_URL || 'http://localhost:3000' });
  console.log(JSON.stringify(report, null, 2));
  return report.stores.every((s) => !s.ok) ? 1 : 0;
}

// runScript closes PGlite cleanly (shutdown checkpoint) on exit, error and Ctrl+C.
runScript(main);
