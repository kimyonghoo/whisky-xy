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
import { createPoliteFetcher, CrawlStopped, DEFAULT_DEADLINE_MS } from '@/lib/pagecrawl/fetcher';
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

/**
 * Wall-clock budget of a whole run, from the start of `runCrawl`: well inside the workflow's
 * 45-minute timeout, so the run always ends with its ingest written.
 */
export const RUN_BUDGET_MS = 40 * 60_000;
/** A JP store is not started with less than this left of the run budget. */
export const MIN_STORE_BUDGET_MS = 60_000;

interface StoreRunOpts {
  fetchFn?: FetchFn;
  delayMs?: number;
  politeSleep?: (ms: number) => Promise<void>;
  politeNow?: () => number;
  /** Non-USD stores: this store's wall-clock limit from its start, min(20 min, run budget left). */
  deadlineMs?: number;
  /** The run clock (ms), the same one the run budget is measured on. */
  clock: () => number;
}

/** Shopify catalog crawl. Non-USD stores are robots-checked (robots.txt read and obeyed first). */
async function runShopifyStore(db: Db, store: Store, t: Date, opts: StoreRunOpts): Promise<{ entry: StoreEntry; events: ChangeEvent[] }> {
  let robots;
  let products;
  let complete;
  let stoppedBy;
  const startedAt = opts.clock();
  try {
    if (store.currency !== 'USD') robots = await loadShopifyRobots(store, { fetchFn: opts.fetchFn });
    // The store's deadline counts from its start, so the robots.txt request comes out of it.
    const deadlineMs = robots && opts.deadlineMs !== undefined
      ? Math.max(1, opts.deadlineMs - (opts.clock() - startedAt))
      : undefined;
    ({ products, complete, stoppedBy } = await fetchCatalog(store, {
      fetchFn: opts.fetchFn,
      delayMs: opts.delayMs,
      robots,
      ...(robots ? { sleep: opts.politeSleep, now: opts.politeNow, deadlineMs } : {}),
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
      deadlineMs: opts.deadlineMs,
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
   * production always takes from the real clock (pacing, the 20-minute store deadline and the
   * 40-minute run budget).
   */
  politeSleep?: (ms: number) => Promise<void>;
  politeNow?: () => number;
}): Promise<CrawlReport> {
  const { db, stores, notify, siteUrl } = opts;
  const now = opts.now ?? (() => new Date());
  // The run budget is measured on the polite crawls' clock (injectable in tests), from here.
  const clock = opts.politeNow ?? (() => performance.now());
  const runStartedAt = clock();
  const budgetLeftMs = () => RUN_BUDGET_MS - (clock() - runStartedAt);
  const entries: (StoreEntry | undefined)[] = new Array(stores.length);

  /** One store, start to finish. Never throws: a failure becomes the store's report entry. */
  async function crawlOne(store: Store): Promise<{ entry: StoreEntry; events: ChangeEvent[] }> {
    const skip = (ok: boolean, note: string) => ({ entry: { storeId: store.id, ok, note, observations: 0, events: 0 }, events: [] });
    if (!store.crawlEnabled) return skip(true, 'skipped: crawl disabled (terms)');
    let deadlineMs: number | undefined;
    if (store.currency !== 'USD') {
      // Japanese stores must be able to identify and reach us: no crawl with the localhost fallback UA.
      if (botContactOrigin() === null) {
        console.error(`[crawl] ${store.id} skipped: SITE_URL unset or not a reachable origin`);
        return skip(false, 'skipped: SITE_URL unset');
      }
      const left = budgetLeftMs();
      if (left < MIN_STORE_BUDGET_MS) {
        console.error(`[crawl] ${store.id} skipped: run budget exhausted`);
        return skip(true, 'skipped: run budget exhausted');
      }
      deadlineMs = Math.min(DEFAULT_DEADLINE_MS, left);
    }
    try {
      const run = store.adapter === 'page' ? runPageStore : runShopifyStore;
      return await run(db, store, now(), { ...opts, clock, deadlineMs });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[crawl] ${store.id} failed: ${error}`);
      return { entry: { storeId: store.id, ok: false, error, observations: 0, events: 0 }, events: [] };
    }
  }

  // 1. Public stores. Only their events can alert, so the alerts need not wait for the private crawls.
  const events: ChangeEvent[] = [];
  for (const [i, store] of stores.entries()) {
    if (!store.publicAllowed) continue;
    const r = await crawlOne(store);
    entries[i] = r.entry;
    events.push(...r.events);
  }

  // 2. fx, kr_links and the alerts.
  const report: CrawlReport = { stores: [], alertsSent: 0, fx: 'ok', krLinks: { ok: 0, failed: 0 } };
  await refreshAndAlert(db, report, events, { fetchFn: opts.fetchFn, delayMs: opts.delayMs, now, notify, siteUrl });

  // 3. Private stores (Japan): slow, polite page crawls that never alert. Run last, so a slow or
  // failing private store cannot delay or lose the public alerts.
  for (const [i, store] of stores.entries()) {
    if (store.publicAllowed) continue;
    entries[i] = (await crawlOne(store)).entry;
  }

  report.stores = entries.filter((e): e is StoreEntry => e !== undefined);
  return report;
}

/** Step 2 of a run: fx, kr_links, and the alerts for the public stores' events. */
async function refreshAndAlert(
  db: Db,
  report: CrawlReport,
  events: ChangeEvent[],
  opts: { fetchFn?: FetchFn; delayMs?: number; now: () => Date; notify: (text: string) => Promise<void>; siteUrl: string },
): Promise<void> {
  const { now, notify, siteUrl } = opts;
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
}
