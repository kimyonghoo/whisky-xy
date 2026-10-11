import { describe, it, expect } from 'vitest';
import {
  correctToken,
  editDistance,
  literalPhrase,
  matchesPhrase,
  parseQuery,
  queryPhrase,
  translateKorean,
  type Vocab,
} from '@/lib/search-query';

const vocab: Vocab = new Map([
  ['jack', 300], ['daniels', 290], ['single', 900], ['barrel', 2247], ['proof', 1243], ['prrof', 1],
  ['stagg', 70], ['weller', 200], ['blantons', 97],
]);

describe('translateKorean', () => {
  it('maps Korean spellings, with or without spaces, longest match first', () => {
    expect(translateKorean('스태그').trim()).toBe('stagg');
    expect(translateKorean('잭 다니엘 싱글배럴').replace(/\s+/g, ' ').trim()).toBe('jack daniels single barrel');
    expect(translateKorean('조지티스태그').trim()).toBe('george t stagg');
    expect(translateKorean('맥캘란 12년').replace(/\s+/g, ' ').trim()).toBe('macallan 12');
  });
  it('drops unknown Hangul and keeps Latin text', () => {
    expect(translateKorean('웰러 full proof').replace(/\s+/g, ' ').trim()).toBe('weller full proof');
    expect(translateKorean('뷁').trim()).toBe('');
  });
});

describe('editDistance', () => {
  it('counts edits including adjacent swaps', () => {
    expect(editDistance('prrof', 'proof', 2)).toBe(1);
    expect(editDistance('barel', 'barrel', 2)).toBe(1);
    expect(editDistance('stgag', 'stagg', 2)).toBe(1);
    expect(editDistance('abc', 'abcdef', 1)).toBe(2);
  });
});

describe('correctToken', () => {
  it('fixes typos to the most common close word', () => {
    expect(correctToken('barel', vocab)).toBe('barrel');
    expect(correctToken('weler', vocab)).toBe('weller');
  });
  it('fixes a typo even when a listing has the same typo, if the fix is far more common', () => {
    expect(correctToken('prrof', vocab)).toBe('proof');
  });
  it('leaves words that match as typed, short words and numbers alone', () => {
    expect(correctToken('stag', vocab)).toBeNull(); // substring of stagg
    expect(correctToken('blanton', vocab)).toBeNull();
    expect(correctToken('jk', vocab)).toBeNull();
    expect(correctToken('101', vocab)).toBeNull();
    expect(correctToken('zzzzzz', vocab)).toBeNull();
  });
});

describe('parseQuery', () => {
  it('expands abbreviations and keeps the literal as an alternative', () => {
    expect(parseQuery('sbbp')).toEqual([[['single', 'barrel', 'barrel', 'proof'], ['sbbp']]]);
  });
  it('stems plurals so "daniels" and "daniel" find the same bottles', () => {
    expect(parseQuery("jack daniel's")).toEqual([[['jack']], [['daniel']]]);
    expect(parseQuery('jack daniel')).toEqual([[['jack']], [['daniel']]]);
  });
  it('fixes typos with a vocabulary, keeping the literal as fallback', () => {
    expect(parseQuery('barel prrof', vocab)).toEqual([[['barrel'], ['barel']], [['proof'], ['prrof']]]);
  });
  it('turns Korean into English terms; unknown-only Korean yields nothing', () => {
    expect(parseQuery('스태그')).toEqual([[['stagg']]]);
    expect(parseQuery('뷁')).toEqual([]);
  });
});

describe('phrases', () => {
  it('says what was searched only when interpretation changed it', () => {
    expect(queryPhrase(parseQuery('스태그'))).not.toBe(literalPhrase('스태그'));
    expect(queryPhrase(parseQuery('jack daniels'))).toBe(literalPhrase('jack daniels'));
    expect(queryPhrase(parseQuery('sbbp'))).toBe('single barrel barrel proof');
  });
  it('matches consecutive word prefixes', () => {
    expect(matchesPhrase('jack daniels single barrel barrel proof rye', 'jack daniel single barrel barrel proof')).toBe(true);
    expect(matchesPhrase('jack daniels single barrel 94 proof', 'jack daniel single barrel barrel proof')).toBe(false);
    expect(matchesPhrase('benchmark old no 8 buffalo trace', 'buffalo trace')).toBe(true);
  });
});
