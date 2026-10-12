# Japan Phase 1 (Private Sapporo/Tokyo Crawl) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crawl 北海道根本商店 (Sapporo, Shopify) and 信濃屋 (Tokyo, makeshop page crawl) into the database on the 6-hourly run. The crawl must be private, polite and lawful, and the data must be checkable through a CLI quality report.

**Architecture:**
- Stores gain `currency`, `pricesIncludeTax`, `adapter` and `crawlEnabled`. Listings gain a `currency` column.
- The Shopify path becomes currency-aware.
- A new `src/lib/pagecrawl/` module provides:
  - a robots-obeying, rate-limited fetcher;
  - a JSON-LD product-page reader;
  - a per-store list config.

  It produces the same `Observation`s, so `ingestStoreCrawl` stays the single writer.
- Private stores are guarded everywhere a listing id can be reached directly (card page, recheck API, alerts).

**Tech Stack:** Next.js 16.4, TypeScript, Drizzle + Postgres (PGlite in tests), Vitest, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-10-12-japan-phase1-design.md`

## Global Constraints

- **robots.txt is obeyed.**
  - Fetch and parse it before any request to a page-crawled host, for our User-Agent and `*`.
  - Never request a disallowed path, and honour a `Crawl-delay` larger than ours.
  - 404 means no rules. Any other failure means do not crawl this run.
- **Rate:** page crawls send at most **one request every 3,000 ms per host** and at most **300 requests per store per run**.
  - Stop the store for the run on the first **403, 429 or 503**, on **3 consecutive errors**, or on a bot-challenge page.
  - Never retry in a loop.
- **Facts only:** price, currency, availability, size, title, product URL and store-side ids. Japanese stores keep `imageUrl: null`, and descriptions are never stored. Test fixtures are trimmed to the needed snippets, not full pages.
- **Honest identity:** use the existing `botUserAgent()`. No browser spoofing, no ways around bot protection.
- **Private:** both stores are `publicAllowed: false`, and cities `tokyo`/`sapporo` stay `status: 'soon'`.
  - No public page, alert or count may include a private store.
  - Store ids: `nemoto`, `shinanoya`.
- **Terms of use:** read each store's 利用規約 / 特定商取引法 page before enabling. If automated collection is forbidden, set `crawlEnabled: false`.
  - Record the date, URL, verdict and quoted clause in a comment beside the store in `src/lib/stores.ts`.
- **Prices:** stored in the existing integer column in the currency's minor unit (USD cents; JPY whole yen, so ¥27,500 is `27500`). Japanese prices are tax-included and `taxRate` is `0`.
- Existing US behaviour, tests and `npm run crawl` keep working. Existing bottle keys for ASCII titles must not change.
- The worktree guard refuses commands mixing git with other commands, so run git as separate plain commands. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Read the relevant guide in `node_modules/next/dist/docs/` before touching Next.js code (AGENTS.md).

## Review Focus

1. A private store's listing reached by direct id (`/ko/card/<id>`, `POST /api/recheck/<id>`) must 404, not render or hit the store. (Task 3 test.)
2. A Japanese title with no ASCII letters must produce a non-empty, brand-specific bottle key. Two different Japanese whiskies of the same size must not share one. (Task 2 test.)
3. A list page that is reached when the run's request budget is already spent must not be fetched. A partial crawl must never mark unseen listings sold out. (Task 5 test.)
4. A JPY Shopify store returning prices like `"27500.00"` or `"27500"` must store `27500`, not `2750000`. (Task 1 test.)
5. A robots.txt that disallows the list path, or a 403 on the first request, must yield zero further requests and a report entry that says why. (Task 4 test.)

---

### Task 1: Currency-aware stores and listings

**Files:**
- Modify: `src/lib/stores.ts` (Store interface and every existing store entry)
- Modify: `src/lib/db/schema.ts` (`listings.currency`)
- Create: `drizzle/0004_listing_currency.sql`, plus the snapshot and journal entry. Generate with `npm run db:generate` if it works offline, otherwise hand-write as `0003` was.
- Modify: `src/lib/money.ts` (add `parsePriceMinor`)
- Modify: `src/lib/crawl/map.ts` (Observation gets `currency`; price via `parsePriceMinor`)
- Modify: `src/lib/crawl/ingest.ts` (persist `currency`)
- Modify: `src/lib/shopify/client.ts` (per-store currency cookie and check)
- Test: `tests/money.test.ts`, `tests/shopify/client.test.ts`, `tests/crawl/map.test.ts`, `tests/crawl/ingest.test.ts`, `tests/db/` (the migration test pattern used for 0003)

**Interfaces:**
- Produces:
  - `type Currency = 'USD' | 'JPY'`
  - `Store` gains `currency: Currency`, `pricesIncludeTax: boolean`, `adapter: 'shopify' | 'page'`, `crawlEnabled: boolean`
  - `parsePriceMinor(text: string, currency: Currency): number`
  - `Observation.currency: Currency`
  - `storeHeaders(store: Pick<Store, 'currency'>)`, which sends `localization=US; cart_currency=USD` for USD and `localization=JP; cart_currency=JPY` for JPY
  - `CurrencyMismatchError` message `Expected <store.currency> but store reported <x>`

- [ ] **Step 1: Write failing tests.**
  - `parsePriceMinor('27500', 'JPY') === 27500`, `parsePriceMinor('27500.00', 'JPY') === 27500`, `parsePriceMinor('27,500', 'JPY') === 27500`.
  - `parsePriceMinor('27500.50', 'JPY')` throws, because yen has no fraction.
  - `parsePriceMinor('129.99', 'USD') === 12999`.
  - The Shopify client sends the JPY cookie for a JPY store and accepts `/cart.js` `currency: 'JPY'`. The same JPY store reporting `USD` throws `CurrencyMismatchError`.
  - `toObservations` for a JPY store yields `currency: 'JPY'` and the yen price.
  - Ingest persists `currency`.
  - The migration test: after `0004`, existing rows read `currency = 'USD'`.
- [ ] **Step 2: Run** `npx vitest run tests/money.test.ts tests/shopify/client.test.ts tests/crawl` and expect FAIL.
- [ ] **Step 3: Implement.**
  - Every existing US store gets `currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true`.
  - Keep `parsePriceToCents` as a thin wrapper, `parsePriceMinor(s, 'USD')`, so other callers stay unchanged.
  - The column is `text('currency').notNull().default('USD')`, with a doc comment on `priceCents` saying "minor unit of `currency`".
- [ ] **Step 4: Run** the full suite with `npx vitest run` and `npx tsc --noEmit`; expect all PASS.
- [ ] **Step 5: Commit** with `feat: per-store currency (USD/JPY) through crawl and listings`.

### Task 2: Japanese text parsing (size, whisky detection, bottle keys)

**Files:**
- Modify: `src/lib/whisky/parse.ts`
- Test: `tests/whisky/` (existing parse tests; add cases)

**Interfaces:**
- Consumes: none.
- Produces: unchanged signatures. `parseSizeMl`, `isWhiskyProduct`, `normalizeText` and `bottleKey` accept Japanese text.

- [ ] **Step 1: Write failing tests.**
  - `parseSizeMl('サントリー 山崎 12年 700㎖') === 700`, `parseSizeMl('容量 700ml') === 700`, `parseSizeMl('ｍｌ表記 ７００ｍｌ') === 700`, `parseSizeMl('1.75L') === 1750`.
  - `isWhiskyProduct({ title: '山崎 12年 シングルモルトウイスキー', productType: '', tags: [] })` is true, and likewise for `ウィスキー`, `ウヰスキー`, `ｳｲｽｷｰ`.
  - `isWhiskyProduct({ title: '梅酒', productType: 'リキュール', tags: [] })` is false.
  - `normalizeText('山崎 12年')` contains `山崎`, and `normalizeText('ラフロイグ')` is non-empty.
  - `bottleKey({ title: '山崎 12年 700ml', variantTitle: null }) !== bottleKey({ title: '白州 12年 700ml', variantTitle: null })`.
  - **Regression:** for every ASCII title already used in the existing parse tests, `bottleKey` output is unchanged. Assert against a recorded list of current outputs. Capture them first by running the current code.
- [ ] **Step 2: Run** `npx vitest run tests/whisky` and expect FAIL.
- [ ] **Step 3: Implement.**
  - NFKC-fold full-width digits and letters before matching sizes.
  - Size regex accepts `ml|mL|㎖`.
  - `WHISKY_RE` adds `ウイスキー|ウィスキー|ウヰスキー|ウイスキ|シングルモルト|ブレンデッド`.
  - `ALWAYS_REJECT_RE` adds `リキュール|梅酒|焼酎|日本酒|グラス|ギフト券`.
  - `normalizeText` keeps `\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}ー` alongside `[a-z0-9]`.
- [ ] **Step 4: Run** `npx vitest run` (full) and expect PASS. The regression list must be identical.
- [ ] **Step 5: Commit** with `feat: Japanese size, whisky and bottle-key parsing`.

### Task 3: Private-store guards

**Files:**
- Modify: `src/app/[lang]/card/[id]/page.tsx` (after the store lookup, `notFound()` when `!store.publicAllowed`)
- Modify: `src/lib/recheck.ts` (return `null` for a listing whose store is not public, before any network call)
- Modify: `src/lib/alerts/match.ts` (`selectAlerts` skips listings of non-public stores)
- Test: `tests/recheck.test.ts`, `tests/recheck-route.test.ts`, `tests/alerts/*.test.ts`, plus a new `tests/private-stores.test.ts`

**Interfaces:**
- Consumes: `Store.publicAllowed` (existing).
- Produces: `isPublicStoreId(storeId: string): boolean` in `src/lib/stores.ts`.

- [ ] **Step 1: Write failing tests.**
  - `recheckListing(db, id)` for a seeded listing whose `storeId` is a non-public store returns `null`, and the injected fetch is called **0** times.
  - The route returns 404.
  - `selectAlerts` with a `new` event for a private-store listing and a matching watch returns `[]`.
  - In `tests/private-stores.test.ts`, with a private store present in `STORES`, assert all of:
    - it is excluded from `storesIn(city)`;
    - it is excluded from the search store list (`searchListings` with seeded private-store rows returns none of them);
    - it is excluded from map stores;
    - it is excluded from `comparisonStores()`;
    - the footer count is unchanged.
- [ ] **Step 2: Run** the tests and expect FAIL where guards are missing. The search, map and compare exclusions may already pass; keep them as regression tests.
- [ ] **Step 3: Implement** the guards listed under Files.
- [ ] **Step 4: Run** `npx vitest run` and expect PASS.
- [ ] **Step 5: Commit** with `fix: private stores unreachable by direct listing id, recheck and alerts`.

### Task 4: Polite fetcher with robots.txt

**Files:**
- Create: `src/lib/pagecrawl/robots.ts`, `src/lib/pagecrawl/fetcher.ts`
- Test: `tests/pagecrawl/robots.test.ts`, `tests/pagecrawl/fetcher.test.ts`

**Interfaces:**
- Consumes: `botUserAgent()` and the `FetchFn` type from `src/lib/shopify/client.ts`.
- Produces:
  - `parseRobots(text: string, userAgent: string): { isAllowed(path: string): boolean; crawlDelayMs: number | null }`. Longest-match Allow/Disallow, matching the group for our product token `WhiskyPortalBot` or `*`, with `*` and `$` wildcards.
  - `class CrawlStopped extends Error { reason: 'robots-unavailable' | 'disallowed' | 'http-403' | 'http-429' | 'http-503' | 'errors' | 'challenge' | 'budget' }`
  - `createPoliteFetcher(opts: { origin: string; fetchFn?: FetchFn; minDelayMs?: number /*3000*/; maxRequests?: number /*300*/; sleep?: (ms: number) => Promise<void>; now?: () => number }): Promise<{ get(path: string): Promise<string>; used(): number }>`.
    - It loads `/robots.txt` first, which counts toward the budget.
    - It throws `CrawlStopped` per the Global Constraints.
    - `get` returns HTML text.
    - It uses `redirect: 'manual'` and rejects cross-host redirects, like the Shopify client.
    - It caps the response size, reusing the `createStoreFetch` byte limit pattern.
    - The effective delay is `max(minDelayMs, crawlDelayMs)`.
    - A challenge is a status of 403/503 with `cf-mitigated`, or a body containing `cf-chl` / `challenge-platform`.

- [ ] **Step 1: Write failing tests.**
  - `parseRobots` handles a group for `*` with `Disallow: /cart` / `Allow: /view/item/`, `Crawl-delay: 10`, a `$` anchor, and an empty file (all allowed).
  - With a fake fetch and fake sleep:
    - robots 404 means requests proceed;
    - robots 500 throws `robots-unavailable` with no further requests;
    - a disallowed path throws `disallowed` with no request made;
    - a third `get` while `maxRequests: 3` (robots counted) throws `budget`;
    - the first 403 throws `http-403`, and later `get`s throw immediately without fetching;
    - three consecutive network errors throw `errors`;
    - a challenge body throws `challenge`;
    - the fake sleep receives `3000` between requests, or `10000` when `Crawl-delay: 10`;
    - the `User-Agent` header equals `botUserAgent()`.
- [ ] **Step 2: Run** `npx vitest run tests/pagecrawl` and expect FAIL.
- [ ] **Step 3: Implement** both files. No third-party robots library.
- [ ] **Step 4: Run** `npx vitest run tests/pagecrawl` and expect PASS.
- [ ] **Step 5: Commit** with `feat: robots-obeying rate-limited page fetcher`.

### Task 5: Page-crawl adapter and the 信濃屋 config

**Files:**
- Create:
  - `src/lib/pagecrawl/jsonld.ts` (extract `Product`/`Offer` from `<script type="application/ld+json">`)
  - `src/lib/pagecrawl/adapter.ts` (`crawlPageStore`)
  - `src/lib/pagecrawl/configs.ts` (per-store configs, starting with `shinanoya`)
  - `tests/fixtures/shinanoya-list.html`, `tests/fixtures/shinanoya-item-instock.html`, `tests/fixtures/shinanoya-item-soldout.html`
- Test: `tests/pagecrawl/jsonld.test.ts`, `tests/pagecrawl/adapter.test.ts`

**Interfaces:**
- Consumes:
  - `createPoliteFetcher` and `CrawlStopped` (Task 4);
  - `Observation`, `Currency` and `parsePriceMinor` (Task 1);
  - `parseSizeMl`, `isWhiskyProduct`, `bottleKey` and `normalizeText` (Task 2).
- Produces:
  - `parseJsonLdOffer(html: string): { name: string | null; sku: string | null; price: string | null; currency: string | null; availability: 'in' | 'out' | null } | null`.
  - `interface PageStoreConfig { listPath(page: number): string; maxListPages: number; productUrlRe: RegExp; productId(url: string): string | null; sizeFrom(html: string): number | null }`, where `sizeFrom` reads the `容量` spec row.
  - `crawlPageStore(store: Store, cfg: PageStoreConfig, opts: { fetcher; dueProductPaths: string[] }): Promise<{ observations: Observation[]; listPaths: string[]; stopped: CrawlStopped['reason'] | null; requests: number }>`.
    - It reads list pages until it has new product paths or a list page yields none.
    - Then it reads product pages from `dueProductPaths` first (oldest checked), then new ones, until the budget ends.
    - Observations carry `currency` from JSON-LD. It must equal `store.currency`, otherwise the product is skipped and counted.
    - `imageUrl: null`, `variantId = productId`, `handle = productId`, `vendor = ''`, `productType = ''`, `url` absolute.

- [ ] **Step 1: Create the trimmed fixtures.**
  - Fetch one `ct755` list page and two product pages (one in stock, one sold out) from shinanoya-tokyo.jp **by hand, once**, with the bot User-Agent and at least 3 s between requests. Check robots.txt first.
  - Keep only the markup the parser needs: product links on the list page; the JSON-LD block, title and spec table on item pages.
  - Remove images, descriptions and everything else. Note the fetch date in a comment at the top of each fixture.
- [ ] **Step 2: Write failing tests.**
  - `parseJsonLdOffer` on the fixtures returns price `'27500'` (or the fixture's actual price), `currency 'JPY'`, `availability 'in'`/`'out'`.
  - It handles `@graph` arrays and an `offers` array, and returns `null` for no JSON-LD.
  - `crawlPageStore` with a fake fetcher serving the fixtures:
    - yields whisky observations with yen prices and `sizeMl 700`;
    - stops reading list pages when the budget is spent;
    - visits due paths first;
    - returns `stopped: 'budget'` while keeping the observations gathered so far;
    - does not fetch a disallowed path;
    - skips a product whose JSON-LD currency is not JPY.
- [ ] **Step 3: Run** `npx vitest run tests/pagecrawl` and expect FAIL.
- [ ] **Step 4: Implement** the files listed above.
  - Rotation bookkeeping lives in the caller (Task 6). The adapter only takes `dueProductPaths`.
  - The config's `listPath(n)` builds `/view/category/ct755?page=<n>`.
  - `productUrlRe` matches `/view/item/\d+`.
- [ ] **Step 5: Run** `npx vitest run` and expect PASS.
- [ ] **Step 6: Commit** with `feat: JSON-LD page-crawl adapter with Shinanoya config`.

### Task 6: Wire Japanese stores into the crawl run

**Files:**
- Modify: `src/lib/stores.ts` (add `nemoto` and `shinanoya`)
- Modify: `src/lib/crawl/run.ts` (dispatch by `store.adapter`; skip `crawlEnabled: false`; page-crawl rotation; never sweep unseen)
- Modify: `scripts/crawl.ts` (no behaviour change beyond the report fields)
- Test: `tests/crawl/run.test.ts`, `tests/stores.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `CrawlReport.stores[].note` adds `stopped: <reason>` / `skipped: crawl disabled (terms)`;
  - `dueProductPaths(db, storeId, limit): Promise<string[]>`, which returns that store's listing URLs' paths ordered by `checkedAt` ascending.

- [ ] **Step 1: Check the terms (manual) and record them in `stores.ts` comments.**
  - Read 信濃屋's `https://shinanoya-tokyo.jp/view/contract` and its 利用規約 (if linked), and 北海道根本商店's terms page.
  - Quote any clause about automated access, scraping or reproduction.
  - Verdicts:
    - only content reproduction is forbidden: crawl is allowed under the facts-only rule, `crawlEnabled: true`;
    - automated access is forbidden: `crawlEnabled: false`.
- [ ] **Step 2: Add the store entries.**
  - Store-side facts come from each store's own pages, and lat/lng from a single Nominatim lookup.
  - `nemoto`:
    - city `sapporo`, address in 札幌市南区 from its site;
    - `currency: 'JPY'`, `pricesIncludeTax: true`, `taxRate: 0`;
    - `adapter: 'shopify'`, `catalogPath: '/collections/whisky/products.json'`;
    - `stockReliability: 'high'`, `onlineOnly: false`, `publicAllowed: false`.
  - `shinanoya`:
    - city `tokyo`, using 銀座店's address and phone, with a comment noting that stock is the NET SHOP's;
    - `currency: 'JPY'`, `pricesIncludeTax: true`, `taxRate: 0`;
    - `adapter: 'page'`, `stockReliability: 'low'`, `onlineOnly: false`, `publicAllowed: false`.
- [ ] **Step 3: Write failing tests.**
  - `runCrawl` with a page store and fake fetch calls `crawlPageStore`.
  - It passes `dueProductPaths` from the DB.
  - It ingests with `markMissingSoldOut: false`.
  - It reports `stopped: budget`.
  - A `crawlEnabled: false` store makes zero requests and reports `skipped`.
  - A JPY Shopify store goes through the existing path with currency JPY.
  - A `stores.test.ts` invariant: every store with `currency: 'JPY'` has `pricesIncludeTax: true`, `taxRate: 0` and `publicAllowed: false`, and its city's status is `'soon'`. This holds while phase 1 is private; the owner lifts it at launch.
- [ ] **Step 4: Implement**, then **Step 5: Run** `npx vitest run` and expect PASS.
- [ ] **Step 6: Live smoke test (manual, polite).**
  - `CRAWL_ONLY=nemoto npm run crawl` against the local PGlite DB.
  - Then `CRAWL_ONLY=shinanoya npm run crawl`. It runs about 15 minutes at 3 s per request and 300 requests.
  - Record the JSON report in the task report. Do not run either one twice.
- [ ] **Step 7: Commit** with `feat: crawl 北海道根本商店 and 信濃屋 privately`.

### Task 7: Quality report CLI and docs

**Files:**
- Create: `scripts/crawl-report.ts`, `src/lib/crawl/quality.ts`
- Modify: `package.json` (add `"crawl:report": "tsx scripts/crawl-report.ts"`), `README.md` (crawl section: Japanese stores, privacy, guardrails), `.github/workflows/crawl.yml` (only if the timeout needs raising; it is 45 min today)
- Test: `tests/crawl/quality.test.ts`

**Interfaces:**
- Consumes: the `listings` table and `STORES`.
- Produces: `qualityReport(db, storeId, opts?: { samples?: number; random?: () => number }): Promise<QualityReport>`.
  - It returns `{ storeId; total; inStock; pctPrice; pctSize; pctAvailability; currencies: Record<string, number>; oldestCheckedAt; newestCheckedAt; samples: {title; price; currency; sizeMl; available; url}[]; warnings: string[] }`.
  - Warnings: JPY price under `1000` or over `5000000`, missing size, and a title failing `isWhiskyProduct`.

- [ ] **Step 1: Write failing tests** for `qualityReport` on seeded rows. They cover the percentages, currency counts, the three warning kinds, and a deterministic sample order with an injected `random`.
- [ ] **Step 2: Run** them and expect FAIL. **Step 3: Implement**, so that `scripts/crawl-report.ts` accepts `--store <id>` or `--all` and prints readable text.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`, and expect all clean. Then run `npm run crawl:report -- --all` on the local DB and paste the output into the task report.
- [ ] **Step 5: Commit** with `feat: crawl quality report for private store review`.
