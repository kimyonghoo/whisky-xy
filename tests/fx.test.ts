import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { fetchUsdKrw, refreshFx, getLatestFx } from '@/lib/fx';
import type { FetchFn } from '@/lib/shopify/client';

const fakeFx = (body: unknown, status = 200): FetchFn =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as FetchFn;

describe('fetchUsdKrw', () => {
  it('returns KRW rate', async () => {
    expect(await fetchUsdKrw(fakeFx({ result: 'success', rates: { KRW: 1380.5 } }))).toBe(1380.5);
  });
  it('rejects implausible, failed, or malformed', async () => {
    await expect(fetchUsdKrw(fakeFx({ result: 'success', rates: { KRW: 5 } }))).rejects.toThrow();
    await expect(fetchUsdKrw(fakeFx({ result: 'success', rates: { KRW: 3000 } }))).rejects.toThrow();
    await expect(fetchUsdKrw(fakeFx({ result: 'error', rates: { KRW: 1380 } }))).rejects.toThrow();
    await expect(fetchUsdKrw(fakeFx({ result: 'success', rates: {} }))).rejects.toThrow();
    await expect(fetchUsdKrw(fakeFx({}, 500))).rejects.toThrow();
  });
});

describe('refreshFx', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { db = await createTestDb(); });

  it('fetches once per UTC day', async () => {
    let n = 0;
    const f: FetchFn = (async () => { n++; return new Response(JSON.stringify({ result: 'success', rates: { KRW: 1400 } })); }) as FetchFn;
    expect(await getLatestFx(db)).toBeNull();
    expect(await refreshFx(db, new Date('2026-03-01T01:00:00Z'), f)).toBe(1400);
    expect(await refreshFx(db, new Date('2026-03-01T23:00:00Z'), f)).toBe(1400);
    expect(n).toBe(1);
    await refreshFx(db, new Date('2026-03-02T00:00:00Z'), f);
    expect(n).toBe(2);
    expect(await getLatestFx(db)).toMatchObject({ date: '2026-03-02', usdKrw: 1400 });
  });
});
