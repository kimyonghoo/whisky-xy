import { eq, desc } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { fxRates, type FxRate } from '@/lib/db/schema';
import type { FetchFn } from '@/lib/shopify/client';

const FX_URL = 'https://open.er-api.com/v6/latest/USD';

export async function fetchUsdKrw(fetchFn: FetchFn = fetch): Promise<number> {
  const res = await fetchFn(FX_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`fx: HTTP ${res.status}`);
  let body: { result?: unknown; rates?: { KRW?: unknown } };
  try {
    body = await res.json();
  } catch {
    throw new Error('fx: invalid JSON');
  }
  const krw = body?.rates?.KRW;
  if (body?.result !== 'success' || typeof krw !== 'number' || !Number.isFinite(krw) || !(krw > 500 && krw < 3000)) {
    throw new Error('fx: unexpected response');
  }
  return krw;
}

export async function refreshFx(db: Db, now: Date, fetchFn?: FetchFn): Promise<number> {
  const date = now.toISOString().slice(0, 10);
  const [existing] = await db.select().from(fxRates).where(eq(fxRates.date, date));
  if (existing) return existing.usdKrw;
  const usdKrw = await fetchUsdKrw(fetchFn);
  await db.insert(fxRates).values({ date, usdKrw, fetchedAt: now }).onConflictDoNothing();
  return usdKrw;
}

export async function getLatestFx(db: Db): Promise<FxRate | null> {
  const [row] = await db.select().from(fxRates).orderBy(desc(fxRates.date)).limit(1);
  return row ?? null;
}
