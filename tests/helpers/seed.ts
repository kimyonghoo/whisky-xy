import { bottleKey, normalizeText } from '@/lib/whisky/parse';

let n = 0;


export function seed(over: { storeId: string; title: string; priceCents: number; available?: boolean; variantTitle?: string | null; vendor?: string; searchText?: string }) {
  n++;
  const variantTitle = over.variantTitle ?? null;
  const vendor = over.vendor ?? 'Vendor';
  const now = new Date();
  return {
    storeId: over.storeId, productId: `p${n}`, variantId: `v${n}`, handle: `h${n}`, title: over.title, variantTitle, vendor,
    productType: 'Whiskey', imageUrl: null, url: `https://x/${n}`, priceCents: over.priceCents, available: over.available ?? true,
    sizeMl: 750, proof: null, batch: null, bottleKey: bottleKey({ title: over.title, variantTitle }),
    searchText: over.searchText ?? normalizeText(`${over.title} ${variantTitle ?? ""} ${vendor}`),
    firstSeenAt: now, lastSeenAt: now, checkedAt: now, updatedAt: now,
  };
}

