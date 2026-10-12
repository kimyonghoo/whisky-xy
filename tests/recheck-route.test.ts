import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { listings } from '@/lib/db/schema';
import type { Db } from '@/lib/db/client';
import { parseCardId, MAX_DB_ID } from '@/lib/card';
import { isCrossSiteRequest } from '@/lib/request-origin';

import { PRIVATE_STORE } from './helpers/private-store';

let testDb: Db;
vi.mock('@/lib/stores', async (orig) => (await import('./helpers/private-store')).withPrivateStore(await orig<typeof import('@/lib/stores')>()));
vi.mock('@/lib/db/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/client')>()),
  getDb: async () => testDb,
}));
// The route must never reach a real store in tests.
vi.mock('@/lib/shopify/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/shopify/client')>()),
  fetchLiveProduct: vi.fn(async () => [{ id: 555, priceCents: 9000, available: true }]),
}));

const { POST } = await import('@/app/api/recheck/[id]/route');
const { resetRecheckCooldowns } = await import('@/lib/recheck');

const SITE = 'https://whisky.example';
function post(id: string, headers: Record<string, string> = {}) {
  return POST(new Request(`${SITE}/api/recheck/${id}`, { method: 'POST', headers: { host: 'whisky.example', ...headers } }), {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/recheck/[id]', () => {
  let id: number;
  beforeAll(async () => {
    testDb = await createTestDb();
    const [row] = await testDb
      .insert(listings)
      .values({ ...seed({ storeId: 'dewinespot', title: 'Stagg', priceCents: 10000 }), variantId: '555', checkedAt: new Date(Date.now() - 3_600_000) })
      .returning();
    id = row.id;
  });
  beforeEach(() => resetRecheckCooldowns());

  it('400 for non-numeric and out-of-int4 ids (no DB error)', async () => {
    for (const bad of ['abc', '0', '-1', '999999999999', String(MAX_DB_ID + 1)]) {
      expect((await post(bad)).status).toBe(400);
    }
  });

  it('404 for an unknown id', async () => {
    expect((await post(String(MAX_DB_ID))).status).toBe(404);
  });

  it('404 for a private-store listing, and the store is never contacted', async () => {
    const [row] = await testDb
      .insert(listings)
      .values({ ...seed({ storeId: PRIVATE_STORE.id, title: 'Private Bottle', priceCents: 10000 }), variantId: '556', checkedAt: new Date(Date.now() - 3_600_000) })
      .returning();
    const { fetchLiveProduct } = await import('@/lib/shopify/client');
    vi.mocked(fetchLiveProduct).mockClear();
    const res = await post(String(row.id), { origin: SITE });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(fetchLiveProduct).not.toHaveBeenCalled();
  });

  it('403 for a cross-site browser POST, before any store request', async () => {
    const res = await post(String(id), { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
    expect((await post(String(id), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(String(id), { origin: 'null' })).status).toBe(403);
  });

  it('200 for a same-origin POST and returns the live result', async () => {
    const res = await post(String(id), { origin: SITE, 'sec-fetch-site': 'same-origin' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'updated', priceCents: 9000, available: true });
    // within 60 s: cached, no second store request
    expect(await (await post(String(id), { origin: SITE })).json()).toMatchObject({ status: 'cached' });
  });
});

describe('isCrossSiteRequest', () => {
  const req = (h: Record<string, string>, url = `${SITE}/api/x`) => new Request(url, { method: 'POST', headers: h });
  it('allows same-origin, SITE_URL, and header-less (non-browser) requests', () => {
    expect(isCrossSiteRequest(req({}))).toBe(false);
    expect(isCrossSiteRequest(req({ origin: SITE }))).toBe(false);
    expect(isCrossSiteRequest(req({ 'sec-fetch-site': 'same-origin', origin: SITE }))).toBe(false);
    expect(isCrossSiteRequest(req({ origin: 'https://whisky.vercel.app' }, 'http://internal:3000/api/x'), 'https://whisky.vercel.app')).toBe(false);
    expect(isCrossSiteRequest(req({ origin: 'https://whisky.vercel.app', host: 'whisky.vercel.app', 'x-forwarded-proto': 'https' }, 'http://internal:3000/api/x'), undefined)).toBe(false);
  });
  it('rejects other origins and cross-site / same-site fetch metadata', () => {
    expect(isCrossSiteRequest(req({ origin: 'https://evil.example' }))).toBe(true);
    expect(isCrossSiteRequest(req({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(isCrossSiteRequest(req({ 'sec-fetch-site': 'same-site' }))).toBe(true);
    expect(isCrossSiteRequest(req({ origin: 'http://whisky.example' }))).toBe(true); // scheme differs
  });
});

describe('parseCardId bounds', () => {
  it('accepts 1..2^31-1 only', () => {
    expect(parseCardId(String(MAX_DB_ID))).toBe(MAX_DB_ID);
    expect(parseCardId(String(MAX_DB_ID + 1))).toBeNull();
    expect(parseCardId('99999999999')).toBeNull();
  });
});
