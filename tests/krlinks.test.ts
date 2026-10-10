import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers/db';
import { upsertKrLink, deleteKrLink, getKrLinks, listKrLinks, refreshKrLinks } from '@/lib/krlinks';
import type { FetchFn } from '@/lib/shopify/client';

let db: Awaited<ReturnType<typeof createTestDb>>;
const t0 = new Date('2026-03-01T00:00:00Z');
const t1 = new Date('2026-03-02T00:00:00Z');
const input = (over = {}) => ({
  bottleKey: 'k1', productId: '20583', nameKo: '산토리', nameEn: 'Suntory', imageUrl: 'https://x/y.webp',
  price: { lowPriceKrw: 57000, highPriceKrw: 62000, offerCount: 5 }, ...over,
});
const ldPage = (low: number) =>
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', offers: { priceCurrency: 'KRW', lowPrice: low, highPrice: low + 1, offerCount: 2 } })}</script>`;

beforeEach(async () => { db = await createTestDb(); });

describe('krlinks', () => {
  it('upserts, reads, lists and deletes', async () => {
    await upsertKrLink(db, input(), t0);
    await upsertKrLink(db, input({ price: { lowPriceKrw: 58000, highPriceKrw: null, offerCount: null } }), t1);
    const m = await getKrLinks(db, ['k1', 'zz']);
    expect(m.size).toBe(1);
    expect(m.get('k1')).toMatchObject({ lowPriceKrw: 58000, highPriceKrw: null, checkedAt: t1, dailyshotProductId: '20583' });
    expect(await listKrLinks(db)).toHaveLength(1);
    expect((await getKrLinks(db, [])).size).toBe(0);
    await deleteKrLink(db, 'k1');
    expect(await listKrLinks(db)).toHaveLength(0);
  });

  it('upsert stores null for non-https images', async () => {
    await upsertKrLink(db, input({ imageUrl: 'http://x/y.png' }), t0);
    expect((await getKrLinks(db, ['k1'])).get('k1')!.imageUrl).toBeNull();
  });

  it('refresh updates on success', async () => {
    await upsertKrLink(db, input(), t0);
    const f: FetchFn = (async () => new Response(ldPage(50000))) as FetchFn;
    expect(await refreshKrLinks(db, { fetchFn: f, delayMs: 0, now: t1 })).toEqual({ ok: 1, failed: 0 });
    expect((await getKrLinks(db, ['k1'])).get('k1')).toMatchObject({ lowPriceKrw: 50000, checkedAt: t1 });
  });

  it('failure or discontinued keeps old values and checkedAt, logs productId only', async () => {
    await upsertKrLink(db, input(), t0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom: FetchFn = (async () => { throw new Error('secret body'); }) as FetchFn;
    expect(await refreshKrLinks(db, { fetchFn: boom, delayMs: 0, now: t1 })).toEqual({ ok: 0, failed: 1 });
    const gone: FetchFn = (async () => new Response('x', { status: 404 })) as FetchFn;
    expect(await refreshKrLinks(db, { fetchFn: gone, delayMs: 0, now: t1 })).toEqual({ ok: 0, failed: 1 });
    expect((await getKrLinks(db, ['k1'])).get('k1')).toMatchObject({ lowPriceKrw: 57000, checkedAt: t0 });
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret');
    expect(warn.mock.calls.flat().join(' ')).toContain('20583');
    warn.mockRestore();
  });
});
