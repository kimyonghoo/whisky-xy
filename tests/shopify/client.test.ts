import { describe, it, expect } from 'vitest';
import { fetchCatalog, fetchLiveProduct, CurrencyMismatchError, storeHeaders } from '@/lib/shopify/client';
import type { Store } from '@/lib/stores';

const store = { id: 'dewinespot', name: 'De Wine Spot', domain: 'dewinespot.co', city: 'brooklyn' } as Store;
const HOST = 'https://dewinespot.co';

interface Call { url: string; headers: Record<string, string> }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function makeFake(route: (url: string) => Response) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return route(url);
  }) as typeof fetch & { calls: Call[] };
  fn.calls = calls;
  return fn;
}
const prod = (id: number) => ({ id, title: `P${id}`, handle: `p${id}`, vendor: 'v', product_type: 't', tags: [], images: [], variants: [] });
const usd = () => json({ currency: 'USD' });

describe('fetchCatalog', () => {
  it('pages until empty and sends USD cookie', async () => {
    const fake = makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('page=1')) return json({ products: [prod(1), prod(2)] });
      if (url.endsWith('page=2')) return json({ products: [prod(3)] });
      return json({ products: [] });
    });
    const { products, complete } = await fetchCatalog(store, { fetchFn: fake, delayMs: 0 });
    expect(products).toHaveLength(3);
    expect(complete).toBe(true);
    expect(fake.calls.every((c) => c.headers.Cookie === 'localization=US; cart_currency=USD')).toBe(true);
    expect(fake.calls.every((c) => c.headers['User-Agent'].startsWith('WhiskyPortalBot/0.1'))).toBe(true);
    expect(fake.calls.map((c) => c.url)).toContain(`${HOST}/products.json?limit=250&page=3`);
  });
  it('throws CurrencyMismatchError when cart.js reports KRW', async () => {
    const fake = makeFake(() => json({ currency: 'KRW' }));
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(fake.calls).toHaveLength(1);
  });
  it('throws (no partial result) when page 2 returns 429', async () => {
    const fake = makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('page=1')) return json({ products: [prod(1)] });
      return json({}, 429);
    });
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/429/);
  });
  it('stops at maxPages and reports incomplete', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({ products: [prod(1)] })));
    const { products, complete } = await fetchCatalog(store, { fetchFn: fake, delayMs: 0, maxPages: 2 });
    expect(products).toHaveLength(2);
    expect(complete).toBe(false);
  });
  it('crawls the store collection path when catalogPath is set', async () => {
    const fake = makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('page=1')) return json({ products: [prod(1)] });
      return json({ products: [] });
    });
    const { complete } = await fetchCatalog({ ...store, catalogPath: '/collections/whiskeys/products.json' }, { fetchFn: fake, delayMs: 0 });
    expect(complete).toBe(true);
    expect(fake.calls.map((c) => c.url)).toEqual([
      `${HOST}/cart.js`,
      `${HOST}/collections/whiskeys/products.json?limit=250&page=1`,
      `${HOST}/collections/whiskeys/products.json?limit=250&page=2`,
    ]);
  });
  it('rejects a catalogPath that is not a products.json endpoint', async () => {
    const fake = makeFake(() => usd());
    for (const catalogPath of ['/admin/products.json', '//evil.com/products.json', '/collections/../x/products.json', 'products.json']) {
      await expect(fetchCatalog({ ...store, catalogPath }, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/invalid catalogPath/);
    }
  });
  it('waits delayMs between requests', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({ products: [] })));
    const t = Date.now();
    await fetchCatalog(store, { fetchFn: fake, delayMs: 60 });
    expect(Date.now() - t).toBeGreaterThanOrEqual(55);
  });
});

describe('fetchLiveProduct', () => {
  const liveFake = () =>
    makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('/products/stagg.js')) return json({ variants: [{ id: 11, price: 17500, available: true }] });
      return json({}, 404);
    });
  it('returns cents and null on 404', async () => {
    expect(await fetchLiveProduct(store, 'stagg', { fetchFn: liveFake() })).toEqual([{ id: 11, priceCents: 17500, available: true }]);
    expect(await fetchLiveProduct(store, 'gone', { fetchFn: liveFake() })).toBeNull();
  });
  it('throws on currency mismatch', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? json({ currency: 'KRW' }) : json({ variants: [] })));
    await expect(fetchLiveProduct(store, 'stagg', { fetchFn: fake })).rejects.toBeInstanceOf(CurrencyMismatchError);
  });
});

describe('storeHeaders', () => {
  it('has cookie and UA', () => {
    expect(storeHeaders().Cookie).toBe('localization=US; cart_currency=USD');
  });
});

describe('hardening', () => {
  it('rejects when a request hangs past timeoutMs', async () => {
    const hang = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(init.signal!.reason));
      })) as typeof fetch;
    await expect(fetchCatalog(store, { fetchFn: hang, delayMs: 0, timeoutMs: 50 })).rejects.toBeTruthy();
  });
  it('rejects with domain and content-type on non-JSON 200', async () => {
    const fake = makeFake((url) =>
      url.endsWith('/cart.js')
        ? usd()
        : new Response('<html>challenge</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/dewinespot\.co.*text\/html/);
  });
  it('rejects on 301 and always requests with redirect manual', async () => {
    const seen: (RequestRedirect | undefined)[] = [];
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.redirect);
      return String(input).endsWith('/cart.js')
        ? usd()
        : new Response(null, { status: 301, headers: { location: 'https://evil.example/' } });
    }) as typeof fetch;
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/301/);
    expect(seen.every((r) => r === 'manual')).toBe(true);
  });
  it('live: throws on non-integer price', async () => {
    const fake = makeFake((url) =>
      url.endsWith('/cart.js') ? usd() : json({ variants: [{ id: 1, price: '175.00', available: true }] }),
    );
    await expect(fetchLiveProduct(store, 'x', { fetchFn: fake })).rejects.toThrow(/price/);
  });
});
