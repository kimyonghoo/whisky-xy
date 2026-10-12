import { describe, it, expect } from 'vitest';
import { KO_BRANDS, displayBottleName, koreanBottleName } from '@/lib/ko-name';

describe('koreanBottleName', () => {
  it('reads brand, age and category in Korean', () => {
    expect(koreanBottleName('Lagavulin 16 Year Old Single Malt Scotch Whisky')).toBe('라가불린 16년 싱글 몰트 스카치 위스키');
  });

  it('reads a bourbon category phrase', () => {
    expect(koreanBottleName('Stagg Kentucky Straight Bourbon Whiskey')).toBe('스태그 켄터키 스트레이트 버번 위스키');
  });

  it('prefers the longest brand phrase and keeps the vintage', () => {
    expect(koreanBottleName('George T. Stagg Kentucky Straight Bourbon Whiskey 2024')).toBe(
      '조지 T. 스태그 켄터키 스트레이트 버번 위스키 2024',
    );
    expect(koreanBottleName('George T Stagg Bourbon 2005 Lot A 130.9 Proof')).toBe('조지 T. 스태그 버번 2005 Lot A 130.9 Proof');
  });

  it('matches straight, curly and missing apostrophes', () => {
    const want = '블랑톤 싱글 배럴 버번';
    expect(koreanBottleName("Blanton's Single Barrel Bourbon")).toBe(want);
    expect(koreanBottleName('Blanton’s Single Barrel Bourbon')).toBe(want);
    expect(koreanBottleName('Blantons Single Barrel Bourbon')).toBe(want);
  });

  it('keeps unknown words in English, in order', () => {
    expect(koreanBottleName('GlenDronach 15 Year Old Revival')).toBe('글렌드로낙 15년 Revival');
  });

  it('returns null when the brand is not in the glossary', () => {
    expect(koreanBottleName('Kentucky Boy Straight Bourbon Whiskey')).toBeNull();
    expect(koreanBottleName('Spey Trutina Single Malt Scotch Whisky')).toBeNull();
    expect(koreanBottleName('')).toBeNull();
  });

  it('drops size and gift-box noise', () => {
    expect(koreanBottleName('Redbreast 15 Year Irish Whiskey 750ml')).toBe('레드브레스트 15년 아이리시 위스키');
    expect(koreanBottleName('Macallan 12 Year Old Double Cask 750 ml (Gift Box)')).toBe('맥캘란 12년 더블 캐스크');
    expect(koreanBottleName('Jameson Irish Whiskey 1L w/ Gift Box')).toBe('제임슨 아이리시 위스키');
    expect(koreanBottleName('Hibiki Japanese Harmony 1.75 L')).toBe('히비키 재패니즈 Harmony');
  });

  it('keeps batch codes and proof as written', () => {
    expect(koreanBottleName('Elijah Craig Barrel Proof Batch C923')).toBe('엘라이저 크레이그 배럴 프루프 배치 C923');
    expect(koreanBottleName('Larceny Barrel Proof B524')).toBe('라세니 배럴 프루프 B524');
    expect(koreanBottleName('Old Forester 1920 Prohibition Style 115 Proof')).toBe('올드 포레스터 1920 Prohibition Style 115 Proof');
  });

  it('is case-insensitive and drops a leading "The"', () => {
    expect(koreanBottleName('LAGAVULIN 16 YEAR OLD')).toBe('라가불린 16년');
    expect(koreanBottleName('lagavulin 16 year old')).toBe('라가불린 16년');
    expect(koreanBottleName('The Glenlivet 12 Years Old Single Malt Scotch Whisky')).toBe('글렌리벳 12년 싱글 몰트 스카치 위스키');
  });

  it('reads every age spelling as N년', () => {
    for (const age of ['12 Year Old', '12 Years', '12 Yr', '12 Yr.', '12-Year', '12YO', '12yrs', '12 Years Old', '12-Year-Old']) {
      expect(koreanBottleName(`Glenfiddich ${age} Single Malt`)).toBe('글렌피딕 12년 싱글 몰트');
    }
  });

  it('collapses whitespace', () => {
    expect(koreanBottleName('  Wild   Turkey  Rare Breed  ')).toBe('와일드 터키 레어 브리드');
  });

  it('covers roughly 150 brands and distilleries', () => {
    expect(Object.keys(KO_BRANDS).length).toBeGreaterThanOrEqual(150);
  });
});

describe('displayBottleName', () => {
  const english = 'Lagavulin 16 Year Old Single Malt Scotch Whisky';

  it('leaves /en untouched', () => {
    expect(displayBottleName({ english, nameKo: '라가불린 16년', locale: 'en' })).toEqual({ primary: english, original: null });
  });

  it('prefers the Dailyshot Korean name on /ko', () => {
    expect(displayBottleName({ english, nameKo: '라가불린 16년', locale: 'ko' })).toEqual({ primary: '라가불린 16년', original: english });
  });

  it('falls back to the glossary on /ko', () => {
    expect(displayBottleName({ english, nameKo: null, locale: 'ko' })).toEqual({
      primary: '라가불린 16년 싱글 몰트 스카치 위스키',
      original: english,
    });
  });

  it('shows English only on /ko for an unknown brand', () => {
    expect(displayBottleName({ english: 'Kentucky Boy Bourbon', locale: 'ko' })).toEqual({ primary: 'Kentucky Boy Bourbon', original: null });
  });
});
