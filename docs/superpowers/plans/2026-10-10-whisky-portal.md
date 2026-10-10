# Whisky Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A portal that pulls whisky prices and in-stock status from Shopify stores in Brooklyn, NJ and CA. It groups identical bottles for comparison, shows how much cheaper each bottle is than in Korea (Dailyshot), produces a shareable "buy card" link per listing for the user's sister, and sends Telegram alerts for watched bottles.

**Architecture:** One Next.js 16 repo. Pure logic lives in `src/lib/**`: parsing, Shopify client, ingest, alerts and search. Two thin entry points share it: the Next app (pages and API routes) and `scripts/crawl.ts`. A GitHub Actions cron job runs the crawl script every 6 hours. Data lives in Postgres through Drizzle: Supabase in production, and PGlite for tests and for local dev when `DATABASE_URL` is unset.

**Tech Stack:** Next.js 16 (App Router, already scaffolded), React 19, TypeScript, Tailwind 4, shadcn/ui, Drizzle ORM + drizzle-kit, `postgres` (postgres-js), `@electric-sql/pglite`, Vitest, tsx, Leaflet + react-leaflet, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-10-10-whisky-portal-design.md` (Korean). Read it before starting any task.

## Global Constraints

- **Never bypass bot protection.** Only Shopify public endpoints are used: `/products.json`, `/products/<handle>.js` and `/cart.js`. For Dailyshot, only `/m/search/result` and `/m/item/<id>` are used.
- **Korea comparison is a pure price comparison.** No duty-free allowance, customs estimates or bottle limits (user decision). It is never shown on the sister's buy card.
- **Every request to a store sends these headers:** `Cookie: localization=US; cart_currency=USD` and `User-Agent: WhiskyPortalBot/0.1 (+<SITE_URL>)`.
- **Currency check before every write:** a store's data is written only after `/cart.js` returns `currency === "USD"`. Otherwise the store is skipped and nothing is written.
- **Crawl pacing:** at least 1100 ms between requests to the same store, at most 60 pages per store, and every 6 hours.
- **Money is integer cents everywhere.** Parse price strings without float multiplication.
- **Secrets come only from env:** `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` (comma-separated), `SITE_URL`, `ADMIN_KEY`. Commit only `.env.example`.
- **All SQL goes through Drizzle query builders** or parameterized `sql` templates. Never concatenate strings into SQL.
- **Never render store-provided HTML** (`body_html` / `description`).
- **Images are hotlinked** from the store CDN (plain `<img>`), never copied.
- **"Stale" means `checkedAt` is older than 24 hours.** Stale data is always shown with a visible warning.
- **Grouping is conservative.** When unsure, don't group. Stagg, Stagg Jr. and George T. Stagg must never share a group or match each other's watch.
- **UI language:** Korean for UI text. Product and store info stays in original English. Strings go in `src/lib/i18n/ko.ts` so English can be added later.
- **Default search view:** Brooklyn + NJ ("main"). CA appears in a separate "LA 갈 때" section and is never mixed into main sorting.
- **Sorting** within a group: in-stock first, then by tax-included price. Watch target prices are compared pre-tax.
- **Tax rates in store config:** NY `0.08875`, NJ `0.06625`, Studio City CA `0.0975`, South San Francisco CA `0.09875`. Verify the CA rates against CDTFA when filling Task 2.
- **Next 16:** route `params` and `searchParams` are Promises (`await params`).

## Review Focus

1. **A page fetch fails mid-crawl** (HTTP 429/500 on page 7). The whole store is skipped for this run. Its listings must not be marked sold out, which would cause false "sold out" now and false "restock" alerts later. Test lives in Task 7.
2. **Price strings like `"0.29"`, `"64.5"`, `"1,299.97"`** must become exactly 29, 6450 and 129997 cents. Float math would produce off-by-one cents. Test lives in Task 5.
3. **A product with several size variants (750ml and 1.75L)** becomes separate listings with different `bottleKey`s, and the card shows the correct size. Test lives in Task 5.
4. **Live recheck fails** (store timeout, non-USD response, product removed). The card page still renders the stored data with a stale/failed notice and never throws. Tests live in Tasks 9 and 11.
5. **Search input with `%`, `_`, `'` or Korean text** returns results or empty without SQL errors. `%` is treated literally. Test lives in Task 8.

---

## File Structure

```
src/lib/db/schema.ts          Drizzle tables: listings, price_history, watches
src/lib/db/client.ts          Db type, getDb() (postgres-js or PGlite)
src/lib/stores.ts             Store config (static), Region, getStore
src/lib/money.ts              parsePriceToCents, formatUsd, withTaxCents
src/lib/freshness.ts          freshness(checkedAt, now)
src/lib/i18n/ko.ts            Korean UI strings
src/lib/whisky/parse.ts       isWhiskyProduct, parseSizeMl, parseProof, parseBatch, normalizeText, bottleKey
src/lib/shopify/client.ts     fetchCatalog, fetchLiveProduct, CurrencyMismatchError
src/lib/crawl/map.ts          Observation, toObservations
src/lib/crawl/ingest.ts       ChangeEvent, ingestStoreCrawl, recordLiveCheck
src/lib/crawl/run.ts          runCrawl
src/lib/alerts/match.ts       watchMatches, selectAlerts
src/lib/alerts/telegram.ts    formatAlert, sendTelegram
src/lib/listings.ts           getListing, getPriceHistory, storeAvailability
src/lib/search.ts             searchListings, grouping
src/lib/recheck.ts            recheckListing
src/lib/watches.ts            parseWatchForm, suggestExcludes, createWatch, listWatches, deleteWatch
src/lib/admin.ts              isAdmin
src/lib/dailyshot/client.ts   searchDailyshot, fetchDailyshotPrice (Korea prices)
src/lib/fx.ts                 fetchUsdKrw, refreshFx, getLatestFx
src/lib/compare.ts            compareKr
src/lib/krlinks.ts            krLinks CRUD + refreshKrLinks
src/app/link-kr/              admin: link a bottle group to a Dailyshot product
src/app/compare/              savings ranking (US vs Korea bars)
scripts/crawl.ts              CLI entry for runCrawl
src/app/page.tsx              search
src/app/card/[id]/page.tsx    buy card (+ components in src/app/card/[id]/)
src/app/api/recheck/[id]/route.ts
src/app/watchlist/page.tsx    (+ actions.ts)
src/app/map/page.tsx          (+ StoreMap.tsx client)
tests/**                      Vitest, mirrors src/lib; tests/helpers/db.ts
.github/workflows/crawl.yml
```

---

### Task 1: Foundation — tooling, schema, DB access

**Files:**
- Create: `vitest.config.ts`, `drizzle.config.ts`, `.env.example`, `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `tests/helpers/db.ts`, `tests/db/schema.test.ts`, `drizzle/` (generated)
- Modify: `package.json` (scripts), `.gitignore` (add `.data/`, `.env*` except `.env.example`), `next.config.ts` (`serverExternalPackages: ['@electric-sql/pglite']`)

**Interfaces:**
- Produces:
  - Tables:
    - `listings`: `id serial pk`, `storeId text`, `productId text`, `variantId text`, `handle text`, `title text`, `variantTitle text null`, `vendor text`, `productType text`, `imageUrl text null`, `url text`, `priceCents integer`, `available boolean`, `sizeMl integer null`, `proof real null`, `batch text null`, `bottleKey text`, `searchText text`, `firstSeenAt`, `lastSeenAt`, `checkedAt`, `updatedAt` (all `timestamptz`). Unique on `(storeId, variantId)`. Index on `bottleKey`.
    - `priceHistory`: `id serial`, `listingId integer fk → listings.id on delete cascade`, `priceCents integer`, `available boolean`, `recordedAt timestamptz`.
    - `watches`: `id serial`, `label text`, `includeTerms text[]`, `excludeTerms text[] default '{}'`, `batch text null`, `sizeMl integer null`, `maxPriceCents integer null`, `regions text[] default '{brooklyn,nj}'`, `createdAt timestamptz`.
  - Types: `Listing`, `NewListing`, `Watch`, `NewWatch`, `PriceHistoryRow` (`$inferSelect` / `$inferInsert`).
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>`.
  - `getDb(): Promise<Db>` is memoized. If `DATABASE_URL` starts with `postgres`, it uses postgres-js with `{ prepare: false }` (Supabase pooler). Otherwise it uses PGlite at `.data/pglite` and runs migrations from `./drizzle` on first call.
  - `createTestDb(): Promise<Db>` returns in-memory PGlite with migrations applied.
  - npm scripts: `test` (`vitest run`), `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`), `crawl` (`tsx scripts/crawl.ts`).

- [ ] **Step 1:** Run `git init` and make an initial commit of the existing scaffold, README and docs.
- [ ] **Step 2:** Install dependencies.
  - Run `npm i drizzle-orm postgres @electric-sql/pglite`.
  - Run `npm i -D drizzle-kit vitest tsx @vitejs/plugin-react vite-tsconfig-paths`.
  - Create `vitest.config.ts` with the tsconfig-paths plugin (so `@/` resolves) and `environment: 'node'`.
- [ ] **Step 3: Write the failing test** `tests/db/schema.test.ts`:

```ts
it('round-trips a listing and enforces (storeId, variantId) uniqueness', async () => {
  const db = await createTestDb();
  const row = { storeId: 'dewinespot', productId: '1', variantId: '11', handle: 'stagg', title: 'Stagg Kentucky Straight Bourbon Whiskey',
    variantTitle: null, vendor: 'Buffalo Trace', productType: 'Bourbon', imageUrl: null, url: 'https://dewinespot.co/products/stagg',
    priceCents: 17500, available: true, sizeMl: 750, proof: null, batch: null, bottleKey: 'k', searchText: 'stagg kentucky straight bourbon whiskey',
    firstSeenAt: new Date(), lastSeenAt: new Date(), checkedAt: new Date(), updatedAt: new Date() };
  await db.insert(listings).values(row);
  expect((await db.select().from(listings))[0].priceCents).toBe(17500);
  await expect(db.insert(listings).values(row)).rejects.toThrow();
});
```

- [ ] **Step 4:** Run `npx vitest run tests/db`. Expected: FAIL (module not found).
- [ ] **Step 5:** Write `schema.ts`, `client.ts`, `drizzle.config.ts` and `tests/helpers/db.ts`. Run `npm run db:generate` to create `drizzle/0000_*.sql`. Write `.env.example` listing the five env vars with empty values and a comment per var.
- [ ] **Step 6:** Run `npx vitest run tests/db`. Expected: PASS.
- [ ] **Step 7:** Commit with `feat: db schema, test harness`.

---

### Task 2: Store config, money, freshness, strings

**Files:**
- Create: `src/lib/stores.ts`, `src/lib/money.ts`, `src/lib/freshness.ts`, `src/lib/i18n/ko.ts`
- Test: `tests/money.test.ts`, `tests/freshness.test.ts`, `tests/stores.test.ts`

**Interfaces:**
- Produces:
  - `type Region = 'brooklyn' | 'nj' | 'ca'`
  - `interface Store { id: string; name: string; domain: string; region: Region; address: string; lat: number; lng: number; phone: string; taxRate: number; stockReliability: 'high' | 'low'; onlineOnly: boolean; publicAllowed: boolean; note?: string }`
  - `STORES: Store[]`, `getStore(id: string): Store | undefined`, `MAIN_REGIONS: Region[] = ['brooklyn','nj']`, `REGION_LABEL: Record<Region,string>` = `{brooklyn:'브루클린', nj:'뉴저지', ca:'캘리포니아'}`
  - `parsePriceToCents(s: string): number`, `formatUsd(cents: number): string`, `withTaxCents(priceCents: number, taxRate: number): number` (Math.round)
  - `STALE_AFTER_MS = 86_400_000`, `freshness(checkedAt: Date, now: Date): { stale: boolean; label: string }`

- [ ] **Step 1: Write failing tests:**

```ts
expect(parsePriceToCents('64.50')).toBe(6450);
expect(parsePriceToCents('64.5')).toBe(6450);
expect(parsePriceToCents('0.29')).toBe(29);
expect(parsePriceToCents('1,299.97')).toBe(129997);
expect(parsePriceToCents('175')).toBe(17500);
expect(() => parsePriceToCents('abc')).toThrow();
expect(formatUsd(6450)).toBe('$64.50');
expect(formatUsd(129997)).toBe('$1,299.97');
expect(withTaxCents(6499, 0.06625)).toBe(6930);
const now = new Date('2026-10-10T12:00:00Z');
expect(freshness(new Date('2026-10-10T11:59:30Z'), now)).toEqual({ stale: false, label: '방금 확인' });
expect(freshness(new Date('2026-10-10T11:15:00Z'), now)).toEqual({ stale: false, label: '45분 전 확인' });
expect(freshness(new Date('2026-10-10T09:00:00Z'), now)).toEqual({ stale: false, label: '3시간 전 확인' });
expect(freshness(new Date('2026-10-08T12:00:00Z'), now)).toEqual({ stale: true, label: '2일 전 확인' });
// stores.test.ts
expect(new Set(STORES.map(s => s.id)).size).toBe(STORES.length);
for (const s of STORES) { expect(s.domain).not.toMatch(/^https?:/); expect(s.lat).not.toBe(0); expect(s.phone).not.toBe(''); }
expect(getStore('liquorcave')?.stockReliability).toBe('low');
expect(getStore('coolvines')?.stockReliability).toBe('low');
expect(getStore('bittersandbottles')?.onlineOnly).toBe(true);
```

- [ ] **Step 2:** Run `npx vitest run tests/money.test.ts tests/freshness.test.ts tests/stores.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules.
  - `parsePriceToCents` strips commas, splits on `.`, pads or truncates the fraction to 2 digits and uses integer math.
  - Fill `STORES` with the 9 stores below. Take address and phone from each store's own site (contact page or footer, or `/meta.json`). Geocode lat/lng once with Nominatim by hand (`https://nominatim.openstreetmap.org/search?format=json&q=<address>`) and hardcode the results.
  - Liquor Cave has several locations. Use the one its contact page lists first, and set `note: '여러 지점 있음 — 방문 전 전화 확인'`.
  - All stores get `publicAllowed: true`.

| id | name | domain | region | taxRate | stockReliability | onlineOnly |
|---|---|---|---|---|---|---|
| dewinespot | De Wine Spot | dewinespot.co | brooklyn | 0.08875 | high | false |
| theliquorstore | The Liquor Store | theliquorstore.com | brooklyn | 0.08875 | high | false |
| grainvine | Grain & Vine | grainvine.com | brooklyn | 0.08875 | high | false |
| slopecellars | Slope Cellars | slopecellars.com | brooklyn | 0.08875 | high | false |
| liquorcave | Liquor Cave | liquorcave.com | nj | 0.06625 | low | false |
| winechateau | Wine Chateau | winechateau.com | nj | 0.06625 | high | false |
| coolvines | CoolVines | coolvines.com | nj | 0.06625 | low | false |
| flask | Flask Fine Wine & Whisky | flaskfinewines.com | ca | 0.0975 | high | false |
| bittersandbottles | Bitters & Bottles | bittersandbottles.com | ca | 0.09875 | high | true |

- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: store config, money, freshness`.

---

### Task 3: Whisky text parsing and bottle keys

**Files:**
- Create: `src/lib/whisky/parse.ts`
- Test: `tests/whisky/parse.test.ts`

**Interfaces:**
- Produces:
  - `isWhiskyProduct(p: { title: string; productType: string; tags: string[] }): boolean`
  - `parseSizeMl(text: string): number | null`
  - `parseProof(text: string): number | null`
  - `parseBatch(text: string): string | null`
  - `normalizeText(text: string): string` lowercases, NFKD-folds, deletes `'` and `’`, turns `&` into `and`, turns every other non-alphanumeric into a space, collapses whitespace and trims.
  - `bottleKey(p: { title: string; variantTitle: string | null }): string`

- [ ] **Step 1: Write failing tests** (titles are real ones from the stores):

```ts
expect(isWhiskyProduct({ title: 'Stagg Kentucky Straight Bourbon Whiskey', productType: 'Bourbon', tags: [] })).toBe(true);
expect(isWhiskyProduct({ title: 'Nikka From the Barrel', productType: 'Spirits - Japanese Whisky', tags: [] })).toBe(true);
expect(isWhiskyProduct({ title: 'Jack Daniels Single Barrel Rye 94 Proof', productType: 'WHISKY', tags: [] })).toBe(true);
expect(isWhiskyProduct({ title: "Jack Daniel's & Coca-Cola Zero Sugar Variety 6-Pack 355ml", productType: 'Cans & Cocktails', tags: [] })).toBe(false);
expect(isWhiskyProduct({ title: "Jack Daniel's Honey Liqueur", productType: 'Liqueur', tags: [] })).toBe(false);
expect(isWhiskyProduct({ title: 'Expresiones Del Corazon George T. Stagg Anejo Tequila', productType: 'Tequila', tags: [] })).toBe(false);
expect(isWhiskyProduct({ title: "Stag's Leap Artemis Cabernet Sauvignon 2022 750ml", productType: 'Wine', tags: [] })).toBe(false);
expect(isWhiskyProduct({ title: 'Barrell Seagrass Cask Finished Rye Whiskey', productType: 'Whiskey', tags: [] })).toBe(true);

expect(parseSizeMl('Buffalo Trace Single Oak 375ml / Half-Bottle')).toBe(375);
expect(parseSizeMl('Jack Daniels Bonded Tennessee Whiskey 1 Liter')).toBe(1000);
expect(parseSizeMl('Sinatra Select 90 Proof 1L')).toBe(1000);
expect(parseSizeMl('Titos 1.75L')).toBe(1750);
expect(parseSizeMl('1 / 750 ml')).toBe(750);
expect(parseSizeMl('Stagg Kentucky Straight Bourbon Whiskey')).toBeNull();

expect(parseProof('Stagg Jr Barrel Proof Bourbon Batch 9 131.9 Proof')).toBe(131.9);
expect(parseProof("Jack Daniel's Single Barrel Proof 125")).toBe(125);
expect(parseProof("Jack Daniel's Whiskey Single Barrel 94º")).toBe(94);
expect(parseProof('Doctor Bird Private Barrel Cask Strength (119 Proof)')).toBe(119);
expect(parseProof("Jack Daniel's Barrel Proof Single Barrel Tennessee Whiskey")).toBeNull();

expect(parseBatch('Stagg Jr Barrel Proof Bourbon Batch 9 131.9 Proof')).toBe('9');
expect(parseBatch('Jack Daniels 12Yr Batch # 2')).toBe('2');
expect(parseBatch('Jack Daniel\'s 10 Year Tennessee Whiskey Batch 05 700ml')).toBe('5');
expect(parseBatch('Stagg Batch 24A')).toBe('24A');
expect(parseBatch('Elijah Craig Barrel Proof B524 Bourbon')).toBe('B524');
expect(parseBatch('Stagg Kentucky Straight Bourbon Whiskey')).toBeNull();

const k = (title: string, variantTitle: string | null = null) => bottleKey({ title, variantTitle });
expect(k("Jack Daniel's Barrel Proof Single Barrel Tennessee Whiskey"))
  .toBe(k("Jack Daniel's Single Barrel Barrel Proof Tennessee Whiskey"));
expect(k('Stagg Kentucky Straight Bourbon Whiskey')).not.toBe(k('Stagg Jr Kentucky Straight Bourbon Whiskey'));
expect(k('Stagg Kentucky Straight Bourbon Whiskey')).not.toBe(k('George T. Stagg Kentucky Straight Bourbon Whiskey'));
expect(k("Jack Daniel's Barrel Proof Single Barrel Tennessee Whiskey"))
  .not.toBe(k("Jack Daniel's Barrel Proof Single Barrel Tennessee Rye Whiskey"));
expect(k('Stagg Jr Barrel Proof Bourbon Batch 9 131.9 Proof')).not.toBe(k('Stagg Jr Barrel Proof Bourbon Batch 14 130.2 Proof'));
expect(k('Jack Daniels Bonded Tennessee Whiskey', '700ml')).not.toBe(k('Jack Daniels Bonded Tennessee Whiskey', '1 Liter'));
```

- [ ] **Step 2:** Run `npx vitest run tests/whisky`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - **isWhiskyProduct:**
    - Matches when the combined text (title + productType + tags) matches `/whisk(e)?y|bourbon|scotch|\brye\b|single malt/i`.
    - It is rejected when the title or productType matches `/liqueur|cocktail|\bcans?\b|\d+-pack|tequila|mezcal|\bwine\b|cabernet|sauvignon|chardonnay|gift card|glass(es|ware)?\b|bitters/i`.
  - **parseSizeMl:** handles `\d+(\.\d+)?\s*ml` and `(\d+(\.\d+)?)\s*(l|liter|litre)\b`, converting liters to ml.
  - **parseProof:** matches `(\d{2,3}(\.\d)?)\s*proof`, `proof\s*(\d{2,3}(\.\d)?)` and `(\d{2,3})\s*º`, with values limited to 60–160.
  - **parseBatch:** matches `batch\s*#?\s*([0-9]+[a-z]?)` (leading zeros stripped, letters uppercased) or `\b([abc]\d{3})\b` (uppercased).
  - **bottleKey algorithm:**

```
text = title + ' ' + (variantTitle ?? '')
size = parseSizeMl(text); proof = parseProof(text); batch = parseBatch(text)
stripped = text with size, proof-with-number, '#N'/'batch N' and B### matches removed
tokens = normalizeText(stripped).split(' ')
         minus STOPWORDS = {whiskey, whisky, the, kentucky, tennessee, straight, default, title, year, years, old, yr}
         (keep 'jr', 'george', 't', 'rye', 'barrel', 'proof', 'single' — they distinguish bottles)
key = [...new Set(tokens)].sort().join(' ') + `|p${proof ?? ''}|b${batch ?? ''}|s${size ?? ''}`
```

- [ ] **Step 4:** Run `npx vitest run tests/whisky`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: whisky title parsing and bottle keys`.

---

### Task 4: Shopify client

**Files:**
- Create: `src/lib/shopify/client.ts` (with the `ShopifyProduct` / `ShopifyVariant` types inline)
- Test: `tests/shopify/client.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 2).
- Produces:
  - `type FetchFn = typeof fetch`
  - `storeHeaders(): Record<string,string>` returns the cookie and User-Agent from Global Constraints. `SITE_URL` is read from env, defaulting to `http://localhost:3000`.
  - `class CurrencyMismatchError extends Error { currency: string }`
  - `interface ShopifyVariant { id: number; title: string; price: string; available: boolean }`
  - `interface ShopifyProduct { id: number; title: string; handle: string; vendor: string; product_type: string; tags: string[] | string; images: { src: string }[]; variants: ShopifyVariant[] }`
  - `fetchCatalog(store: Store, opts?: { fetchFn?: FetchFn; delayMs?: number; maxPages?: number }): Promise<ShopifyProduct[]>`
    - Defaults are 1100 ms and 60 pages.
    - It first GETs `/cart.js` and throws `CurrencyMismatchError` if `currency !== 'USD'`.
    - It then pages `/products.json?limit=250&page=N` until a page returns `products: []`.
    - Any non-2xx response throws an `Error` that includes the status. There is no partial result.
  - `interface LiveVariant { id: number; priceCents: number; available: boolean }`
  - `fetchLiveProduct(store: Store, handle: string, opts?: { fetchFn?: FetchFn; timeoutMs?: number }): Promise<LiveVariant[] | null>`
    - The timeout defaults to 5000 ms.
    - It fetches `/cart.js` and `/products/<handle>.js` in parallel. A currency mismatch throws.
    - A 404 on the product returns `null` (product removed).
    - `.js` prices are already integer cents.

- [ ] **Step 1: Write failing tests** with a fake `fetchFn` that routes by URL and records calls:

```ts
it('pages until empty and sends USD cookie', async () => { /* pages 1,2 have products, 3 empty */
  const products = await fetchCatalog(store, { fetchFn: fake, delayMs: 0 });
  expect(products).toHaveLength(3);
  expect(fake.calls.every(c => c.headers.Cookie === 'localization=US; cart_currency=USD')).toBe(true);
  expect(fake.calls.map(c => c.url)).toContain('https://dewinespot.co/products.json?limit=250&page=3');
});
it('throws CurrencyMismatchError when cart.js reports KRW', async () => {
  await expect(fetchCatalog(store, { fetchFn: krwFake, delayMs: 0 })).rejects.toBeInstanceOf(CurrencyMismatchError);
});
it('throws (no partial result) when page 2 returns 429', async () => {
  await expect(fetchCatalog(store, { fetchFn: failingPage2, delayMs: 0 })).rejects.toThrow(/429/);
});
it('stops at maxPages', async () => { expect(await fetchCatalog(store, { fetchFn: endless, delayMs: 0, maxPages: 2 })).toHaveLength(2); });
it('live product returns cents and null on 404', async () => {
  expect(await fetchLiveProduct(store, 'stagg', { fetchFn: liveFake })).toEqual([{ id: 11, priceCents: 17500, available: true }]);
  expect(await fetchLiveProduct(store, 'gone', { fetchFn: liveFake })).toBeNull();
});
```

- [ ] **Step 2:** Run `npx vitest run tests/shopify`. Expected: FAIL.
- [ ] **Step 3:** Implement using `AbortSignal.timeout(timeoutMs)` for live calls and `setTimeout` promises for the delay.
- [ ] **Step 4:** Run `npx vitest run tests/shopify`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: shopify client with currency guard`.

---

### Task 5: Mapping and ingest

**Files:**
- Create: `src/lib/crawl/map.ts`, `src/lib/crawl/ingest.ts`
- Test: `tests/crawl/map.test.ts`, `tests/crawl/ingest.test.ts`

**Interfaces:**
- Consumes: `ShopifyProduct` (Task 4), the parse functions (Task 3), `parsePriceToCents` (Task 2), `Db` and `listings` / `priceHistory` (Task 1).
- Produces:
  - `interface Observation { storeId; productId: string; variantId: string; handle; title; variantTitle: string | null; vendor; productType; imageUrl: string | null; url; priceCents: number; available: boolean; sizeMl: number | null; proof: number | null; batch: string | null; bottleKey: string; searchText: string }`
  - `toObservations(store: Store, p: ShopifyProduct): Observation[]`
    - Returns one observation per variant and `[]` for non-whisky.
    - Variants with `sizeMl !== null && sizeMl < 200` are dropped.
    - `variantTitle` is `null` when it equals `'Default Title'`.
    - `tags` arrives as either an array or a comma string.
    - `url = https://<domain>/products/<handle>`.
    - `searchText = normalizeText(title + ' ' + (variantTitle ?? '') + ' ' + vendor)`.
  - `type ChangeKind = 'new' | 'restock' | 'sold_out' | 'price_drop' | 'price_change'`
  - `interface ChangeEvent { kind: ChangeKind; listingId: number; prevPriceCents: number | null; priceCents: number; available: boolean }`
  - `ingestStoreCrawl(db: Db, storeId: string, obs: Observation[], now: Date): Promise<ChangeEvent[]>`
  - `recordLiveCheck(db: Db, listing: Listing, live: { priceCents: number; available: boolean }, now: Date): Promise<ChangeEvent | null>`

- [ ] **Step 1: Write failing map tests:**

```ts
const p = { id: 1, title: 'Jack Daniels Bonded Tennessee Whiskey', handle: 'jd-bonded', vendor: 'Jack Daniel', product_type: 'Whiskey', tags: 'bourbon, usa',
  images: [{ src: 'https://cdn.shopify.com/a.jpg' }],
  variants: [{ id: 11, title: '700ml', price: '34.99', available: true }, { id: 12, title: '1 Liter', price: '38.87', available: false },
             { id: 13, title: '50ml', price: '2.99', available: true }] };
const obs = toObservations(flask, p);
expect(obs.map(o => [o.variantId, o.sizeMl, o.priceCents])).toEqual([['11', 700, 3499], ['12', 1000, 3887]]);
expect(obs[0].bottleKey).not.toBe(obs[1].bottleKey);
expect(obs[0].url).toBe('https://flaskfinewines.com/products/jd-bonded');
expect(toObservations(flask, { ...p, variants: [{ id: 14, title: 'Default Title', price: '0.29', available: true }] })[0])
  .toMatchObject({ variantTitle: null, priceCents: 29 });
```

- [ ] **Step 2: Write failing ingest tests** on `createTestDb()` with `t0 < t1 < t2`:

```ts
it('first crawl of a store inserts silently', async () => {
  expect(await ingestStoreCrawl(db, 'flask', [a(6499, true), b(3499, false)], t0)).toEqual([]);
  expect(await db.select().from(priceHistory)).toHaveLength(2);
});
it('emits new / restock / price_drop / sold_out on later crawls', async () => {
  await ingestStoreCrawl(db, 'flask', [a(6499, true), b(3499, false)], t0);
  const ev = await ingestStoreCrawl(db, 'flask', [a(5999, true), b(3499, true), c(17500, true)], t1);
  expect(ev.map(e => e.kind).sort()).toEqual(['new', 'price_drop', 'restock']);
  const ev2 = await ingestStoreCrawl(db, 'flask', [b(3499, true), c(17500, true)], t2); // a disappeared
  expect(ev2).toEqual([expect.objectContaining({ kind: 'sold_out', prevPriceCents: 5999 })]);
});
it('unchanged crawl writes no history but bumps checkedAt', async () => { /* history count unchanged, checkedAt === t1 */ });
it('duplicate variant in one crawl does not throw (last wins)', async () => { /* [a(6499,true), a(6000,true)] */ });
it('recordLiveCheck writes history only when changed', async () => { /* returns null when same; returns price_change when higher */ });
it('new variant that is out of stock emits nothing', async () => { /* no event for unavailable new */ });
```

- [ ] **Step 3:** Run `npx vitest run tests/crawl`. Expected: FAIL.
- [ ] **Step 4:** Implement.
  - **Upsert:** `onConflictDoUpdate` on `(storeId, variantId)`, after loading the store's existing rows into a Map keyed by variantId.
  - **Event rules:**
    - `new` is emitted only when the listing is available and the store already had rows.
    - `restock` covers unavailable → available.
    - `sold_out` covers available → unavailable, including listings missing from `obs`.
    - `price_drop` is emitted when the price fell and the listing is available. Any other price change is `price_change`.
  - Each event also inserts a `priceHistory` row. `checkedAt` and `lastSeenAt` become `now` for every observed row.
  - Wrap everything in `db.transaction`.
- [ ] **Step 5:** Run `npx vitest run tests/crawl`. Expected: PASS.
- [ ] **Step 6:** Commit with `feat: observation mapping and ingest with change events`.

---

### Task 6: Watch matching and Telegram

**Files:**
- Create: `src/lib/alerts/match.ts`, `src/lib/alerts/telegram.ts`
- Test: `tests/alerts/match.test.ts`, `tests/alerts/telegram.test.ts`

**Interfaces:**
- Consumes: `Watch`, `Listing` (Task 1), `Store` / `getStore` (Task 2), `ChangeEvent` (Task 5), `normalizeText` (Task 3), `formatUsd` / `withTaxCents` (Task 2).
- Produces:
  - `watchMatches(w: Watch, l: Listing, store: Store): boolean`
    - Every `normalizeText(term)` in `includeTerms` must appear as a whole-word phrase in `' ' + l.searchText + ' '`.
    - No `excludeTerms` phrase may appear.
    - `w.batch` and `w.sizeMl`, when set, must equal the listing's values.
    - `store.region` must be in `w.regions`.
  - `interface AlertCandidate { watch: Watch; listing: Listing; event: ChangeEvent }`
  - `selectAlerts(watches: Watch[], events: ChangeEvent[], listingsById: Map<number, Listing>): AlertCandidate[]`
    - `new` and `restock` alert when the watch matches and (`maxPriceCents` is null or `priceCents <= maxPriceCents`).
    - `price_drop` alerts only when `maxPriceCents` is set and `prevPriceCents > maxPriceCents >= priceCents`.
    - Other kinds never alert.
  - `formatAlert(c: AlertCandidate, store: Store, siteUrl: string): string` returns Telegram HTML. All dynamic text goes through `escapeHtml`.
  - `sendTelegram(token: string, chatIds: string[], text: string, fetchFn?: FetchFn): Promise<void>` POSTs `https://api.telegram.org/bot<token>/sendMessage` with `{ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: false }`. It throws if any response is not ok.

- [ ] **Step 1: Write failing tests:**

```ts
const stagg = watch({ includeTerms: ['stagg'], excludeTerms: ['jr', 'junior', 'george'], regions: ['brooklyn', 'nj'] });
expect(watchMatches(stagg, listing('Stagg Kentucky Straight Bourbon Whiskey Batch 24A'), dewinespot)).toBe(true);
expect(watchMatches(stagg, listing('Stagg Jr Barrel Proof Bourbon Batch 9'), dewinespot)).toBe(false);
expect(watchMatches(stagg, listing('BTAC George T. Stagg Kentucky Straight Bourbon'), dewinespot)).toBe(false);
expect(watchMatches(stagg, listing('Stagg Kentucky Straight Bourbon Whiskey'), flask)).toBe(false); // CA not in regions
expect(watchMatches(watch({ includeTerms: ['stag'] }), listing('Stagg Bourbon'), dewinespot)).toBe(false); // whole word
expect(watchMatches({ ...stagg, batch: '24A' }, listing('Stagg Batch 23C', { batch: '23C' }), dewinespot)).toBe(false);

const w = { ...stagg, maxPriceCents: 20000 };
expect(selectAlerts([w], [ev('restock', 17500)], byId)).toHaveLength(1);
expect(selectAlerts([w], [ev('restock', 64900)], byId)).toHaveLength(0);
expect(selectAlerts([w], [ev('price_drop', 19900, 21000)], byId)).toHaveLength(1);
expect(selectAlerts([w], [ev('price_drop', 18000, 19000)], byId)).toHaveLength(0); // already under target
expect(selectAlerts([stagg], [ev('price_drop', 18000, 19000)], byId)).toHaveLength(0); // no target → no price alerts
expect(selectAlerts([stagg], [ev('sold_out', 17500)], byId)).toHaveLength(0);

const text = formatAlert(cand({ title: 'A <b> & "Stagg"' }), dewinespot, 'https://x.app');
expect(text).toContain('A &lt;b&gt; &amp; "Stagg"');
expect(text).toContain('https://x.app/card/');
expect(text).toContain('$175.00');
```

- [ ] **Step 2:** Run `npx vitest run tests/alerts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - The alert text layout is the kind label, then the title, price and tax-included price, store name and region, and the card link.
  - Kind labels: `restock` → `🔔 재입고`, `new` → `🆕 새로 입고`, `price_drop` → `💸 목표가 이하`.
  - Add a `⚠️ 재고 표시 부정확 — 방문 전 전화 확인` line for low-reliability stores.
- [ ] **Step 4:** Run `npx vitest run tests/alerts`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: watch matching and telegram alerts`.

---

### Task 7: Crawl runner, CLI and GitHub Actions

**Files:**
- Create: `src/lib/crawl/run.ts`, `scripts/crawl.ts`, `.github/workflows/crawl.yml`
- Test: `tests/crawl/run.test.ts`

**Interfaces:**
- Consumes: `fetchCatalog` (Task 4), `toObservations` / `ingestStoreCrawl` (Task 5), `selectAlerts` / `formatAlert` (Task 6), `watches` table.
- Produces:
  - `interface CrawlReport { stores: { storeId: string; ok: boolean; error?: string; observations: number; events: number }[]; alertsSent: number }`
  - `runCrawl(opts: { db: Db; stores: Store[]; fetchFn?: FetchFn; delayMs?: number; now?: () => Date; notify: (text: string) => Promise<void>; siteUrl: string }): Promise<CrawlReport>`
    - Stores run sequentially. A store whose `fetchCatalog` throws is reported as `ok:false` and its rows are untouched.
    - Alerts are selected across all stores' events and sent one `notify` per candidate.
    - A failed `notify` is logged and counted out, and does not abort the run.
  - `scripts/crawl.ts` calls `getDb()` and `runCrawl` with `STORES`.
    - `notify` uses `sendTelegram`, or `console.log` when `TELEGRAM_BOT_TOKEN` is unset.
    - It prints the report as JSON and exits with code 1 only if every store failed.

- [ ] **Step 1: Write failing tests** (PGlite plus a fake fetch serving two stores):

```ts
it('skips a failing store without touching its rows (no false sold_out)', async () => {
  await runCrawl({ ...base, fetchFn: bothOk });                 // seeds both stores
  const before = await db.select().from(listings).where(eq(listings.storeId, 'flask'));
  const r = await runCrawl({ ...base, fetchFn: flaskPage2Returns429 });
  expect(r.stores.find(s => s.storeId === 'flask')).toMatchObject({ ok: false });
  expect(await db.select().from(listings).where(eq(listings.storeId, 'flask'))).toEqual(before);
});
it('sends one notify per alert after a restock', async () => {
  await db.insert(watches).values({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: ['jr','junior','george'], regions: ['brooklyn','nj'] });
  await runCrawl({ ...base, fetchFn: staggSoldOut });
  const sent: string[] = [];
  const r = await runCrawl({ ...base, fetchFn: staggInStock, notify: async t => { sent.push(t); } });
  expect(r.alertsSent).toBe(1); expect(sent[0]).toContain('재입고');
});
it('KRW store is reported failed and writes nothing', async () => { /* cart.js currency KRW → ok:false, 0 rows for that store */ });
```

- [ ] **Step 2:** Run `npx vitest run tests/crawl/run.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `run.ts` and `scripts/crawl.ts`. Then write `crawl.yml`:
  - Triggers: `schedule: cron '17 */6 * * *'` and `workflow_dispatch`.
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, npm cache), `npm ci`, `npm run db:migrate`, `npm run crawl`.
  - Env comes from secrets: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `SITE_URL`.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 5: Real smoke run.** With `DATABASE_URL` unset (local PGlite), run `npm run crawl` while temporarily limiting `STORES` via env `CRAWL_ONLY=bittersandbottles`. Implement that filter in `scripts/crawl.ts`.
  - Expected: a JSON report with `ok:true` and `observations > 20`.
  - Then run `npm run crawl` for all stores. Expected: most stores `ok:true`. Write down any failures in the commit message.
- [ ] **Step 6:** Commit with `feat: crawl runner, CLI, scheduled workflow`.

---

### Task 8: Search and grouping

**Files:**
- Create: `src/lib/search.ts`, `src/lib/listings.ts`
- Test: `tests/search.test.ts`, `tests/listings.test.ts`

**Interfaces:**
- Consumes: `Db` / `listings` / `priceHistory`, `STORES` / `getStore` / `MAIN_REGIONS`, `withTaxCents`, `normalizeText`.
- Produces:
  - `interface SearchParams { q: string; region?: Region; storeId?: string; inStockOnly?: boolean; minCents?: number; maxCents?: number }`
  - `interface ListingRow extends Listing { store: Store; taxIncludedCents: number }`
  - `interface BottleGroup { bottleKey: string; displayTitle: string; sizeMl: number | null; proof: number | null; batch: string | null; imageUrl: string | null; rows: ListingRow[]; bestAvailableCents: number | null }`
  - `searchListings(db: Db, p: SearchParams): Promise<{ main: BottleGroup[]; ca: BottleGroup[] }>`
    - Normalized query tokens each become an `ilike(listings.searchText, '%' + escapeLike(tok) + '%')`, ANDed together. `escapeLike` escapes `\`, `%` and `_`.
    - An empty q with no `storeId` returns empty sections.
    - Only stores with `publicAllowed` are included. `region` narrows the stores. Results are limited to 500 rows.
    - Rows are grouped by `bottleKey` and the groups are split into `main` (brooklyn/nj) and `ca`. A `bottleKey` present in both appears in both sections.
    - Row order: available first, then `taxIncludedCents` ascending.
    - Group order: groups with `bestAvailableCents` first, ascending, then the rest by title.
    - `displayTitle` is the title of the first row.
  - `getListing(db: Db, id: number): Promise<Listing | null>`
  - `getPriceHistory(db: Db, listingId: number, limit = 20): Promise<PriceHistoryRow[]>` returns newest first.
  - `storeAvailability(db: Db, bottleKey?: string): Promise<Map<string, number>>` maps a storeId to its available whisky count, or to the count of matching available listings when `bottleKey` is given.

- [ ] **Step 1: Write failing tests:** seed listings across dewinespot, liquorcave and flask.

```ts
const r = await searchListings(db, { q: "jack daniel's barrel proof" });
expect(r.main[0].rows.map(x => x.storeId)).toEqual(['liquorcave', 'dewinespot']);   // in-stock, cheaper tax-incl first
expect(r.ca.length).toBeGreaterThan(0);
expect(r.main.flatMap(g => g.rows).every(x => x.store.region !== 'ca')).toBe(true);
expect((await searchListings(db, { q: 'stagg', inStockOnly: true })).main.flatMap(g => g.rows).every(x => x.available)).toBe(true);
expect(await searchListings(db, { q: '' })).toEqual({ main: [], ca: [] });
expect((await searchListings(db, { q: '', storeId: 'flask' })).ca.length).toBeGreaterThan(0);
await expect(searchListings(db, { q: "100% o'brien _ 위스키" })).resolves.toEqual({ main: [], ca: [] });
// group with an in-stock row sorts before a group that is all sold out
```

- [ ] **Step 2:** Run `npx vitest run tests/search.test.ts tests/listings.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: search with bottle grouping and region sections`.

---

### Task 9: Live recheck service and API

**Files:**
- Create: `src/lib/recheck.ts`, `src/app/api/recheck/[id]/route.ts`
- Test: `tests/recheck.test.ts`

**Interfaces:**
- Consumes: `getListing` (Task 8), `fetchLiveProduct` (Task 4), `recordLiveCheck` (Task 5), `getStore`.
- Produces:
  - `MIN_RECHECK_INTERVAL_MS = 60_000`
  - `type RecheckStatus = 'updated' | 'cached' | 'failed' | 'gone'`
  - `recheckListing(db: Db, id: number, opts?: { fetchFn?: FetchFn; now?: Date }): Promise<{ listing: Listing; status: RecheckStatus } | null>`
    - Returns `null` if the listing doesn't exist.
    - Returns `cached` without any fetch if `checkedAt` is within 60 seconds.
    - Returns `gone` when the product 404s or the variant is missing. The listing is recorded unavailable via `recordLiveCheck`.
    - Returns `failed` on any thrown error (timeout, non-USD), leaving the stored listing unchanged.
    - Otherwise returns `updated`, with `checkedAt` set to `now` even when nothing changed.
    - The fetch only goes to `getStore(listing.storeId).domain`. Never use a URL from user input.
  - `POST /api/recheck/[id]` validates that `id` matches `/^\d+$/` (400 otherwise). It returns 404 if the listing is not found, and otherwise `{ status, priceCents, available, checkedAt }` as JSON.

- [ ] **Step 1: Write failing tests:** `updated` (price changed and history added), `cached` (fetch not called), `failed` (fetch throws, listing unchanged), `gone` (null live result, `available` false) and `null` for an unknown id.
- [ ] **Step 2:** Run `npx vitest run tests/recheck.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the service and the route handler (`export async function POST(_req, { params }: { params: Promise<{ id: string }> })`).
- [ ] **Step 4:** Run `npx vitest run tests/recheck.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: live recheck service and API`.

---

### Task 10: UI shell and search page

**Files:**
- Create: `src/lib/i18n/ko.ts` (extend it), `src/components/ListingRow.tsx`, `src/components/CopyLinkButton.tsx` (client), `src/components/FreshnessBadge.tsx`, `src/components/StockBadge.tsx`
- Modify: `src/app/layout.tsx` (`lang="ko"`, header nav: 검색 / 지도 / 관심 목록), `src/app/page.tsx`
- shadcn: `npx shadcn@latest init`, then `npx shadcn@latest add button input badge card select checkbox`

**Interfaces:**
- Consumes: `searchListings` (Task 8), `freshness`, `formatUsd`, `REGION_LABEL`.
- Produces: `CopyLinkButton({ path }: { path: string })` copies `window.location.origin + path`, shows "복사됨" for 2 seconds, and is reused by Task 11. `FreshnessBadge({ checkedAt })` shows the stale state in amber. `StockBadge({ available, reliability })`.

- [ ] **Step 1: Build the search page.** It is a server component with a GET form whose fields are `q`, `region`, `inStock`, `min` and `max` (dollars → cents).
  - Results render as "메인 (브루클린·뉴저지)" groups, then a separate "LA 갈 때 (캘리포니아)" heading with the CA groups.
  - Group header: image, displayTitle, size, proof and batch shown as prominent chips.
  - Each row shows:
    - store name with region label
    - price and "세금 포함 약 $X"
    - `StockBadge` (low reliability shows "재고 표시 부정확")
    - `FreshnessBadge`
    - "온라인 주문 전용" chip if `onlineOnly`
    - buttons: `CopyLinkButton path=/card/<id>` "카드 링크 복사", "관심 등록" → `/watchlist?q=<q>`, and "지도" → `/map?bottle=<encodeURIComponent(bottleKey)>`
  - The empty state explains to "위스키 이름을 검색하세요".
- [ ] **Step 2: Verify.**
  - Run `npx vitest run`. Expected: PASS.
  - Run `npm run lint` and `npm run build`. Expected: both succeed.
  - Run the crawl from Task 7 locally, then `npm run dev`, and open `/?q=stagg`. Expected: groups appear, CA is in its own section, and badges render.
  - Take a screenshot with the `run` skill if available.
- [ ] **Step 3:** Commit with `feat: search UI`.

---

### Task 11: Buy card page

**Files:**
- Create: `src/app/card/[id]/page.tsx`, `src/app/card/[id]/RecheckButton.tsx` (client), `src/app/card/[id]/ClerkMode.tsx` (client), `src/lib/card.ts`
- Test: `tests/card.test.ts`

**Interfaces:**
- Consumes: `recheckListing` (Task 9), `getPriceHistory` (Task 8), `getStore`, `freshness`, `formatUsd`, `withTaxCents`, `CopyLinkButton`.
- Produces:
  - `cardMeta(listing: Listing, store: Store): { title: string; description: string; image: string | null }` is a pure function for OG tags. The `description` starts with the check date in `M/D 기준 $X.XX` form (the date in America/New_York), then the stock status in Korean, then the store name and address.
  - `mapsUrl(address: string): string` returns `https://www.google.com/maps/dir/?api=1&destination=<encodeURIComponent(address)>`.

- [ ] **Step 1: Write failing tests:**

```ts
expect(cardMeta(listing({ priceCents: 17500, available: true, checkedAt: new Date('2026-10-10T15:00:00Z') }), dewinespot).description)
  .toMatch(/^10\/10 기준 \$175\.00 · 재고 있음 · De Wine Spot/);
expect(mapsUrl('428 Lorimer St, Brooklyn, NY')).toBe('https://www.google.com/maps/dir/?api=1&destination=428%20Lorimer%20St%2C%20Brooklyn%2C%20NY');
```

- [ ] **Step 2:** Run `npx vitest run tests/card.test.ts`. Expected: FAIL. Then implement `src/lib/card.ts`. Expected: PASS.
- [ ] **Step 3: Build the page.**
  - `generateMetadata` uses stored data (no live fetch) and sets `openGraph.images` to the CDN image.
  - The page body awaits `recheckListing(db, id)` and treats `null` as `notFound()`. A `failed` status shows "실시간 확인 실패 — 마지막 저장 정보" along with `FreshnessBadge`.
  - Layout (mobile-first, large type):
    - photo
    - exact title with size, proof and batch chips
    - price, plus tax-included price
    - stock status
    - the low-reliability warning box when applicable: "이 매장은 재고 표시가 부정확해요. 가기 전에 전화로 확인하세요"
    - `RecheckButton`, which POSTs `/api/recheck/<id>`, then calls `router.refresh()` and shows the status
    - store name and address, the "길찾기" button (`mapsUrl`), the "전화하기" button (`tel:`) and the "매장 페이지에서 보기" link (`listing.url`, `rel="noopener noreferrer"`)
    - the note "온라인 재고와 매장 진열 재고는 다를 수 있어요"
    - "점원에게 보여주기" opens `ClerkMode`: a fullscreen overlay with the photo, title in very large text and "Do you have this bottle?", with a tap to close
    - a collapsed "가격 이력" list from `getPriceHistory`
- [ ] **Step 4: Verify.**
  - Run `npm run build`.
  - On the dev server, open `/card/<id>` for a real listing. Click 다시 확인. Expected: the freshness changes to "방금 확인".
  - Run `curl -s localhost:3000/card/<id> | grep og:` and expect the `og:title`, `og:description` and `og:image` tags.
  - Open `/card/999999`. Expected: 404.
- [ ] **Step 5:** Commit with `feat: buy card page with live recheck`.

---

### Task 12: Watchlist (admin-key protected)

**Files:**
- Create: `src/lib/admin.ts`, `src/lib/watches.ts`, `src/app/watchlist/page.tsx`, `src/app/watchlist/actions.ts`
- Test: `tests/admin.test.ts`, `tests/watches.test.ts`

**Interfaces:**
- Consumes: `Db` / `watches`, `normalizeText`, `MAIN_REGIONS`.
- Produces:
  - `isAdmin(cookieValue: string | undefined, adminKey: string | undefined): boolean` is false when `adminKey` is unset or empty, and otherwise compares with `crypto.timingSafeEqual` on equal-length buffers.
  - `LINE_SIBLINGS: Record<string, string[]> = { stagg: ['jr', 'junior', 'george'] }`
  - `suggestExcludes(includeTerms: string[]): string[]`
  - `interface WatchInput { label: string; includeTerms: string[]; excludeTerms: string[]; batch: string | null; sizeMl: number | null; maxPriceCents: number | null; regions: Region[] }`
  - `parseWatchForm(fd: FormData): WatchInput | { error: string }`
    - `includeTerms` / `excludeTerms` are comma-separated and normalized, and blanks are dropped. `includeTerms` must be non-empty.
    - `maxPrice` is in dollars and goes through `parsePriceToCents`.
    - `regions` come from checkboxes, defaulting to `['brooklyn','nj']`. Values outside `Region` are rejected.
  - `createWatch(db, input)`, `listWatches(db)` and `deleteWatch(db, id)`.

- [ ] **Step 1: Write failing tests:**

```ts
expect(isAdmin('k', undefined)).toBe(false); expect(isAdmin('k', '')).toBe(false);
expect(isAdmin('wrong', 'secret')).toBe(false); expect(isAdmin('secret', 'secret')).toBe(true);
expect(suggestExcludes(['Stagg'])).toEqual(['jr', 'junior', 'george']);
expect(suggestExcludes(['george t stagg'])).toEqual([]);   // only exact line key triggers
const fd = new FormData(); fd.set('label', 'Stagg'); fd.set('include', 'Stagg'); fd.set('exclude', 'jr, junior,george'); fd.set('maxPrice', '200');
expect(parseWatchForm(fd)).toEqual({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: ['jr', 'junior', 'george'], batch: null, sizeMl: null, maxPriceCents: 20000, regions: ['brooklyn', 'nj'] });
fd.set('include', ' , '); expect(parseWatchForm(fd)).toHaveProperty('error');
fd.set('include', 'stagg'); fd.append('regions', 'tx'); expect(parseWatchForm(fd)).toHaveProperty('error');
```

- [ ] **Step 2:** Run `npx vitest run tests/admin.test.ts tests/watches.test.ts`. Expected: FAIL. Implement until PASS.
- [ ] **Step 3: Build the page and actions.**
  - Without a valid `admin_key` cookie, the page shows only a key form. Its server action sets an httpOnly, `sameSite:'lax'`, `secure` (in production) cookie for 180 days if `isAdmin` passes.
  - With the cookie, the page shows:
    - a list of watches with label, terms, target and regions, plus a delete button
    - a create form prefilled from `?q=`. `include` is the q, and `exclude` is prefilled from `suggestExcludes`, with a hint "Stagg Jr·George T. Stagg는 제외됨 — 필요하면 수정하세요".
    - optional batch, size (ml) and target price ($, pre-tax, labeled "세전"), plus region checkboxes with CA unchecked by default
  - Every server action re-checks `isAdmin` first, then calls `revalidatePath('/watchlist')`.
- [ ] **Step 4: Verify.**
  - Run `npm run build`.
  - With `ADMIN_KEY=test` in `.env.local`, log in, create a Stagg watch and delete it.
  - Run a crawl with a seeded sold-out → in-stock transition (or `CRAWL_ONLY` plus a manual SQL update setting `available=false` on a matching listing). Expected: an alert in console output, or in Telegram if a token is set.
- [ ] **Step 5:** Commit with `feat: watchlist with admin key`.

---

### Task 13: Store map

**Files:**
- Create: `src/app/map/page.tsx`, `src/app/map/StoreMap.tsx` (client)
- Modify: `src/app/page.tsx`, so that a `store` searchParam lists that store's whiskies (searchListings `storeId`, Task 8)

**Interfaces:**
- Consumes: `STORES`, `storeAvailability` (Task 8), `REGION_LABEL`.

- [ ] **Step 1:** Run `npm i leaflet react-leaflet` and `npm i -D @types/leaflet`.
- [ ] **Step 2: Build the map.**
  - `page.tsx` (server) reads `?bottle=`, calls `storeAvailability(db, bottle)` and passes plain store data with counts to `StoreMap`.
  - `StoreMap` is loaded with `dynamic(() => import('./StoreMap'), { ssr: false })` from a small client wrapper. It imports `leaflet/dist/leaflet.css`.
  - The map uses OSM tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` with the required attribution). It is centered on NYC (40.70, -73.95, zoom 11) with a "LA 보기" button that flies to (34.14, -118.40).
  - Use `L.divIcon` markers to avoid the broken default icon paths.
  - With `?bottle`, stores without the bottle are greyed out.
  - The popup shows the name, address, "위스키 N개 재고", a link `/?store=<id>`, and a "온라인 주문 전용" note for Bitters & Bottles.
- [ ] **Step 3: Verify.**
  - Run `npm run build`.
  - Open `/map` on the dev server. Expected: 7 East Coast markers, and "LA 보기" shows Flask. Bitters & Bottles is off-screen near SF, which is acceptable.
  - Clicking a marker opens a popup whose link lists that store's whiskies.
  - Open `/map?bottle=<key>` from a search result. Expected: the non-carrying stores are greyed out.
- [ ] **Step 4:** Commit with `feat: store map`.

---

### Task 14: Dailyshot client, FX, comparison math

**Files:**
- Modify: `src/lib/db/schema.ts`. Add the tables below, then run `npm run db:generate` to create a new migration.
- Create: `src/lib/dailyshot/client.ts`, `src/lib/fx.ts`, `src/lib/compare.ts`, `src/lib/krlinks.ts`
- Test: `tests/dailyshot/client.test.ts` (fixtures in `tests/fixtures/dailyshot-search.html`, `tests/fixtures/dailyshot-item.html`, trimmed from real pages), `tests/fx.test.ts`, `tests/compare.test.ts`, `tests/krlinks.test.ts`

**Interfaces:**
- Produces:
  - Table `krLinks`: `id serial`, `bottleKey text unique`, `dailyshotProductId text`, `nameKo text`, `nameEn text null`, `imageUrl text null`, `lowPriceKrw integer`, `highPriceKrw integer null`, `offerCount integer null`, `checkedAt timestamptz`.
  - Table `fxRates`: `date text pk` (YYYY-MM-DD, UTC), `usdKrw real`, `fetchedAt timestamptz`.
  - Types: `KrLink`, `FxRate`.
  - `dailyshotUrl(productId: string): string` returns `https://dailyshot.co/m/item/<id>`.
  - `interface DailyshotCandidate { productId: string; nameKo: string; nameEn: string | null; priceKrw: number; imageUrl: string | null }`
  - `searchDailyshot(q: string, opts?: { fetchFn?: FetchFn }): Promise<DailyshotCandidate[]>`
    - GETs `/m/search/result?q=<encodeURIComponent(q)>` and parses `__NEXT_DATA__`.
    - Walks the JSON for objects with numeric `top_product_id`, numeric `price` and string `name`. It maps them to `productId: String(top_product_id)`, `nameKo: name`, `nameEn: en_name || null`, `priceKrw: price` and `imageUrl: thumbnail_image`.
    - Results are de-duplicated by `productId`, keeping the lowest price. At most 20 are returned.
  - `interface DailyshotPrice { lowPriceKrw: number; highPriceKrw: number | null; offerCount: number | null }`
  - `fetchDailyshotPrice(productId: string, opts?: { fetchFn?: FetchFn }): Promise<DailyshotPrice | null>`
    - Parses the `application/ld+json` block whose `@type` is `Product`. It throws if `offers.priceCurrency !== 'KRW'`.
    - It returns `null` on 404 or when `offers` is missing (discontinued).
    - Dailyshot requests send `User-Agent: WhiskyPortalBot/0.1 (+<SITE_URL>)`.
  - `fetchUsdKrw(fetchFn?: FetchFn): Promise<number>` calls `https://open.er-api.com/v6/latest/USD` and returns `rates.KRW`. It throws unless `result === 'success'` and `500 < KRW < 3000`.
  - `refreshFx(db: Db, now: Date, fetchFn?): Promise<number>` returns today's stored rate if present, and otherwise fetches and inserts it.
  - `getLatestFx(db: Db): Promise<FxRate | null>`
  - `type Verdict = 'big' | 'small' | 'worse'`
  - `compareKr(usTaxIncludedCents: number, usdKrw: number, krLowKrw: number): { usKrw: number; diffKrw: number; savingsPct: number; verdict: Verdict }`
    - `usKrw = Math.round(cents * usdKrw / 100)`
    - `diffKrw = krLowKrw - usKrw`
    - `savingsPct` is rounded to an integer.
    - The verdict is `big` when ≥15, `small` when 0–14, and `worse` when below 0.
  - `upsertKrLink(db, input: { bottleKey; productId; nameKo; nameEn; imageUrl; price: DailyshotPrice }, now)`, `deleteKrLink(db, bottleKey)`, `getKrLinks(db, bottleKeys: string[]): Promise<Map<string, KrLink>>`, `listKrLinks(db)`
  - `refreshKrLinks(db: Db, opts: { fetchFn?; delayMs?: number; now: Date }): Promise<{ ok: number; failed: number }>`
    - Paced at 1100 ms. On failure it keeps the old values and `checkedAt`.
    - On `null` (discontinued) it leaves the row and counts it as failed. The UI shows staleness through `checkedAt`.

- [ ] **Step 1: Save fixtures.** Save a real search page for `q=stagg` and a real item page as fixtures, trimmed to the `__NEXT_DATA__` / ld+json scripts.
- [ ] **Step 2: Write failing tests:**

```ts
const c = await searchDailyshot('stagg', { fetchFn: fixtureFetch });
expect(c).toContainEqual(expect.objectContaining({ nameKo: '스태그 배치 24C', nameEn: 'Stagg Batch 24C', priceKrw: 649000 }));
expect(new Set(c.map(x => x.productId)).size).toBe(c.length);
expect(await fetchDailyshotPrice('20583', { fetchFn: fixtureFetch })).toEqual({ lowPriceKrw: 57000, highPriceKrw: 62000, offerCount: 5 });
expect(await fetchDailyshotPrice('404', { fetchFn: notFound })).toBeNull();
await expect(fetchUsdKrw(fakeFx({ result: 'success', rates: { KRW: 5 } }))).rejects.toThrow();
expect(compareKr(19045, 1380, 649000)).toEqual({ usKrw: 262821, diffKrw: 386179, savingsPct: 60, verdict: 'big' });
expect(compareKr(6930, 1380, 100000).verdict).toBe('small');   // 95,634 vs 100,000 → 4%
expect(compareKr(6930, 1380, 90000).verdict).toBe('worse');
// refreshFx: second call same UTC day does not fetch; refreshKrLinks: failing fetch keeps old lowPriceKrw and checkedAt
```

- [ ] **Step 3:** Run `npx vitest run tests/dailyshot tests/fx.test.ts tests/compare.test.ts tests/krlinks.test.ts`. Expected: FAIL. Implement until all PASS.
- [ ] **Step 4:** Wire the new refreshes into `runCrawl` (Task 7).
  - After the stores finish, call `refreshFx` then `refreshKrLinks`.
  - Errors there are logged into `CrawlReport` as `fx: 'ok' | string` and `krLinks: { ok, failed }`, and never fail the run.
  - Extend the Task 7 test so a throwing fx fetch leaves the store results `ok:true`.
- [ ] **Step 5:** Run `npx vitest run`. Expected: PASS.
- [ ] **Step 6:** Commit with `feat: dailyshot prices, fx, korea comparison math`.

---

### Task 15: Korea comparison UI — linking, search chip, savings ranking

**Files:**
- Create:
  - `src/app/link-kr/page.tsx` and `src/app/link-kr/actions.ts`, both admin-only
  - `src/components/KrCompareChip.tsx`
  - `src/app/compare/page.tsx` and `src/app/compare/SavingsChart.tsx`
- Modify: `src/lib/search.ts`. Add `kr?: { link: KrLink; compare: ReturnType<typeof compareKr> | null }` to `BottleGroup`. It is filled via `getKrLinks` and `getLatestFx`, comparing against the group's cheapest in-stock `taxIncludedCents`, and `compare` is null when there's no in-stock row or no fx. Also modify `src/app/page.tsx`, `src/app/layout.tsx` (nav item "한국 대비"), `tests/search.test.ts`.

**Interfaces:**
- Consumes: Task 14 functions, `isAdmin` (Task 12), `searchListings` (Task 8).

- [ ] **Step 1: Write the failing test** in `tests/search.test.ts`. Seed a krLink for the Stagg bottleKey plus an fx row of 1380, then `expect(group.kr?.compare?.verdict).toBe('big')`. A group with no in-stock rows gets `kr.compare === null`. Run it to see FAIL, implement the `search.ts` change, and run it to see PASS.
- [ ] **Step 2: Build `KrCompareChip`.**
  - It shows "한국 최저 649,000원 · 미국 약 262,821원 · 386,179원(60%) 이득".
  - Background follows the verdict: green for `big` ("사 올 만함"), grey for `small` ("비슷함"), red for `worse` ("한국이 더 쌈").
  - It also shows the Dailyshot link and the Dailyshot `checkedAt` freshness.
  - Render it in each group header on `/`, in both the main and CA sections, each using its own section's best price.
  - Admins see "한국 가격 연결" / "연결 변경" → `/link-kr?bottle=<key>&q=<group displayTitle stripped to brand words>`.
- [ ] **Step 3: Build `/link-kr`.**
  - The page is admin-gated like `/watchlist`.
  - It has a query box so the user can type Korean, e.g. "스태그". The results come from `searchDailyshot`, shown as image, Korean name, English name and price.
  - The US bottle summary (title, size, proof, batch) is shown at the top for side-by-side checking.
  - The "이 상품으로 연결" server action re-checks `isAdmin`, calls `fetchDailyshotPrice` and `upsertKrLink`, then redirects back to `/?q=`.
  - A "연결 해제" action calls `deleteKrLink`.
  - `bottleKey` arrives from the query string, so it is validated against an existing `listings.bottleKey`.
- [ ] **Step 4: Build `/compare`.** Load the `dataviz` skill first and follow its color and mark rules.
  - The page is public and read-only.
  - It ranks every linked bottle that has an in-stock US row, sorted by `savingsPct` descending.
  - `SavingsChart` draws one row per bottle, as hand-built SVG/HTML bars with no chart library: two horizontal bars on a shared KRW scale for US KRW vs Korea lowest, with the diff and % labelled and the verdict colors.
  - Each row links to `/?q=` for the bottle and shows the store and region of the cheapest US row.
  - A footer shows the fx rate used and its date.
- [ ] **Step 5: Verify.**
  - Run `npx vitest run`, `npm run lint` and `npm run build`. Expected: success.
  - On the dev server, after a crawl: search "stagg", link the De Wine Spot Stagg group to the Dailyshot "스태그" product via `/link-kr` and confirm the chip appears.
  - Run `CRAWL_ONLY=dewinespot npm run crawl` and confirm the report shows `krLinks.ok >= 1`.
  - Open `/compare` and confirm the bars render.
- [ ] **Step 6:** Commit with `feat: korea price comparison UI`.

---

### Task 16: Deployment docs and final verification

**Files:**
- Modify: `README.md`. Rewrite it to match what was built: stack, stores, local dev (`npm run crawl` then `npm run dev`, PGlite needs no DB) and the env vars.
- Create: `docs/SETUP.md`

- [ ] **Step 1:** Write `docs/SETUP.md` in Korean as step-by-step instructions for the user. These are user actions; the agent must not perform them.
  1. Create a Supabase project and copy the **Transaction pooler** connection string (port 6543) into `DATABASE_URL`.
  2. Create a Telegram bot via @BotFather to get `TELEGRAM_BOT_TOKEN`. Get the chat id by messaging the bot and opening `https://api.telegram.org/bot<token>/getUpdates`, which gives `TELEGRAM_CHAT_IDS`.
  3. Push the code to a GitHub repo and add the 4 secrets. Run the "crawl" workflow manually once.
  4. Import the repo into Vercel and set `DATABASE_URL`, `SITE_URL` (the Vercel URL) and `ADMIN_KEY` (a long random string).
- [ ] **Step 2: Full verification.**
  - Run `npx vitest run`. Expected: all PASS.
  - Run `npm run lint` and `npm run build`. Expected: success.
  - Do a fresh local `npm run crawl` and record which stores were `ok:true`.
  - Manual pass on the dev server:
    - search "stagg": CA is separate, and Stagg / Stagg Jr. / George T. Stagg are in different groups
    - search "jack daniel barrel proof": NJ/BK first
    - the card page works, including recheck and clerk mode
    - a watchlist round-trip works
    - the map works
    - the Korea chip appears on a linked group, and the `/compare` bars render
  - Report the results.
- [ ] **Step 3:** Commit with `docs: setup guide and README`.
