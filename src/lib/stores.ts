import type { CityId } from '@/lib/geo';

export type Currency = 'USD' | 'JPY';

export interface Store {
  id: string;
  name: string;
  domain: string;
  city: CityId;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  taxRate: number;
  stockReliability: 'high' | 'low';
  onlineOnly: boolean;
  publicAllowed: boolean;
  /** Currency the store prices in; `listings.priceCents` is that currency's minor unit. */
  currency: Currency;
  /** True when listed prices already include sales/consumption tax (set `taxRate` to 0 then). */
  pricesIncludeTax: boolean;
  /** How the store is crawled: Shopify `products.json`, or HTML page parsing. */
  adapter: 'shopify' | 'page';
  /** False keeps a store out of the crawl (e.g. its terms forbid automated collection). */
  crawlEnabled: boolean;
  /**
   * Shopify products.json path to crawl instead of the whole catalog, e.g. a whisky collection's
   * `/collections/<handle>/products.json`. Same public endpoint, same headers and pacing. Use it
   * when the full catalog can't finish within the page limit, so the missing-sweep can run.
   * The sweep then means "no longer in this collection" (marked sold out, never deleted).
   */
  catalogPath?: string;
  /**
   * The crawled source lists only whisky (e.g. the store's whisky category), so a title needs no
   * whisky word to count; reject terms (glasses, liqueurs, wine, case sales/sets...) still apply.
   * Read by both the page adapter (crawlPageStore) and the Shopify mapper (toObservations).
   */
  whiskyOnlyCatalog?: boolean;
}


// Address/phone from each store's own site; lat/lng geocoded once via Nominatim.
export const STORES: Store[] = [
  {
    id: 'dewinespot', name: 'De Wine Spot', domain: 'dewinespot.co', city: 'brooklyn',
    address: '428 Lorimer St, Brooklyn, NY 11206', lat: 40.7096302, lng: -73.9485132,
    phone: '718-388-9463', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'theliquorstore', name: 'The Liquor Store', domain: 'theliquorstore.com', city: 'brooklyn',
    address: '55 Flatbush Ave, Brooklyn, NY 11217', lat: 40.6872047, lng: -73.9794964,
    phone: '718-222-0100', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'grainvine', name: 'Grain & Vine', domain: 'grainvine.com', city: 'brooklyn',
    address: '190 Union Ave, Brooklyn, NY 11211', lat: 40.7060339, lng: -73.9501105,
    phone: '718-782-9463', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'slopecellars', name: 'Slope Cellars', domain: 'shop.slopecellars.com', city: 'brooklyn',
    address: '436 7th Ave, Brooklyn, NY 11215', lat: 40.6635689, lng: -73.9846378,
    phone: '718-369-7307', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'liquorcave', name: 'Liquor Cave', domain: 'www.liquorcave.com', city: 'nj',
    address: '775 US-1, Edison, NJ 08817', lat: 40.5125877, lng: -74.3837563,
    phone: '732-662-4699', taxRate: 0.06625, stockReliability: 'low', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'winechateau', name: 'Wine Chateau', domain: 'winechateau.com', city: 'nj',
    address: '85 Central Ave, Metuchen, NJ 08840', lat: 40.5414336, lng: -74.3678358,
    phone: '800-946-3190', taxRate: 0.06625, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
    // The full catalog is > 25,000 products (mostly wine) and never completes in 100 pages, so
    // the missing-sweep could never run. The public "Whiskeys" collection (checked 2026-10-11:
    // scotch, bourbon, rye, irish, japanese... ~3.4k products) completes in ~14 pages.
    catalogPath: '/collections/whiskeys/products.json',
  },
  {
    id: 'coolvines', name: 'CoolVines', domain: 'coolvines.com', city: 'nj',
    address: '350 Warren St, Jersey City, NJ 07302', lat: 40.7200248, lng: -74.0378045,
    phone: '201-432-8910', taxRate: 0.06625, stockReliability: 'low', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'flask', name: 'Flask Fine Wine & Whisky', domain: 'flaskfinewines.com', city: 'la',
    address: '12194 Ventura Blvd, Studio City, CA 91604', lat: 34.1432209, lng: -118.3982,
    // CDTFA lists 10.25% for this address (LA Measure A), not the plan's 9.75%.
    phone: '818-761-5373', taxRate: 0.1025, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  {
    id: 'bittersandbottles', name: 'Bitters & Bottles', domain: 'www.bittersandbottles.com', city: 'la',
    address: '240 Grand Ave, South San Francisco, CA 94080', lat: 37.6551751, lng: -122.409552,
    phone: '650-741-6430', taxRate: 0.09875, stockReliability: 'high', onlineOnly: true, publicAllowed: true,
    currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
  },
  // ---- Japan, phase 1: crawled privately (publicAllowed false; tokyo/sapporo stay 'soon') ----
  {
    // 北海道根本商店 (有限会社一山根本商店). Shop facts: the 真駒内店 根本商店 block on https://nemoto-shouten.com/
    // (fetched 2026-10-13). Online stock is shared with this shop (legal notice: 商品は実店舗での販売も行っております).
    // Terms checked 2026-10-13. Verdict: crawlEnabled true.
    // - https://nemoto-shouten.com/policies/terms-of-service (利用規約): e-mail domain and order-form
    //   instructions only; no clause on automated access, scraping or reproduction.
    // - https://nemoto-shouten.com/policies/legal-notice (特定商取引法に基づく表記): seller, address, prices
    //   ("販売価格は、表示された金額（表示価格/消費税込）と致します。"), payment, returns; no such clause either.
    // - robots.txt (200): allows the whisky collection's products.json pages and /meta.json; disallows
    //   /cart.js ("AJAX surfaces"), so the robots-checked crawl reads the currency from /meta.json instead.
    // lat/lng PROVISIONAL: Nominatim returned no result on 2026-10-13, both for the address
    // ("北海道札幌市南区真駒内本町3丁目5-16") and at block level ("真駒内本町三丁目, 南区, 札幌市"). These are an
    // approximate 真駒内本町 position (not geocoded), to be replaced before launch; the pin is private.
    id: 'nemoto', name: '北海道根本商店', domain: 'nemoto-shouten.com', city: 'sapporo',
    address: '北海道札幌市南区真駒内本町3丁目5-16', lat: 42.9935, lng: 141.356,
    phone: '011-582-2994', taxRate: 0, stockReliability: 'high', onlineOnly: false, publicAllowed: false,
    currency: 'JPY', pricesIncludeTax: true, adapter: 'shopify', crawlEnabled: true,
    // 749 whiskies on 2026-10-12: the whisky collection completes in a few pages.
    catalogPath: '/collections/whisky/products.json', whiskyOnlyCatalog: true,
  },
  {
    // 信濃屋 NET SHOP (shinanoya-tokyo.jp, MakeShop; 株式会社信濃屋食品). The pin is 銀座店: address and phone
    // from https://shinanoya.co.jp/shop/ (fetched 2026-10-13). Prices and stock are the NET SHOP's, not
    // 銀座店's, hence stockReliability 'low'.
    // Terms checked 2026-10-13 (Task 5): no 利用規約 page on shinanoya-tokyo.jp (footer/guide link none);
    // /view/guide and /view/contract (特定商取引法) have no clause on automated access; robots.txt is 404
    // (no rules). Only restriction (/view/guide): "当店画像・コメント等を無断で転載する行為は弊社知的財産権への
    // 権利侵害に抵触する場合がございます" -> facts only, imageUrl null, no descriptions. Verdict: crawlEnabled true.
    // Corporate ご利用規約 https://shinanoya.co.jp/support/terms.html, read 2026-10-13 (robots.txt 404). Verdict:
    // allowed under facts only. It governs "当社がこのウェブサイト上で提供するサービス" (shinanoya.co.jp), and
    // 第6条 sends linked sites, the 「ウイスキー」通販サイト among them, to their own terms. Even if read as
    // group-wide, it has no clause on automated access, crawlers, scraping, bots or programs. 第2条
    // 禁止事項 lists "当社のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為" and
    // "当社のサービスの運営を妨害するおそれのある行為", which the polite fetcher's 1 request per 3 s, 300 per run,
    // stop-on-403/429/503 rules respect. 第4条 restricts content use "（複製、改ざん、頒布などを含む。）" beyond
    // legal limits; we store facts only (price, stock, size, title, url), no images or descriptions.
    // lat/lng: the 銀座八丁目 block (OSM relation 4859106) from Nominatim on 2026-10-13. The house-number
    // lookup ("東京都中央区銀座8丁目6-22") returned no result.
    id: 'shinanoya', name: '信濃屋', domain: 'shinanoya-tokyo.jp', city: 'tokyo',
    address: '東京都中央区銀座8-6-22 銀座ピアースビル1F', lat: 35.666698, lng: 139.763463,
    phone: '03-3571-3315', taxRate: 0, stockReliability: 'low', onlineOnly: false, publicAllowed: false,
    currency: 'JPY', pricesIncludeTax: true, adapter: 'page', crawlEnabled: true, whiskyOnlyCatalog: true,
  },
];

export function getStore(id: string): Store | undefined {
  return STORES.find((s) => s.id === id);
}

/** True only for a registered store that may be shown publicly. Unknown ids are not public. */
export function isPublicStoreId(storeId: string): boolean {
  return getStore(storeId)?.publicAllowed === true;
}
