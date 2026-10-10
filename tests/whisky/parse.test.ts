import { describe, it, expect } from 'vitest';
import { isWhiskyProduct, parseSizeMl, parseProof, parseBatch, normalizeText, bottleKey } from '@/lib/whisky/parse';

describe('isWhiskyProduct', () => {
  it('accepts whisky and rejects non-whisky', () => {
    expect(isWhiskyProduct({ title: 'Stagg Kentucky Straight Bourbon Whiskey', productType: 'Bourbon', tags: [] })).toBe(true);
    expect(isWhiskyProduct({ title: 'Nikka From the Barrel', productType: 'Spirits - Japanese Whisky', tags: [] })).toBe(true);
    expect(isWhiskyProduct({ title: 'Jack Daniels Single Barrel Rye 94 Proof', productType: 'WHISKY', tags: [] })).toBe(true);
    expect(isWhiskyProduct({ title: "Jack Daniel's & Coca-Cola Zero Sugar Variety 6-Pack 355ml", productType: 'Cans & Cocktails', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: "Jack Daniel's Honey Liqueur", productType: 'Liqueur', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: 'Expresiones Del Corazon George T. Stagg Anejo Tequila', productType: 'Tequila', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: "Stag's Leap Artemis Cabernet Sauvignon 2022 750ml", productType: 'Wine', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: 'Barrell Seagrass Cask Finished Rye Whiskey', productType: 'Whiskey', tags: [] })).toBe(true);
  });
});

describe('parseSizeMl', () => {
  it('parses sizes', () => {
    expect(parseSizeMl('Buffalo Trace Single Oak 375ml / Half-Bottle')).toBe(375);
    expect(parseSizeMl('Jack Daniels Bonded Tennessee Whiskey 1 Liter')).toBe(1000);
    expect(parseSizeMl('Sinatra Select 90 Proof 1L')).toBe(1000);
    expect(parseSizeMl('Titos 1.75L')).toBe(1750);
    expect(parseSizeMl('1 / 750 ml')).toBe(750);
    expect(parseSizeMl('Stagg Kentucky Straight Bourbon Whiskey')).toBeNull();
  });
});

describe('parseProof', () => {
  it('parses proof', () => {
    expect(parseProof('Stagg Jr Barrel Proof Bourbon Batch 9 131.9 Proof')).toBe(131.9);
    expect(parseProof("Jack Daniel's Single Barrel Proof 125")).toBe(125);
    expect(parseProof("Jack Daniel's Whiskey Single Barrel 94º")).toBe(94);
    expect(parseProof("Jack Daniel's Whiskey Single Barrel 94°")).toBe(94);
    expect(parseProof('Doctor Bird Private Barrel Cask Strength (119 Proof)')).toBe(119);
    expect(parseProof("Jack Daniel's Barrel Proof Single Barrel Tennessee Whiskey")).toBeNull();
  });
});

describe('parseBatch', () => {
  it('parses batch', () => {
    expect(parseBatch('Stagg Jr Barrel Proof Bourbon Batch 9 131.9 Proof')).toBe('9');
    expect(parseBatch('Jack Daniels 12Yr Batch # 2')).toBe('2');
    expect(parseBatch("Jack Daniel's 10 Year Tennessee Whiskey Batch 05 700ml")).toBe('5');
    expect(parseBatch('Stagg Batch 24A')).toBe('24A');
    expect(parseBatch('Elijah Craig Barrel Proof B524 Bourbon')).toBe('B524');
    expect(parseBatch('Stagg Kentucky Straight Bourbon Whiskey')).toBeNull();
  });
});

describe('normalizeText', () => {
  it('normalizes', () => {
    expect(normalizeText("Jack Daniel’s & Coca-Cola  Café")).toBe('jack daniels and coca cola cafe');
  });
});

describe('bottleKey', () => {
  const k = (title: string, variantTitle: string | null = null) => bottleKey({ title, variantTitle });
  it('groups conservatively', () => {
    expect(k("Jack Daniel's Barrel Proof Single Barrel Tennessee Whiskey"))
      .toBe(k("Jack Daniel's Single Barrel Barrel Proof Tennessee Whiskey"));
    expect(k('Stagg Kentucky Straight Bourbon Whiskey')).not.toBe(k('Stagg Jr Kentucky Straight Bourbon Whiskey'));
    expect(k('Stagg Kentucky Straight Bourbon Whiskey')).not.toBe(k('George T. Stagg Kentucky Straight Bourbon Whiskey'));
    expect(k("Jack Daniel's Barrel Proof Single Barrel Tennessee Whiskey"))
      .not.toBe(k("Jack Daniel's Barrel Proof Single Barrel Tennessee Rye Whiskey"));
    expect(k('Stagg Jr Barrel Proof Bourbon Batch 9 131.9 Proof')).not.toBe(k('Stagg Jr Barrel Proof Bourbon Batch 14 130.2 Proof'));
    expect(k('Jack Daniels Bonded Tennessee Whiskey', '700ml')).not.toBe(k('Jack Daniels Bonded Tennessee Whiskey', '1 Liter'));
  });
});
