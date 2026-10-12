import { describe, it, expect } from 'vitest';
import { ko } from '@/lib/i18n/ko';

/** 해요체 endings (a bare 요 is fine: 필요, 주요, 중요 are nouns). */
const HAEYO = /(해요|세요|에요|예요|어요|아요|여요|네요|돼요|줘요|봐요|려요|까요|게요|나요|래요|데요|군요|죠)[.?!…]?$/;

/** Intentionally English lines (ClerkMode is read by the store clerk). */
const ALLOW = new Set(['card.clerkQuestion']);

/** Plausible argument sets: functions are called with each, so both sides of a branch are covered. */
const ARG_SETS: ((n: number) => unknown[])[] = [
  (n) => Array.from({ length: n }, () => 3),
  (n) => Array.from({ length: n }, () => 0),
  (n) => Array.from({ length: n }, () => 'Lagavulin 16'),
  (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 3 : null)),
];

function collect(value: unknown, path: string, out: { path: string; text: string }[]) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (typeof value === 'function') {
    for (const make of ARG_SETS) collect((value as (...a: unknown[]) => unknown)(...make(Math.max(value.length, 1))), path, out);
  } else if (Array.isArray(value)) value.forEach((v, i) => collect(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, path ? `${path}.${k}` : k, out);
  }
}

const strings: { path: string; text: string }[] = [];
collect(ko, '', strings);

describe('Korean copy tone (합니다체)', () => {
  it('walks a meaningful number of strings', () => {
    expect(strings.length).toBeGreaterThan(300);
  });

  it('uses no 해요체 endings', () => {
    const offenders = strings.filter((s) => !ALLOW.has(s.path) && HAEYO.test(s.text.trim()));
    expect(offenders).toEqual([]);
  });

  it('suggests rather than orders: no "~해 보십시오" imperatives', () => {
    expect(strings.filter((s) => /보십시오/.test(s.text))).toEqual([]);
  });

  it('uses no exclamation marks', () => {
    expect(strings.filter((s) => s.text.includes('!'))).toEqual([]);
  });

  it('keeps the ClerkMode line in English', () => {
    expect(ko.card.clerkQuestion).toBe('Do you have this bottle?');
  });
});

describe('Whisky Index copy values', () => {
  it('names the site', () => {
    expect(ko.site.title).toBe('Whisky Index');
    expect(ko.site.titleKo).toBe('위스키 인덱스');
  });

  it('uses the hero copy verbatim', () => {
    expect(ko.search.heroEyebrow).toBe('New York · Los Angeles · Tokyo · Taipei');
    expect(ko.search.heroTitle).toBe('위스키 성지를 찾아서');
    expect(ko.search.heroLead).toBe('오늘 어느 리쿼샵에서 사야 가장 좋은지, 세금까지 더한 가격과 재고로 알려 드립니다.');
    expect(ko.search.placeholder).toBe('증류소, 숙성 연수, 보틀명으로 검색');
    expect(ko.search.curatedLabel).toBe('CURATED');
  });

  it('curates 5–6 searches across styles', () => {
    expect(ko.search.examples.length).toBeGreaterThanOrEqual(5);
    expect(ko.search.examples.length).toBeLessThanOrEqual(6);
  });

  it('labels the three how-to steps', () => {
    expect(ko.search.how.map((h) => h.kicker)).toEqual(['01 · SEARCH', '02 · COMPARE', '03 · SHARE']);
  });

  it('keeps the city-section labels in English capitals', () => {
    expect(ko.search.yourCity).toBe('YOUR CITY');
    expect(ko.search.elsewhere('UNITED STATES')).toBe('ELSEWHERE IN UNITED STATES');
  });

  it('has the city selector and language switch', () => {
    expect(ko.lang).toMatchObject({ ko: 'KO', en: 'EN' });
    expect(typeof ko.lang.label).toBe('string');
    expect(ko.citySelect.current('미국', '브루클린')).toContain('브루클린');
    expect(ko.citySelect.storesCount(4)).toContain('4곳');
    expect(ko.soon.body('도쿄')).toContain('도쿄');
    expect(ko.soon.back('브루클린')).toContain('브루클린');
  });
});
