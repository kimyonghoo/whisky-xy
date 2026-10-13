// Per-store page-crawl configs, keyed by store id. Facts about each site's own markup only.
import { parseSizeMl } from '@/lib/whisky/parse';
import { decodeHtmlEntities } from '@/lib/pagecrawl/jsonld';

export interface PageStoreConfig {
  /** Path of whisky list page `page` (1-based). */
  listPath(page: number): string;
  /** Upper bound on list pages; the rotation wraps to page 1 after it. */
  maxListPages: number;
  /** List pages read per run, from where the previous run stopped. */
  listPagesPerRun: number;
  /** Tested against each `href` on a list page: true for links to products of the crawled list. */
  productUrlRe: RegExp;
  /** Store-side product id from a product URL or path, or null when it is not a product URL. */
  productId(url: string): string | null;
  /** The canonical path of a product page (what is fetched and stored). */
  productPath(productId: string): string;
  /** Bottle size in ml from the item page's 容量 (volume) spec row, or null. */
  sizeFrom(html: string): number | null;
  /** Title fallback when the JSON-LD has no name. */
  titleFrom?(html: string): string | null;
}

const stripTags = (s: string) => decodeHtmlEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * A table cell that holds only the 容量 label (optionally `Volume(容量)` or `容量：`), and the
 * cell right after it. A cell that merely mentions 容量 in a sentence does not count.
 */
const VOLUME_ROW_RE =
  /<t[dh]\b[^>]*>(?:<[^>]*>|\s)*(?:volume\s*)?[(（]?\s*容量\s*[)）]?\s*[:：]?(?:<[^>]*>|\s)*<\/t[dh]>\s*<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/i;

/**
 * 信濃屋 (shinanoya-tokyo.jp, a MakeShop store). Checked 2026-10-13:
 * - the ウイスキー category is `ct755`, paginated with `?page=<n>` (142 pages of 30 then);
 * - the category grid links are `/view/item/<12 digits>?category_page_id=ct755`; the same page
 *   also has recommendation blocks with plain `/view/item/<id>` links, which are not followed;
 * - item pages carry a JSON-LD Product/Offer (price, JPY, availability), an empty `<title>`, an
 *   `h2.product-name` heading (the page's h1 is a site banner) and a `Volume(容量)` spec row.
 */
const SHINANOYA: PageStoreConfig = {
  listPath: (page) => `/view/category/ct755?page=${page}`,
  // A safety cap above the 142 pages seen; the rotation also wraps on an empty or repeated page.
  maxListPages: 300,
  listPagesPerRun: 20,
  productUrlRe: /^(?:https:\/\/(?:www\.)?shinanoya-tokyo\.jp)?\/view\/item\/\d+\?category_page_id=ct755(?:&|$)/,
  productId: (url) => /^(?:https:\/\/(?:www\.)?shinanoya-tokyo\.jp)?\/view\/item\/(\d+)(?:[?#]|$)/.exec(url)?.[1] ?? null,
  productPath: (id) => `/view/item/${id}`,
  sizeFrom: (html) => {
    const m = VOLUME_ROW_RE.exec(html);
    return m ? parseSizeMl(stripTags(m[1]).replace(/(\d)[,，](?=\d{3})/g, '$1')) : null;
  },
  titleFrom: (html) => {
    const m = /<h2\b[^>]*class=["'][^"']*\bproduct-name\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i.exec(html);
    const t = m ? stripTags(m[1]) : '';
    return t === '' ? null : t;
  },
};

export const PAGE_STORE_CONFIGS: Record<string, PageStoreConfig> = {
  shinanoya: SHINANOYA,
};
