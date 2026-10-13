import { inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, watches, type Listing } from '@/lib/db/schema';
import type { Store } from '@/lib/stores';
import { getStore } from '@/lib/stores';
import { fetchCatalog, loadShopifyRobots, RobotsRefusal, type FetchFn } from '@/lib/shopify/client';
import { toObservations, catalogVariantIds } from '@/lib/crawl/map';
import { applyPageChecks, ingestStoreCrawl, type ChangeEvent } from '@/lib/crawl/ingest';
import { dueProductPaths, getNextListPage, saveNextListPage, storeListingPaths } from '@/lib/crawl/page-state';
import { botContactOrigin } from '@/lib/bot-ua';
import { createPoliteFetcher, CrawlStopped } from '@/lib/pagecrawl/fetcher';
import { crawlPageStore, type PageCrawlSkips } from '@/lib/pagecrawl/adapter';
import { PAGE_STORE_CONFIGS } from '@/lib/pagecrawl/configs';
import { refreshFx } from '@/lib/fx';
import { refreshKrLinks } from '@/lib/krlinks';
import { selectAlerts, formatAlert } from '@/lib/alerts/match';

/** What a page-crawled store did this run. */
export interface PageRunSummary {
  /** Requests sent, robots.txt included (at most 300). */
  requests: number;
  listPages: number;
  discovered: number;
  /** Product pages attempted. */
  checked: number;
  skipped: PageCrawlSkips;
  nextListPage: number;
}

export interface CrawlReport {
  stores: {
    storeId: string;
    ok: boolean;
    error?: string;
    /** Why the store was skipped or stopped, or an anomaly (`skipped: …`, `stopped: <reason>`, …). */
    note?: string;
    observations: number;
    events: number;
    page?: PageRunSummary;
  }[];
  alertsSent: number;
  fx: 'ok' | string;
  krLinks: { ok: number; failed: number };
}

type StoreEntry = CrawlReport['stores'][number];

/**
 * Known product pages re-checked per run, oldest checked first. Below the 300-request budget on
 * purpose: robots.txt and 20 list pages take 21, and the remaining ~130 go to new products found on
 * the list pages, so discovery never stalls once the store has hundreds of listings.
 */
const PAGE_DUE_PER_RUN = 150;

interface StoreRunOpts {
  fetchFn?: FetchFn;
  delayMs?: number;
  politeSleep?: (ms: number) => Promise<void>;
  politeNow?: () => number;
}

/** Shopify catalog crawl. Non-USD stores are robots-checked (robots.txt read and obeyed first). */
async function runShopifyStore(db: Db, store: Store, t: Date, opts: StoreRunOpts): Promise<{ entry: StoreEntry; events: ChangeEvent[] }> {
  let robots;
  let products;
  let complete;
  let stoppedBy;
  try {
    if (store.currency !== 'USD') robots = await loadShopifyRobots(store, { fetchFn: opts.fetchFn });
    ({ products, complete, stoppedBy } = await fetchCatalog(store, {
      fetchFn: opts.fetchFn,
      delayMs: opts.delayMs,
      robots,
      ...(robots ? { sleep: opts.politeSleep, now: opts.politeNow } : {}),
    }));
  } catch (err) {
    if (err instanceof RobotsRefusal) {
      return { entry: { storeId: store.id, ok: true, note: `skipped: ${err.message}`, observations: 0, events: 0 }, events: [] };
    }
    throw err;
  }
  const obs = products.flatMap((p) => toObservations(store, p));
  const markMissingSoldOut = complete && obs.length > 0;
  const evs = await ingestStoreCrawl(db, store.id, obs, t, {
    markMissingSoldOut,
    catalogVariantIds: catalogVariantIds(products),
  });
  const entry: StoreEntry = { storeId: store.id, ok: true, observations: obs.length, events: evs.length };
  if (obs.length === 0) entry.note = 'anomaly: no whisky observations; missing listings not marked sold out';
  else if (!complete) {
    entry.note = stoppedBy === 'deadline'
      ? 'stopped: deadline; missing listings not marked sold out'
      : 'incomplete: page limit reached; missing listings not marked sold out';
  }
  return { entry, events: evs };
}

/**
 * Page crawl of one store through the polite fetcher (robots, >= 3 s, 300 requests). Partial by
 * design: observed pages are ingested, per-path outcomes update their own listings, and nothing is
 * marked sold out for not being reached.
 */
async function runPageStore(db: Db, store: Store, t: Date, opts: StoreRunOpts): Promise<{ entry: StoreEntry; events: ChangeEvent[] }> {
  const cfg = PAGE_STORE_CONFIGS[store.id];
  if (!cfg) throw new Error(`no page-crawl config for ${store.id}`);
  let fetcher;
  try {
    fetcher = await createPoliteFetcher({
      origin: `https://${store.domain}`,
      fetchFn: opts.fetchFn,
      sleep: opts.politeSleep,
      now: opts.politeNow,
    });
  } catch (err) {
    if (err instanceof CrawlStopped) {
      return { entry: { storeId: store.id, ok: true, note: `stopped: ${err.reason}`, observations: 0, events: 0 }, events: [] };
    }
    throw err;
  }
  const [due, known, listPageStart] = await Promise.all([
    dueProductPaths(db, store.id, PAGE_DUE_PER_RUN),
    storeListingPaths(db, store.id),
    getNextListPage(db, store.id),
  ]);
  const r = await crawlPageStore(store, cfg, { fetcher, dueProductPaths: due, knownProductPaths: new Set(known), listPageStart });

  const evs = await ingestStoreCrawl(db, store.id, r.observations, t, { markMissingSoldOut: false });
  const checks = r.checked
    .filter((c) => c.outcome !== 'observed')
    .map((c) => ({ variantId: cfg.productId(c.path), gone: c.outcome === 'gone' }))
    .filter((c): c is { variantId: string; gone: boolean } => c.variantId !== null);
  const checkEvents = await applyPageChecks(db, store.id, checks, t);
  await saveNextListPage(db, store.id, r.nextListPage, t);

  const entry: StoreEntry = {
    storeId: store.id,
    ok: true,
    observations: r.observations.length,
    events: evs.length + checkEvents.length,
    page: {
      requests: r.requests,
      listPages: r.listPaths.length,
      discovered: r.discoveredProductPaths.length,
      checked: r.checked.length,
      skipped: r.skipped,
      nextListPage: r.nextListPage,
    },
  };
  if (r.stopped) entry.note = `stopped: ${r.stopped}`;
  return { entry, events: [...evs, ...checkEvents] };
}

export async function runCrawl(opts: {
  db: Db;
  stores: Store[];
  fetchFn?: FetchFn;
  delayMs?: number;
  now?: () => Date;
  notify: (text: string) => Promise<void>;
  siteUrl: string;
  /**
   * Tests only: sleep and clock of the polite crawls (page stores and robots-checked Shopify), which
   * production always takes from the real clock (pacing and the 20-minute deadline).
   */
  politeSleep?: (ms: number) => Promise<void>;
  politeNow?: () => number;
}): Promise<CrawlReport> {
  const { db, stores, notify, siteUrl } = opts;
  const now = opts.now ?? (() => new Date());
  const report: CrawlReport = { stores: [], alertsSent: 0, fx: 'ok', krLinks: { ok: 0, failed: 0 } };
  const events: ChangeEvent[] = [];

  for (const store of stores) {
    if (!store.crawlEnabled) {
      report.stores.push({ storeId: store.id, ok: true, note: 'skipped: crawl disabled (terms)', observations: 0, events: 0 });
      continue;
    }
    // Japanese stores must be able to identify and reach us: no crawl with the localhost fallback UA.
    if (store.currency !== 'USD' && botContactOrigin() === null) {
      console.error(`[crawl] ${store.id} skipped: SITE_URL unset or not a reachable origin`);
      report.stores.push({ storeId: store.id, ok: false, note: 'skipped: SITE_URL unset', observations: 0, events: 0 });
      continue;
    }
    try {
      const run = store.adapter === 'page' ? runPageStore : runShopifyStore;
      const { entry, events: evs } = await run(db, store, now(), opts);
      events.push(...evs);
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
    const byId = new Map<number, Listing>();
    // chunked: a mass sold-out sweep can yield more ids than Postgres' bind-param limit
    for (let i = 0; i < ids.length; i += 5000) {
      const rows = await db.select().from(listings).where(inArray(listings.id, ids.slice(i, i + 5000)));
      for (const l of rows) byId.set(l.id, l);
    }
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
