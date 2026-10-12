import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottleHeader } from '@/components/BottleHeader';
import { BottleResult } from '@/components/BottleResult';
import { displayBottleName } from '@/lib/ko-name';
import type { Locale } from '@/lib/i18n';
import type { BottleGroup, ListingRow } from '@/lib/search';
import type { KrLink } from '@/lib/db/schema';
import { getStore } from '@/lib/stores';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';

const english = 'Lagavulin 16 Year Old Single Malt Scotch Whisky';
const korean = '라가불린 16년 싱글 몰트 스카치 위스키';
const spec = { sizeMl: 750, proof: 86, batch: null };

function header(locale: Locale, variant: 'compact' | 'hero') {
  const name = displayBottleName({ english, locale });
  return renderToStaticMarkup(
    <BottleHeader variant={variant} headingLevel={variant === 'hero' ? 'h1' : 'h3'} title={name.primary} original={name.original} imageUrl={null} spec={spec} />,
  );
}

/** Text of the heading element, tags stripped. */
const heading = (html: string, tag: string) => html.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`))?.[1].replace(/<[^>]+>/g, '');

describe('BottleHeader names', () => {
  for (const variant of ['compact', 'hero'] as const) {
    const tag = variant === 'hero' ? 'h1' : 'h3';

    it(`${variant} on /ko: Korean title with the English name as a second line`, () => {
      const html = header('ko', variant);
      expect(heading(html, tag)).toBe(korean);
      expect(html).toMatch(new RegExp(`<${tag}(?![^>]*lang=)[^>]*>`));
      expect(html).toContain(`<p lang="en" class="`);
      expect(html).toMatch(/<p lang="en"[^>]*text-muted-foreground[^>]*>Lagavulin 16 Year Old Single Malt Scotch Whisky<\/p>/);
    });

    it(`${variant} on /en: the English title alone, no second line`, () => {
      const html = header('en', variant);
      expect(heading(html, tag)).toBe(english);
      expect(html).not.toContain(korean);
      expect(html).not.toContain('<p lang="en"');
      expect(html.split(english).length - 1).toBe(1);
    });
  }

  it('on /ko with an unknown brand: the English title marked lang="en", no second line', () => {
    const name = displayBottleName({ english: 'Kentucky Boy Bourbon', locale: 'ko' });
    const html = renderToStaticMarkup(<BottleHeader title={name.primary} original={name.original} imageUrl={null} spec={spec} />);
    expect(html).toMatch(/<h3 lang="en"[^>]*>Kentucky Boy Bourbon<\/h3>/);
    expect(html).not.toContain('<p lang="en"');
  });
});

describe('BottleResult names', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const store = getStore('dewinespot')!;
  const row = {
    id: 1, storeId: store.id, store, stock: 'instock', taxIncludedCents: 9000, priceCents: 9000, available: true,
    title: 'Stagg Bourbon Whiskey 750ml', variantTitle: null, checkedAt: now,
  } as unknown as ListingRow;
  const link = { bottleKey: 'stagg', nameKo: '스태그', nameEn: 'Stagg', dailyshotProductId: '1', lowPriceKrw: 300000, checkedAt: now } as KrLink;
  const group = (kr?: BottleGroup['kr']): BottleGroup => ({
    bottleKey: 'stagg', displayTitle: 'Stagg Bourbon Whiskey 750ml', sizeMl: 750, proof: null, batch: null, imageUrl: null, rows: [row],
    bestAvailableCents: 9000, kr,
  });
  const render = (g: BottleGroup, locale: Locale) =>
    renderToStaticMarkup(<BottleResult group={g} q="stagg" city="brooklyn" now={now} locale={locale} d={locale === 'ko' ? ko : en} />);

  it('prefers the Dailyshot Korean name on /ko and labels the store list with it', () => {
    const html = render(group({ link, compare: null, fx: null }), 'ko');
    expect(heading(html, 'h3')).toBe('스태그');
    expect(html).toContain('>Stagg Bourbon Whiskey 750ml</p>');
    expect(html).toContain('aria-label="스태그"');
  });

  it('falls back to the glossary on /ko and keeps /en English', () => {
    expect(heading(render(group(), 'ko'), 'h3')).toBe('스태그 버번 위스키');
    const html = render(group({ link, compare: null, fx: null }), 'en');
    expect(heading(html, 'h3')).toBe('Stagg Bourbon Whiskey 750ml');
    // Korean on /en appears only as Dailyshot data (its link label), never as the title or a second line.
    expect(html).not.toContain('<p lang="en"');
    expect(html).toContain('aria-label="Stagg Bourbon Whiskey 750ml"');
  });
});
