import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { ReactElement } from 'react';
import { bottleKey } from '@/lib/whisky/parse';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { PRIVATE_STORE } from './helpers/private-store';
import { listings } from '@/lib/db/schema';
import type { Db } from '@/lib/db/client';
import { ko } from '@/lib/i18n/ko';

let testDb: Db;
vi.mock('@/lib/stores', async (orig) => (await import('./helpers/private-store')).withPrivateStore(await orig<typeof import('@/lib/stores')>()));
vi.mock('@/lib/db/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/client')>()),
  getDb: async () => testDb,
}));
// The card page reads the [lang] root param and request data; neither exists outside Next.
vi.mock('@/lib/i18n/server', async () => ({ getDict: async () => ko, getLocale: async () => 'ko' as const }));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
// A private listing must never reach a store; fail loudly if anything tries.
vi.mock('@/lib/shopify/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/shopify/client')>()),
  fetchLiveProduct: vi.fn(async () => {
    throw new Error('network must not be reached for a private store');
  }),
}));

const { STORES, getStore, isPublicStoreId } = await import('@/lib/stores');
const { storesIn } = await import('@/lib/geo');
const { searchListings, getVocab } = await import('@/lib/search');
const { bottleStoreOffers } = await import('@/lib/listings');
const { default: MapPage } = await import('@/app/[lang]/map/page');
const { buildMapStores } = await import('@/lib/map-view');
const { usInStockPools, listKrComparisons, getBottleSummary } = await import('@/lib/krcompare');
const { recheckListing } = await import('@/lib/recheck');
const { SiteFooter } = await import('@/components/SiteChrome');
const { default: CardPage, generateMetadata } = await import('@/app/[lang]/card/[id]/page');

const PUBLIC_COUNT = STORES.filter((s) => s.publicAllowed).length;
const WHISKY = 'Zzyzx Private Reserve Bourbon';

describe('private store (crawled, never public)', () => {
  let privateId: number;
  let publicId: number;
  beforeAll(async () => {
    testDb = await createTestDb();
    const [priv, pub] = await testDb
      .insert(listings)
      .values([
        seed({ storeId: PRIVATE_STORE.id, title: WHISKY, priceCents: 5000 }),
        seed({ storeId: 'dewinespot', title: WHISKY, priceCents: 9000 }),
      ])
      .returning();
    privateId = priv.id;
    publicId = pub.id;
  });

  describe('map page bottle header', () => {
    const PRIVATE_ONLY = 'Qwertyuiop Hidden Rye';
    const SHARED_PRIVATE = 'MIXED BOTTLE BOURBON';
    const SHARED_PUBLIC = 'Mixed Bottle Bourbon';
    beforeAll(async () => {
      await testDb.insert(listings).values([
        seed({ storeId: PRIVATE_STORE.id, title: PRIVATE_ONLY, priceCents: 4000 }),
        seed({ storeId: PRIVATE_STORE.id, title: SHARED_PRIVATE, priceCents: 1000 }),
        seed({ storeId: 'dewinespot', title: SHARED_PUBLIC, priceCents: 9000 }),
      ]);
    });
    const keyOf = (t: string) => bottleKey({ title: t, variantTitle: null });

    it('bottleStoreOffers: a bottle only a private store carries is null', async () => {
      expect(await bottleStoreOffers(testDb, keyOf(PRIVATE_ONLY))).toBeNull();
    });

    it('bottleStoreOffers: a cheaper in-stock private row never supplies the title or an offer', async () => {
      expect(keyOf(SHARED_PRIVATE)).toBe(keyOf(SHARED_PUBLIC)); // same bottle, differently cased title
      const b = await bottleStoreOffers(testDb, keyOf(SHARED_PUBLIC));
      expect(b?.title).toBe(SHARED_PUBLIC);
      expect([...b!.offers.keys()]).toEqual(['dewinespot']);
    });

    async function renderMap(bottle: string) {
      const shell = (await MapPage({ searchParams: Promise.resolve({ bottle }) })) as ReactElement<Record<string, unknown>>;
      // <main><Suspense><MapView/></Suspense></main>
      const view = ((shell.props.children as ReactElement<{ children: ReactElement<Record<string, unknown>> }>).props.children);
      return JSON.stringify(await (view.type as (p: unknown) => Promise<unknown>)(view.props));
    }

    it('the page shows not-found for a private-only bottle and never prints its title', async () => {
      const html = await renderMap(keyOf(PRIVATE_ONLY));
      expect(html).toContain(ko.map.bottleNotFound);
      expect(html).not.toContain(PRIVATE_ONLY);
    });

    it('the page headline comes from the public row', async () => {
      const html = await renderMap(keyOf(SHARED_PUBLIC));
      expect(html).toContain(SHARED_PUBLIC);
      expect(html).not.toContain(SHARED_PRIVATE);
      expect(html).not.toContain(ko.map.bottleNotFound);
    });

    it('the typo-correction vocabulary holds no word that only private listings contain', async () => {
      const vocab = await getVocab(testDb, Date.now() + 2 * 3_600_000);
      expect(vocab.has('qwertyuiop')).toBe(false);
      expect(vocab.has('mixed')).toBe(true);
    });
  });

  it('is registered in the test STORES but not public', () => {
    expect(getStore(PRIVATE_STORE.id)).toBeDefined();
    expect(isPublicStoreId(PRIVATE_STORE.id)).toBe(false);
    expect(isPublicStoreId('dewinespot')).toBe(true);
    expect(isPublicStoreId('no-such-store')).toBe(false);
  });

  it('is excluded from storesIn(city)', () => {
    expect(storesIn('brooklyn').map((s) => s.id)).not.toContain(PRIVATE_STORE.id);
    expect(storesIn('brooklyn').map((s) => s.id)).toContain('dewinespot');
  });

  it('is excluded from search, including a direct store filter', async () => {
    const all = await searchListings(testDb, { q: 'zzyzx', city: 'brooklyn' });
    const rows = all.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
    expect(rows.map((r) => r.storeId)).toEqual(['dewinespot']);
    const byStore = await searchListings(testDb, { q: '', city: 'brooklyn', storeId: PRIVATE_STORE.id });
    expect(byStore.sections.flatMap((s) => s.groups)).toEqual([]);
  });

  it('is excluded from map stores', () => {
    const ids = buildMapStores(STORES, new Map(), null).map((s) => s.id);
    expect(ids).not.toContain(PRIVATE_STORE.id);
    expect(ids).toHaveLength(PUBLIC_COUNT);
  });

  it('is excluded from the Korea comparison pool and bottle summary', async () => {
    const key = (await testDb.select().from(listings)).find((l) => l.id === privateId)!.bottleKey;
    const pools = await usInStockPools(testDb, [key]);
    expect(pools.get(key)?.map((r) => r.storeId)).toEqual(['dewinespot']);
    expect(await listKrComparisons(testDb)).toMatchObject({ linked: 0 });
    expect((await getBottleSummary(testDb, key))?.storeCount).toBe(1);
  });

  it('leaves the footer store count unchanged', async () => {
    const footer = (await SiteFooter()) as ReactElement;
    expect(JSON.stringify(footer)).toContain(ko.footer.coverage(PUBLIC_COUNT));
  });

  it('recheck returns null for it and still works for a public listing', async () => {
    expect(await recheckListing(testDb, privateId)).toBeNull();
    expect(await recheckListing(testDb, publicId)).not.toBeNull();
  });

  describe('card page', () => {
    // CardPage wraps CardView in Suspense; call CardView directly so notFound() surfaces.
    async function renderCard(id: number) {
      const shell = (await CardPage({ params: Promise.resolve({ id: String(id) }) })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
      const view = shell.props.children;
      return (view.type as (p: unknown) => Promise<unknown>)(view.props);
    }

    it('is a 404 for a private listing id', async () => {
      await expect(renderCard(privateId)).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    });

    it('renders for a public listing id', async () => {
      await expect(renderCard(publicId)).resolves.toBeDefined();
    });

    it('exposes no metadata for a private listing id', async () => {
      expect(await generateMetadata({ params: Promise.resolve({ id: String(privateId) }) })).toEqual({});
      expect((await generateMetadata({ params: Promise.resolve({ id: String(publicId) }) })).title).toBeDefined();
    });
  });
});
