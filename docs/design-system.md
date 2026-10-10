# Design System: 위스키 가격 포털

Every screen follows this doc. Tokens live in `src/app/globals.css`, primitives in `src/components/ui/*`, product patterns in `src/components/*`, and copy in `src/lib/i18n/ko.ts`. If a screen needs something that isn't here, add it here first.

---

## 1. Brand direction: "Cask & Paper"

**Who we design for**
- **The buyer in Korea.** Comparing prices on desktop or phone.
- **The sister in Manhattan.** On her phone, in a store or on the subway, and she doesn't know whisky.
- **Future public visitors.**

The product has to feel **trustworthy first, premium second**. A wrong trip is the worst outcome, so clarity beats decoration every time.

**Direction**
- Warm paper surfaces (`#fbf8f3`) with ink text (`#1f1a15`).
- **One** brand colour, cask copper (`#9a4a12`), plus a honey accent (`#d9962b`) used only in the mark and in decorative washes.
- Think of a good whisky shop's price tag or a printed tasting menu. Avoid barrels, wood grain, script fonts and gold gradients (kitsch).

**Wordmark**
- `BrandMark` is a copper rounded tile holding a white rocks-glass outline with a honey pour. The same art is used in `src/app/icon.svg` (the favicon).
- Next to the mark sits **위스키 가격 포털** in Pretendard ExtraBold. On ≥ sm screens, a tracked `NY · NJ · CA` sub-label is added.
- The name stays descriptive Korean until there is a commercial brand name. Swapping the name means changing `ko.site.title` and nothing else.

---

## 2. Colour tokens (light mode)

All pairs below meet **WCAG AA (≥ 4.5:1)** for body text. Tailwind classes are `bg-*`, `text-*` and `border-*` with the token name.

| Token | Value | Use |
|---|---|---|
| `background` | `#fbf8f3` | page |
| `card` | `#ffffff` | raised surfaces, inputs |
| `muted` / `secondary` | `#f3eee6` | sunken areas, chips, secondary section bg |
| `foreground` | `#1f1a15` | body text (≈16:1) |
| `muted-foreground` | `#6b6157` | secondary text (5.7:1 on bg, 6.0:1 on white) |
| `border` / `border-strong` (`input`) | `#e7dfd3` / `#d3c7b6` | dividers / control borders |
| `primary` | `#9a4a12` | primary buttons, links, rank #1, section icons (white text 6.2:1) |
| `primary-hover` | `#7f3c0d` | hover |
| `primary-soft` | `#f7eadb` | best-row highlight, hero wash, empty-state icon disc |
| `honey` | `#d9962b` | decorative only, **never text** |
| `ring` | `#b0601a` | focus outline: ≥ 3.9:1 on every surface token (white 4.6, paper 4.4, muted 4.0, primary-soft 3.9, all status tints ≥ 3.9) |

**Dark mode is intentionally deferred.**
- `color-scheme: light` is declared, and no `.dark` tokens ship.
- The ClerkMode use case actually wants a bright screen.
- If dark mode is added later, every semantic pair in §3 needs its own dark values and a contrast check. Don't invert automatically.

---

## 3. Semantic status colours

Each status comes as a set: `-fg` (text/icon), `-bg` (tint) and `-line` (border). **Colour is never the only signal.** Every status always carries an icon and a word as well.

| Status | Tokens | Icon | Word (ko.ts) | Meaning |
|---|---|---|---|---|
| In stock | `instock-fg #1a6638` / `instock-bg #e8f4ec` / `instock-line` / solid `instock #1e7a42` | CircleCheck | 재고 있음 | the store site says available |
| Sold out | `soldout-fg #5f574f` / `soldout-bg #efebe5` | CircleX | 품절 | neutral grey, not red: sold out is information, not an error |
| Unreliable | `caution-fg #6f4600` / `caution-bg #fff4d6` / `caution-icon #a86c00` | TriangleAlert | 재고 표시 부정확 | the store's stock flag can't be trusted (`stockReliability: 'low'`) |
| Stale | `stale-fg #8f3110` / `stale-bg #fdede4` | Clock | 오래된 정보 | `checkedAt` > 24 h |
| Live / verified | `info-fg #1d4f7a` / `info-bg #e9f1f9` | BadgeCheck | 방금 확인 | confirmed by a live check this request |
| Savings big | solid `instock` + white | TrendingDown | 한국보다 N% 저렴 | US ≥ 20 % cheaper |
| Savings small | `instock-*` tint | TrendingDown | 한국보다 N% 저렴 | 3–20 % cheaper |
| Same | `soldout-*` tint | Equal | 한국과 비슷 | within ±3 % |
| Worse | `danger-fg #a11c1c` / `danger-bg #fdecec` | TrendingUp | 한국이 N% 저렴 | Korea is cheaper |

- **Danger** is reserved for failures (a live check failed) and "worse" comparisons. Don't use red for sold out.
- The savings thresholds live in `compareTier()` in `src/lib/search-view.ts` and are **provisional product defaults**. Revisit them with real Task 15 data.

---

## 4. Typography

**Font: Pretendard Variable**
- Self-hosted from the `pretendard` npm package. `layout.tsx` imports `pretendardvariable-dynamic-subset.css`.
- Turbopack copies the woff2 subsets into `/_next/static/media`. Pages download only the unicode-range slices they render.
- No CDN and no `<script>`.
- Fallback stack: `-apple-system, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`.

**Type scale** (mobile → ≥ sm):

| Role | Size / line-height | Weight | Where |
|---|---|---|---|
| Display | 32 → 48 px / 1.15 | 800 | search hero |
| Title 1 | 28 → 36 px / 1.2 | 700 | buy-card bottle title, PageHeader |
| Price XL | 48 → 60 px / 1 | 700 tabular | buy-card price |
| Title 2 | 20 → 24 px | 700 | section headers, store name on card |
| Title 3 | 16 → 18 px / snug | 600 | bottle title in lists |
| Body | 16 px / 1.5 | 400 | default; inputs are always ≥ 16 px (no iOS zoom) |
| Small | 14 px | 400–600 | secondary text, buttons sm |
| Caption | 12 px | 500–600 | freshness, chips; **12 px is the minimum** |

**Rules**
- Every number that can be compared (prices, counts, dates) uses the `tabular` utility.
- `word-break: keep-all` is set globally so Korean wraps at word boundaries. `overflow-wrap: anywhere` stops long English product names from overflowing.
- Product and store names stay in their original English. Mark them `lang="en"` where they are large (ClerkMode, address).
- Use `text-balance` on big headings.

---

## 5. Spacing, radius, elevation

- **Spacing** uses the Tailwind 4 px scale. Rhythm:
  - 4/6/8 px inside components,
  - 12/16 px between related blocks,
  - 20/24 px between card sections,
  - 32 px between page sections.
- **Page gutters:** 16 px on mobile, 24 px at ≥ sm.
- **Max widths:**
  - `max-w-4xl` for lists,
  - `max-w-xl` for the buy card (phone-shaped even on desktop),
  - `max-w-5xl` for the header/footer.
- **Radius** (`--radius` = 12 px):
  - `md` 9 px for small buttons,
  - `lg` 12 px for buttons and inputs,
  - `xl` 16 px for image tiles and notices,
  - `2xl` 20 px for cards,
  - `3xl` 24 px for the secondary section panel,
  - `full` for chips and badges.
- **Elevation** (warm-tinted shadows only):
  - `shadow-card` for resting surfaces and controls,
  - `shadow-raised` for popovers, the hero input and the docked action bar,
  - `shadow-overlay` for modal-level layers.
- Borders do most of the separation work; shadows stay subtle.

---

## 6. Component inventory

### Primitives (`src/components/ui`)
| Component | Variants | Rules |
|---|---|---|
| `Button` / `buttonVariants` | `default` (copper), `dark` (ink), `outline`, `secondary`, `ghost`, `destructive`, `link` · sizes `xs sm default lg xl icon icon-sm` | One `default` button per view region. `xl` (56 px) is for buy-card thumb actions. On `pointer: coarse` every size is at least 44 px tall. Use `buttonVariants` on `<a>`/`<Link>` for navigation. |
| `Badge` | `spec instock soldout caution stale danger info solid outline secondary` · sizes `sm md lg` | Non-interactive. Always icon + word for status. |
| `Card` | `as="div|article|section"` | One self-contained thing (a bottle, a store). Don't nest cards. |
| `Input`, `NativeSelect`, `fieldClass` | — | 44 px tall, 16 px text. Use native `<select>` on forms (OS picker on phones, works without JS). |
| `Skeleton` | — | Pulses only under `motion-safe`. |

`select.tsx` and `checkbox.tsx` (base-ui) are kept for future popover-style UI. Forms use native controls.

### Product patterns (`src/components`)
| Pattern | Component | Rule |
|---|---|---|
| Price display | `PriceBlock` | See §8.1 |
| Store row / ranked list | `StoreLine`, `RankMarker`, `RegionChip` | See §8.2, §8.10 |
| Bottle header | `BottleHeader` (`compact` / `hero`), `BottleImage`, `SpecChips` | See §8.3 |
| Status badges | `StatusBadge`, `StockBadge` | See §3 |
| Freshness | `FreshnessIndicator` | See §8.6 |
| Section header | `SectionHeader` (`primary` / `secondary`) | See §8.5 |
| Page header | `PageHeader` | Title block for watchlist/map/compare screens |
| Callout | `Notice` (`caution stale danger info success`) | Problems that change the decision. `urgent` → `role="alert"` |
| Empty / error | `EmptyState` | See §7 |
| KRW-vs-USD chip | `PriceCompareChip` | See §8.9 |
| Bottle result | `BottleResult` | Search-result card for one bottle group |
| Site chrome | `SiteHeader`, `SiteFooter`, `SkipLink`, `Wordmark`, `NavLinks` | Layout only |
| Share | `CopyLinkButton`, `ShareCardButton` | See §8.8 |

---

## 7. Loading / empty / error states

| State | Pattern |
|---|---|
| **First load** | The route's `<Suspense fallback>` renders the **most likely final layout**. On search, the fallback *is* the landing hero (a cold load of `/` is the common case, and nothing flashes). On the buy card, it is `CardSkeleton`, a layout-shaped skeleton with an `sr-only role="status"` message. Never a bare "로딩 중" line. |
| **In-page navigation** (new search, filter change) | Keep the old results visible, dim them (`opacity-50`, `aria-busy`), and show a spinner in the submit button (`SearchShell` + `ResultsRegion`). Content never flashes away. |
| **Incremental load** ("더 보기") | Link-level spinner via `useLinkStatus`; scroll position is kept. |
| **Action in progress** (recheck) | Button disabled with a spinning icon and the verb "확인 중…". Result line in `role="status"`. |
| **Empty, no query** | Hero with a strong prompt, example chips and how-it-works. |
| **No results** | `EmptyState`: SearchX icon, "검색 결과가 없어요", the query echoed back, 3 concrete tips, a "필터 초기화" button when filters are active, and example chips. |
| **Section empty** | Dashed inline box, one line. |
| **Not found** | `EmptyState` as `h1` with a single big "검색으로" action. The route soft-404s (200), which is accepted. |
| **Error** | `app/error.tsx`: `EmptyState` with **다시 시도** (`retry()`) and **검색으로**. Never show error messages or stack traces to users. |

---

## 8. Reusable patterns (required for Tasks 12, 13, 15)

### 8.1 Price display: `PriceBlock`
- **Always show both prices, each explicitly labelled.**
- `emphasis="tax"` (lists and rankings): the tax-included price is big, with `세전 $X` below. Lists are sorted by tax-included price, so the big number must be the sort key.
- `emphasis="shelf"` (buy card, anything used in the store): the pre-tax shelf price is big, captioned `매장 표시 가격 (세전)`, with `세금 포함 약 $Y` below. It matches the tag the sister sees on the shelf.
- When the item is sold out, the price stays visible but dimmed (`dimmed`). It is never struck through, because it is the last known price, not a wrong one.
- **Every big price carries a label.** Lists put a small `세금 포함 약` caption above the big number (`ko.row.taxIncludedCaption`); the bottle summary says `최저가 · 세금 포함 약`. The card says `매장 표시 가격 (세전)` above, and `세금 포함 약 $Y` below.
- **Rule of thumb:** comparing or ranking → tax-included is big. Standing in front of a shelf → pre-tax is big.
- Format with `formatUsd`. Money is integer cents everywhere.

### 8.2 Store row: `StoreLine`
- **Left to right:** rank marker → store name + region chip (+ 온라인 주문 전용) → stock badge(s) + freshness → price (tax emphasis, right-aligned) → chevron.
- The whole main area is one link to the buy card. Secondary actions (copy link, 관심 등록, 지도) sit beside it on desktop and below it, indented, on mobile.
- Card links use `prefetch={false}`, because rendering a card triggers a live store check. Never prefetch routes with side effects.

### 8.3 Bottle header: `BottleHeader`
- **Identity before price.** Photo tile (always white, because store photos are shot on white) → exact English title → spec chips (`750 ml`, `101 proof`, batch).
- `hero`: full-width 4:3 photo and a 28–36 px title (buy card).
- `compact`: 72–96 px photo with a two-line-clamped title (lists).
- Images are hotlinked https-only through `BottleImage` (`safeHttpsUrl`), with `referrerPolicy="no-referrer"`. A neutral glass icon is shown when there is no photo.

### 8.4 Status badges
- See §3. `StockBadge` = stock status + the unreliable flag when the store is low-reliability.
- Badge sizes:
  - `sm` in lists,
  - `md` in summaries,
  - `lg` on the buy card.

### 8.5 Section headers: `SectionHeader`
- `primary`: copper icon tile, 20–24 px title, count chip, one-line sub. Used for the main (Brooklyn + NJ) section.
- `secondary`: neutral icon tile, a smaller title, placed **inside a sunken panel** (`bg-muted/60 rounded-3xl`). Used for "LA 갈 때" and any other out-of-region or optional content.
- Secondary sections may start collapsed (`<details>`) when the primary section has results. The toggle stays visible while open ("…접기") so they can be collapsed again.

### 8.5a Search filters
- The in-stock chip sits outside the popover and applies instantly.
- Fields inside the 필터 popover (region, min, max) apply **only on 적용**, so several can be set together.
- Esc closes the popover and returns focus to its trigger. An outside click closes it without moving focus.
- Active filters are shown as removable chips.

### 8.6 Data-freshness indicator: `FreshnessIndicator`
- **Fresh** (≤ 24 h): quiet clock icon + "N시간 전 확인" in muted text.
- **Stale** (> 24 h): always the stale badge "오래된 정보 · N일 전 확인". On the buy card, add a stale `Notice` that asks the user to recheck.
- `showDate` appends "뉴욕 기준 M/D".
- After a successful live check, add the `live` badge "매장 사이트에서 방금 확인한 정보예요".

### 8.7 Primary and secondary actions
- One primary (copper) action per region. Secondary actions are `outline`; tertiary actions are `ghost` or `link`.
- On the buy card, **길찾기 (primary) + 전화하기 (outline)** are `xl` (56 px). On phones they dock to the bottom edge (`data-sticky-actions`), so they stay in thumb reach. `body:has([data-sticky-actions])` reserves space for the dock.
- ClerkMode uses `dark` (ink) so it doesn't compete with the copper primary.
- External links open in a new tab with `rel="noopener noreferrer"` and show an ExternalLink icon.

### 8.8 Share
- In lists (buyer at a desk): `CopyLinkButton` with the explicit label "카드 링크 복사" and an inline ✓ "복사됨" confirmation.
- On the card: `ShareCardButton` opens the OS share sheet when one exists (straight to KakaoTalk on phones) and falls back to copy otherwise.

### 8.9 KRW-vs-USD comparison chip: `PriceCompareChip` (Task 15)
- Input: `savingsRatio = (koreaKrw − usKrw) / koreaKrw`. Tiers come from `compareTier()` (see §3).
- **Pure price comparison only.** No duty, customs or bottle-limit maths.
- **Never shown on the buy card.**
- Place it next to the tax-included price in lists, never in place of it.

### 8.10 Ranked list
- Use `<ol>` + `RankMarker`. #1 is filled copper and its row gets a `primary-soft` wash plus an sr-only "최저가". Ranks 2+ are outlined, and unranked items (sold out) get a dash.
- Rank only what is actually comparable (in-stock offers). Sold-out rows sort after them and are not numbered.
- Show 3 rows per item, then a `<details>` "매장 N곳 더 보기".
- Lists of items are capped at **20 per section**, followed by "더 보기 (N종 남음)". The cap is pure logic in `src/lib/search-view.ts` (`parseShowCount`, `capGroups`, `nextShowCount`) and driven by URL params (`?main=40`, `?ca=40`, hard max 500).

---

## 9. Motion
- Motion is functional only: 150–200 ms colour/opacity transitions, a fade-in for ClerkMode, spinners for pending work, and a skeleton pulse.
- No parallax and no entrance choreography.
- `prefers-reduced-motion: reduce` disables animations and transitions globally (`globals.css`). Spinners and pulses also use `motion-safe:`.

---

## 10. Accessibility
- **Contrast:** AA for all text (§2–3). Never put text on `honey`.
- **Focus:** a global 3 px `ring`-coloured `:focus-visible` outline with 2 px offset. Because of the offset, the outline is drawn against the surrounding surface, and `#b0601a` is ≥ 3.9:1 on every surface token.
  - Primitives must **not** add `outline-none` / `outline-hidden` or translucent `ring-ring/xx` focus rings. They fail 3:1.
  - The only exceptions are a full-contrast replacement (e.g. the ClerkMode close button's 4 px black ring on white) and menu items, which draw an inset `outline-ring`.
- **Touch targets:** at least 44 × 44 px on coarse pointers (built into `Button`, chips, nav links and summaries).
- **Landmarks:**
  - skip link → `#main`,
  - one `<main id="main">` per page,
  - `<nav aria-label>`,
  - sections with `aria-labelledby`,
  - the search form has `role="search"`.
- **Live regions:** pending/result messages use `role="status"`. Render-time problems that change the decision use `Notice urgent` (`role="alert"`).
- **Icons:** always `aria-hidden` unless they are the only content, in which case the element gets an `aria-label` or `sr-only` text.
- **Dialogs** (ClerkMode):
  - `role="dialog" aria-modal`,
  - focus moves to the close button and Tab stays there,
  - Esc closes it,
  - focus returns to the opener,
  - body scroll is locked.
- **Forms** work without JS (GET form, native controls); JS only enhances them.

---

## 11. Korean copy guidelines
- Use **해요체**, short and concrete: "재고 있어요", "방금 확인했어요". Don't use 합니다체 anywhere in the UI.
- **Say what to do next:** "가기 전에 전화로 확인하세요", not just "재고 정보 부정확".
- **Warnings are calm and specific.** No exclamation marks or ALL-CAPS. State the cause, then the action.
- **Numbers and units:**
  - `$129.00`; `세금 포함 약 $140.45` ("약" because tax is an estimate),
  - `세전` for pre-tax,
  - `N곳` for stores, `N종` for bottles,
  - `N분/시간/일 전 확인` for freshness.
- **Never translate product or store names.** Region names are in Korean (브루클린, 뉴저지, 캘리포니아).
- **ClerkMode** is in English for the clerk: "Do you have this bottle?". Its Korean helper line is for the sister.
- Every string lives in `src/lib/i18n/ko.ts`. No literals in components.

---

## 12. Security and performance guardrails (design-relevant)
- Crawled URLs (images, store pages) render only through `safeHttpsUrl`. `tel:` links come from `telHref` (digits and `+` only).
- Never use `dangerouslySetInnerHTML`, and never render store-provided HTML.
- No runtime CDNs: fonts are self-hosted and icons come from `lucide-react` (tree-shaken).
- No heavy UI libraries.
- Routes that have side effects (card = live recheck) are linked with `prefetch={false}`.
