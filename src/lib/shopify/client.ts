import type { Currency, Store } from '@/lib/stores';
import { liveFetch, storeFetch } from '@/lib/shopify/http';
import { botUserAgent } from '@/lib/bot-ua';

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

/** Only `/products.json` or `/collections/<handle>/products.json`: never an arbitrary path. */
const CATALOG_PATH_RE = /^\/(?:collections\/[a-z0-9][a-z0-9-]*\/)?products\.json$/;

export function catalogPathOf(store: Pick<Store, 'domain' | 'catalogPath'>): string {
  const p = store.catalogPath ?? '/products.json';
  if (!CATALOG_PATH_RE.test(p)) throw new Error(`${store.domain}: invalid catalogPath ${p}`);
  return p;
}

export async function fetchCatalog(
  store: Store,
  opts: { fetchFn?: FetchFn; delayMs?: number; maxPages?: number; timeoutMs?: number } = {},
): Promise<{ products: ShopifyProduct[]; complete: boolean }> {
  const fetchFn = opts.fetchFn ?? storeFetch;
  const delayMs = opts.delayMs ?? 1100;
  const maxPages = opts.maxPages ?? 100;
  const timeoutMs = opts.timeoutMs ?? 20000;

  await checkCurrency(store, fetchFn, AbortSignal.timeout(timeoutMs));

  const base = catalogPathOf(store);
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    await sleep(delayMs);
    const path = `${base}?limit=250&page=${page}`;
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
