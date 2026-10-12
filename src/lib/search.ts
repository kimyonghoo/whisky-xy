import { and, asc, desc, gte, ilike, inArray, lte, eq, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, type FxRate, type KrLink, type Listing } from '@/lib/db/schema';
import { STORES, getStore, type Store } from '@/lib/stores';
import { CITIES, getCity, type CityId } from '@/lib/geo';
import { withTaxCents } from '@/lib/money';
import { normalizeText } from '@/lib/whisky/parse';
import { matchesPhrase, parseQuery, queryPhrase, type QueryTerm, type Vocab } from '@/lib/search-query';
import { getKrLinks } from '@/lib/krlinks';
import { getLatestFx } from '@/lib/fx';
import { compareKr } from '@/lib/compare';
import { usInStockPools } from '@/lib/krcompare';
import { confirmedSince, stockState, type StockState } from '@/lib/freshness';

export interface SearchParams {
  q: string;
  /** The selected city; it is listed first and other live cities of its country follow. */
  city: CityId;
  storeId?: string;
  inStockOnly?: boolean;
  /** Bottle size in ml; one of SIZE_OPTIONS. */
  sizeMl?: number;
  minCents?: number;
  maxCents?: number;
}

export interface ListingRow extends Listing {
  store: Store;
  taxIncludedCents: number;
  /** 'unverified' = available but not checked for 48 h: never ranked or used as a price base. */
  stock: StockState;
}

export interface BottleGroup {
  bottleKey: string;
  displayTitle: string;
  /** Variant title that tells groups apart (e.g. release year), shown next to the title. */
  displayVariant?: string | null;
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
  imageUrl: string | null;
  rows: ListingRow[];
  /** Cheapest confirmed in-stock tax-included price (unverified rows excluded). */
  bestAvailableCents: number | null;
  /**
   * Korea (Dailyshot) comparison, present only when the bottle is linked.
   * `compare` uses the US-wide cheapest in-stock tax-included price, from `baseCity`; it is null
   * when no city has an in-stock row or no fx rate exists. `fx` is the rate used.
   */
  kr?: { link: KrLink; compare: ReturnType<typeof compareKr> | null; fx: FxRate | null; baseCity?: CityId | null };
}

export interface CitySection {
  city: CityId;
  groups: BottleGroup[];
  /** Cheapest confirmed in-stock tax-included price in this city. */
  bestAvailableCents: number | null;
  /** Distinct stores with at least one row. */
  storeCount: number;
}

/** What the search form and URL carry; the page resolves `city` separately (cookie, store, legacy region). */
export type SearchFilters = Omit<SearchParams, 'city'>

export const SECTION_ROW_LIMIT = 500;

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const STOCK_ORDER: Record<StockState, number> = { instock: 0, unverified: 1, soldout: 2 };

/** Confirmed in stock first, then "확인 필요", then sold out; each by tax-included price. */
function rowCmp(a: ListingRow, b: ListingRow): number {
  return STOCK_ORDER[a.stock] - STOCK_ORDER[b.stock] || a.taxIncludedCents - b.taxIncludedCents;
}

/**
 * The variant title when it identifies the bottle (e.g. a release year "2024"), else null.
 * Pure size variants ("750ml", "1.75 L") are already shown as a spec chip.
 */
export function identifyingVariant(variantTitle: string | null): string | null {
  if (!variantTitle) return null;
  const rest = variantTitle.replace(/\d+(?:\.\d+)?\s*(?:ml|liters?|litres?|l)\b/gi, '').replace(/[^a-z0-9]/gi, '');
  return rest ? variantTitle.trim() : null;
}

/**
 * Relevance tier, best first: the query phrase in the bottle's own title, then anywhere in its
 * text (the vendor is part of it: "buffalo trace" also hits Benchmark), then scattered words.
 */
function phraseTier(rows: ListingRow[], phrase: string): number {
  if (!phrase) return 0;
  if (rows.some((r) => matchesPhrase(normalizeText(`${r.title} ${r.variantTitle ?? ''}`), phrase))) return 0;
  return rows.some((r) => matchesPhrase(r.searchText, phrase)) ? 1 : 2;
}

function buildGroups(rows: ListingRow[], phrase: string): BottleGroup[] {
  const map = new Map<string, ListingRow[]>();
  for (const r of rows) {
    const arr = map.get(r.bottleKey);
    if (arr) arr.push(r);
    else map.set(r.bottleKey, [r]);
  }
  const groups: BottleGroup[] = [];
  const tier = new Map<string, number>();
  for (const [key, rs] of map) {
    tier.set(key, phraseTier(rs, phrase));
    rs.sort(rowCmp);
    const first = rs[0];
    const avail = rs.filter((r) => r.stock === 'instock').map((r) => r.taxIncludedCents);
    groups.push({
      bottleKey: key,
      displayTitle: first.title,
      displayVariant: identifyingVariant(first.variantTitle),
      sizeMl: first.sizeMl,
      proof: first.proof,
      batch: first.batch,
      imageUrl: rs.find((r) => r.imageUrl)?.imageUrl ?? null,
      rows: rs,
      bestAvailableCents: avail.length ? Math.min(...avail) : null,
    });
  }
  groups.sort((a, b) => {
    const t = tier.get(a.bottleKey)! - tier.get(b.bottleKey)!;
    if (t) return t;
    const A = a.bestAvailableCents;
    const B = b.bestAvailableCents;
    if (A !== null && B !== null) return A - B || a.displayTitle.localeCompare(b.displayTitle);
    if (A !== null) return -1;
    if (B !== null) return 1;
    return a.displayTitle.localeCompare(b.displayTitle);
  });
  return groups;
}

export interface SearchOptions {
  /** Per-section row limit; override is intended for tests only. */
  rowLimit?: number;
  /** Clock for the 48 h unverified cut-off; tests inject it. */
  now?: Date;
  /** Already-interpreted query (the page shows it); parsed from `p.q` when omitted. */
  terms?: QueryTerm[];
}

const VOCAB_TTL_MS = 60 * 60_000;
const vocabCache = new WeakMap<Db, { at: number; vocab: Promise<Vocab> }>();

/** Every word in listings' search text with its listing count, cached per db for an hour (feeds typo fixes). */
export function getVocab(db: Db, now = Date.now()): Promise<Vocab> {
  const hit = vocabCache.get(db);
  if (hit && now - hit.at < VOCAB_TTL_MS) return hit.vocab;
  const vocab = db
    .execute<{ w: string; n: number }>(
      sql`select w, count(*)::int as n from (select distinct id, unnest(string_to_array(${listings.searchText}, ' ')) as w from ${listings}) t where w <> '' group by w`,
    )
    .then((res) => {
      const rows = (Array.isArray(res) ? res : (res as { rows: { w: string; n: number }[] }).rows) as { w: string; n: number }[];
      return new Map(rows.map((r) => [r.w, Number(r.n)]));
    });
  // A failed load must not stick for an hour.
  vocab.catch(() => vocabCache.delete(db));
  vocabCache.set(db, { at: now, vocab });
  return vocab;
}

/** The query as searched: Korean spellings, abbreviations and typos resolved against listing words. */
export async function interpretQuery(db: Db, q: string): Promise<QueryTerm[]> {
  const plain = parseQuery(q);
  if (plain.length === 0) return plain;
  return parseQuery(q, await getVocab(db));
}

function termCond(term: QueryTerm): SQL | undefined {
  const alts = term.map((tokens) => and(...tokens.map((t) => ilike(listings.searchText, `%${escapeLike(t)}%`))));
  return alts.length === 1 ? alts[0] : or(...alts);
}

export async function searchListings(
  db: Db,
  p: SearchParams,
  opts: SearchOptions = {},
): Promise<{ sections: CitySection[] }> {
  const selected = getCity(p.city);
  if (!selected || selected.status === 'soon') return { sections: [] };
  const terms = opts.terms ?? (await interpretQuery(db, p.q ?? ''));
  if (terms.length === 0 && !p.storeId) return { sections: [] };
  const phrase = queryPhrase(terms);
  const limit = opts.rowLimit ?? SECTION_ROW_LIMIT;
  const now = opts.now ?? new Date();

  let stores = STORES.filter((s) => s.publicAllowed);
  if (p.storeId) stores = stores.filter((s) => s.id === p.storeId);
  // Selected city first, then the other live cities of its country in CITIES order.
  const cityIds = [
    selected.id,
    ...CITIES.filter((c) => c.country === selected.country && c.status === 'live' && c.id !== selected.id).map((c) => c.id),
  ];

  // Each city is queried separately so one city can never crowd out another.
  const section = async (sectionStores: Store[]): Promise<BottleGroup[]> => {
    if (sectionStores.length === 0) return [];
    const conds = [inArray(listings.storeId, sectionStores.map((s) => s.id)), ...terms.map(termCond)];
    // "재고 있는 곳만" means confirmed in stock: unverified (> 48 h) rows are left out too.
    if (p.inStockOnly) conds.push(eq(listings.available, true), gte(listings.checkedAt, confirmedSince(now)));
    if (p.sizeMl != null) conds.push(eq(listings.sizeMl, p.sizeMl));
    if (p.minCents != null) conds.push(gte(listings.priceCents, p.minCents));
    if (p.maxCents != null) conds.push(lte(listings.priceCents, p.maxCents));
    const found = await db
      .select()
      .from(listings)
      .where(and(...conds))
      .orderBy(desc(listings.available), asc(listings.priceCents), asc(listings.id))
      .limit(limit);
    const rows: ListingRow[] = [];
    for (const l of found) {
      const store = getStore(l.storeId);
      if (!store) continue;
      rows.push({ ...l, store, taxIncludedCents: withTaxCents(l.priceCents, store.taxRate), stock: stockState(l, now) });
    }
    return buildGroups(rows, phrase);
  };

  const sections = await Promise.all(
    cityIds.map(async (id): Promise<CitySection> => {
      const groups = await section(stores.filter((s) => s.city === id));
      const rows = groups.flatMap((g) => g.rows);
      const avail = groups.map((g) => g.bestAvailableCents).filter((c): c is number => c !== null);
      return {
        city: id,
        groups,
        bestAvailableCents: avail.length ? Math.min(...avail) : null,
        storeCount: new Set(rows.map((r) => r.storeId)).size,
      };
    }),
  );
  // The selected city always stays (the page explains an empty one); other cities only when they have results.
  const kept = sections.filter((s) => s.city === p.city || s.groups.length > 0);
  await attachKr(db, kept, now);
  return { sections: kept };
}

/**
 * Fills `group.kr` for linked bottles. Every group of a bottle, in any section, compares against the
 * US-wide lowest confirmed in-stock price over all public stores (the /compare basis), never the
 * search's filtered or capped rows; `baseCity` names the city that price is from.
 */
async function attachKr(db: Db, sections: CitySection[], now: Date): Promise<void> {
  const groups = sections.flatMap((s) => s.groups);
  if (groups.length === 0) return;
  const [links, fx] = await Promise.all([getKrLinks(db, [...new Set(groups.map((g) => g.bottleKey))]), getLatestFx(db)]);
  if (links.size === 0) return;
  const pools = await usInStockPools(db, [...links.keys()], now);
  for (const g of groups) {
    const link = links.get(g.bottleKey);
    if (!link) continue;
    const base = pools.get(g.bottleKey)?.[0];
    const compare = base && fx ? compareKr(base.taxIncludedCents, fx.usdKrw, link.lowPriceKrw) : null;
    g.kr = { link, compare, fx, baseCity: base?.store.city ?? null };
  }
}
