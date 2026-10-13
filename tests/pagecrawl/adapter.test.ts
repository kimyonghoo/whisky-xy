import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Store } from '@/lib/stores';
import { createPoliteFetcher } from '@/lib/pagecrawl/fetcher';
import { crawlPageStore } from '@/lib/pagecrawl/adapter';
import { PAGE_STORE_CONFIGS, type PageStoreConfig } from '@/lib/pagecrawl/configs';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
const LIST = fixture('shinanoya-list.html');
const INSTOCK = fixture('shinanoya-item-instock.html');
const SOLDOUT = fixture('shinanoya-item-soldout.html');

const ORIGIN = 'https://shinanoya-tokyo.jp';
const CFG = PAGE_STORE_CONFIGS.shinanoya;

/** Test-only store: never added to STORES. */
const STORE: Store = {
  id: 'shinanoya-test', name: '信濃屋 (test)', domain: 'shinanoya-tokyo.jp', city: 'tokyo',
  address: 'test', lat: 35.68, lng: 139.76, phone: '000', taxRate: 0, stockReliability: 'high',
  onlineOnly: true, publicAllowed: false, currency: 'JPY', pricesIncludeTax: true, adapter: 'page',
  crawlEnabled: true, whiskyOnlyCatalog: true,
};

const P1 = '/view/category/ct755?page=1';
const P2 = '/view/category/ct755?page=2';
const EMPTY_LIST = '<html><body><ul class="category_itemArea_ul"></ul></body></html>';
const item = (id: string) => `/view/item/${id}`;
/** The first two products of the list fixture's main grid. */
const A = item('000000022839');
const B = item('000000022838');

/** Item page built like the fixtures: JSON-LD offer, product-name heading, optional 容量 row. */
function itemPage(o: { name?: string; price?: string; currency?: string; availability?: string; size?: string; h2?: string }): string {
  const offer = { '@type': 'Offer', price: o.price ?? '5478', priceCurrency: o.currency ?? 'JPY', availability: o.availability ?? 'http://schema.org/InStock' };
  const product = { '@context': 'http://schema.org', '@type': 'Product', ...(o.name !== undefined ? { name: o.name } : {}), offers: offer };
  return `<html><head><title></title><script type="application/ld+json">${JSON.stringify(product)}</script></head><body>
<h2 class="product-name">${o.h2 ?? ''}</h2>
${o.size ? `<table><tbody><tr><td><p>Volume(容量)</p></td><td><p>${o.size}</p></td></tr></tbody></table>` : ''}
</body></html>`;
}

type Reply = string | number | Error;

/** Real polite fetcher over a fake network. Unrouted paths are 404. Records every requested path. */
async function setup(routes: Record<string, Reply>, opts: { robots?: string; maxRequests?: number } = {}) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    const key = u.pathname + u.search;
    calls.push(key);
    if (key === '/robots.txt') return new Response(opts.robots ?? 'User-agent: *\nDisallow: /cart\n', { status: 200 });
    const r = routes[key];
    if (r === undefined) return new Response('not found', { status: 404 });
    if (r instanceof Error) throw r;
    if (typeof r === 'number') return new Response('x', { status: r });
    return new Response(r, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }) as typeof fetch;
  const fetcher = await createPoliteFetcher({
    origin: ORIGIN, fetchFn, maxRequests: opts.maxRequests ?? 300, sleep: async () => {}, now: () => 0,
  });
  return { fetcher, calls };
}

const withCfg = (over: Partial<PageStoreConfig>): PageStoreConfig => ({ ...CFG, ...over });

describe('shinanoya config', () => {
  it('builds list paths with the site\'s own ?page= parameter', () => {
    expect(CFG.listPath(1)).toBe(P1);
    expect(CFG.listPath(37)).toBe('/view/category/ct755?page=37');
    expect(CFG.listPagesPerRun).toBe(20);
  });

  it('matches only the category grid links and maps them to canonical item paths', () => {
    expect(CFG.productUrlRe.test('/view/item/000000022839?category_page_id=ct755')).toBe(true);
    expect(CFG.productUrlRe.test('/view/item/000000022791')).toBe(false); // recommendation block
    expect(CFG.productUrlRe.test('/view/item/000000000006?category_page_id=ct6')).toBe(false);
    expect(CFG.productId('/view/item/000000022839?category_page_id=ct755')).toBe('000000022839');
    expect(CFG.productId('/view/item/000000022839')).toBe('000000022839');
    expect(CFG.productId('/view/category/ct755')).toBeNull();
    expect(CFG.productPath('000000022839')).toBe(A);
  });

  it('reads the 容量 spec row (plain and span-wrapped)', () => {
    expect(CFG.sizeFrom(INSTOCK)).toBe(700);
    expect(CFG.sizeFrom(SOLDOUT)).toBe(700);
    expect(CFG.sizeFrom('<table><tr><th>容量</th><td>1,000ml</td></tr></table>')).toBe(1000);
    expect(CFG.sizeFrom('<table><tr><td>容量：700ml の説明</td><td>200ml</td></tr></table>')).toBeNull();
    expect(CFG.sizeFrom('<p>容量</p>')).toBeNull();
  });
});

describe('crawlPageStore', () => {
  it('turns fixture pages into JPY whisky observations, facts only', async () => {
    const { fetcher } = await setup({ [P1]: LIST, [P2]: EMPTY_LIST, [A]: INSTOCK, [B]: SOLDOUT });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [] });
    expect(r.stopped).toBeNull();
    expect(r.listPaths).toEqual([P1, P2]);
    expect(r.nextListPage).toBe(1); // page 2 had no products: wrap
    expect(r.discoveredProductPaths).toHaveLength(30);
    expect(r.observations).toHaveLength(2);
    const [inStock, soldOut] = r.observations;
    expect(inStock).toEqual({
      storeId: 'shinanoya-test',
      productId: '000000022839',
      variantId: '000000022839',
      handle: '000000022839',
      title: 'ベンリアック 12年　スモーキートゥエルブ（正規）',
      variantTitle: '700ml',
      vendor: '',
      productType: '',
      imageUrl: null,
      url: 'https://shinanoya-tokyo.jp/view/item/000000022839',
      priceCents: 5478,
      currency: 'JPY',
      available: true,
      sizeMl: 700,
      proof: null,
      batch: null,
      bottleKey: expect.stringMatching(/\|s700$/),
      searchText: expect.any(String),
    });
    expect(soldOut).toMatchObject({ productId: '000000022838', priceCents: 92180, currency: 'JPY', available: false, sizeMl: 700, imageUrl: null });
    // 28 other grid items 404 here: skipped as gone, never as observations.
    expect(r.skipped).toEqual({ disallowed: 0, gone: 28, currency: 0, notWhisky: 0, noPrice: 0, noAvailability: 0, error: 0 });
    expect(r.requests).toBe(1 + 2 + 30);
    expect(r.checked).toHaveLength(30);
    expect(r.checked.slice(0, 3)).toEqual([
      { path: A, outcome: 'observed' },
      { path: B, outcome: 'observed' },
      { path: item('000000022837'), outcome: 'gone' },
    ]);
  });

  it('reports a per-path outcome for every product path attempted, and none for unreached paths', async () => {
    const GLASS = item('000000022836'); // 【グラス付き】 in the list fixture
    const { fetcher } = await setup(
      {
        [P1]: LIST, [P2]: EMPTY_LIST,
        [A]: INSTOCK,
        [GLASS]: itemPage({ name: '【グラス付き】I.W.ハーパー 12年（正規）', size: '700ml' }),
      },
      { maxRequests: 1 + 2 + 2 + 3 }, // robots, 2 list pages, 2 due, 3 fresh
    );
    const DELISTED = item('000000000404');
    const r = await crawlPageStore(STORE, CFG, {
      fetcher, dueProductPaths: [DELISTED, A], knownProductPaths: new Set([B, item('000000022837')]),
    });
    expect(r.stopped).toBe('budget');
    expect(r.checked).toEqual([
      { path: DELISTED, outcome: 'gone' },
      { path: A, outcome: 'observed' },
      { path: GLASS, outcome: 'notWhisky' },
      { path: item('000000022834'), outcome: 'gone' },
      { path: item('000000022833'), outcome: 'gone' },
    ]);
    expect(r.checked.map((c) => c.path)).not.toContain(item('000000022832')); // not reached: budget
    expect(r.skipped).toMatchObject({ gone: 3, notWhisky: 1 });
  });

  it('reports disallowed paths as checked without fetching them', async () => {
    const { fetcher, calls } = await setup({ [P1]: EMPTY_LIST }, { robots: 'User-agent: *\nDisallow: /view/item/000000022839\n' });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [A] });
    expect(calls).not.toContain(A);
    expect(r.checked).toEqual([{ path: A, outcome: 'disallowed' }]);
  });

  it('canonicalises due and known paths, so an item is fetched once and stored under its canonical url', async () => {
    const { fetcher, calls } = await setup({ [P1]: LIST, [P2]: EMPTY_LIST, [A]: INSTOCK });
    const r = await crawlPageStore(STORE, CFG, {
      fetcher,
      dueProductPaths: [`${A}?category_page_id=ct755`, A, '/view/category/ct755', item('000000022838') + '?category_page_id=ct755'],
      knownProductPaths: new Set([`${item('000000022837')}?category_page_id=ct755`]),
    });
    expect(calls.filter((c) => c === A)).toHaveLength(1);
    expect(calls.filter((c) => c.includes('category_page_id'))).toEqual([]);
    expect(calls).not.toContain(item('000000022837'));
    expect(calls.filter((c) => c === '/view/category/ct755')).toEqual([]); // no id: never fetched
    expect(r.observations[0].url).toBe(`https://shinanoya-tokyo.jp${A}`);
    expect(r.checked.slice(0, 2)).toEqual([{ path: A, outcome: 'observed' }, { path: B, outcome: 'gone' }]);
  });

  it('uses the 容量 size for both sizeMl and the bottle key when the title says otherwise', async () => {
    const { fetcher } = await setup({ [P1]: EMPTY_LIST, [A]: itemPage({ name: '山崎 12年 750ml', size: '700ml' }) });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [A] });
    const o = r.observations[0];
    expect(o.sizeMl).toBe(700);
    expect(o.bottleKey).toMatch(/\|s700$/);
    expect(o.title).toBe('山崎 12年 750ml');
    expect(o.variantTitle).toBe('容量 700ml');
  });

  it('keeps variantTitle null when the title already states the 容量 size', async () => {
    const { fetcher } = await setup({ [P1]: EMPTY_LIST, [A]: itemPage({ name: '山崎 12年 700ml', size: '700ml' }) });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [A] });
    expect(r.observations[0]).toMatchObject({ sizeMl: 700, variantTitle: null });
  });

  it('wraps to page 1 on a generic list-page error, but resumes at the page after a stop', async () => {
    const p5 = CFG.listPath(5);
    const err = await setup({ [p5]: 500 });
    expect((await crawlPageStore(STORE, CFG, { fetcher: err.fetcher, dueProductPaths: [], listPageStart: 5 })).nextListPage).toBe(1);

    const redirect = await setup({ [p5]: 302 });
    const r = await crawlPageStore(STORE, CFG, { fetcher: redirect.fetcher, dueProductPaths: [], listPageStart: 5 });
    expect(r.nextListPage).toBe(1);
    expect(r.stopped).toBeNull();
    expect(r.skipped.error).toBe(1);

    const first = await setup({ [P1]: 500 });
    expect((await crawlPageStore(STORE, CFG, { fetcher: first.fetcher, dueProductPaths: [] })).nextListPage).toBe(1);

    const budget = await setup({ [p5]: LIST }, { maxRequests: 1 });
    const b = await crawlPageStore(STORE, CFG, { fetcher: budget.fetcher, dueProductPaths: [], listPageStart: 5 });
    expect(b.stopped).toBe('budget');
    expect(b.nextListPage).toBe(5);
  });

  it('never follows the recommendation-block links', async () => {
    const { fetcher, calls } = await setup({ [P1]: LIST, [P2]: EMPTY_LIST });
    await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [] });
    expect(calls).not.toContain(item('000000022791'));
    expect(calls).not.toContain(item('000000022749'));
    expect(calls.filter((c) => c.includes('category_page_id'))).toEqual([]);
  });

  it('stops reading list pages when the budget is spent', async () => {
    const { fetcher, calls } = await setup({ [P1]: LIST, [P2]: LIST }, { maxRequests: 2 });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [] });
    expect(calls).toEqual(['/robots.txt', P1]);
    expect(r.stopped).toBe('budget');
    expect(r.listPaths).toEqual([P1]);
    expect(r.nextListPage).toBe(2);
    expect(r.observations).toEqual([]);
    expect(r.requests).toBe(2);
  });

  it('returns stopped budget and keeps the observations gathered so far', async () => {
    const { fetcher, calls } = await setup({ [P1]: LIST, [P2]: EMPTY_LIST, [A]: INSTOCK, [B]: SOLDOUT }, { maxRequests: 5 });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [] });
    expect(calls).toEqual(['/robots.txt', P1, P2, A, B]);
    expect(r.stopped).toBe('budget');
    expect(r.observations.map((o) => o.productId)).toEqual(['000000022839', '000000022838']);
  });

  it('visits due paths first, then list-discovered paths that are neither due nor known', async () => {
    const due = [item('000000000111'), B, item('000000000111')];
    const known = new Set([item('000000022837'), item('000000022836')]);
    const { fetcher, calls } = await setup({ [P1]: LIST, [P2]: EMPTY_LIST, [A]: INSTOCK, [B]: SOLDOUT, [due[0]]: INSTOCK });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: due, knownProductPaths: known });
    const products = calls.filter((c) => c.startsWith('/view/item/'));
    expect(products.slice(0, 3)).toEqual([due[0], B, A]);
    expect(products).not.toContain(item('000000022837'));
    expect(products).not.toContain(item('000000022836'));
    expect(new Set(products).size).toBe(products.length); // nothing twice
    expect(products).toHaveLength(2 + (30 - 1 - 2)); // 2 due; 30 discovered minus B (due) and the 2 known
    expect(r.observations.map((o) => o.productId).slice(0, 3)).toEqual(['000000000111', '000000022838', '000000022839']);
  });

  it('rotates list pages: starts at listPageStart, reads listPagesPerRun pages, returns the next one', async () => {
    const p = (n: number) => CFG.listPath(n);
    const { fetcher, calls } = await setup({ [p(5)]: LIST, [p(6)]: LIST.replaceAll('0000000228', '0000000227') });
    const r = await crawlPageStore(STORE, withCfg({ listPagesPerRun: 2 }), { fetcher, dueProductPaths: [], listPageStart: 5 });
    expect(calls.slice(0, 3)).toEqual(['/robots.txt', p(5), p(6)]);
    expect(r.listPaths).toEqual([p(5), p(6)]);
    expect(r.nextListPage).toBe(7);
  });

  it('wraps to page 1 after maxListPages', async () => {
    const { fetcher, calls } = await setup({ [CFG.listPath(4)]: LIST });
    const r = await crawlPageStore(STORE, withCfg({ maxListPages: 4 }), { fetcher, dueProductPaths: [], listPageStart: 4 });
    expect(calls.filter((c) => c.includes('category/'))).toEqual([CFG.listPath(4)]);
    expect(r.nextListPage).toBe(1);
  });

  it('wraps to page 1 when a list page is gone or repeats the previous page (clamped pagination)', async () => {
    const gone = await setup({ [P1]: LIST });
    expect((await crawlPageStore(STORE, CFG, { fetcher: gone.fetcher, dueProductPaths: [] })).nextListPage).toBe(1);
    expect(gone.calls.filter((c) => c.includes('category/'))).toEqual([P1, P2]);

    const same = await setup({ [P1]: LIST, [P2]: LIST, [CFG.listPath(3)]: LIST });
    const r = await crawlPageStore(STORE, CFG, { fetcher: same.fetcher, dueProductPaths: [] });
    expect(same.calls.filter((c) => c.includes('category/'))).toEqual([P1, P2]);
    expect(r.nextListPage).toBe(1);
  });

  it('does not fetch a robots-disallowed path, and counts it', async () => {
    const { fetcher, calls } = await setup(
      { [P1]: LIST, [P2]: EMPTY_LIST, [A]: INSTOCK, [B]: SOLDOUT },
      { robots: 'User-agent: *\nDisallow: /view/item/000000022839\n' },
    );
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [] });
    expect(calls).not.toContain(A);
    expect(r.skipped.disallowed).toBe(1);
    expect(r.observations.map((o) => o.productId)).toEqual(['000000022838']);
  });

  it('skips a product whose JSON-LD currency is not the store currency', async () => {
    const { fetcher } = await setup({ [P1]: EMPTY_LIST, [A]: itemPage({ name: '山崎 12年', currency: 'USD', size: '700ml' }) });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [A] });
    expect(r.observations).toEqual([]);
    expect(r.skipped.currency).toBe(1);
  });

  it('skips and counts missing price, missing availability and non-whisky items', async () => {
    const C = item('3'), D = item('4'), E = item('5'), F = item('6'), G = item('7');
    const { fetcher } = await setup({
      [P1]: EMPTY_LIST,
      [C]: '<html><title>山崎 12年</title></html>', // no JSON-LD
      [D]: itemPage({ name: '山崎 12年', availability: 'https://schema.org/PreOrder', size: '700ml' }),
      [E]: itemPage({ name: 'ウイスキーグラス', size: '700ml' }),
      [F]: itemPage({ name: '山崎 12年 ミニチュア 50ml' }),
      [G]: itemPage({ name: '山崎 12年', price: '12.5', size: '700ml' }),
    });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [C, D, E, F, G] });
    expect(r.observations).toEqual([]);
    expect(r.skipped).toMatchObject({ noPrice: 2, noAvailability: 1, notWhisky: 2 });
  });

  it('applies the whisky-word requirement unless the store is a whisky-only catalog', async () => {
    const page = itemPage({ name: '山崎 12年', size: '700ml' });
    const a = await setup({ [P1]: EMPTY_LIST, [A]: page });
    expect((await crawlPageStore(STORE, CFG, { fetcher: a.fetcher, dueProductPaths: [A] })).observations).toHaveLength(1);
    const b = await setup({ [P1]: EMPTY_LIST, [A]: page });
    const r = await crawlPageStore({ ...STORE, whiskyOnlyCatalog: undefined }, CFG, { fetcher: b.fetcher, dueProductPaths: [A] });
    expect(r.observations).toEqual([]);
    expect(r.skipped.notWhisky).toBe(1);
  });

  it('takes the title from the product heading when JSON-LD has no name, and size from the title without a 容量 row', async () => {
    const { fetcher } = await setup({ [P1]: EMPTY_LIST, [A]: itemPage({ h2: ' 山崎 12年 700ml &amp; box ' }) });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [A] });
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0]).toMatchObject({ title: '山崎 12年 700ml & box', sizeMl: 700, variantTitle: null });
    expect(r.observations[0].bottleKey).toMatch(/\|s700$/);
  });

  it('skips gone pages and other per-path errors, but a stop ends the run with what it has', async () => {
    const { fetcher, calls } = await setup({
      [P1]: EMPTY_LIST,
      [A]: INSTOCK,
      [item('8')]: 500,
      [item('9')]: 410,
      [B]: SOLDOUT,
      [item('10')]: 403,
      [item('11')]: INSTOCK,
    });
    const due = [A, item('8'), item('9'), B, item('10'), item('11')];
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: due });
    expect(r.stopped).toBe('http-403');
    expect(calls).not.toContain(item('11'));
    expect(r.observations.map((o) => o.productId)).toEqual(['000000022839', '000000022838']);
    expect(r.skipped).toMatchObject({ gone: 1, error: 1 });
  });

  it('a stop while reading list pages ends the run before any product page', async () => {
    const { fetcher, calls } = await setup({ [P1]: 429 });
    const r = await crawlPageStore(STORE, CFG, { fetcher, dueProductPaths: [A] });
    expect(r.stopped).toBe('http-429');
    expect(calls).toEqual(['/robots.txt', P1]);
    expect(r.nextListPage).toBe(1);
  });
});
