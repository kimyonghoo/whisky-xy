import type { Currency, Store } from '@/lib/stores';
import type { ShopifyProduct } from '@/lib/shopify/client';
import { parsePriceMinor } from '@/lib/money';
import { isWhiskyProduct, parseSizeMl, parseProof, parseBatch, normalizeText, bottleKey } from '@/lib/whisky/parse';

export interface Observation {
  storeId: string;
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  variantTitle: string | null;
  vendor: string;
  productType: string;
  imageUrl: string | null;
  url: string;
  /** Minor unit of `currency` (USD cents, whole JPY). */
  priceCents: number;
  currency: Currency;
  available: boolean;
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
  bottleKey: string;
  searchText: string;
}

function toTagList(tags: string[] | string | null | undefined): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

export function toObservations(store: Store, p: ShopifyProduct): Observation[] {
  const tags = toTagList(p.tags);
  if (!isWhiskyProduct({ title: p.title, productType: p.product_type, tags }, { whiskyOnlyCatalog: store.whiskyOnlyCatalog })) {
    return [];
  }
  // Facts only for Japanese stores (spec §3.4): product photos are the store's works, so no image url.
  const keepImage = store.currency === 'USD';

  const out: Observation[] = [];
  for (const v of p.variants) {
    let priceCents: number;
    try {
      priceCents = parsePriceMinor(v.price, store.currency);
    } catch {
      continue; // unparseable price: skip this variant only
    }
    const variantTitle = v.title === 'Default Title' ? null : v.title;
    const sizeText = `${p.title} ${variantTitle ?? ''}`;
    const sizeMl = (variantTitle ? parseSizeMl(variantTitle) : null) ?? parseSizeMl(p.title);
    if (sizeMl !== null && sizeMl < 200) continue;
    out.push({
      storeId: store.id,
      productId: String(p.id),
      variantId: String(v.id),
      handle: p.handle,
      title: p.title,
      variantTitle,
      vendor: p.vendor,
      productType: p.product_type,
      imageUrl: keepImage ? (p.images[0]?.src ?? null) : null,
      url: `https://${store.domain}/products/${p.handle}`,
      priceCents,
      currency: store.currency,
      available: v.available,
      sizeMl,
      proof: parseProof(sizeText),
      batch: parseBatch(sizeText),
      bottleKey: bottleKey({ title: p.title, variantTitle }),
      searchText: normalizeText(`${p.title} ${variantTitle ?? ''} ${p.vendor}`),
    });
  }
  return out;
}

/** Every variant id present in the raw catalog, regardless of whisky/size/price filtering. */
export function catalogVariantIds(products: ShopifyProduct[]): Set<string> {
  const ids = new Set<string>();
  for (const p of products) for (const v of p.variants) ids.add(String(v.id));
  return ids;
}
