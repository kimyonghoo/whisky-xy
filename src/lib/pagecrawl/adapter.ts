// Page-crawl adapter: list pages -> product paths -> item pages -> observations.
// Every request goes through the polite fetcher (robots, pacing, budget, stop rules).
import type { Store } from '@/lib/stores';
import type { Observation } from '@/lib/crawl/map';
import { parsePriceMinor } from '@/lib/money';
import { bottleKey, isWhiskyProduct, normalizeText, parseBatch, parseProof, parseSizeMl } from '@/lib/whisky/parse';
import { CrawlStopped, PageGone, PathDisallowed, type CrawlStopReason, type PoliteFetcher } from '@/lib/pagecrawl/fetcher';
import { decodeHtmlEntities, parseJsonLdOffer } from '@/lib/pagecrawl/jsonld';
import type { PageStoreConfig } from '@/lib/pagecrawl/configs';

export interface PageCrawlSkips {
  /** robots.txt refused the path (or the path was malformed). */
  disallowed: number;
  /** 404/410. */
  gone: number;
  /** JSON-LD currency missing or not the store's currency. */
  currency: number;
  /** Not a whisky bottle by title, or a miniature under 200 ml. */
  notWhisky: number;
  /** No JSON-LD Product, no single price, or an unparseable price. */
  noPrice: number;
  /** The JSON-LD gives no explicit in-stock/out-of-stock value. */
  noAvailability: number;
  /** Any other per-page failure (HTTP error, network error, unusable path). */
  error: number;
}

export type PageCheckOutcome = 'observed' | keyof PageCrawlSkips;

export interface PageCrawlResult {
  observations: Observation[];
  /**
   * One entry per product path attempted this run (canonical path), in order: observed, or why it
   * was skipped. Paths not reached because of a stop or the budget are absent.
   */
  checked: { path: string; outcome: PageCheckOutcome }[];
  /** List pages read successfully this run. */
  listPaths: string[];
  /** Product paths found on this run's list pages (canonical, de-duplicated, in page order). */
  discoveredProductPaths: string[];
  /** Where the next run's list reading starts. */
  nextListPage: number;
  /** Why the fetcher stopped the store for this run, or null when the run finished its work. */
  stopped: CrawlStopReason | null;
  /** Requests used, robots.txt included. */
  requests: number;
  skipped: PageCrawlSkips;
}

export interface PageCrawlOptions {
  fetcher: PoliteFetcher;
  /** Known product paths to re-check, oldest checked first. Visited before new ones. */
  dueProductPaths: string[];
  /** Product paths already stored; list-discovered paths in this set are not fetched as new. */
  knownProductPaths?: ReadonlySet<string>;
  /** First list page to read (1-based). Default 1. */
  listPageStart?: number;
}

/** Bottles under this are miniatures, which the Shopify path drops too. */
const MIN_BOTTLE_ML = 200;

function hrefs(html: string): string[] {
  return [...html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => decodeHtmlEntities((m[1] ?? m[2]).trim()));
}

/** Canonical product paths linked from a list page, in page order, without duplicates. */
function listProductPaths(html: string, cfg: PageStoreConfig): string[] {
  const out = new Set<string>();
  for (const href of hrefs(html)) {
    if (!cfg.productUrlRe.test(href)) continue;
    const id = cfg.productId(href);
    if (id !== null) out.add(cfg.productPath(id));
  }
  return [...out];
}

function titleOf(html: string, jsonLdName: string | null, cfg: PageStoreConfig): string {
  const fromLd = jsonLdName === null ? '' : decodeHtmlEntities(jsonLdName).trim();
  if (fromLd) return fromLd;
  const fromCfg = cfg.titleFrom?.(html)?.trim();
  if (fromCfg) return fromCfg;
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return t ? decodeHtmlEntities(t[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}

type PageOutcome = { obs: Observation } | { skip: keyof PageCrawlSkips };

/** One fetched item page to an observation, or the reason it is skipped. Never guesses a fact. */
function toObservation(store: Store, cfg: PageStoreConfig, path: string, productId: string, html: string): PageOutcome {
  const offer = parseJsonLdOffer(html);
  if (!offer || offer.price === null) return { skip: 'noPrice' };
  if (offer.currency !== store.currency) return { skip: 'currency' };
  let priceCents: number;
  try {
    priceCents = parsePriceMinor(offer.price, store.currency);
  } catch {
    return { skip: 'noPrice' };
  }
  if (offer.availability === null) return { skip: 'noAvailability' };

  const title = titleOf(html, offer.name, cfg);
  if (!title || !isWhiskyProduct({ title, productType: '', tags: [] }, { whiskyOnlyCatalog: store.whiskyOnlyCatalog })) {
    return { skip: 'notWhisky' };
  }
  const titleSize = parseSizeMl(title);
  const specSize = cfg.sizeFrom(html);
  const sizeMl = specSize ?? titleSize;
  if (sizeMl !== null && sizeMl < MIN_BOTTLE_ML) return { skip: 'notWhisky' };
  // One size source for sizeMl and the bottle key: the 容量 row when there is one. It goes in
  // variantTitle whenever the title does not already say it, so the key (and any later rekey,
  // which reads title + variantTitle) uses it: `700ml` when the title has no size (instead of the
  // 750 ml default), `容量 700ml` when the title says another size (the 容量 label wins in bottleKey).
  const variantTitle =
    specSize === null || specSize === titleSize ? null : titleSize === null ? `${specSize}ml` : `容量 ${specSize}ml`;
  const keyText = `${title} ${variantTitle ?? ''}`;

  return {
    obs: {
      storeId: store.id,
      productId,
      variantId: productId,
      handle: productId,
      title,
      variantTitle,
      vendor: '',
      productType: '',
      imageUrl: null,
      url: `https://${store.domain}${path}`,
      priceCents,
      currency: store.currency,
      available: offer.availability === 'in',
      sizeMl,
      proof: parseProof(keyText),
      batch: parseBatch(keyText),
      bottleKey: bottleKey({ title, variantTitle }),
      searchText: normalizeText(title),
    },
  };
}

/**
 * Crawls one page-based store within the fetcher's budget:
 * 1. list pages from `listPageStart`, up to `cfg.listPagesPerRun`, collecting product paths;
 * 2. item pages: `dueProductPaths` first, then list-discovered paths that are neither due nor known.
 *
 * Observations come only from item pages fetched in this run (no sold-out sweep: runs are partial).
 * A `CrawlStopped` ends the run and keeps what was gathered; every other per-path failure skips
 * that path and is counted in `skipped`.
 */
export async function crawlPageStore(store: Store, cfg: PageStoreConfig, opts: PageCrawlOptions): Promise<PageCrawlResult> {
  const { fetcher } = opts;
  const skipped: PageCrawlSkips = { disallowed: 0, gone: 0, currency: 0, notWhisky: 0, noPrice: 0, noAvailability: 0, error: 0 };
  const observations: Observation[] = [];
  const checked: PageCrawlResult['checked'] = [];
  const listPaths: string[] = [];
  const discovered = new Set<string>();
  let stopped: CrawlStopReason | null = null;

  const start = Number.isInteger(opts.listPageStart) && opts.listPageStart! >= 1 && opts.listPageStart! <= cfg.maxListPages
    ? opts.listPageStart!
    : 1;
  let nextListPage = start;
  let previousPage: string | null = null;

  // 1. List pages.
  for (let read = 0; read < cfg.listPagesPerRun; read++) {
    const page = start + read;
    const path = cfg.listPath(page);
    let html: string;
    try {
      html = await fetcher.get(path);
    } catch (e) {
      if (e instanceof CrawlStopped) {
        stopped = e.reason;
        nextListPage = page; // not read: start there next run
      } else if (e instanceof PageGone) {
        nextListPage = 1; // past the end of the list
      } else if (e instanceof PathDisallowed) {
        skipped.disallowed++;
        nextListPage = 1;
      } else {
        // Any other error (HTTP error, redirect of a past-the-end page, network): wrap rather than
        // retry this page forever.
        skipped.error++;
        nextListPage = 1;
      }
      break;
    }
    listPaths.push(path);
    const found = listProductPaths(html, cfg);
    const signature = found.join('\n');
    // No products, or the very same products as the page before (pagination clamped at the end).
    if (found.length === 0 || signature === previousPage) {
      nextListPage = 1;
      break;
    }
    previousPage = signature;
    for (const p of found) discovered.add(p);
    nextListPage = page >= cfg.maxListPages ? 1 : page + 1;
    if (page >= cfg.maxListPages) break;
  }

  // 2. Item pages: due first (in the given order), then new ones.
  if (stopped === null) {
    // Everything is compared and fetched in canonical form; a path with no product id is skipped
    // without a request (and is not reported in `checked`, having no canonical path).
    const canonical = (p: string): string | null => {
      const id = cfg.productId(p);
      return id === null ? null : cfg.productPath(id);
    };
    const due: string[] = [];
    for (const p of opts.dueProductPaths) {
      const c = canonical(p);
      if (c === null) skipped.error++;
      else if (!due.includes(c)) due.push(c);
    }
    const dueSet = new Set(due);
    const known = new Set<string>();
    for (const p of opts.knownProductPaths ?? []) {
      const c = canonical(p);
      if (c !== null) known.add(c);
    }
    const fresh = [...discovered].filter((p) => !dueSet.has(p) && !known.has(p));

    for (const path of [...due, ...fresh]) {
      const productId = cfg.productId(path)!; // canonical paths always have an id
      let outcome: PageCheckOutcome;
      try {
        const html = await fetcher.get(path);
        const result = toObservation(store, cfg, path, productId, html);
        if ('obs' in result) {
          observations.push(result.obs);
          outcome = 'observed';
        } else {
          outcome = result.skip;
        }
      } catch (e) {
        if (e instanceof CrawlStopped) {
          stopped = e.reason;
          break;
        }
        outcome = e instanceof PathDisallowed ? 'disallowed' : e instanceof PageGone ? 'gone' : 'error';
      }
      if (outcome !== 'observed') skipped[outcome]++;
      checked.push({ path, outcome });
    }
  }

  return {
    observations,
    checked,
    listPaths,
    discoveredProductPaths: [...discovered],
    nextListPage,
    stopped,
    requests: fetcher.used(),
    skipped,
  };
}
