import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  LINE_SIBLINGS,
  createWatch,
  deleteWatch,
  listWatches,
  parseWatchForm,
  parseWatchId,
  suggestExcludes,
  type WatchInput,
} from '@/lib/watches';
import { watchMatches } from '@/lib/alerts/match';
import { getStore } from '@/lib/stores';
import type { Listing } from '@/lib/db/schema';
import { normalizeText } from '@/lib/whisky/parse';

describe('suggestExcludes', () => {
  it('suggests sibling lines for an exact line key', () => {
    expect(LINE_SIBLINGS).toEqual({ stagg: ['jr', 'junior', 'george'] });
    expect(suggestExcludes(['Stagg'])).toEqual(['jr', 'junior', 'george']);
    expect(suggestExcludes(['george t stagg'])).toEqual([]); // only exact line key triggers
    expect(suggestExcludes([])).toEqual([]);
    expect(suggestExcludes(['weller'])).toEqual([]);
  });

  it('returns a copy, not the shared array', () => {
    const s = suggestExcludes(['stagg']);
    s.push('x');
    expect(LINE_SIBLINGS.stagg).toEqual(['jr', 'junior', 'george']);
  });
});

describe('parseWatchForm', () => {
  it('parses the brief example and rejects bad input', () => {
    const fd = new FormData(); fd.set('label', 'Stagg'); fd.set('include', 'Stagg'); fd.set('exclude', 'jr, junior,george'); fd.set('maxPrice', '200');
    expect(parseWatchForm(fd)).toEqual({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: ['jr', 'junior', 'george'], batch: null, sizeMl: null, maxPriceCents: 20000, regions: ['brooklyn', 'nj'] });
    fd.set('include', ' , '); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd.set('include', 'stagg'); fd.append('regions', 'tx'); expect(parseWatchForm(fd)).toHaveProperty('error');
  });

  function base(): FormData {
    const fd = new FormData();
    fd.set('label', '');
    fd.set('include', 'Eagle Rare, 10');
    return fd;
  }

  it('defaults the label to the include text and drops blanks / duplicates', () => {
    const fd = base();
    fd.set('exclude', ' , Jr., jr ,');
    const r = parseWatchForm(fd) as WatchInput;
    expect(r.label).toBe('Eagle Rare, 10');
    expect(r.includeTerms).toEqual(['eagle rare', '10']);
    expect(r.excludeTerms).toEqual(['jr']);
    expect(r.maxPriceCents).toBeNull();
  });

  it('accepts explicit regions, batch and size', () => {
    const fd = base();
    fd.append('regions', 'ca');
    fd.append('regions', 'nj');
    fd.set('batch', ' B524 ');
    fd.set('sizeMl', '750');
    fd.set('maxPrice', '$1,299.97');
    const r = parseWatchForm(fd) as WatchInput;
    expect(r.regions).toEqual(['nj', 'ca']);
    expect(r.batch).toBe('B524');
    expect(r.sizeMl).toBe(750);
    expect(r.maxPriceCents).toBe(129997);
  });

  it('normalizes batch like the crawler does (uppercase, no prefix, no leading zeros)', () => {
    const fd = base();
    fd.set('batch', 'batch #024a');
    expect((parseWatchForm(fd) as WatchInput).batch).toBe('24A');
    fd.set('batch', 'b-524');
    expect(parseWatchForm(fd)).toMatchObject({ field: 'batch' });
  });

  it('rejects bad price, size, empty region choice and overlong text', () => {
    let fd = base(); fd.set('maxPrice', 'abc'); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd = base(); fd.set('maxPrice', '0'); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd = base(); fd.set('sizeMl', '75.5'); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd = base(); fd.set('sizeMl', '-1'); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd = base(); fd.set('regionsSubmitted', '1'); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd = base(); fd.set('label', 'x'.repeat(200)); expect(parseWatchForm(fd)).toHaveProperty('error');
    fd = base(); fd.set('include', 'stagg'); fd.set('exclude', 'stagg'); expect(parseWatchForm(fd)).toHaveProperty('error');
  });

  it('reports which field is wrong', () => {
    const fd = base(); fd.set('include', '');
    expect(parseWatchForm(fd)).toMatchObject({ field: 'include' });
    const fd2 = base(); fd2.set('maxPrice', 'x');
    expect(parseWatchForm(fd2)).toMatchObject({ field: 'maxPrice' });
  });
});

describe('parseWatchId', () => {
  it('accepts positive integers only', () => {
    expect(parseWatchId('12')).toBe(12);
    for (const bad of ['0', '-1', '1.5', 'abc', '', ' 1', '1e3', '99999999999', null]) expect(parseWatchId(bad)).toBeNull();
  });
});

describe('watch CRUD', () => {
  it('creates, lists newest first and deletes', async () => {
    const db = await createTestDb();
    const stagg: WatchInput = { label: 'Stagg', includeTerms: ['stagg'], excludeTerms: ['jr', 'junior', 'george'], batch: null, sizeMl: null, maxPriceCents: 20000, regions: ['brooklyn', 'nj'] };
    const a = await createWatch(db, stagg);
    const b = await createWatch(db, { ...stagg, label: 'Weller', includeTerms: ['weller'], excludeTerms: [] });
    expect(a.createdAt).toBeInstanceOf(Date);
    expect((await listWatches(db)).map((w) => w.label)).toEqual(['Weller', 'Stagg']);
    expect(await deleteWatch(db, a.id)).toBe(true);
    expect(await deleteWatch(db, a.id)).toBe(false);
    expect((await listWatches(db)).map((w) => w.id)).toEqual([b.id]);
  });

  it('stored Stagg watch matches Stagg but not Stagg Jr. or George T. Stagg', async () => {
    const db = await createTestDb();
    const fd = new FormData(); fd.set('label', 'Stagg'); fd.set('include', 'Stagg'); fd.set('exclude', suggestExcludes(['Stagg']).join(', '));
    const w = await createWatch(db, parseWatchForm(fd) as WatchInput);
    const store = getStore('dewinespot')!;
    const listing = (title: string) => ({ searchText: normalizeText(title), batch: null, sizeMl: 750, storeId: store.id }) as unknown as Listing;
    expect(watchMatches(w, listing('Stagg Kentucky Straight Bourbon Batch 24A'), store)).toBe(true);
    expect(watchMatches(w, listing('Stagg Jr. Bourbon'), store)).toBe(false);
    expect(watchMatches(w, listing('George T. Stagg 2024'), store)).toBe(false);
  });
});
