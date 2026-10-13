import { pgTable, serial, integer, text, boolean, real, timestamp, index, unique } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const listings = pgTable(
  'listings',
  {
    id: serial('id').primaryKey(),
    storeId: text('store_id').notNull(),
    productId: text('product_id').notNull(),
    variantId: text('variant_id').notNull(),
    handle: text('handle').notNull(),
    title: text('title').notNull(),
    variantTitle: text('variant_title'),
    vendor: text('vendor').notNull(),
    productType: text('product_type').notNull(),
    imageUrl: text('image_url'),
    url: text('url').notNull(),
    /** Price in the minor unit of `currency` (USD cents, whole JPY). */
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    available: boolean('available').notNull(),
    sizeMl: integer('size_ml'),
    proof: real('proof'),
    batch: text('batch'),
    bottleKey: text('bottle_key').notNull(),
    searchText: text('search_text').notNull(),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    checkedAt: ts('checked_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    unique('listings_store_variant_unique').on(t.storeId, t.variantId),
    index('listings_bottle_key_idx').on(t.bottleKey),
  ],
);

export const priceHistory = pgTable('price_history', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  priceCents: integer('price_cents').notNull(),
  available: boolean('available').notNull(),
  recordedAt: ts('recorded_at').notNull(),
});

export const watches = pgTable('watches', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  includeTerms: text('include_terms').array().notNull(),
  excludeTerms: text('exclude_terms').array().notNull().default([]),
  batch: text('batch'),
  sizeMl: integer('size_ml'),
  maxPriceCents: integer('max_price_cents'),
  cities: text('cities').array().notNull().default(['brooklyn', 'nj']),
  createdAt: ts('created_at').notNull(),
});

export const krLinks = pgTable('kr_links', {
  id: serial('id').primaryKey(),
  bottleKey: text('bottle_key').notNull().unique(),
  dailyshotProductId: text('dailyshot_product_id').notNull(),
  nameKo: text('name_ko').notNull(),
  nameEn: text('name_en'),
  imageUrl: text('image_url'),
  lowPriceKrw: integer('low_price_krw').notNull(),
  highPriceKrw: integer('high_price_krw'),
  offerCount: integer('offer_count'),
  checkedAt: ts('checked_at').notNull(),
});

export const fxRates = pgTable('fx_rates', {
  date: text('date').primaryKey(),
  usdKrw: real('usd_krw').notNull(),
  fetchedAt: ts('fetched_at').notNull(),
});

/**
 * Per-store token bucket for live rechecks (card opens + "다시 확인"). Shared by every server
 * instance, so visitors can never make us hit a store faster than the bucket allows.
 */
export const storeLiveBudget = pgTable('store_live_budget', {
  storeId: text('store_id').primaryKey(),
  tokens: real('tokens').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

/**
 * Per-store page-crawl bookmark kept between runs: the list page the next run starts reading at
 * (page crawls read a slice of the store's list pages per run and wrap to page 1).
 */
export const crawlState = pgTable('crawl_state', {
  storeId: text('store_id').primaryKey(),
  nextListPage: integer('next_list_page').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export type KrLink = typeof krLinks.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Watch = typeof watches.$inferSelect;
export type NewWatch = typeof watches.$inferInsert;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
