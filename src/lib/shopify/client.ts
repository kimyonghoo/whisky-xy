import type { Currency, Store } from '@/lib/stores';
import { liveFetch, storeFetch } from '@/lib/shopify/http';
import { botUserAgent } from '@/lib/bot-ua';
import { parseRobots, type Robots } from '@/lib/pagecrawl/robots';
import { MAX_CRAWL_DELAY_MS, PRODUCT_TOKEN } from '@/lib/pagecrawl/fetcher';

export type FetchFn = typeof fetch;

export interface ShopifyVariant { id: number; title: string; price: string; available: boolean }
export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[] | string;
  images: { src: string }[];
  variants: ShopifyVariant[];
}
export interface LiveVariant { id: number; priceCents: number; available: boolean }

export class CurrencyMismatchError extends Error {
  currency: string;
  constructor(expected: string, currency: string) {
    super(`Expected ${expected} but store reported ${currency}`);
    this.name = 'CurrencyMismatchError';
    this.currency = currency;
  }
}

const CURRENCY_COOKIE: Record<Currency, string> = {
  USD: 'localization=US; cart_currency=USD',
  JPY: 'localization=JP; cart_currency=JPY',
};

export function storeHeaders(store: Pick<Store, 'currency'>): Record<string, string> {
  return {
    Cookie: CURRENCY_COOKIE[store.currency],
    Accept: '*/*',
    'User-Agent': botUserAgent(),
  };
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

async function storeRequest(store: Store, path: string, fetchFn: FetchFn, signal: AbortSignal): Promise<Response> {
  // redirect: 'manual' so we never send our cookie to, or read data from, another host.
  const res = await fetchFn(`https://${store.domain}${path}`, { headers: storeHeaders(store), signal, redirect: 'manual' });
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new Error(`${store.domain} ${path}: unexpected redirect (HTTP ${res.status || 'opaqueredirect'})`);
  }
  return res;
}

async function readJson<T>(store: Store, path: string, res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    const ct = (res.headers.get('content-type') ?? 'unknown').split(';')[0].trim();
    throw new Error(`${store.domain} ${path}: expected JSON, got ${ct}`);
  }
}

async function checkCurrency(store: Store, fetchFn: FetchFn, signal: AbortSignal): Promise<void> {
  const res = await storeRequest(store, '/cart.js', fetchFn, signal);
  if (!res.ok) throw new Error(`${store.domain} /cart.js failed: HTTP ${res.status}`);
  const cart = await readJson<{ currency?: string }>(store, '/cart.js', res);
  if (cart.currency !== store.currency) throw new CurrencyMismatchError(store.currency, String(cart.currency));
}

/**
 * The store is not crawled this run because of its robots.txt: it could not be read (anything but
 * a 2xx or a 404), it disallows a path the crawl would request, or its Crawl-delay is too long.
 */
export class RobotsRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RobotsRefusal';
  }
}

/**
 * Reads the store's robots.txt with the bot User-Agent (no cookie, no redirects, no retry).
 * 404 means no rules; any other non-2xx, a redirect or a network error refuses the store.
 */
export async function loadShopifyRobots(
  store: Pick<Store, 'domain'>,
  opts: { fetchFn?: FetchFn; timeoutMs?: number } = {},
): Promise<Robots> {
  const fetchFn = opts.fetchFn ?? liveFetch;
  let res: Response;
  try {
    res = await fetchFn(`https://${store.domain}/robots.txt`, {
      headers: { 'User-Agent': botUserAgent(), Accept: 'text/plain,*/*' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
      redirect: 'manual',
    });
  } catch (e) {
    throw new RobotsRefusal(`robots.txt unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
  let robots: Robots;
  if (res.status === 404) {
    robots = parseRobots('', PRODUCT_TOKEN);
  } else if (res.status >= 200 && res.status < 300 && res.type !== 'opaqueredirect') {
    robots = parseRobots(await res.text(), PRODUCT_TOKEN);
  } else {
    throw new RobotsRefusal(`robots.txt unavailable: HTTP ${res.status || res.type}`);
  }
  if ((robots.crawlDelayMs ?? 0) > MAX_CRAWL_DELAY_MS) {
    throw new RobotsRefusal(`robots.txt crawl-delay ${robots.crawlDelayMs} ms exceeds ${MAX_CRAWL_DELAY_MS} ms`);
  }
  return robots;
}

/**
 * Currency check for robots-checked crawls. Shopify's robots.txt disallows `/cart.js` (an "AJAX
 * surface"), so these read the shop's currency from `/meta.json` instead.
 */
async function checkMetaCurrency(store: Store, fetchFn: FetchFn, signal: AbortSignal): Promise<void> {
  const res = await storeRequest(store, '/meta.json', fetchFn, signal);
  if (!res.ok) throw new Error(`${store.domain} /meta.json failed: HTTP ${res.status}`);
  const meta = await readJson<{ currency?: string }>(store, '/meta.json', res);
  if (meta.currency !== store.currency) throw new CurrencyMismatchError(store.currency, String(meta.currency));
}

/** Only `/products.json` or `/collections/<handle>/products.json`: never an arbitrary path. */
const CATALOG_PATH_RE = /^\/(?:collections\/[a-z0-9][a-z0-9-]*\/)?products\.json$/;

export function catalogPathOf(store: Pick<Store, 'domain' | 'catalogPath'>): string {
  const p = store.catalogPath ?? '/products.json';
  if (!CATALOG_PATH_RE.test(p)) throw new Error(`${store.domain}: invalid catalogPath ${p}`);
  return p;
}

/**
 * Reads the catalog page by page. With `robots` (the robots-checked crawl used for non-USD stores),
 * every path the crawl could request (`/meta.json` and catalog pages 1..maxPages, with their exact
 * query) is checked before the first request, the currency comes from `/meta.json`, and a
 * Crawl-delay above `delayMs` sets the pacing. Without it, behaviour is unchanged (`/cart.js`).
 */
export async function fetchCatalog(
  store: Store,
  opts: {
    fetchFn?: FetchFn;
    delayMs?: number;
    maxPages?: number;
    timeoutMs?: number;
    robots?: Robots;
    /** Tests only. */
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ products: ShopifyProduct[]; complete: boolean }> {
  const fetchFn = opts.fetchFn ?? storeFetch;
  const maxPages = opts.maxPages ?? 100;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const wait = opts.sleep ?? sleep;
  const { robots } = opts;
  const delayMs = Math.max(opts.delayMs ?? 1100, robots?.crawlDelayMs ?? 0);

  const base = catalogPathOf(store);
  const pagePath = (page: number) => `${base}?limit=250&page=${page}`;
  if (robots) {
    const paths = ['/meta.json', ...Array.from({ length: maxPages }, (_, i) => pagePath(i + 1))];
    const refused = paths.find((p) => !robots.isAllowed(p));
    if (refused !== undefined) throw new RobotsRefusal(`robots.txt disallows ${refused}`);
    await checkMetaCurrency(store, fetchFn, AbortSignal.timeout(timeoutMs));
  } else {
    await checkCurrency(store, fetchFn, AbortSignal.timeout(timeoutMs));
  }

  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    await wait(delayMs);
    const path = pagePath(page);
    const res = await storeRequest(store, path, fetchFn, AbortSignal.timeout(timeoutMs));
    if (!res.ok) throw new Error(`${store.domain} products page ${page} failed: HTTP ${res.status}`);
    const body = await readJson<{ products?: ShopifyProduct[] }>(store, path, res);
    const batch = body.products ?? [];
    if (batch.length === 0) return { products, complete: true };
    products.push(...batch);
  }
  return { products, complete: false };
}

export async function fetchLiveProduct(
  store: Store,
  handle: string,
  opts: { fetchFn?: FetchFn; timeoutMs?: number } = {},
): Promise<LiveVariant[] | null> {
  // Shopify's `/products/<handle>.js` prices are in subunits (x100) even for zero-decimal
  // currencies, so a JPY price would be stored 100x too high. Fail closed, before any request,
  // until a non-USD live recheck is designed. (recheckListing turns this throw into 'failed'.)
  if (store.currency !== 'USD') {
    throw new Error(`Live recheck is USD-only: ${store.id} prices in ${store.currency}`);
  }
  const fetchFn = opts.fetchFn ?? liveFetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const productPath = `/products/${encodeURIComponent(handle)}.js`;

  const [, res] = await Promise.all([
    checkCurrency(store, fetchFn, signal),
    storeRequest(store, productPath, fetchFn, signal),
  ]);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${store.domain} product ${handle} failed: HTTP ${res.status}`);
  const body = await readJson<{ variants?: { id: number | string; price: unknown; available: boolean }[] }>(
    store,
    productPath,
    res,
  );
  return (body.variants ?? []).map((v) => {
    if (typeof v.price !== 'number' || !Number.isInteger(v.price)) {
      throw new Error(`${store.domain} ${productPath}: variant ${v.id} has non-integer price ${String(v.price)}`);
    }
    return { id: Number(v.id), priceCents: v.price, available: Boolean(v.available) };
  });
}
