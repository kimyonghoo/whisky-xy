import type { Store } from '@/lib/stores';

/**
 * A test-only store that is crawled but never public. It sits in a live city so that a missing
 * guard would actually surface it. Never added to the real STORES list.
 */
export const PRIVATE_STORE: Store = {
  id: 'private-test', name: 'Private Test Store', domain: 'private.example', city: 'brooklyn',
  address: '1 Private St, Brooklyn, NY 11201', lat: 40.69, lng: -73.99,
  phone: '000-000-0000', taxRate: 0, stockReliability: 'high', onlineOnly: false, publicAllowed: false,
  currency: 'USD', pricesIncludeTax: false, adapter: 'shopify', crawlEnabled: true,
};

/** A public JPY store, for tests of non-USD behaviour. Pass it as `extra` to `withPrivateStore`. */
export const PUBLIC_JPY_STORE: Store = { ...PRIVATE_STORE, id: 'public-jpy-test', publicAllowed: true, currency: 'JPY' };

/**
 * For `vi.mock('@/lib/stores', async (orig) => (await import('./helpers/private-store')).withPrivateStore(await orig()))`.
 * The real stores plus PRIVATE_STORE, with the lookup helpers rebuilt over that list.
 */
export function withPrivateStore<M extends { STORES: Store[] }>(real: M, extra: Store[] = []): M {
  const STORES = [...real.STORES, PRIVATE_STORE, ...extra];
  return {
    ...real,
    STORES,
    getStore: (id: string) => STORES.find((s) => s.id === id),
    isPublicStoreId: (id: string) => STORES.some((s) => s.id === id && s.publicAllowed),
  };
}
