import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/db';
import { listings } from '@/lib/db/schema';
import { formatMoney, formatReport, qualityReport } from '@/lib/crawl/quality';
import { bottleKey, normalizeText } from '@/lib/whisky/parse';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

let n = 0;
async function add(o: {
  storeId: string; title: string; price: number; currency?: string; sizeMl?: number | null; available?: boolean; checkedAt?: Date; productType?: string;
}) {
  n++;
  const at = o.checkedAt ?? new Date('2026-10-12T00:00:00Z');
  await db.insert(listings).values({
    storeId: o.storeId, productId: `p${n}`, variantId: `v${n}`, handle: `h${n}`, title: o.title, variantTitle: null, vendor: 'V',
    productType: o.productType ?? '', imageUrl: null, url: `https://example.test/${n}`, priceCents: o.price, currency: o.currency ?? 'JPY',
    available: o.available ?? true, sizeMl: o.sizeMl === undefined ? 700 : o.sizeMl, proof: null, batch: null,
    bottleKey: bottleKey({ title: o.title, variantTitle: null }), searchText: normalizeText(o.title),
    firstSeenAt: at, lastSeenAt: at, checkedAt: at, updatedAt: at,
  });
}

/** Five nemoto rows (whisky-only catalog, JPY). */
async function seedNemoto() {
  await add({ storeId: 'nemoto', title: '山崎 12年 700ml', price: 27500, checkedAt: new Date('2026-10-12T03:00:00Z') });
  await add({ storeId: 'nemoto', title: 'ラフロイグ 10年', price: 8800, sizeMl: null, checkedAt: new Date('2026-10-12T01:00:00Z') });
  await add({ storeId: 'nemoto', title: '白州 ウイスキー 700ml', price: 500, available: false, checkedAt: new Date('2026-10-12T05:00:00Z') });
  await add({ storeId: 'nemoto', title: 'ベンリアック 12年 700ml', price: 6_000_000, available: false });
  await add({ storeId: 'nemoto', title: 'タリスカー 10年 700ml', price: 0 });
}

describe('formatMoney', () => {
  it('prints JPY as whole yen and USD as dollars and cents', () => {
    expect(formatMoney(27500, 'JPY')).toBe('¥27,500');
    expect(formatMoney(1234, 'USD')).toBe('$12.34');
    expect(formatMoney(129997, 'USD')).toBe('$1,299.97');
  });
});

describe('qualityReport', () => {
  it('counts rows, stock, field coverage, currencies and the checked-at range for one store only', async () => {
    await seedNemoto();
    await add({ storeId: 'shinanoya', title: '別の店 ウイスキー', price: 9000 });
    const r = await qualityReport(db, 'nemoto');
    expect(r).toMatchObject({
      storeId: 'nemoto', total: 5, inStock: 3,
      pctPrice: 80, // the ¥0 row has no usable price
      pctSize: 80, // one row has no size
      pctAvailability: 60, // in stock / total
      currencies: { JPY: 5 },
      oldestCheckedAt: new Date('2026-10-12T00:00:00Z'),
      newestCheckedAt: new Date('2026-10-12T05:00:00Z'),
    });
  });

  it('an empty store reports zeros and no dates', async () => {
    expect(await qualityReport(db, 'nemoto')).toMatchObject({
      total: 0, inStock: 0, pctPrice: 0, pctSize: 0, pctAvailability: 0, currencies: {},
      oldestCheckedAt: null, newestCheckedAt: null, samples: [], warnings: [], noWhiskyWord: { count: 0, examples: [] },
    });
  });

  it('warns on JPY prices under 1000 or over 5000000, on a missing size, and on a title the store flag rejects', async () => {
    await seedNemoto();
    await add({ storeId: 'nemoto', title: 'ウイスキーグラス 2個', price: 3000 }); // glass: rejected even in a whisky-only catalog
    const r = await qualityReport(db, 'nemoto');
    expect(r.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('price ¥500 under ¥1,000: 白州 ウイスキー 700ml'),
      expect.stringContaining('price ¥0 under ¥1,000: タリスカー 10年 700ml'),
      expect.stringContaining('price ¥6,000,000 over ¥5,000,000: ベンリアック 12年 700ml'),
      expect.stringContaining('no size: ラフロイグ 10年'),
      expect.stringContaining('not whisky: ウイスキーグラス 2個'),
    ]));
    expect(r.warnings).toHaveLength(5);
    expect(r.warningCount).toBe(5);
  });

  it('whisky-only stores warn with their own flag; titles without a whisky word are counted apart, with examples', async () => {
    await add({ storeId: 'nemoto', title: 'かわいい しろいイチゴ', price: 3000 }); // passes with the flag, has no whisky word
    await add({ storeId: 'nemoto', title: '山崎 12年 700ml', price: 27500 }); // same: no whisky word
    await add({ storeId: 'nemoto', title: 'ウイスキー 白州 700ml', price: 9000 }); // has one
    const r = await qualityReport(db, 'nemoto');
    expect(r.warnings.filter((w) => w.startsWith('not whisky'))).toEqual([]);
    expect(r.noWhiskyWord).toEqual({ count: 2, examples: ['かわいい しろいイチゴ', '山崎 12年 700ml'] });
  });

  it('a store without the flag warns on every title that fails the default check, and USD rows get no JPY price rule', async () => {
    await add({ storeId: 'flask', title: 'Premium Vodka 750ml', price: 100, currency: 'USD', sizeMl: 750 });
    await add({ storeId: 'flask', title: 'Buffalo Trace Bourbon 750ml', price: 2999, currency: 'USD', sizeMl: 750 });
    const r = await qualityReport(db, 'flask');
    expect(r.warnings).toEqual(['not whisky: Premium Vodka 750ml']);
    expect(r.noWhiskyWord).toEqual({ count: 1, examples: ['Premium Vodka 750ml'] });
    expect(r.currencies).toEqual({ USD: 2 });
  });

  it('caps each warning kind at 20 shown plus a +N more line, and caps the no-whisky-word examples at 15', async () => {
    for (let i = 0; i < 25; i++) await add({ storeId: 'nemoto', title: `ボトル ${i}`, price: 9000, sizeMl: null });
    const r = await qualityReport(db, 'nemoto');
    const sizeLines = r.warnings.filter((w) => w.startsWith('no size') || w === '+5 more no size');
    expect(sizeLines).toHaveLength(21);
    expect(sizeLines[20]).toBe('+5 more no size');
    expect(r.warningCount).toBe(25);
    expect(r.noWhiskyWord.count).toBe(25);
    expect(r.noWhiskyWord.examples).toHaveLength(15);
  });

  it('samples are a deterministic function of the injected random', async () => {
    await seedNemoto();
    const titles = async (random: () => number) => (await qualityReport(db, 'nemoto', { samples: 2, random })).samples.map((s) => s.title);
    // partial Fisher-Yates over the rows in id order
    expect(await titles(() => 0)).toEqual(['山崎 12年 700ml', 'ラフロイグ 10年']);
    expect(await titles(() => 0.999)).toEqual(['タリスカー 10年 700ml', '山崎 12年 700ml']);
    expect(await titles(() => 0.999)).toEqual(await titles(() => 0.999));
    const all = (await qualityReport(db, 'nemoto', { samples: 50, random: () => 0 })).samples;
    expect(all).toHaveLength(5);
    expect(all[0]).toEqual({ title: '山崎 12年 700ml', price: 27500, currency: 'JPY', sizeMl: 700, available: true, url: expect.stringMatching(/^https:\/\/example\.test\/\d+$/) });
  });
});

describe('formatReport', () => {
  it('prints yen and dollars by row currency, marks private stores, and shows the warnings', async () => {
    await seedNemoto();
    await add({ storeId: 'flask', title: 'Buffalo Trace Bourbon 750ml', price: 2999, currency: 'USD', sizeMl: 750 });
    const jp = formatReport(await qualityReport(db, 'nemoto', { samples: 1, random: () => 0 }));
    expect(jp).toContain('nemoto (private)');
    expect(jp).toContain('¥27,500');
    expect(jp).toContain('total 5');
    expect(jp).toContain('price ¥500 under ¥1,000');
    const us = formatReport(await qualityReport(db, 'flask', { samples: 1, random: () => 0 }));
    expect(us).not.toContain('(private)');
    expect(us).toContain('$29.99');
  });

  it('never prints control characters from stored fields (defensive: rows written before ingest stripped them)', async () => {
    const r = await qualityReport(db, 'nemoto');
    const evil = 'Bad\u001b[2J\u001b]0;pwned\u0007 ウイスキー\nline\u009b31m';
    r.samples = [{ title: evil, price: 5000, currency: 'JPY', sizeMl: null, available: true, url: 'https://x.test/\u001b[1m' }];
    r.warnings = [`no size: ${evil}`];
    r.warningCount = 1;
    r.noWhiskyWord = { count: 1, examples: [evil] };
    const out = formatReport(r);
    // only the line breaks formatReport itself puts between lines
    expect(out).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    expect(out.split('\n').filter((l) => l.includes('Bad'))).toHaveLength(3);
    expect(out).toContain('Bad[2J]0;pwned ウイスキー line31m');
    expect(out).toContain('https://x.test/[1m');
  });
});

describe('qualityReport default samples', () => {
  it('shows 15 random samples by default (spec section 6)', async () => {
    for (let i = 0; i < 20; i++) await add({ storeId: 'nemoto', title: `山崎 ${i}年 700ml`, price: 5000 + i });
    expect((await qualityReport(db, 'nemoto', { random: () => 0 })).samples).toHaveLength(15);
  });
});
