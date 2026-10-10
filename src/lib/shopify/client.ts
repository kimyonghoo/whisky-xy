import type { Store } from '@/lib/stores';

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
  constructor(currency: string) {
    super(`Expected USD but store reported ${currency}`);
    this.name = 'CurrencyMismatchError';
    this.currency = currency;
  }
}

export function storeHeaders(): Record<string, string> {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  return {
    Cookie: 'localization=US; cart_currency=USD',
    'User-Agent': `WhiskyPortalBot/0.1 (+${siteUrl})`,
  };
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

async function checkCurrency(store: Store, fetchFn: FetchFn, signal?: AbortSignal): Promise<void> {
  const res = await fetchFn(`https://${store.domain}/cart.js`, { headers: storeHeaders(), signal });
  if (!res.ok) throw new Error(`${store.domain} /cart.js failed: HTTP ${res.status}`);
  const cart = (await res.json()) as { currency?: string };
  if (cart.currency !== 'USD') throw new CurrencyMismatchError(String(cart.currency));
}

export async function fetchCatalog(
  store: Store,
  opts: { fetchFn?: FetchFn; delayMs?: number; maxPages?: number } = {},
): Promise<{ products: ShopifyProduct[]; complete: boolean }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const delayMs = opts.delayMs ?? 1100;
  const maxPages = opts.maxPages ?? 100;

  await checkCurrency(store, fetchFn);

  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    await sleep(delayMs);
    const url = `https://${store.domain}/products.json?limit=250&page=${page}`;
    const res = await fetchFn(url, { headers: storeHeaders() });
    if (!res.ok) throw new Error(`${store.domain} products page ${page} failed: HTTP ${res.status}`);
    const body = (await res.json()) as { products?: ShopifyProduct[] };
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
  const fetchFn = opts.fetchFn ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const productUrl = `https://${store.domain}/products/${encodeURIComponent(handle)}.js`;

  const [, res] = await Promise.all([
    checkCurrency(store, fetchFn, signal),
    fetchFn(productUrl, { headers: storeHeaders(), signal }),
  ]);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${store.domain} product ${handle} failed: HTTP ${res.status}`);
  const body = (await res.json()) as { variants?: { id: number; price: number; available: boolean }[] };
  return (body.variants ?? []).map((v) => ({ id: v.id, priceCents: v.price, available: v.available }));
}
