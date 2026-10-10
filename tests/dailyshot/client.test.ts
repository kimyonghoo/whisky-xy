import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { searchDailyshot, fetchDailyshotPrice, dailyshotUrl } from '@/lib/dailyshot/client';
import type { FetchFn } from '@/lib/shopify/client';

const fx = (n: string) => fs.readFileSync(path.join(__dirname, '../fixtures', n), 'utf8');
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });
const calls: { url: string; headers: Headers }[] = [];
const fixtureFetch: FetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
  const u = String(input);
  calls.push({ url: u, headers: new Headers(init?.headers) });
  if (u.includes('/m/search/result')) return html(fx('dailyshot-search.html'));
  if (u.endsWith('/m/item/20583')) return html(fx('dailyshot-item.html'));
  return html('nope', 404);
}) as FetchFn;
const notFound: FetchFn = (async () => html('nope', 404)) as FetchFn;
const withNext = (data: unknown) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
const ld = (offers: unknown) =>
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'x', ...(offers ? { offers } : {}) })}</script>`;

describe('dailyshot', () => {
  it('builds item url', () => {
    expect(dailyshotUrl('20583')).toBe('https://dailyshot.co/m/item/20583');
  });

  it('searches and parses candidates', async () => {
    const c = await searchDailyshot('stagg', { fetchFn: fixtureFetch });
    expect(c).toContainEqual(expect.objectContaining({ nameKo: '스태그 배치 24C', nameEn: 'Stagg Batch 24C', priceKrw: 649000 }));
    expect(new Set(c.map((x) => x.productId)).size).toBe(c.length);
    expect(c.length).toBeLessThanOrEqual(20);
    const last = calls.at(-1)!;
    expect(last.url).toBe('https://dailyshot.co/m/search/result?q=stagg');
    expect(last.headers.get('user-agent')).toMatch(/^WhiskyPortalBot\/0\.1 \(\+/);
  });

  it('dedupes keeping lowest price, caps at 20, only https images', async () => {
    const items = [
      { top_product_id: 1, name: 'a', en_name: '', price: 500, thumbnail_image: 'http://x/y.png' },
      { top_product_id: 1, name: 'a', en_name: '', price: 300, thumbnail_image: 'https://x/y.png' },
      ...Array.from({ length: 30 }, (_, i) => ({ top_product_id: 100 + i, name: `n${i}`, en_name: 'e', price: 1000 + i, thumbnail_image: null })),
    ];
    const f: FetchFn = (async () => html(withNext({ props: { items } }))) as FetchFn;
    const c = await searchDailyshot('q', { fetchFn: f });
    expect(c).toHaveLength(20);
    expect(c.find((x) => x.productId === '1')).toMatchObject({ priceKrw: 300, nameEn: null, imageUrl: 'https://x/y.png' });
    const f2: FetchFn = (async () => html(withNext({ items: items.slice(0, 1) }))) as FetchFn;
    expect((await searchDailyshot('q', { fetchFn: f2 }))[0].imageUrl).toBeNull();
  });

  it('survives deeply nested hostile JSON and rejects oversized pages', async () => {
    const n = 5000;
    const body = '<script id="__NEXT_DATA__" type="application/json">' + '['.repeat(n) + '{"top_product_id":9,"name":"deep","price":1}' + ']'.repeat(n) + '</script>';
    const f: FetchFn = (async () => html(body)) as FetchFn;
    await expect(searchDailyshot('q', { fetchFn: f })).resolves.toBeDefined();
    const big: FetchFn = (async () => html(withNext({ pad: 'x'.repeat(3_000_000) }))) as FetchFn;
    await expect(searchDailyshot('q', { fetchFn: big })).rejects.toThrow();
  });

  it('throws on non-ok search', async () => {
    await expect(searchDailyshot('q', { fetchFn: notFound })).rejects.toThrow();
  });

  it('parses item price', async () => {
    expect(await fetchDailyshotPrice('20583', { fetchFn: fixtureFetch })).toEqual({ lowPriceKrw: 57000, highPriceKrw: 62000, offerCount: 5 });
  });

  it('returns null on 404 or missing offers', async () => {
    expect(await fetchDailyshotPrice('404', { fetchFn: notFound })).toBeNull();
    const f: FetchFn = (async () => html(`<html>${ld(null)}</html>`)) as FetchFn;
    expect(await fetchDailyshotPrice('1', { fetchFn: f })).toBeNull();
  });

  it('throws on non-KRW currency', async () => {
    const f: FetchFn = (async () => html(ld({ '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: 5 }))) as FetchFn;
    await expect(fetchDailyshotPrice('1', { fetchFn: f })).rejects.toThrow(/KRW/);
  });

  it('rejects non-numeric product ids', async () => {
    await expect(fetchDailyshotPrice('../x', { fetchFn: fixtureFetch })).rejects.toThrow();
  });
});
