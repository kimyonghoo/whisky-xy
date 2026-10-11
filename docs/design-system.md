# Design System: Whisky Index

Every screen follows this doc. Tokens live in `src/app/globals.css`, primitives in `src/components/ui/*`, product patterns in `src/components/*`, and copy in `src/lib/i18n/ko.ts` and `src/lib/i18n/en.ts`. If a screen needs something that isn't here, add it here first.

---

## 1. Brand: Whisky Index

**What it is.** A whisky price index: today's prices and stock at trusted retailers, sorted honestly by tax-included price. It is going commercial, and it should feel like a private lounge or a luxury retailer: **trustworthy first, premium second**. A wrong trip to a store is the worst outcome, so clarity always beats decoration.

**Who we design for**
- **The buyer in Korea**, comparing prices on desktop or phone.
- **The visitor in the store**, on a phone in New York or Los Angeles, who may not know whisky.
- **Future visitors in Asia** (Tokyo, Osaka, Sapporo, Taipei open later).

**Name.** `Whisky Index` (Korean: 위스키 인덱스). "Index" means a price index. The name comes from `site.title` / `site.titleKo` in the dictionaries; components never spell it.

**Mark.** `BrandMark` (`src/components/Wordmark.tsx`): a pot still inside a two-ring compass, drawn in thin gold lines (`currentColor`, 1.2 px stroke, inner ring at 40 % opacity). `src/app/icon.svg` is the same art on black, simplified for 16 px (no inner ring, heavier strokes).

**Wordmark.** `WHISKY INDEX` in Cormorant Garamond 600 capitals, tracked 0.16–0.2 em, in `foreground` next to the gold mark.

**The "no kitsch" rule.** Luxury comes from restraint. The following count as failures even when everything works:
- gold gradients, gold-filled panels or large gold areas;
- wood grain, barrels, leather or paper textures;
- decorative script fonts;
- gloss, glow, bevels and heavy shadows;
- pill-shaped everything.

Gold is a line and a label. Structure comes from black space, thin warm lines and serif headings.

---

## 2. Colour tokens (dark only)

The site has one theme: deep black. There is no light mode and no theme switch (`color-scheme: dark`). Every text pair below meets **WCAG AA (≥ 4.5:1)**; `tests/contrast.test.ts` parses `:root` and fails the build if a token change breaks a pair.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `background` | `#0a0a0a` | page | — |
| `card` | `#141414` | raised surfaces: cards, inputs | — |
| `popover` | `#161616` | menus, popups, map popups | — |
| `muted` / `secondary` | `#1a1917` | hover rows, skeletons, empty image tiles | — |
| `accent` | `#1f1d1a` | vendored shadcn hover | — |
| `foreground` | `#f2efe8` | body text, warm off-white | 17.2 on bg, 16.0 on card |
| `muted-foreground` | `#a39c90` | secondary text | 7.3 on bg, 6.8 on card |
| `faint` | `#8a8478` | the quietest text (준비 중, English sub-names, placeholders) | 5.3 on bg, 4.7 on `primary-soft` |
| `border` / `border-strong` | `#1f1c18` / `#2c2720` | hairlines / control and tag outlines | — |
| `input` | `#3a342b` | form control borders, checkbox boxes | — |
| `primary` | `#d4af6a` | **gold**: links, eyebrow labels, the search underline, selected states, outline buttons | 9.6 on bg, 8.9 on card |
| `primary-hover` | `#e0c084` | hover on gold text/lines | — |
| `primary-soft` | `#1d1912` | a barely-warm tint for a **selected** row or chip (city menu, nav item, checked city chip). Never a decorative wash | — |
| `primary-foreground` | `#0a0a0a` | text on the few small gold fills (map markers) | 9.6 |
| `honey` | `#b8924f` | decorative only (the `must` verdict ring, the selected-marker ring); **never text** | — |
| `ring` | `#d4af6a` | focus outline | 9.6 on bg, 8.9 on card |
| `on-solid` | `#ffffff` | text on the small solid status fills (verdict badges, `solid` badge). Never a surface | ≥ 5.4 on each fill |

**Gold rules**
- Gold may fill only small marks: map markers and their list numbers, the city-trigger dot. Everything else is gold **outline or text**.
- The default `Button` is a gold outline on black; there is no gold-filled button.
- Rank #1, filter counts, current-link badges and step numbers are gold **outlined**.

**Light areas.** None by design. The only light pixels on the site are store product photos (content), shown on dark tiles (§8.3). The map tiles are inverted to dark (§8.11). ClerkMode is dark too (§8.7).

---

## 3. Semantic status colours

Each status comes as a set: `-fg` (text/icon), `-bg` (a low-chroma dark tint) and `-line` (a mid-tone border). **Colour is never the only signal.** Every status always carries an icon and a word as well.

| Status | Tokens | Icon | Word (ko / en) | Meaning | Contrast |
|---|---|---|---|---|---|
| In stock | `instock-fg #7fcc9c` / `instock-bg #0f1c14` / `instock-line #24533a` / solid `instock #1e7a42` | CircleCheck | 재고 있음 / In stock | the store site says available | 9.2 |
| Unverified | stale tokens | CircleHelp | 재고 확인 필요 / Stock unconfirmed | available, but `checkedAt` > 48 h (`stockState()`): never ranked, never the cheapest price, never a Korea-compare base | 8.6 |
| Sold out | `soldout-fg #a39c90` / `soldout-bg #1a1917` | CircleX | 품절 / Sold out | neutral, not red: sold out is information, not an error | 6.5 |
| Unreliable | `caution-fg #e9bd62` / `caution-bg #211a0c` / `caution-icon #d9a23a` | TriangleAlert | 재고 표시 부정확 | the store's stock flag can't be trusted (`stockReliability: 'low'`) | 9.8 |
| Stale | `stale-fg #f0a37f` / `stale-bg #24150e` | Clock | 오래된 정보 | `checkedAt` > 24 h | 8.6 |
| Live / verified | `info-fg #8fbbe6` / `info-bg #0f1823` | BadgeCheck | 방금 확인 | confirmed by a live check this request | 8.9 |
| Danger | `danger-fg #f2908a` / `danger-bg #261212` | CircleAlert | — | failures (a live check failed) and form errors | 7.8 |

- Red is reserved for failures and the `worse` verdict. Never for sold out.
- Every `-fg` also passes 4.5:1 on `card`, so a status word can sit outside its tint.

### 3a. Korea comparison verdicts

Five **ordinal** tiers computed by `compareKr()` (`src/lib/compare.ts`). Labels live in `compare.verdict`; styles in `VERDICT_STYLE` (`src/components/PriceCompareChip.tsx`). Tokens are `verdict-<tier>` (solid: badge fill and bar), `-bg` (band tint), `-line` (border), `-ink` (text on the tint).

| Tier | Range | Word (ko) | Icon | Badge | Bar on card | Ink on band |
|---|---|---|---|---|---|---|
| `must` | ≥ 50 % | 최우선 구매 | PartyPopper (`must-glow`, 4.8) | solid `#137347` + `on-solid` (5.9), 2 px honey ring | 3.1 | 10.9 |
| `big` | 30–49 % | 크게 유리 | ChevronsDown | solid `#1e7a42` + `on-solid` (5.4) | 3.4 | 9.2 |
| `good` | 15–29 % | 유리 | ChevronDown | tint + ink | 5.0 | 10.8 |
| `small` | 0–14 % | 소폭 유리 | Minus | neutral tint + ink | 4.8 | 7.9 |
| `worse` | Korea cheaper (decided by sign before rounding) | 한국이 저렴 | TrendingUp | solid `#c0392b` + `on-solid` (5.4) | 3.4 | 7.8 |

- Intensity tracks the tier; `small` is deliberately neutral; `worse` is the only red; `must` is the only tier with honey (ring only).
- Never colour alone: icon + word + colour, and the money line ("394,386원(61%) 절약", "한국이 50,000원(8%) 더 저렴") is always visible.
- The Korea reference bar on `/compare` is slate `kr-bar #6f8cab` (5.3 on card), a different hue from every verdict.
- The US base is the **US-wide** lowest in-stock tax-included price, whichever city it comes from (the row names the city).

---

## 4. Typography

| Face | Token | Loaded by | Use |
|---|---|---|---|
| Pretendard Variable | `font-sans` | `pretendard` npm package, dynamic unicode-range subsets | body, UI, numbers, prices |
| Noto Serif KR 500/700 | `font-serif` | `next/font/google` (self-hosted at build, Korean slices on demand) | page titles, section headings, city names, empty-state titles |
| Cormorant Garamond 600 | `font-display` | `next/font/google` | the wordmark only |

No runtime font CDN, no `<script>`.

**Type scale** (mobile → ≥ sm):

| Role | Size / line-height | Face, weight | Where |
|---|---|---|---|
| Hero | 28 → 40 px / 1.35 | serif 500 | home hero |
| Title 1 | 28 → 36 px / 1.2 | serif 500 | `PageHeader`, buy-card bottle title, coming-soon city |
| Price XL | 48 → 60 px / 1 | sans 700 tabular | buy-card price |
| Title 2 | 20 → 24 px | serif 500 | section headings (`SectionHeader`, list headings, store name on card) |
| Title 3 | 16 → 18 px / snug | sans 600 | bottle titles in lists (English product names stay sans for legibility) |
| Body | 15–16 px / 1.5–1.7 | sans 400 | default; inputs are always ≥ 16 px (no iOS zoom) |
| Small | 14 px | sans 400–600 | secondary text, small buttons |
| Caption | 12 px | sans 500 | freshness, tags; **12 px is the minimum** for words (11 px only for tracked Latin capitals) |

**Labels (eyebrows)**
- **Latin capitals** (`YOUR CITY`, `CURATED`, `ELSEWHERE IN UNITED STATES`, `01 · SEARCH`, `COMING SOON`, the city list in the hero): 10.5–11 px, tracked 0.28–0.36 em, `lang="en"`, gold (or `muted-foreground` for the secondary section).
- **Korean eyebrows** (매장 지도, 한국 대비): 12 px, a light 0.06 em tracking, gold. Never tracked wide: spaced-out Hangul reads as broken.

**Rules**
- Every comparable number (prices, counts, dates) uses `tabular`.
- `word-break: keep-all` globally; `overflow-wrap: anywhere` for long English names.
- Product and store names stay in their original English and carry `lang="en"` where large.
- `text-balance` on big headings.

---

## 5. Spacing, radius, lines, elevation

- **Spacing** uses the Tailwind 4 px scale: 4/6/8 px inside components, 12/16 px between related blocks, 20/24 px between card sections, 32 px+ between page sections. Generous black space is part of the look.
- **Page gutters:** 16 px on mobile, 24 px at ≥ sm. **Max widths:** `max-w-4xl` lists, `max-w-xl` buy card, `max-w-5xl` header/footer/home bands.
- **Radius** (`--radius` = 6 px): `sm` 3 px for tags and checkboxes, `md` ~4.5 px for buttons, chips, menus, folds, `lg` 6 px for cards and panels. Circles only for rank numbers, map markers and the city dot. **No pills** for chips or filters.
- **Lines do the separating.** Cards are `border` (`#1f1c18`) on `card`; controls and tags use `border-strong`. Page headers end in a hairline (`border-b`), result sections start with one (`border-t`).
- **Elevation:** `shadow-card` is zero. `shadow-raised` lifts popovers, the filter panel and the docked action bar off the black; `shadow-overlay` is for menus/modals. Nothing else casts a shadow.

---

## 6. Component inventory

### Primitives (`src/components/ui`)
| Component | Variants | Rules |
|---|---|---|
| `Button` / `buttonVariants` | `default` (gold outline), `outline` (hairline on card), `secondary`, `ghost`, `destructive`, `link` · sizes `xs sm default lg xl icon icon-sm` | One `default` per view region. `xl` (56 px) for buy-card thumb actions. On `pointer: coarse` every size is ≥ 44 px. Use `buttonVariants` on links. |
| `Badge` | `default` (gold outline), `spec instock soldout caution stale danger info solid outline secondary` · sizes `sm md lg` | Non-interactive. Always icon + word for status. |
| `Card` | `as="div|article|section"` | One self-contained thing. Don't nest cards. |
| `Input`, `NativeSelect` | — | 44 px tall, 16 px text, `input` border, gold border on focus plus the focus ring. |
| `Skeleton` | — | `muted` block; pulses only under `motion-safe`. |

### Product patterns (`src/components`)
| Pattern | Component | Rule |
|---|---|---|
| Brand | `Wordmark`, `BrandMark` | §1 |
| Site chrome | `SiteHeader`, `SiteFooter`, `SkipLink`, `NavLinks`, `MobileMenu` | §8.13 |
| City | `CitySelect`, `CityMenuContent`, `CityChip`, `citySubLabel` | §6a, §6b |
| Language | `LangSwitch` | §6c |
| Coming soon | `ComingSoonNotice` | §6d |
| City sections | `CitySections` | §6e |
| Price display | `PriceBlock` | §8.1 |
| Store row / ranked list | `StoreLine`, `RankMarker` | §8.2, §8.10 |
| Bottle header | `BottleHeader`, `BottleImage`, `SpecChips` | §8.3 |
| Status | `StatusBadge`, `StockBadge`, `Notice` | §3 |
| Headings | `PageHeader`, `SectionHeader`, `countTagClass` | §4, §8.5 |
| Empty / error | `EmptyState` | §7 |
| Korea comparison | `PriceCompareChip`, `KrCompareChip`, `SavingsChart` | §3a, §8.9, §8.12 |
| Share | `CopyLinkButton`, `ShareCardButton` | §8.8 |

### 6a. `CityChip`
A quiet `secondary` tag with the city's name in the page language (브루클린 / Brooklyn). It names where a store or price is; it is never a control.

### 6b. `CitySelect` (header)
- Trigger: `● 미국 · 브루클린 ▾` (`citySelect.current`) — a 6 px gold dot, hairline `border-strong` box, `md` radius. Phones: on the second header row, left.
- Popup: countries on the left as a vertical tab list (active tab: 2 px gold left rule + `primary-soft`), the chosen country's cities on the right. Each city shows its name, an English sub-name in `faint`, and `매장 N곳` (gold when current) or `준비 중`. The current city has a gold check and `aria-current`.
- `citySubLabel` hides a sub-name that would only repeat what is shown: the displayed city name (New Jersey in English) or the country (Tokyo · Japan, Taipei · Taiwan). Brooklyn keeps "New York", Los Angeles keeps "California".
- Keyboard: arrows move between countries (tabs, activate on focus) and between cities (Up/Down/Home/End); Esc closes; focus opens on the current city.
- Picking a **live** city sets the `wi_city` cookie (1 year, `path=/`, `SameSite=Lax`) and `?city=`. Picking a **coming-soon** city only sets `?city=`; it is never remembered. The URL's `?city=` wins over the cookie; both are whitelist-validated.

### 6c. `LangSwitch`
`KO / EN` in 12 px tracked capitals; the current language is `foreground` and `aria-current`, the other `muted-foreground`. Each link goes to the **same page** in the other locale, keeping the query (search, city). The accessible name keeps the visible label ("EN English"). Choosing sets `wi_lang`.

### 6d. `ComingSoonNotice`
Shown instead of results for a coming-soon city: a calm, finished-looking announcement, never an empty result. Between two hairlines: `COMING SOON · JAPAN` eyebrow, the city name in serif (32–40 px), `오픈을 준비하고 있습니다`, one line of body, and a gold-outline action back to the visitor's live city (`{city} 시세 보기`).

### 6e. City sections (search results)
- **Your city first.** A hairline, `YOUR CITY` eyebrow, the city name as a serif `SectionHeader` with a line pin icon and an outlined count (`4종`), and the sort note (`재고 있는 매장 우선 · 세금 포함 가격순`). Then its bottle results.
- **Elsewhere in the same country.** A hairline and `ELSEWHERE IN UNITED STATES` in `muted-foreground`, then one fold per other live city (`<details>`, hairline box, `md` radius, no fill). The closed fold already shows the city (serif), `N곳에서 판매 · 최저 $X` and a gold chevron, so a cheaper city is visible without opening. Folds open by default when your city has nothing.
- Cities of other countries never appear in results.

---

## 7. Loading / empty / error states

| State | Pattern |
|---|---|
| **First load** | The route's `<Suspense fallback>` renders the most likely final layout (on search: the hero; on the card: `CardSkeleton`) with an `sr-only role="status"` line. |
| **In-page navigation** | Keep old results visible, dim them (`aria-busy`), spinner in the submit button. |
| **Incremental load** ("더 보기") | Link spinner via `useLinkStatus`; scroll kept. |
| **Action in progress** | Button disabled, spinning icon, the verb ("확인 중…"); result in `role="status"`. |
| **Empty, no query** | The home hero. |
| **No results** | `EmptyState`: line icon in a hairline square, serif title "검색 결과가 없습니다", the query echoed, concrete tips, a "필터 초기화" action when filters are active, and the curated searches. |
| **Section empty** | A hairline box, one line. |
| **Not found** | `EmptyState` as `h1` with one big "검색으로" action. |
| **Error** | `app/[lang]/error.tsx`: `EmptyState` with **다시 시도** and **검색으로**. Never show error details. |
| **Coming-soon city** | `ComingSoonNotice` (§6d), never an empty state. |

`EmptyState` is a `card` panel with a hairline border (no dashed lines, no gold disc).

---

## 8. Reusable patterns

### 8.1 Price display: `PriceBlock`
- Always show both prices, each labelled. `emphasis="tax"` in lists and rankings (the tax-included price is the sort key, so it is big); `emphasis="shelf"` on the buy card (the pre-tax shelf price matches the tag in the store).
- Sold-out prices stay visible but dimmed, never struck through.
- Format with `formatUsd`; money is integer cents everywhere. KRW is `formatKrw` (`126,000원` / `₩126,000`).

### 8.2 Store row: `StoreLine`
- Rank marker → store name + `CityChip` (+ 온라인 주문 전용) → stock + freshness → price → chevron. The main area is one link to the buy card; secondary actions (copy link, 관심 등록, 지도) sit beside it on desktop and below it on phones.
- Card links use `prefetch={false}` (a card triggers a live store check).

### 8.3 Bottle header: `BottleHeader`, `BottleImage`, `SpecChips`
- Identity before price: photo → exact English title → spec chips (`750 ml`, `101 proof`, batch; formatted by `spec.size` / `spec.proof`).
- `BottleImage` is a **dark tile** (`muted`, hairline border). Store photos keep their own (often white) background as content, letterboxed on the dark tile; while a photo loads or when it fails, the tile stays dark — never a white box. No photo → a faint line glass icon.
- `hero`: full-width 4:3 photo and a serif 28–36 px title (buy card). `compact`: 72–96 px photo, two-line title (lists).
- Images are hotlinked https-only (`safeHttpsUrl`) with `referrerPolicy="no-referrer"`.

### 8.4 Status badges
See §3. `StockBadge` = stock + the unreliable flag. Sizes: `sm` in lists, `md` in summaries, `lg` on the buy card.

### 8.5 Headings: `PageHeader`, `SectionHeader`
- `PageHeader`: Korean eyebrow in gold, serif title, lead in `muted-foreground`, then a hairline.
- `SectionHeader`: optional line icon (gold for `primary`, muted for `secondary`), serif title, outlined count (`countTagClass`), one-line sub.
- Counts are outlined tags (`border-strong`, `sm` radius), never filled pills.

### 8.5a Search filters
- The in-stock chip sits outside the popover and applies instantly (checked: instock border + tint + green check outline, no fill).
- Fields inside 필터 (size, min, max) apply only on 적용; the active count is a gold outlined number.
- Esc closes the popover and returns focus; an outside click closes it without moving focus.
- Active filters are gold-outline removable chips with an accessible name "… 필터 해제".

### 8.6 Freshness: `FreshnessIndicator`
- ≤ 24 h: quiet clock + "N시간 전 확인". > 24 h: the stale badge; on the buy card also a stale `Notice` suggesting a recheck.
- After a successful live check: the `live` badge "매장 사이트에서 방금 확인한 정보입니다".

### 8.7 Actions and ClerkMode
- One `default` (gold outline) action per region; secondary actions `outline`; tertiary `ghost` / `link`.
- Buy card: **길찾기 (default) + 전화하기 (outline)** at `xl`; on phones they dock to the bottom edge (`data-sticky-actions`).
- **ClerkMode** (`점원에게 보여주기`, an `outline` button) opens a full-screen dark dialog: huge off-white title (17:1), spec line, price, and "Do you have this bottle?" in a 2 px gold frame. It stays English for the clerk; the close hint is in the page language. Keeps the screen awake where supported.
- External links open in a new tab with `rel="noopener noreferrer"` and an ExternalLink icon.

### 8.8 Share
Lists: `CopyLinkButton` ("카드 링크 복사" with an inline "복사됨"). Card: `ShareCardButton` opens the OS share sheet, falling back to copy.

### 8.9 Korea comparison in search: `KrCompareChip`
- A band inside `BottleResult` between the header and the store list: verdict badge + money line in the tier's ink; `한국 최저 … · 미국 약 …`; a meta row with `데일리샷에서 보기 ↗`, Dailyshot freshness and the fx used. Screen readers get one sentence (`compare.srSummary`).
- Pure price comparison only (no duty or customs maths). Never shown on the buy card.

### 8.10 Ranked list
- `<ol>` + `RankMarker`: #1 is a **gold ring** and its row gets a 2 px gold rule on the left edge plus an sr-only "최저가"; ranks 2+ are hairline rings; unranked rows (unverified, sold out) get a dash.
- Rank only confirmed in-stock offers. 3 rows per bottle, then "매장 N곳 더 보기". 20 bottles per section, then "더 보기 (N종 남음)" (`?show=`, `?others=`).

### 8.11 Store map (`/map`)
- List + map synced by number (marker = list `NumberDot`, small gold fills with a black edge). Phones: map above the list; ≥ lg: list left, sticky map right. City quick-jumps per live city.
- **Tiles:** standard OSM tiles (no paid provider). They are drawn for light pages, so the tile layer alone gets `.map-tiles-dark` (`invert(1) hue-rotate(180deg)` with slightly reduced brightness, contrast and saturation): the map turns dark, water stays blue-grey and labels keep their original contrast, light on dark. Markers, popups and controls are not filtered. A configured provider (`NEXT_PUBLIC_MAP_TILE_URL`) is shown as-is.
- Popups (`popover`, `border-strong`, `lg` radius), zoom buttons (`card`, hairline, gold on hover/focus) and the attribution (dark translucent, gold links) are restyled at the end of `globals.css`. Popups render React, never HTML strings.
- `?bottle=`: stores without it are greyed with the sold-out tokens (never opacity on text); a legend explains the two marker styles.

### 8.12 Savings ranking (`/compare`, `SavingsChart`)
- Hand-built HTML bars on one zero-based KRW scale shared by every row: `한국` (slate) and `미국` (verdict colour), direct value labels, the money line and verdict under the bars. #1 gets a gold hairline border (no wash).
- Each row has an sr-only sentence; bars and duplicated numbers are `aria-hidden`. Legend: the two bars, the scale note and the five tiers.

### 8.13 Header and footer
- Desktop: one 64 px row — mark + wordmark, centred nav (active item: `foreground` with a 1 px gold underline), city selector and `KO / EN` on the right. Phones: mark + menu button, then a second full-width row with the city selector and language switch.
- Footer: a `muted/50` band with the disclaimer, tax note, coverage line and the name.
- Skip link: gold outline on `popover`, visible on focus.

---

## 9. Motion
- Functional only: 150–200 ms colour/opacity transitions, a small scale-fade for popovers, a fade-in for ClerkMode, spinners and the skeleton pulse. No parallax, no entrance choreography.
- `prefers-reduced-motion: reduce` disables animations and transitions globally.

---

## 10. Accessibility
- **Contrast:** AA for all text (§2–3), guarded by `tests/contrast.test.ts`. Never text on `honey`.
- **Focus:** a global 3 px gold `:focus-visible` outline with 2 px offset (9.6:1 on black, 8.9:1 on card). Primitives must not add `outline-none` or translucent rings. Menu items draw the same outline inset. Checkbox chips forward focus to the chip (`has-focus-visible:outline`).
- **Touch targets:** ≥ 44 × 44 px on coarse pointers (buttons, chips, nav, summaries, city and language controls).
- **Landmarks:** skip link → `#main`; one `<main id="main">`; labelled `<nav>`s; sections with `aria-labelledby`; the search form has `role="search"`.
- **Label in name:** a control whose visible label is English capitals keeps that text in its accessible name (hero `SEARCH` → "SEARCH 검색"; `KO / EN` links).
- **Language:** `<html lang>` follows the locale; English product/store names and Latin labels carry `lang="en"`.
- **Live regions:** pending/result messages use `role="status"`; render-time problems that change the decision use `Notice urgent` (`role="alert"`).
- **Dialogs** (ClerkMode): `role="dialog" aria-modal`, focus on the close button, Esc closes, focus returns, body scroll locked.
- **Forms** work without JS (GET forms, native controls).

---

## 11. Copy guidelines

### Korean (`ko.ts`)
- **합니다체 throughout**: refined, calm and natural, in the voice of a private lounge or a luxury retailer. No 해요체 anywhere in the UI.
- **Never bureaucratic or translationese.** Prefer short, plain sentences and noun-phrase labels ("가격 동일", "세금 포함 가격순") over stacked nouns and stiff formulas.
- **Labels, chips and headings may be noun phrases** ("재고 있음", "최저가", "크게 유리"). Full sentences end in 합니다체.
- **Requests and suggestions:**
  - actions the user must take: "~해 주십시오" ("잠시 후 다시 시도해 주십시오");
  - advice: "~하시기 바랍니다" ("방문 전 매장에 재고를 확인하시기 바랍니다");
  - options: "~하실 수 있습니다" ("다른 매장의 시세는 전체 검색에서 확인하실 수 있습니다");
  - questions: "~하시겠습니까?".
  - **Not** "~해 보십시오": it reads as an order. `tests/copy-tone.test.ts` rejects it.
- **Say what to do next**, calmly and specifically. No exclamation marks.
- **Latin capitals are labels, not sentences:** `CURATED`, `YOUR CITY`, `ELSEWHERE IN UNITED STATES`, `01 · SEARCH`, `COMING SOON`.
- **Numbers and units:** `$129.00`; `세금 포함 약 $140.45`; `세전 $X`; `N곳` stores; `N종` bottles; `N분/시간/일 전 확인`.
- **Names:** never translate product or store names. Cities are in Korean (브루클린, 뉴저지, 로스앤젤레스, 도쿄, 오사카, 삿포로, 타이베이). The site is `Whisky Index` (위스키 인덱스).

### English (`en.ts`)
- The same tone: understated luxury-retail English, sentence case, no exclamation marks, no hype.
- Same structure: `tests/i18n.test.ts` requires exactly the keys of `ko` and the same function arities.
- Korean appears on `/en` only as data (Dailyshot product names) and the language switch's own name (한국어).

### Both
- **ClerkMode** stays English in both locales: "Do you have this bottle?".
- Every string lives in the dictionaries. No literals in components (units such as `ml` / `proof` included: `spec.size`, `spec.proof`).

---

## 12. Locales, cities and URLs
- Locales `ko` (default) and `en`, as the first path segment (`/ko/...`, `/en/...`). Unprefixed URLs redirect (307) to the `wi_lang` cookie locale or `ko`; Accept-Language is never used.
- Cities: `brooklyn`, `nj`, `la` (United States, live); `tokyo`, `osaka`, `sapporo` (Japan, soon); `taipei` (Taiwan, soon). Default `brooklyn`.
- `?city=` and `lang` inputs are whitelist-validated. Legacy `?region=brooklyn|nj|ca` maps to the city.
- Adding a city later means: stores get `city`, the city's status becomes `live`. No screen code changes.

---

## 13. Security and performance guardrails (design-relevant)
- Crawled URLs (images, store pages) render only through `safeHttpsUrl`; `tel:` links come from `telHref`.
- Never `dangerouslySetInnerHTML`, never store-provided HTML.
- No runtime CDNs: fonts are self-hosted; icons come from `lucide-react`.
- Routes with side effects (card = live recheck) are linked with `prefetch={false}`.
- Time-dependent server code (`Date.now()` in the admin session check, relative times) runs after `connection()`, never in a prerender.
