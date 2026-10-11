# Whisky Index Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the portal as Whisky Index. The work covers:
- a dark black-and-gold theme;
- 합니다체 copy;
- a country → city model in which the selected city comes first and other same-country cities follow, collapsed;
- Korean/English routing under `/ko` and `/en`.

**Architecture:**
- **City model.** `src/lib/geo.ts` becomes the single source of countries and cities. Stores carry `city` instead of `region`.
- **Search.** Search returns ordered per-city sections. The Korea comparison uses the US-wide lowest price.
- **Routing.** All pages move under `src/app/[lang]/`, and `src/proxy.ts` redirects unprefixed URLs.
- **Dictionaries.** Server components read the dictionary through `next/root-params`, and client components get it from a context provider.
- **Theme.** The dark theme is a token swap in `globals.css`, plus a new brand mark, a city dropdown, and a home hero.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`, `next/root-params`), React 19, Tailwind CSS 4, Drizzle + Postgres (PGlite in tests), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-whisky-index-rebrand-design.md`

## Global Constraints

- **Read the Next docs first.** Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (`AGENTS.md`). The i18n guide is `01-app/02-guides/internationalization.md`. Root params are covered in `01-app/03-api-reference/04-functions/next-root-params.md`.
- **Name:** `Whisky Index` (Korean: `위스키 인덱스`).
- **Accent:** gold `#d4af6a` only, used for links, labels, the search underline, and selected states. Never use it to fill large areas.
- **Base palette** (starting values; contrast must hold):

  | Role | Value |
  |---|---|
  | page background | `#0a0a0a` |
  | raised surface | `#141414`–`#161616` |
  | text | `#f2efe8` |
  | secondary text | `#a39c90` |
  | faint text | `#6e685e` |
  | lines | `#1f1c18` / `#2c2720` |

- **Contrast:** WCAG AA, with body text at ≥ 4.5:1. This applies to all text, price, stock-status and verdict colours on the dark background.
- **No kitsch:** no gold gradients, wood-grain textures, decorative script fonts, or glossy effects.
- **Copy tone:** 합니다체 throughout the Korean UI, refined and natural, never bureaucratic. No exclamation marks.
  - Keep the number and unit formats: `$129.00`, `세금 포함 약 …`, `세전`, `N곳`, `N종`, `N시간 전 확인`.
  - Never translate store or product names.
  - The English lines in ClerkMode stay as they are.
- **No string literals in components.** Every UI string lives in the dictionaries.
- **No raw colours in components.** Every colour is a token in `src/app/globals.css`.
- **City IDs and statuses:**
  - `brooklyn`, `nj` and `la` (US) are live.
  - `tokyo`, `osaka` and `sapporo` (JP) and `taipei` (TW) are `soon`.
  - The default city is `brooklyn`.
- **Locales:** `ko` (default) and `en`.
  - URLs without a locale redirect to the `wi_lang` cookie's locale, or to `ko`.
  - Never redirect based on Accept-Language.
- **Cookies:** `wi_city` (live cities only) and `wi_lang`. Both are 1 year, `path=/`, `SameSite=Lax`.
- **Validation:** every new URL or form input (`city`, `lang`) is checked against a whitelist.
- **Existing behaviour that must keep working:**
  - Existing tests pass, adapted where the region model changes.
  - `npm run crawl` still works.
  - Existing watches fire for the same stores after migration.

## Review Focus

1. **Old shared links.**
   - `/card/123`, `/?q=stagg&region=ca` and `/map?bottle=…` must land on the same view under `/ko/...`.
   - `?region=ca` means city `la`.
   - Old `?main=` and `?ca=` params must not break the page.
   - Tests: Task 7 (proxy) and Task 3 (`resolveCity` legacy mapping).
2. **A coming-soon city in the URL or the picker.**
   - `?city=tokyo` shows the opening-soon notice with a way back, never an empty result list or an error.
   - It is never written to `wi_city`.
   - Tests: Task 3 (`resolveCity` ignores a `soon` cookie; search returns no sections) and Task 9 (picker does not persist a `soon` city).
3. **Garbage `city` or `lang` values.**
   - `?city=<script>`, `?city=CA` and `/xx/map` resolve to the default or a 404. They never throw and are never reflected unescaped.
   - Tests: Task 3 and Task 7.
4. **Store-scoped list (`?store=<id>`) for a store outside the selected city.**
   - The store's own city becomes the primary section, so the list is not hidden in a collapsed section.
   - Test: Task 3.
5. **Korea comparison when the cheapest US price is in a non-selected city.**
   - The chip and the ranking use the US-wide lowest price and name that city.
   - Test: Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/geo.ts` (new) | Countries, cities, statuses, store↔city helpers, `resolveCity` |
| `src/lib/stores.ts` | `Store.city: CityId` replaces `region`. Drop `Region`, `MAIN_REGIONS`, `REGION_LABEL` |
| `src/lib/search.ts` | `searchListings` → ordered `CitySection[]`; KR attach uses the national best |
| `src/lib/search-form.ts` / `search-view.ts` | Parse `city` (not `region`); new section show params; `searchHref` with locale |
| `src/lib/krcompare.ts` | US-wide lowest price for the ranking and the bottle summary |
| `src/lib/map-view.ts`, `src/app/[lang]/map/*` | Per-city map views |
| `src/lib/watch-form.ts`, `src/lib/alerts/match.ts`, `schema.ts`, `drizzle/0003_*` | `watches.cities` column and migration |
| `src/lib/i18n/{ko,en,index,server,client}.ts(x)` | Dictionaries, `Locale`, `getDict()` (server), `DictProvider`/`useDict()` (client) |
| `src/proxy.ts` (new) | Locale redirect |
| `src/components/LocaleLink.tsx` (new) | `next/link` wrapper that prefixes `/{lang}` |
| `src/app/[lang]/**` | All pages and layouts moved here; `src/app/api/**` stays put |
| `src/app/globals.css`, `src/components/Wordmark.tsx`, `src/app/icon.svg` | Dark tokens, fonts, brand |
| `src/components/CitySelect.tsx`, `LangSwitch.tsx`, `ComingSoonNotice.tsx` (new) | Header controls and the soon state |
| `docs/design-system.md` | Rewritten for the new direction |

---

### Task 1: City model replaces regions

**Files:**
- Create: `src/lib/geo.ts`
- Test: `tests/geo.test.ts`
- Modify: `src/lib/stores.ts` (`Store.region` → `Store.city`; `'ca'` stores → `'la'`, which includes the online-only Bitters & Bottles)
- Modify: every `Region`/`region`/`REGION_LABEL`/`MAIN_REGIONS`/`RegionChip` user found by `grep -rn "Region\|\.region\|MAIN_REGIONS" src scripts tests`
- Rename: `RegionChip` → `CityChip` in `src/components/StoreLine.tsx`

**Interfaces:**
- Produces:
  - `type CountryId = 'us' | 'jp' | 'tw'`
  - `type CityId = 'brooklyn' | 'nj' | 'la' | 'tokyo' | 'osaka' | 'sapporo' | 'taipei'`
  - `interface City { id: CityId; country: CountryId; status: 'live' | 'soon'; nameEn: string; subEn: string }`. `nameEn`/`subEn` are the Latin labels: `Brooklyn`/`New York`, `New Jersey`/`New Jersey`, `Los Angeles`/`California`, `Tokyo`/`Japan`, `Osaka`/`Japan`, `Sapporo`/`Japan`, `Taipei`/`Taiwan`.
  - `COUNTRIES: readonly CountryId[]` = `['us','jp','tw']`
  - `CITIES: readonly City[]`, in the order above
  - `DEFAULT_CITY: CityId = 'brooklyn'`
  - `getCity(id: string): City | undefined`
  - `isCityId(v: unknown): v is CityId`
  - `citiesOf(country: CountryId): City[]`
  - `liveCities(): City[]`
  - `storesIn(city: CityId): Store[]` (public stores only)
- Dictionary keys (in `ko.ts` for now): `ko.city: Record<CityId, string>` and `ko.country: Record<CountryId, string>`.
  - Cities: 브루클린, 뉴저지, 로스앤젤레스, 도쿄, 오사카, 삿포로, 타이베이.
  - Countries: 미국, 일본, 대만.
  - These replace `ko.region`.

Until Task 3 lands, behaviour stays the same:
- Search and other callers that used `MAIN_REGIONS` use `['brooklyn', 'nj']` via a temporary local const in `search.ts`/`krcompare.ts`/`map-view.ts`.
- Tasks 3–5 delete those consts.

- [ ] **Step 1: Write `tests/geo.test.ts`**

```ts
it('lists US cities live and Asian cities soon, in order', () => {
  expect(citiesOf('us').map((c) => [c.id, c.status])).toEqual([['brooklyn','live'],['nj','live'],['la','live']]);
  expect(citiesOf('jp').map((c) => c.id)).toEqual(['tokyo','osaka','sapporo']);
  expect(citiesOf('tw').map((c) => c.status)).toEqual(['soon']);
});
it('validates ids', () => {
  expect(isCityId('la')).toBe(true);
  for (const bad of ['ca', 'LA', '', '<script>', undefined]) expect(isCityId(bad)).toBe(false);
});
it('assigns every public store to a live city; LA holds the former CA stores', () => {
  expect(storesIn('la').map((s) => s.id)).toContain('bittersandbottles');
  for (const s of STORES) expect(getCity(s.city)?.status).toBe('live');
  expect(storesIn('tokyo')).toEqual([]);
});
```

- [ ] **Step 2:** Run `npx vitest run tests/geo.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `geo.ts`, migrate `stores.ts` and all call sites, and rename the chip. Update existing test fixtures that set `region:` so they set `city:`.
- [ ] **Step 4:** Run `npx vitest run` and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 5:** Commit: `refactor: replace store regions with a country/city model`.

---

### Task 2: Watches store cities (DB migration)

**Files:**
- Modify: `src/lib/db/schema.ts` (`watches.regions` → `cities: text('cities').array().notNull().default(['brooklyn','nj'])`)
- Create: `drizzle/0003_*.sql`. Generate it with `npm run db:generate`, make sure it is a column **rename** (not drop/add), then append `UPDATE "watches" SET "cities" = array_replace("cities", 'ca', 'la');`
- Modify: `src/lib/watch-form.ts`, `src/lib/watches.ts`, `src/lib/alerts/match.ts`, `src/app/watchlist/{page,WatchForm,WatchList,actions}.tsx?`
- Test: `tests/alerts/match.test.ts`, `tests/watches.test.ts`, `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `CityId`, `liveCities()`, `isCityId` (Task 1).
- Produces: `Watch.cities: string[]`, and `ParsedWatch.cities: CityId[]`, which replaces `regions`.
  - The form field name is `cities`; the "submitted" marker is `citiesSubmitted`.
  - Watch-form options are `liveCities()` only, so soon cities can never be picked.
  - The parser rejects any value outside the live city IDs with the existing `regionInvalid` error, renamed `cityInvalid`.

- [ ] **Step 1: Write the failing tests**
  - `match.test.ts`: `it('matches an LA store for a watch migrated from ca')`, which uses a watch with `cities: ['la']` and a `bittersandbottles` listing, and expects `true`.
  - `schema.test.ts` (it runs migrations on PGlite): `it('migration 0003 renames regions to cities and maps ca to la')`. The test inserts a row with `regions = {brooklyn,ca}` after migrating to 0002, applies 0003, and expects `cities = ['brooklyn','la']`. If the helper can't stop at 0002, run the 0003 SQL by hand against a table seeded through 0002's SQL files.
  - `watches.test.ts`: `it('rejects a soon city')`, where form `cities=tokyo` returns `{ field: 'cities' }`.
- [ ] **Step 2:** Run `npx vitest run tests/alerts tests/watches.test.ts tests/db`. Expected: FAIL.
- [ ] **Step 3:** Implement the schema change, the migration, the parser and the UI rename.
- [ ] **Step 4:** Run the full `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: watches select cities; migrate ca to la`.

---

### Task 3: City-first search

**Files:**
- Modify: `src/lib/geo.ts` (add `resolveCity`)
- Modify: `src/lib/search.ts`, `src/lib/search-form.ts`, `src/lib/search-view.ts`
- Modify: `src/app/page.tsx`, which becomes `src/app/[lang]/page.tsx` in Task 7. Implement here first, at the current path.
- Modify: `src/components/search/SearchForm.tsx` (remove the region select)
- Test: `tests/geo.test.ts`, `tests/search.test.ts`, `tests/search-form.test.ts`, `tests/search-view.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `resolveCity(input: { city?: string; region?: string; cookie?: string; storeCity?: CityId }): { city: City; soon: boolean }`. Precedence:
    1. `storeCity`;
    2. a valid `city` param, any status;
    3. legacy `region` mapped by `{ brooklyn: 'brooklyn', nj: 'nj', ca: 'la' }`;
    4. a `cookie` naming a **live** city;
    5. `DEFAULT_CITY`.

    `soon` is `city.status === 'soon'`.
  - `SearchParams`: remove `region`; add `city: CityId` (required).
  - `parseSearchForm(raw)` no longer reads `region`. The page calls `resolveCity` and sets `params.city`.
  - `interface CitySection { city: CityId; groups: BottleGroup[]; bestAvailableCents: number | null; storeCount: number }`. `storeCount` counts distinct stores with at least one row.
  - `searchListings(db, p, opts): Promise<{ sections: CitySection[] }>`. It returns `p.city` first, then the other **live** cities of the same country in `CITIES` order.
    - Sections with zero groups are kept for the selected city and dropped for the others.
    - A `soon` city returns `{ sections: [] }`.
    - Each city is queried separately, the same way each region was before.
  - `BottleGroup.kr` gains `baseCity: CityId` (implemented in Task 4).
  - `searchHref` keys: `['q','store','city','size','min','max','inStock','show','others']`.
    - `show` caps the selected section.
    - `others` caps each other-city section.
    - `region`, `main` and `ca` are dropped from generated URLs.
  - `activeFilterCount` no longer counts region.
- Page rendering, following the spec's results order:
  - The selected section header shows `YOUR CITY` and the city name.
  - Below it comes an `ELSEWHERE IN <COUNTRY>` group.
  - Each other city is a `<details>` whose `<summary>` shows the city name, `N곳에서 판매`, and `최저 $X` (from `bestAvailableCents`).
  - A `<details>` is open when the selected section is empty or `others` is present.
  - The page reads the city cookie with `cookies()`.
  - A soon city renders `ComingSoonNotice`, created here as `src/components/ComingSoonNotice.tsx` with props `{ city: City; backCity: City }`. It is plain markup here and styled in Task 9. It has a link back to `backCity`, which is the cookie's live city or Brooklyn.
  - Add the new keys to `ko.ts` in this task, in any tone: `ko.search.yourCity`, `ko.search.elsewhere`, `ko.search.otherCitySummary` and `ko.soon`. Task 6 rewrites them.

- [ ] **Step 1: Write the failing tests**
  - `geo.test.ts`, which covers `resolveCity`:
    - `resolveCity({ region: 'ca' })` resolves to `la`.
    - `resolveCity({ city: 'tokyo', cookie: 'nj' })` resolves to `tokyo` with `soon` true.
    - `resolveCity({ cookie: 'tokyo' })` resolves to `brooklyn`.
    - `resolveCity({ city: '<x>', cookie: 'xx' })` resolves to `brooklyn`.
    - `resolveCity({ city: 'nj', storeCity: 'la' })` resolves to `la`.
  - `search.test.ts`, seeded with listings of one bottle in brooklyn, nj and la:
    - `it('puts the selected city first, then same-country cities')`: with `city: 'nj'`, the section ids are `['nj','brooklyn','la']`.
    - `it('drops empty other-city sections but keeps the selected one')`.
    - `it('reports each section best in-stock price and store count')`.
    - `it('returns no sections for a soon city')`.
  - `search-view.test.ts`: `searchHref({ q: 'x', region: 'ca', main: '40' })` equals `/?q=x`. A test that `activeFilterCount` ignores the city.
  - `search-form.test.ts`: remove the region cases.
- [ ] **Step 2:** Run `npx vitest run tests/geo.test.ts tests/search*.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, then update the page rendering. Keep the store-scoped header, the empty states and the show-more behaviour.
- [ ] **Step 4:** Run the full `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: city-first search sections`.

---

### Task 4: Korea comparison uses the US-wide lowest price

**Files:**
- Modify: `src/lib/search.ts` (`attachKr`), `src/lib/krcompare.ts`
- Modify: `src/app/compare/SavingsChart.tsx` (remove the `caFallback` label; show a `CityChip` for `best.store.city`)
- Modify: `src/components/KrCompareChip.tsx` (name the base city)
- Test: `tests/krcompare.test.ts`, `tests/search.test.ts`

**Interfaces:**
- Consumes: `CitySection` (Task 3).
- Produces:
  - `BottleGroup.kr = { link, compare, fx, baseCity: CityId | null }`. Every group with the same `bottleKey`, in any section, compares against the minimum `bestAvailableCents` across all sections, and `baseCity` is the city of that row.
  - `listKrComparisons`: `best` is the cheapest in-stock row across all public stores.
  - `getBottleSummary`: `bestTaxIncludedCents` is the overall minimum.
  - Remove the `ko.compare.caFallback` key or its equivalent.

- [ ] **Step 1: Write the failing tests**
  - `krcompare.test.ts`: `it('uses LA when LA is cheaper than Brooklyn and NJ')`. Seed brooklyn $120 and la $95; `best.store.city` is `'la'`. Replace the old "CA only as fallback" test.
  - `search.test.ts`: `it('compares every section against the national best')`. Selected `brooklyn` ($120) and other `la` ($95), linked to KR. Both groups have the same `kr.compare`, and `kr.baseCity` is `'la'`.
- [ ] **Step 2:** Run `npx vitest run tests/krcompare.test.ts tests/search.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: Korea comparison uses US-wide lowest price`.

---

### Task 5: Per-city map

**Files:**
- Modify: `src/lib/map-view.ts`, `src/app/map/{page,StoreMap,StoreMapPanel}.tsx`
- Test: `tests/map-view.test.ts`

**Interfaces:**
- Consumes: `CityId`, `citiesOf`, `resolveCity`.
- Produces:
  - `MapViewId = CityId`.
  - `cityBounds(stores, city): [[number,number],[number,number]] | null` replaces `eastBounds`.
  - `initialView(stores: MapStore[], selected: CityId): CityId` returns:
    - `selected` when it has a non-dimmed store, or when nothing is dimmed (no bottle mode);
    - otherwise the first city in `CITIES` order with a carrying store.
  - The view buttons are the live cities of the selected city's country.
  - The page resolves the city with `resolveCity({ city, cookie })`. For a soon city it shows `ComingSoonNotice` instead of the map.
  - `LA_CENTER`/`NYC_CENTER` remain only as the fallback when a city has a single store.

- [ ] **Step 1: Write the failing tests**
  - `it('opens on the selected city when it carries the bottle')`.
  - `it('opens on LA when only LA carries the bottle, even with brooklyn selected')`.
  - `it('bounds only the given city')`.
- [ ] **Step 2:** Run `npx vitest run tests/map-view.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: map views per city`.

---

### Task 6: Korean copy rewrite (합니다체)

**Files:**
- Modify: `src/lib/i18n/ko.ts` (every string)
- Modify: `docs/design-system.md` §11 (replace the 해요체 rule with the Global Constraints tone rules)
- Test: `tests/copy-tone.test.ts` (new)

**Interfaces:**
- Produces final values for these keys. Keys added earlier (Task 3) are rewritten, and new keys are added for Tasks 9 and 10:
  - `ko.site.title = 'Whisky Index'`, `ko.site.titleKo = '위스키 인덱스'`
  - `ko.search.heroEyebrow = 'New York · Los Angeles · Tokyo · Taipei'`
  - `ko.search.heroTitle = '가장 정확한 한 병의 시세.'`
  - `ko.search.heroLead = '신뢰할 수 있는 리테일러의 오늘 가격과 재고를 대조하여, 세금 포함 기준으로 정직하게 정렬합니다.'`
  - `ko.search.placeholder = '증류소, 숙성 연수, 보틀명으로 검색'`
  - `ko.search.curatedLabel = 'CURATED'` (replaces `tryLabel`)
  - `ko.search.how` becomes 3 items with `{ kicker: '01 · SEARCH' | '02 · COMPARE' | '03 · SHARE', title, body }`
  - `ko.search.yourCity = 'YOUR CITY'`, `ko.search.elsewhere = (country: string) => \`ELSEWHERE IN ${country}\``. It takes the English country name, uppercased.
  - `ko.search.otherCitySummary(stores: number, best: string | null)`
  - `ko.soon = { title, body(city: string), back(city: string) }`
  - `ko.citySelect = { label, current(country, city), storesCount(n), soon }`
  - `ko.lang = { label, ko: 'KO', en: 'EN' }`
- **Curated searches.** Replace `ko.search.examples` with 5–6 queries across whisky styles, for example Lagavulin 16, Macallan 18, Yamazaki 12, Springbank 15 and Blanton's.
  - **Each query must return ≥ 1 result against the current production data.** Check each one with a local search against a fresh crawl, or against the DB `DATABASE_URL` points to.
  - Swap out any query that returns nothing.

- [ ] **Step 1: Write `tests/copy-tone.test.ts`**
  - Walk every string in `ko` (call function values with dummy args) and assert none matches `/(요|해요|세요|예요|이에요)[.?!]?$/` or contains `!`.
  - Allow-list keys that are intentionally English (ClerkMode) or are proper nouns.
- [ ] **Step 2:** Run `npx vitest run tests/copy-tone.test.ts`. Expected: FAIL (the current copy is 해요체).
- [ ] **Step 3:** Rewrite `ko.ts` and update `design-system.md` §11.
- [ ] **Step 4:** Run the full `npx vitest run`. Expected: PASS. Update any tests asserting old literal copy.
- [ ] **Step 5:** Commit: `feat: refined 합니다체 copy and Whisky Index name`.

---

### Task 7: Locale routing and dictionaries (ko/en)

**Files:**
- Move: every route under `src/app/` (except `api/`, `globals.css`, `shadcn-tailwind.css`, `icon.svg`) to `src/app/[lang]/`, including `layout.tsx`, `error.tsx` and `not-found.tsx`.
  - If `app/icon.svg` stops resolving with the root layout under `[lang]`, move it as the docs direct.
- Create: `src/proxy.ts`, `src/lib/i18n/index.ts`, `src/lib/i18n/server.ts`, `src/lib/i18n/client.tsx`, `src/lib/i18n/en.ts`, `src/components/LocaleLink.tsx`
- Modify: every `ko` import (≈40 files). Server components use `await getDict()`; client components use `useDict()`. Replace `next/link` with `LocaleLink`, and prefix programmatic navigations (`SearchForm` `nav.navigate`, server `redirect`s).
- Modify: server actions (`watchlist/actions.ts`, `link-kr/actions.ts`). They read a hidden `lang` form field, validate it with `isLocale`, and default to `ko`, because root params are unavailable in actions.
- Test: `tests/i18n.test.ts`, `tests/proxy.test.ts`

**Interfaces:**
- Produces:
  - `type Locale = 'ko' | 'en'`, `LOCALES`, `DEFAULT_LOCALE = 'ko'`, `isLocale(v: unknown): v is Locale` (in `index.ts`)
  - `type Dict = typeof ko`; `en: Dict`
  - `dictFor(locale: Locale): Dict`
  - `localizePath(locale: Locale, path: string): string`. It prefixes `/ko`/`/en` and leaves `http(s):` URLs and `/api/*` untouched.
  - `getDict(): Promise<Dict>` and `getLocale(): Promise<Locale>` in `server.ts`. They use `lang` from `next/root-params`, and `notFound()` when it is invalid.
  - `<DictProvider locale dict>`, `useDict(): Dict` and `useLocale(): Locale` in `client.tsx`. The provider is mounted in `[lang]/layout.tsx`.
  - `proxy(request)`:
    - Paths starting with a valid locale pass through.
    - `/_next`, `/api` and files with an extension pass through.
    - Everything else becomes a 308 redirect to `/{cookie wi_lang if valid else 'ko'}{pathname}{search}`.
    - An invalid first segment that looks like a locale (2 letters, e.g. `/xx/map`) is **not** treated as a locale. It is prefixed (`/ko/xx/map`), which then 404s.
  - In the layout, `<html lang={locale}>`. `generateMetadata` reads title and description from the dictionary. `generateStaticParams` returns both locales.
- `en.ts` is a full English translation of the Task 6 copy, in the same refined, understated tone. Store and product names stay unchanged.

- [ ] **Step 1: Write the failing tests**
  - `i18n.test.ts`:
    - `it('en has exactly the keys of ko')`: deep key comparison, with function keys compared by presence.
    - `localizePath('en', '/?q=x')` equals `/en?q=x`.
    - `localizePath('ko', '/card/5')` equals `/ko/card/5`.
    - `localizePath('en', '/api/recheck/1')` is unchanged.
    - `isLocale('xx')` is false.
  - `proxy.test.ts`: build `NextRequest`s and assert:
    - `/` redirects to `/ko`.
    - `/card/123` with cookie `wi_lang=en` redirects to `/en/card/123`.
    - `/?q=stagg&region=ca` redirects to `/ko?q=stagg&region=ca`, keeping the query.
    - `/en/map` gets no redirect.
    - `/api/recheck/1` gets no redirect.
    - `/xx/map` redirects to `/ko/xx/map`.
- [ ] **Step 2:** Run `npx vitest run tests/i18n.test.ts tests/proxy.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the infra, move the routes, convert call sites, and write `en.ts`.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit` and `npm run build`. Expected: all pass. The build lists `/[lang]` routes for `ko` and `en`.
- [ ] **Step 5:** Run `npm run dev` and check by hand:
  - `/` redirects to `/ko`.
  - `/en` renders English with `<html lang="en">`.
  - Old `/card/<id>` links resolve.
- [ ] **Step 6:** Commit: `feat: ko/en locale routing and dictionaries`.

---

### Task 8: Dark theme tokens, fonts and brand mark

**Files:**
- Modify: `src/app/globals.css`
  - Replace the light values of every token, including the status `*-fg/bg/line` and `verdict-*` sets, with dark values.
  - Drop the `dark` custom variant if it is unused.
- Modify: `src/app/[lang]/layout.tsx`
  - Load the serif fonts with `next/font/google`: Noto Serif KR 500/700 and Cormorant Garamond 600.
  - Expose them as `--font-serif` and `--font-display`.
  - Set `viewport.themeColor` to `#0a0a0a` and add `color-scheme: dark`.
- Modify: `src/components/Wordmark.tsx` (new mark and `WHISKY INDEX` wordmark) and `src/app/icon.svg`
- Modify: primitives in `src/components/ui/*` where radius, shadow or pill shapes conflict with the spec (radius about 4–6px, thin lines, minimal shadow)
- Test: `tests/contrast.test.ts` (new)

**Interfaces:**
- Produces: Tailwind font utilities `font-serif` and `font-display`, which Tasks 9 and 10 use. The token names are unchanged, so components keep their classes.
- The brand mark SVG is the spec's appendix SVG with `stroke="currentColor"`, coloured by `text-primary`.
  - The favicon is the same mark on `#0a0a0a`.
  - If it smudges at 16px, use a simplified favicon: drop the inner ring and thicken the strokes.

- [ ] **Step 1: Write `tests/contrast.test.ts`**
  - Parse `globals.css` `:root` values.
  - Assert WCAG ratio ≥ 4.5 for:
    - `foreground`/`background`, `muted-foreground`/`background`, `muted-foreground`/`card`, `primary`/`background`;
    - every `*-fg` on its `*-bg`, and every `verdict-*-ink` on its `verdict-*-bg`.
  - Assert ≥ 3 for `primary-foreground` on `primary`, which is the button text.
  - Assert the relative luminance of `background` is < 0.01, which means a dark theme.
- [ ] **Step 2:** Run `npx vitest run tests/contrast.test.ts`. Expected: FAIL on the luminance assertion, because the current background is the light `#fbf8f3`.
- [ ] **Step 3:** Implement the tokens, fonts and brand.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: dark black-and-gold theme and Whisky Index mark`.

---

### Task 9: Header (city dropdown, language switch) and home hero

**Files:**
- Create: `src/components/CitySelect.tsx` (client), `src/components/LangSwitch.tsx` (client)
- Modify: `src/components/ComingSoonNotice.tsx` (style it)
- Create: `src/lib/city-cookie.ts`, which holds the pure helpers below
- Modify: `src/components/SiteChrome.tsx`, `src/components/NavLinks.tsx` (mobile menu), `src/app/[lang]/page.tsx` (`Hero`, `Examples`, how-to band, coverage list), `src/components/search/SearchForm.tsx` (hero variant becomes the underline search)
- Test: `tests/city-cookie.test.ts`, `tests/city-select.test.tsx`

**Interfaces:**
- Consumes: `CITIES`, `citiesOf`, `resolveCity` (Tasks 1 and 3); `useDict`, `useLocale`, `localizePath` (Task 7); `ko.citySelect`, `ko.soon`, `ko.lang` (Task 6).
- Produces:
  - `cityCookieFor(city: City): string | null`. It returns the `Set-Cookie`-style string `wi_city=<id>; Path=/; Max-Age=31536000; SameSite=Lax` for live cities, and `null` for soon cities.
  - `withCity(href: string, city: CityId): string`. It sets or replaces `city` in the query and keeps the other params.
- **CitySelect**
  - The trigger reads `● {country} · {city} ▾`.
  - The popover has the countries on the left and the selected country's cities on the right, each with a store count. A soon city reads `준비 중`. The current city gets a gold check.
  - Selecting a city writes the cookie (unless `null`) and calls `router.push(withCity(current URL, id))`.
  - It is keyboard-operable: a button trigger, arrow keys within lists, and Escape closes. Use the existing `@base-ui/react` popover/menu primitives.
  - The server header renders it inside `Suspense`, and the initial city comes from an async server child that reads the `wi_city` cookie. The client prefers `useSearchParams().get('city')` when it is a valid ID.
- **LangSwitch**
  - It shows `KO / EN`. Switching sets `wi_lang` and navigates to the same path and query under the other locale prefix.
- **Mobile layout**
  - Nav items collapse into a menu button, and the city trigger sits in a full-width row under the header bar, as in spec appendix B.
- **Hero**, following spec §5.3 and appendix B:
  - Content, top to bottom: eyebrow, serif title, lead, underline search with a `SEARCH` label, then the `CURATED` row of underlined links, then the three-column `01/02/03` band, then the coverage list. The coverage list shows store counts per **live** city, grouped by country.
- **ComingSoonNotice** shows `ko.soon` copy and a `LocaleLink` back to the cookie's live city or Brooklyn.

- [ ] **Step 1: Write the failing tests**
  - `city-cookie.test.ts`:
    - `cityCookieFor(getCity('tokyo')!)` is `null`.
    - `cityCookieFor(getCity('nj')!)` contains `wi_city=nj` and `Max-Age=31536000`.
    - `withCity('/en?q=x&city=la', 'nj')` is `/en?q=x&city=nj`.
  - `city-select.test.tsx`: render with `react-dom/server` like `tests/bottle-result.test.tsx`. Assert that every `CITIES` entry renders, that soon cities show the `soon` label, and that the current city has `aria-checked="true"` (or `aria-current`).
- [ ] **Step 2:** Run `npx vitest run tests/city-cookie.test.ts tests/city-select.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Run `npm run dev` and compare by hand against `.superpowers/brainstorm/325-1791718372/content/combined-home.html` and `city-select.html` at 1280px and 375px.
  - Picking Tokyo shows the notice, and reloading `/ko` returns to the previous live city.
  - Keyboard-only use works for the city picker.
- [ ] **Step 6:** Commit: `feat: city dropdown, language switch and luxury home hero`.

---

### Task 10: Remaining screens, docs and final pass

**Files:**
- Modify: `src/app/[lang]/{card/[id],compare,map,watchlist,link-kr}/**`, `error.tsx`, `not-found.tsx`, `src/components/*`
  - Remove hard-coded light colours (`grep -rn "#fff\|bg-white\|text-white\|#[0-9a-f]\{6\}" src/app src/components`).
  - Apply `font-serif` to page titles and section headings.
  - Make sure Leaflet popups and tiles stay legible. Keep standard tiles and style the popup chrome with tokens.
- Modify: `docs/design-system.md`. Rewrite §1 (brand: Whisky Index, mark, the "no kitsch" rule), §2–3 (dark tokens), §4 (typography), §6–8 (CityChip, CitySelect, LangSwitch, ComingSoonNotice, city sections), and the copy rules. "Cask & Paper" is gone.
- Modify: `.gitignore` (add `.superpowers/`)
- Modify: `README.md` (name, locales, cities)

- [ ] **Step 1:** Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. Expected: all pass.
- [ ] **Step 2:** In `npm run dev`, walk every page in `/ko` and `/en` at 1280px and 375px. Check:
  - no light surfaces;
  - no 해요체 strings;
  - no untranslated Korean on `/en` except store and product data;
  - the focus rings are visible on the dark background.
- [ ] **Step 3:** Run `npm run crawl` against a local or test DB, or run `npx vitest run tests/crawl`. Expected: completes, which confirms the crawler still works with `Store.city`.
- [ ] **Step 4:** Commit: `feat: dark theme across all screens; design system docs`.
