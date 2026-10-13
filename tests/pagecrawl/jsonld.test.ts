import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities, parseJsonLdOffer } from '@/lib/pagecrawl/jsonld';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
const ld = (obj: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head></html>`;

describe('parseJsonLdOffer', () => {
  it('reads the in-stock Shinanoya item', () => {
    expect(parseJsonLdOffer(fixture('shinanoya-item-instock.html'))).toEqual({
      name: 'ベンリアック 12年　スモーキートゥエルブ（正規）',
      sku: null,
      price: '5478',
      currency: 'JPY',
      availability: 'in',
    });
  });

  it('reads the sold-out Shinanoya item', () => {
    const o = parseJsonLdOffer(fixture('shinanoya-item-soldout.html'));
    expect(o).toMatchObject({ price: '92180', currency: 'JPY', availability: 'out' });
    expect(o?.name).toContain('ブルイックラディ[1991] 33年');
  });

  it('returns null when there is no JSON-LD, or no Product in it', () => {
    expect(parseJsonLdOffer('<html><head><title>x</title></head></html>')).toBeNull();
    expect(parseJsonLdOffer(ld({ '@type': 'Organization', name: 'Shop' }))).toBeNull();
  });

  it('finds the Product inside an @graph array', () => {
    const html = ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [] },
        { '@type': 'Product', name: '山崎 12年', sku: 'Y12', offers: { '@type': 'Offer', price: 27500, priceCurrency: 'JPY', availability: 'https://schema.org/InStock' } },
      ],
    });
    expect(parseJsonLdOffer(html)).toEqual({ name: '山崎 12年', sku: 'Y12', price: '27500', currency: 'JPY', availability: 'in' });
  });

  it('finds the Product in a top-level array and in a later block after an invalid one', () => {
    const product = { '@type': ['Product'], name: 'A', offers: { price: '100', priceCurrency: 'JPY', availability: 'SoldOut' } };
    expect(parseJsonLdOffer(`<script type="application/ld+json">[${JSON.stringify(product)}]</script>`)?.availability).toBe('out');
    const html = `<script type="application/ld+json">{ not json </script>${ld(product)}`;
    expect(parseJsonLdOffer(html)?.price).toBe('100');
  });

  it('reads an offers array whose offers agree', () => {
    const offer = { '@type': 'Offer', price: '27,500', priceCurrency: 'JPY', availability: 'http://schema.org/OutOfStock' };
    const o = parseJsonLdOffer(ld({ '@type': 'Product', name: 'X', offers: [offer, { ...offer }] }));
    expect(o).toMatchObject({ price: '27,500', currency: 'JPY', availability: 'out' });
  });

  it('does not guess between offers that disagree', () => {
    const a = { '@type': 'Offer', price: '5000', priceCurrency: 'JPY', availability: 'https://schema.org/InStock' };
    const o = parseJsonLdOffer(ld({ '@type': 'Product', name: 'X', offers: [a, { ...a, price: '9000' }] }));
    expect(o).toMatchObject({ name: 'X', price: null, availability: null });
  });

  it('gives no single price for an AggregateOffer', () => {
    const o = parseJsonLdOffer(ld({ '@type': 'Product', name: 'X', offers: { '@type': 'AggregateOffer', lowPrice: '1', highPrice: '9', priceCurrency: 'JPY' } }));
    expect(o).toMatchObject({ price: null });
  });

  it('maps availability strictly and leaves anything else null', () => {
    const avail = (availability: unknown) =>
      parseJsonLdOffer(ld({ '@type': 'Product', name: 'X', offers: { price: '1', priceCurrency: 'JPY', availability } }))?.availability;
    expect(avail('http://schema.org/InStock')).toBe('in');
    expect(avail('https://schema.org/LimitedAvailability')).toBe('in');
    expect(avail('InStock')).toBe('in');
    expect(avail('https://schema.org/OutOfStock')).toBe('out');
    expect(avail('https://schema.org/Discontinued')).toBe('out');
    expect(avail('https://schema.org/PreOrder')).toBeNull();
    expect(avail('https://schema.org/InStoreOnly')).toBeNull();
    expect(avail('')).toBeNull();
    expect(avail(undefined)).toBeNull();
    expect(avail(true)).toBeNull();
  });

  it('reads price and currency from a priceSpecification', () => {
    const o = parseJsonLdOffer(ld({ '@type': 'Product', name: 'X', offers: { priceSpecification: { price: 3300, priceCurrency: 'JPY' }, availability: 'InStock' } }));
    expect(o).toMatchObject({ price: '3300', currency: 'JPY' });
  });

  it('returns null fields rather than non-string junk', () => {
    const o = parseJsonLdOffer(ld({ '@type': 'Product', name: { text: 'x' }, offers: { price: { v: 1 }, priceCurrency: 3 } }));
    expect(o).toEqual({ name: null, sku: null, price: null, currency: null, availability: null });
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes the common named and numeric entities once', () => {
    expect(decodeHtmlEntities('Malt &amp; Grain &#39;A&#x27; &quot;B&quot; &lt;&gt;&nbsp;x &amp;amp;')).toBe(`Malt & Grain 'A' "B" <> x &amp;`);
  });
});
