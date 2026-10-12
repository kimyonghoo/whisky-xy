import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCity } from '@/lib/geo';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

const { ComingSoonCompactView, ComingSoonForUrlCity } = await import('@/components/ComingSoonCompact');

describe('ComingSoonCompactView', () => {
  it('names the city and says it is in preparation, in either locale', () => {
    const tokyo = getCity('tokyo')!;
    const k = renderToStaticMarkup(<ComingSoonCompactView city={tokyo} d={ko} />);
    expect(k).toContain(ko.city.tokyo);
    expect(k).toContain(ko.soon.title);
    expect(k).toContain(ko.soon.pageNote);
    const e = renderToStaticMarkup(<ComingSoonCompactView city={tokyo} d={en} />);
    expect(e).toContain(en.city.tokyo);
    expect(e).toContain(en.soon.pageNote);
    expect(e).not.toMatch(/[가-힣]/);
  });
});

describe('ComingSoonForUrlCity', () => {
  beforeEach(() => {
    search = '';
  });
  it('shows the notice for a coming-soon ?city=', () => {
    search = 'city=taipei';
    expect(renderToStaticMarkup(<ComingSoonForUrlCity />)).toContain(ko.city.taipei);
  });
  it('shows nothing for a live, invalid or missing city', () => {
    for (const s of ['city=la', 'city=xyz', '', 'region=ca']) {
      search = s;
      expect(renderToStaticMarkup(<ComingSoonForUrlCity />)).toBe('');
    }
  });
});
