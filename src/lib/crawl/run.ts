import { inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, watches, type Listing } from '@/lib/db/schema';
import type { Store } from '@/lib/stores';
import { getStore } from '@/lib/stores';
import { fetchCatalog, type FetchFn } from '@/lib/shopify/client';
import { toObservations, catalogVariantIds } from '@/lib/crawl/map';
import { ingestStoreCrawl, type ChangeEvent } from '@/lib/crawl/ingest';
import { refreshFx } from '@/lib/fx';
import { refreshKrLinks } from '@/lib/krlinks';
import { selectAlerts, formatAlert } from '@/lib/alerts/match';

export interface CrawlReport {
  stores: { storeId: string; ok: boolean; error?: string; note?: string; observations: number; events: number }[];
  alertsSent: number;
  fx: 'ok' | string;
  krLinks: { ok: number; failed: number };
}

export async function runCrawl(opts: {
  db: Db;
  stores: Store[];
  fetchFn?: FetchFn;
  delayMs?: number;
  now?: () => Date;
  notify: (text: string) => Promise<void>;
  siteUrl: string;
}): Promise<CrawlReport> {
  const { db, stores, notify, siteUrl } = opts;
  const now = opts.now ?? (() => new Date());
  const report: CrawlReport = { stores: [], alertsSent: 0, fx: 'ok', krLinks: { ok: 0, failed: 0 } };
  const events: ChangeEvent[] = [];

  for (const store of stores) {
    try {
      const { products, complete } = await fetchCatalog(store, { fetchFn: opts.fetchFn, delayMs: opts.delayMs });
      const obs = products.flatMap((p) => toObservations(store, p));
      const markMissingSoldOut = complete && obs.length > 0;
      const evs = await ingestStoreCrawl(db, store.id, obs, now(), {
        markMissingSoldOut,
        catalogVariantIds: catalogVariantIds(products),
      });
      events.push(...evs);
      const entry: CrawlReport['stores'][number] = { storeId: store.id, ok: true, observations: obs.length, events: evs.length };
      if (obs.length === 0) entry.note = 'anomaly: no whisky observations; missing listings not marked sold out';
      else if (!complete) entry.note = 'incomplete: page limit reached; missing listings not marked sold out';
      report.stores.push(entry);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[crawl] ${store.id} failed: ${error}`);
      report.stores.push({ storeId: store.id, ok: false, error, observations: 0, events: 0 });
    }
  }

  // Korea comparison data is best-effort: never fails the run.
  try {
    await refreshFx(db, now(), opts.fetchFn);
  } catch (err) {
    report.fx = err instanceof Error ? err.message : String(err);
    console.error(`[crawl] fx failed: ${report.fx}`);
  }
  try {
    report.krLinks = await refreshKrLinks(db, { fetchFn: opts.fetchFn, delayMs: opts.delayMs, now: now() });
  } catch (err) {
    console.error(`[crawl] krLinks failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const ids = [...new Set(events.map((e) => e.listingId))];
  if (ids.length > 0) {
    const watchRows = await db.select().from(watches);
    const rows = await db.select().from(listings).where(inArray(listings.id, ids));
    const byId = new Map<number, Listing>(rows.map((l) => [l.id, l]));
    for (const c of selectAlerts(watchRows, events, byId)) {
      const store = getStore(c.listing.storeId);
      if (!store) continue;
      try {
        await notify(formatAlert(c, store, siteUrl));
        report.alertsSent++;
      } catch (err) {
        console.error(`[crawl] notify failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return report;
}
