import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { endPour, isPageNavigation, startPour } from '@/lib/pour';
import { BrandMark } from '@/components/Wordmark';
import { BottleImage } from '@/components/BottleImage';

const here = new URL('https://whisky.example/ko?q=stagg&city=la');
const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const link = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({
  href,
  target: '',
  download: false,
  ...extra,
});

describe('isPageNavigation', () => {
  it('starts for a plain click on an in-app link to another page or query', () => {
    expect(isPageNavigation(plain, link('/ko/map?city=la'), here)).toBe(true);
    expect(isPageNavigation(plain, link('/ko?q=lagavulin&city=la'), here)).toBe(true);
    expect(isPageNavigation(plain, link('https://whisky.example/en?q=stagg&city=la'), here)).toBe(true);
  });

  it('does not start for the current URL or a hash-only jump', () => {
    expect(isPageNavigation(plain, link('/ko?q=stagg&city=la'), here)).toBe(false);
    expect(isPageNavigation(plain, link('/ko?q=stagg&city=la#main'), here)).toBe(false);
    expect(isPageNavigation(plain, link('#main'), here)).toBe(false);
  });

  it('does not start for other sites, new tabs, downloads or modified clicks', () => {
    expect(isPageNavigation(plain, link('https://dailyshot.co/item/1'), here)).toBe(false);
    expect(isPageNavigation(plain, link('/ko/map', { target: '_blank' }), here)).toBe(false);
    expect(isPageNavigation(plain, link('/ko/map', { download: true }), here)).toBe(false);
    expect(isPageNavigation({ ...plain, metaKey: true }, link('/ko/map'), here)).toBe(false);
    expect(isPageNavigation({ ...plain, ctrlKey: true }, link('/ko/map'), here)).toBe(false);
    expect(isPageNavigation({ ...plain, button: 1 }, link('/ko/map'), here)).toBe(false);
  });

  it('allows an explicit same-tab target', () => {
    expect(isPageNavigation(plain, link('/ko/map', { target: '_self' }), here)).toBe(true);
  });
});

describe('startPour / endPour', () => {
  const dataset: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    for (const k of Object.keys(dataset)) delete dataset[k];
    vi.stubGlobal('document', { documentElement: { dataset } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fills while loading, then finishes and clears', () => {
    startPour();
    expect(dataset.pour).toBe('filling');
    vi.advanceTimersByTime(600);
    endPour();
    expect(dataset.pour).toBe('done');
    vi.advanceTimersByTime(500);
    expect(dataset.pour).toBeUndefined();
  });

  it('clears silently when the page arrives almost at once (no flash)', () => {
    startPour();
    vi.advanceTimersByTime(50);
    endPour();
    expect(dataset.pour).toBeUndefined();
  });

  it('never pours forever when a navigation does not arrive', () => {
    startPour();
    vi.advanceTimersByTime(15_000);
    expect(dataset.pour).toBe('done');
  });

  it('ignores an end without a start', () => {
    endPour();
    expect(dataset.pour).toBeUndefined();
  });
});

describe('BrandMark', () => {
  it('draws the rocks glass with a hidden liquid layer clipped to the glass', () => {
    const html = renderToStaticMarkup(<BrandMark />);
    expect(html).toContain('class="pour-liquid"');
    const id = /<clipPath id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`clip-path="url(#${id})"`);
  });

  it('gives each mark its own clip id', () => {
    const html = renderToStaticMarkup(
      <>
        <BrandMark />
        <BrandMark />
      </>,
    );
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('BottleImage', () => {
  it('puts a photo under the spotlight', () => {
    const html = renderToStaticMarkup(<BottleImage src="https://cdn.example/b.jpg" alt="Stagg" />);
    expect(html).toContain('bottle-spot');
    expect(html).toContain('src="https://cdn.example/b.jpg"');
  });

  it('keeps the dark tile when there is no photo', () => {
    const html = renderToStaticMarkup(<BottleImage src={null} alt="Stagg" />);
    expect(html).not.toContain('bottle-spot');
    expect(html).toContain('bg-muted');
  });
});
