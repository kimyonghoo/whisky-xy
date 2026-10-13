import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings } from '@/lib/db/schema';
import { getStore } from '@/lib/stores';
import { isWhiskyProduct } from '@/lib/whisky/parse';
import { formatUsd } from '@/lib/money';

// Read-only: this module only SELECTs from `listings`. No writes, no network.

/** JPY sanity bounds (whole yen). A price outside them is more likely a parse error than a bottle. */
export const JPY_MIN_PRICE = 1000;
export const JPY_MAX_PRICE = 5_000_000;

/** Warnings shown per kind; the rest collapse into a `+N more` line. */
export const WARNING_CAP = 20;
/** `noWhiskyWord` examples kept. */
export const NO_WHISKY_WORD_EXAMPLES = 15;
const DEFAULT_SAMPLES = 10;

export interface QualitySample {
  title: string;
  /** In the minor unit of `currency` (USD cents, whole yen). */
  price: number;
  currency: string;
  sizeMl: number | null;
  available: boolean;
  url: string;
}

export interface QualityReport {
  storeId: string;
  total: number;
  inStock: number;
  /** Percent of rows (0-100, one decimal) with a price above 0. */
  pctPrice: number;
  /** Percent of rows with a parsed bottle size. */
  pctSize: number;
  /** Percent of rows currently in stock (availability itself is never missing). */
  pctAvailability: number;
  currencies: Record<string, number>;
  oldestCheckedAt: Date | null;
  newestCheckedAt: Date | null;
  samples: QualitySample[];
  /** Capped per kind (price, no size, not whisky) at WARNING_CAP, each kind ending in `+N more ...` when cut. */
  warnings: string[];
  /** Uncapped number of warnings, `+N more` lines not counted. */
  warningCount: number;
  /**
   * Titles that fail the default `isWhiskyProduct` check (no whisky-only flag): the whisky-only
   * catalogs' titles often carry no whisky word, so this is a separate signal, not a warning.
   */
  noWhiskyWord: { count: number; examples: string[] };
}

/** `¥27,500` for JPY (whole yen), `$12.34` for USD (cents); any other currency prints as `<amount> <code>`. */
export function formatMoney(amount: number, currency: string): string {
  if (currency === 'JPY') {
    const sign = amount < 0 ? '-' : '';
    return `${sign}¥${Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
  if (currency === 'USD') return formatUsd(amount);
  return `${amount} ${currency}`;
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

function cap(kind: string, lines: string[]): string[] {
  if (lines.length <= WARNING_CAP) return lines;
  return [...lines.slice(0, WARNING_CAP), `+${lines.length - WARNING_CAP} more ${kind}`];
}

export async function qualityReport(
  db: Db,
  storeId: string,
  opts: { samples?: number; random?: () => number } = {},
): Promise<QualityReport> {
  const rows = await db
    .select({
      title: listings.title,
      productType: listings.productType,
      priceCents: listings.priceCents,
      currency: listings.currency,
      available: listings.available,
      sizeMl: listings.sizeMl,
      url: listings.url,
      checkedAt: listings.checkedAt,
    })
    .from(listings)
    .where(eq(listings.storeId, storeId))
    .orderBy(asc(listings.id));

  const whiskyOnlyCatalog = getStore(storeId)?.whiskyOnlyCatalog === true;
  const total = rows.length;
  const currencies: Record<string, number> = {};
  const priceWarnings: string[] = [];
  const sizeWarnings: string[] = [];
  const whiskyWarnings: string[] = [];
  const noWord: string[] = [];
  let inStock = 0;
  let withPrice = 0;
  let withSize = 0;
  let oldest: Date | null = null;
  let newest: Date | null = null;

  for (const r of rows) {
    currencies[r.currency] = (currencies[r.currency] ?? 0) + 1;
    if (r.available) inStock++;
    if (r.priceCents > 0) withPrice++;
    if (r.sizeMl !== null) withSize++;
    if (oldest === null || r.checkedAt < oldest) oldest = r.checkedAt;
    if (newest === null || r.checkedAt > newest) newest = r.checkedAt;

    // The JPY bounds are meaningless in cents, so they only apply to JPY rows.
    if (r.currency === 'JPY') {
      if (r.priceCents < JPY_MIN_PRICE) {
        priceWarnings.push(`price ${formatMoney(r.priceCents, 'JPY')} under ${formatMoney(JPY_MIN_PRICE, 'JPY')}: ${r.title}`);
      } else if (r.priceCents > JPY_MAX_PRICE) {
        priceWarnings.push(`price ${formatMoney(r.priceCents, 'JPY')} over ${formatMoney(JPY_MAX_PRICE, 'JPY')}: ${r.title}`);
      }
    }
    if (r.sizeMl === null) sizeWarnings.push(`no size: ${r.title}`);

    const p = { title: r.title, productType: r.productType, tags: [] as string[] };
    if (!isWhiskyProduct(p, { whiskyOnlyCatalog })) whiskyWarnings.push(`not whisky: ${r.title}`);
    if (!isWhiskyProduct(p)) noWord.push(r.title);
  }

  // Partial Fisher-Yates over the rows in id order: the sample is a function of `random` alone.
  const random = opts.random ?? Math.random;
  const k = Math.min(opts.samples ?? DEFAULT_SAMPLES, total);
  const pool = [...rows];
  for (let i = 0; i < k; i++) {
    const j = i + Math.min(Math.floor(random() * (total - i)), total - i - 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const samples: QualitySample[] = pool.slice(0, k).map((r) => ({
    title: r.title, price: r.priceCents, currency: r.currency, sizeMl: r.sizeMl, available: r.available, url: r.url,
  }));

  return {
    storeId,
    total,
    inStock,
    pctPrice: pct(withPrice, total),
    pctSize: pct(withSize, total),
    pctAvailability: pct(inStock, total),
    currencies,
    oldestCheckedAt: oldest,
    newestCheckedAt: newest,
    samples,
    warnings: [...cap('price', priceWarnings), ...cap('no size', sizeWarnings), ...cap('not whisky', whiskyWarnings)],
    warningCount: priceWarnings.length + sizeWarnings.length + whiskyWarnings.length,
    noWhiskyWord: { count: noWord.length, examples: noWord.slice(0, NO_WHISKY_WORD_EXAMPLES) },
  };
}

/** Readable text for one store's report (what `npm run crawl:report` prints). */
export function formatReport(r: QualityReport): string {
  const store = getStore(r.storeId);
  const lines: string[] = [];
  lines.push(`== ${r.storeId}${store && !store.publicAllowed ? ' (private)' : ''} ==`);
  lines.push(`total ${r.total}, in stock ${r.inStock}`);
  lines.push(`coverage: price ${r.pctPrice}%, size ${r.pctSize}%, in stock ${r.pctAvailability}%`);
  lines.push(`currencies: ${Object.entries(r.currencies).map(([c, n]) => `${c} ${n}`).join(', ') || '-'}`);
  lines.push(`checked: ${r.oldestCheckedAt?.toISOString() ?? '-'} .. ${r.newestCheckedAt?.toISOString() ?? '-'}`);
  lines.push(`samples (${r.samples.length}):`);
  for (const s of r.samples) {
    lines.push(`  ${formatMoney(s.price, s.currency)}  ${s.sizeMl === null ? '? ml' : `${s.sizeMl}ml`}  ${s.available ? 'in stock' : 'sold out'}  ${s.title}  ${s.url}`);
  }
  lines.push(`warnings (${r.warningCount}):`);
  for (const w of r.warnings) lines.push(`  ${w}`);
  if (r.warnings.length === 0) lines.push('  none');
  const note = r.noWhiskyWord.count === 0 ? '' : store?.whiskyOnlyCatalog ? ' (not a warning in a whisky-only catalog; examples:)' : ' (examples:)';
  lines.push(`no whisky word in title: ${r.noWhiskyWord.count}${note}`);
  for (const t of r.noWhiskyWord.examples) lines.push(`  ${t}`);
  if (r.noWhiskyWord.count > r.noWhiskyWord.examples.length) lines.push(`  +${r.noWhiskyWord.count - r.noWhiskyWord.examples.length} more`);
  return lines.join('\n');
}
