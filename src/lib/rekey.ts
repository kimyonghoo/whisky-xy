import { inArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { krLinks, listings } from '@/lib/db/schema';
import { bottleKey } from '@/lib/whisky/parse';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Sets bottle_key per id in chunks of one UPDATE ... FROM (VALUES ...) each (all values bound). */
async function setBottleKeys(tx: Tx, table: typeof listings | typeof krLinks, pairs: { id: number; key: string }[]): Promise<void> {
  for (let i = 0; i < pairs.length; i += 1000) {
    const values = sql.join(
      pairs.slice(i, i + 1000).map((p) => sql`(${p.id}::integer, ${p.key}::text)`),
      sql`, `,
    );
    await tx.execute(
      sql`update ${table} set ${sql.identifier(table.bottleKey.name)} = v.k from (values ${values}) as v(id, k) where ${table.id} = v.id`,
    );
  }
}

export interface RekeyReport {
  listingsScanned: number;
  listingsChanged: number;
  linksRemapped: number;
  linksDropped: { id: number; bottleKey: string; dailyshotProductId: string; keptId: number }[];
  linksOrphaned: { id: number; bottleKey: string }[];
}

/**
 * Recompute `listings.bottle_key` with the current `bottleKey()` and move `kr_links`
 * to the new keys. Idempotent: a second run changes nothing.
 *
 * kr_links.bottle_key is UNIQUE. When several links land on one new key, the most
 * recently checked one is kept and the others are deleted and reported. Moves go
 * through a temporary key in one transaction, so a swap never trips the constraint.
 */
export async function rekeyAll(db: Db, log: (msg: string) => void = () => {}): Promise<RekeyReport> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: listings.id, title: listings.title, variantTitle: listings.variantTitle, bottleKey: listings.bottleKey })
      .from(listings);

    // old key -> new key votes (a key is a pure function of title + variant, so one
    // old key normally maps to exactly one new key; votes guard the odd case).
    const votes = new Map<string, Map<string, number>>();
    const newKeys = new Set<string>();
    const changed = new Map<string, number[]>(); // new key -> listing ids to update
    for (const r of rows) {
      const next = bottleKey({ title: r.title, variantTitle: r.variantTitle });
      newKeys.add(next);
      const v = votes.get(r.bottleKey) ?? new Map<string, number>();
      v.set(next, (v.get(next) ?? 0) + 1);
      votes.set(r.bottleKey, v);
      if (next !== r.bottleKey) {
        const ids = changed.get(next) ?? [];
        ids.push(r.id);
        changed.set(next, ids);
      }
    }

    const listingPairs = [...changed].flatMap(([key, ids]) => ids.map((id) => ({ id, key })));
    await setBottleKeys(tx, listings, listingPairs);
    const listingsChanged = listingPairs.length;

    const links = await tx.select().from(krLinks);
    const target = new Map<number, string>();
    const linksOrphaned: RekeyReport['linksOrphaned'] = [];
    for (const l of links) {
      const v = votes.get(l.bottleKey);
      if (v) {
        const [best] = [...v.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (v.size > 1) log(`[rekey] old key "${l.bottleKey}" maps to ${v.size} new keys; using "${best[0]}"`);
        target.set(l.id, best[0]);
      } else {
        // No listing carries this key: it is either already a new key (re-run) or orphaned.
        target.set(l.id, l.bottleKey);
        if (!newKeys.has(l.bottleKey)) {
          linksOrphaned.push({ id: l.id, bottleKey: l.bottleKey });
          log(`[rekey] kr_link ${l.id} "${l.bottleKey}" matches no listing; left as is`);
        }
      }
    }

    // Resolve collisions: newest checkedAt wins (id breaks ties deterministically).
    const byTarget = new Map<string, typeof links>();
    for (const l of links) {
      const t = target.get(l.id)!;
      byTarget.set(t, [...(byTarget.get(t) ?? []), l]);
    }
    const linksDropped: RekeyReport['linksDropped'] = [];
    const moves: { id: number; to: string }[] = [];
    for (const [t, group] of byTarget) {
      group.sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime() || b.id - a.id);
      const [keep, ...drop] = group;
      for (const d of drop) {
        linksDropped.push({ id: d.id, bottleKey: d.bottleKey, dailyshotProductId: d.dailyshotProductId, keptId: keep.id });
        log(
          `[rekey] kr_link collision on "${t}": keeping ${keep.id} (dailyshot ${keep.dailyshotProductId}, ` +
            `checked ${keep.checkedAt.toISOString()}), dropping ${d.id} (dailyshot ${d.dailyshotProductId}, ` +
            `old key "${d.bottleKey}", checked ${d.checkedAt.toISOString()})`,
        );
      }
      if (keep.bottleKey !== t) moves.push({ id: keep.id, to: t });
    }

    if (linksDropped.length) {
      await tx.delete(krLinks).where(inArray(krLinks.id, linksDropped.map((d) => d.id)));
    }
    // Two phases so a move onto a key another link is leaving never violates UNIQUE.
    await setBottleKeys(tx, krLinks, moves.map((m) => ({ id: m.id, key: `__rekey_tmp__:${m.id}` })));
    await setBottleKeys(tx, krLinks, moves.map((m) => ({ id: m.id, key: m.to })));
    for (const m of moves) log(`[rekey] kr_link ${m.id} -> "${m.to}"`);

    return {
      listingsScanned: rows.length,
      listingsChanged,
      linksRemapped: moves.length,
      linksDropped,
      linksOrphaned,
    };
  });
}
