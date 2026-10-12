# Japan phase 1 — private crawl of Sapporo and Tokyo stores

Status: approved in chat on 2026-10-12. The owner chose Sapporo and Tokyo first, kept private, Shinanoya first in Tokyo, and "no legal trouble": the legal guardrails below are requirements, not suggestions.
Research basis: the Japan/Taiwan store survey of 2026-10-12, summarised in §2.

## 1. Intent

Route W compares whisky prices city by city, and Tokyo and Sapporo are already listed as "coming soon". This phase builds the data side for those two cities and keeps it **completely private**.
- Stores are crawled and stored with `publicAllowed: false`, so nothing appears in search, the map, compare, alerts or the footer count.
- The owner checks data quality with a CLI report, and later decides on public launch, ideally after asking each store for permission.

Success means:
1. 北海道根本商店 (Sapporo) and 信濃屋 (Tokyo) are crawled on the normal 6-hourly run, politely and lawfully.
2. Their whisky listings land in the database with JPY tax-included prices, bottle size and stock status.
3. `npm run crawl:report -- --store <id>` shows coverage and samples good enough to judge launch readiness.
4. No public page changes. All existing behaviour, tests and US crawling are unaffected.

## 2. Stores in scope

| id | Store | City | Platform | Method |
|---|---|---|---|---|
| `nemoto` | 北海道根本商店 (nemoto-shouten.com) | sapporo | Shopify | Existing Shopify crawler on `/collections/whisky/products.json` (749 whiskies, stock tracked and shared with the shop in 札幌市南区, prices 税込). |
| `shinanoya` | 信濃屋 NET SHOP (shinanoya-tokyo.jp) | tokyo | makeshop | New "page crawl" adapter. Product URLs come from the whisky category list `ct755` (about 4,236 items, 142 list pages). Price and stock come from the list pages if they carry them; otherwise from each product page's JSON-LD `Offer` (`price`, `priceCurrency: JPY`, `availability`). Bottle size comes from the page spec `容量`. |

Store records need real address, lat/lng and phone from each store's own site, as the existing stores have.
- 信濃屋 is online stock (NET SHOP). Its map pin is a representative shop such as 銀座店, with a note that stock is the online shop's. The pin is not shown publicly in this phase.
- Out of scope for this phase: リカーズハセガワ and 六本木鈴酒 (next phase, same adapter, half a day each), Osaka, and Taiwan.

## 3. Legal and ethical guardrails (requirements)

1. **robots.txt is obeyed.**
   - Fetch and parse robots.txt for the store's host before any crawl, for our User-Agent and `*`.
   - Never request a disallowed path.
   - Honour `Crawl-delay` when it is larger than our own delay.
   - A missing robots.txt (404) means no rules. Any other failure means do not crawl this run.
   - The check is code with tests, not a manual note.
2. **Terms of use are checked before enabling.**
   - For each store, read its 利用規約 / 特定商取引法 pages before turning the crawl on.
   - If they forbid automated collection or scraping, the store is **not crawled**.
   - Record the check in `stores.ts` beside the store: date, URL, verdict, and the quoted clause if any.
   - Clauses that forbid reproducing site *content* (text, photos) are handled by guardrail 4.
3. **Gentle load.** Japan has precedent of a crawler's author being arrested over server load (the 2010 Librahack case).
   - Page crawls send **at most one request every 3 seconds per host**.
   - A crawl run sends **at most 300 requests per page-crawled store**. Product pages rotate across runs, oldest-checked first, so a full pass takes several runs.
   - Stop the store for this run on the first 403, 429 or 503, or on 3 consecutive errors. Never retry in a loop.
   - Shopify keeps its existing pacing.
4. **Facts only.**
   - Store the price, currency, availability, size, title, product URL and store-side ids.
   - Do **not** store or hotlink images or descriptions for Japanese stores: `imageUrl` stays null.
   - Prices and stock are facts. Product photos and copy are the store's works.
5. **Honest identity.** Use the existing User-Agent (`WhiskyPortalBot/… (+site)`). Never spoof browsers, rotate IPs or get around bot protection.
   - If a site serves a challenge page (Cloudflare or similar) instead of content, treat it as a block: stop and report it.
6. **Private by default.**
   - `publicAllowed: false` for both stores. Cities stay `status: 'soon'`.
   - Alerts never fire for private stores.
   - Nothing about these stores renders on public pages.
7. **No personal data and no login.** Only public pages, with no cookies beyond what a plain GET needs. Never use logged-in or member prices.

## 4. Data model

- `Store` gains:
  - `currency: 'USD' | 'JPY'`;
  - `pricesIncludeTax: boolean`. True for Japan, where `taxRate` is 0 and no tax is added; false for the US;
  - `adapter: 'shopify' | 'page'`.
- `listings` gains a `currency` column (`text not null default 'USD'`), via a Drizzle migration with a snapshot and test.
  - Prices stay in the existing integer column, in the currency's minor unit. Yen has no minor unit, so ¥27,500 is stored as `27500`.
  - Document this on the column.
- Shopify client: the currency check compares `/cart.js` currency with `store.currency` instead of hard-coded USD, and uses that store's localization cookie. For a JPY store the check must also hold; abort on mismatch as today.
- Volume parsing accepts `ml`, `mL`, `㎖`, full-width `ｍｌ`, and `容量 700ml` style spec rows. Keep the existing ≥200 ml rule.
- Bottle keys and search text work for Japanese titles. Titles are stored as the store writes them, usually Japanese.
- The Korean-name feature already uses Dailyshot and a glossary keyed by English names. Japanese titles fall back to the original title; there is no new transliteration in this phase.

## 5. Page-crawl adapter (`src/lib/pagecrawl/`)

- Generic parts:
  - polite fetcher: robots, delay, budget and stop rules from §3;
  - list-page reader: finds product URLs, and price/stock when present;
  - product-page reader: JSON-LD `Product`/`Offer` first, then a per-store HTML fallback for size and title;
  - a per-store config object (list URL pattern, max pages, selectors for size).
- It produces the same `Observation` objects as the Shopify path, so `ingestStoreCrawl` stays the single writer.
- Sold-out sweep: a page crawl only marks a listing sold out when that listing's own page or list entry says so. Never mark sold out merely because it was not reached this run, since crawls are partial by design.
- Tests use recorded fixture HTML (saved by hand into `tests/fixtures/`). Tests never hit the network.

## 6. Quality report

`npm run crawl:report -- --store <id>` (and `--all`) prints:
- listing count and in-stock count;
- percentage with price, size and availability;
- currency distribution;
- oldest and newest `checkedAt`;
- 15 random samples (title, price, size, stock, URL);
- warnings for anomalies such as prices under ¥1,000 or over ¥5,000,000, missing sizes, or titles not looking like whisky.

## 7. Non-goals

- Any public UI for Japan: yen formatting, Korea comparison in JPY, map pins, opening the cities.
- Other Japanese stores, Osaka and Taiwan.
- Images and descriptions.

## 8. Builder's latitude

These choices are left to the builder:
- the exact config shape;
- how list pages are discovered (pagination param);
- the rotation bookkeeping (e.g. using `checkedAt`);
- the report's formatting.

All of them must keep the §3 guardrails.
