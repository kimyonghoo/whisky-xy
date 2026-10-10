import { describe, it, expect } from 'vitest';
import { asc } from 'drizzle-orm';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { krLinks, listings } from '@/lib/db/schema';
import { rekeyAll } from '@/lib/rekey';

const OLD = {
  gtsA: '2024 bourbon george release stagg t|p|b|s750', // old key of "George T. Stagg Bourbon 2024 Release 750ml"
  gtsB: '2024 antique buffalo collection george stagg t trace|p|b|s', // "Buffalo Trace Antique Collection George T. Stagg 2024"
  stagg: 'bourbon stagg|p|b|s750',
  staggJr: 'bourbon jr stagg|p|b|s750',
};
const NEW_GTS = '2024 george stagg t|p|b|s750';

function link(id: number, bottleKey: string, checkedAt: string, productId: string) {
  return {
    id, bottleKey, dailyshotProductId: productId, nameKo: '조지 티 스태그', nameEn: null, imageUrl: null,
    lowPriceKrw: 1000000, highPriceKrw: null, offerCount: null, checkedAt: new Date(checkedAt),
  };
}

async function setup() {
  const db = await createTestDb();
  const rows = [
    { ...seed({ storeId: 'dewinespot', title: 'George T. Stagg Bourbon 2024 Release 750ml', priceCents: 99900 }), bottleKey: OLD.gtsA },
    { ...seed({ storeId: 'flask', title: 'Buffalo Trace Antique Collection George T. Stagg 2024', priceCents: 89900 }), bottleKey: OLD.gtsB },
    { ...seed({ storeId: 'liquorcave', title: 'Stagg Bourbon 750ml', priceCents: 6999 }), bottleKey: OLD.stagg },
    { ...seed({ storeId: 'liquorcave', title: 'Stagg Jr Bourbon 750ml', priceCents: 7999 }), bottleKey: OLD.staggJr },
  ];
  await db.insert(listings).values(rows);
  return db;
}

describe('rekeyAll', () => {
  it('recomputes keys, remaps kr_links, keeps the newest link on a collision, and is idempotent', async () => {
    const db = await setup();
    await db.insert(krLinks).values([
      link(1, OLD.gtsA, '2026-10-09T00:00:00Z', '111'), // older -> dropped
      link(2, OLD.gtsB, '2026-10-10T00:00:00Z', '222'), // newer -> kept
      link(3, OLD.stagg, '2026-10-10T00:00:00Z', '333'),
      link(4, 'orphan|p|b|s', '2026-10-10T00:00:00Z', '444'),
    ]);
    const logs: string[] = [];
    const r = await rekeyAll(db, (m) => logs.push(m));

    expect(r.listingsScanned).toBe(4);
    expect(r.listingsChanged).toBe(4);
    expect(r.linksDropped).toEqual([{ id: 1, bottleKey: OLD.gtsA, dailyshotProductId: '111', keptId: 2 }]);
    expect(r.linksOrphaned).toEqual([{ id: 4, bottleKey: 'orphan|p|b|s' }]);
    expect(logs.some((l) => l.includes('collision') && l.includes('dropping 1'))).toBe(true);

    const keys = (await db.select().from(listings).orderBy(asc(listings.id))).map((l) => l.bottleKey);
    expect(keys).toEqual([NEW_GTS, NEW_GTS, 'stagg|p|b|s750', 'jr stagg|p|b|s750']);
    expect(new Set(keys).size).toBe(3); // GTS merged; Stagg and Stagg Jr stay apart

    const links = await db.select().from(krLinks).orderBy(asc(krLinks.id));
    expect(links.map((l) => [l.id, l.bottleKey])).toEqual([
      [2, NEW_GTS],
      [3, 'stagg|p|b|s750'],
      [4, 'orphan|p|b|s'],
    ]);

    const again = await rekeyAll(db);
    expect(again).toMatchObject({ listingsChanged: 0, linksRemapped: 0, linksDropped: [] });
    expect((await db.select().from(krLinks).orderBy(asc(krLinks.id))).map((l) => l.bottleKey)).toEqual(links.map((l) => l.bottleKey));
  });

  it('handles a link moving onto a key another link is leaving (no UNIQUE violation)', async () => {
    const db = await createTestDb();
    // Listing A's key changes from X to Y, and listing B's key changes from Y-old to Z.
    // Link on X must move to Y while no link holds Y at the end.
    const a = { ...seed({ storeId: 'flask', title: 'Stagg Bourbon', priceCents: 1 }), bottleKey: 'bourbon stagg|p|b|s' };
    const b = { ...seed({ storeId: 'flask', title: 'Stagg Jr Bourbon', priceCents: 1 }), bottleKey: 'stagg|p|b|s750' };
    await db.insert(listings).values([a, b]);
    await db.insert(krLinks).values([
      link(1, 'bourbon stagg|p|b|s', '2026-10-10T00:00:00Z', '1'), // -> stagg|p|b|s750
      link(2, 'stagg|p|b|s750', '2026-10-10T00:00:00Z', '2'), // currently on that key -> jr stagg|p|b|s750
    ]);
    const r = await rekeyAll(db);
    expect(r.linksDropped).toEqual([]);
    const links = await db.select().from(krLinks).orderBy(asc(krLinks.id));
    expect(links.map((l) => [l.id, l.bottleKey])).toEqual([
      [1, 'stagg|p|b|s750'],
      [2, 'jr stagg|p|b|s750'],
    ]);
  });
});
