import { describe, it, expect } from 'vitest';
import { isWhiskyProduct, parseSizeMl, parseProof, parseBatch, normalizeText, bottleKey } from '@/lib/whisky/parse';
import regression from '../fixtures/parse-regression.json';

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

describe('fix round 1', () => {
  it('isWhiskyProduct handles cask finishes and beer', () => {
    expect(isWhiskyProduct({ title: 'Glendronach Port Wine Cask Finish Scotch', productType: 'Single Malt Scotch', tags: [] })).toBe(true);
    expect(isWhiskyProduct({ title: 'Cabernet Cask Finished Bourbon', productType: 'Bourbon', tags: [] })).toBe(true);
    expect(isWhiskyProduct({ title: 'Bourbon Barrel Aged Stout', productType: 'Beer', tags: [] })).toBe(false);
  });
  it('parseBatch ignores small batch / age / proof', () => {
    expect(parseBatch('Four Roses Small Batch 90 Proof')).toBeNull();
    expect(parseBatch('Small Batch 12 Year')).toBeNull();
    expect(parseBatch('Batch 12Yr')).toBeNull();
    expect(parseBatch('Jack Daniels 12Yr Batch # 2')).toBe('2');
    expect(bottleKey({ title: 'Four Roses Small Batch Bourbon 90 Proof', variantTitle: null }).includes('|b|')).toBe(true);
  });
  it('parseProof ignores sizes; Stagg Jr vs George T', () => {
    expect(parseProof('Barrel Proof 100ml')).toBeNull();
    expect(bottleKey({ title: 'Stagg Jr Kentucky Straight Bourbon Whiskey', variantTitle: null }))
      .not.toBe(bottleKey({ title: 'George T. Stagg Kentucky Straight Bourbon Whiskey', variantTitle: null }));
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

describe('bottleKey canonicalization (I1)', () => {
  const k = (title: string, variantTitle: string | null = null) => bottleKey({ title, variantTitle });

  it('groups GTS 2024 listings from different stores that differ only in marketing words or missing size', () => {
    const gts2024 = [
      'George T. Stagg Kentucky Straight Bourbon Whiskey 2024 Release 750ml', // store A
      'BTAC George T. Stagg Bourbon 2024 750ml', // store B
      'Buffalo Trace Antique Collection George T. Stagg 2024', // store C, no size
      'George T Stagg 2024 Edition Bourbon Whiskey', // store D
    ].map((t) => k(t));
    expect(new Set(gts2024).size).toBe(1);
    expect(gts2024[0]).toBe('2024 george stagg t|p|b|s750');

    const gts2023 = [
      'George T. Stagg Bourbon 2023 Release 750ml',
      'BTAC George T Stagg 2023',
    ].map((t) => k(t));
    expect(new Set(gts2023).size).toBe(1);

    // 2023 and 2024 releases are different bottles: two groups in total.
    expect(new Set([...gts2024, ...gts2023]).size).toBe(2);
  });

  it('keeps Stagg, Stagg Jr. and George T. Stagg in three separate groups', () => {
    const stagg = k('Stagg Kentucky Straight Bourbon Whiskey 750ml');
    const staggJr = k('Stagg Jr. Kentucky Straight Bourbon Whiskey 750ml');
    const gts = k('George T. Stagg Kentucky Straight Bourbon Whiskey 750ml');
    expect(new Set([stagg, staggJr, gts]).size).toBe(3);
    // and their marketing-word variants still land in their own group
    expect(k('Stagg Bourbon')).toBe(stagg);
    expect(k('Stagg Jr Bourbon Whiskey')).toBe(staggJr);
    expect(k('BTAC George T. Stagg Bourbon')).toBe(gts);
    expect(k('Stagg Bourbon')).not.toBe(k('Stagg Jr Bourbon'));
    expect(k('Stagg Jr Bourbon')).not.toBe(k('George T Stagg Bourbon'));
    expect(k('Stagg Bourbon')).not.toBe(k('George T Stagg Bourbon'));
  });

  it('strips "buffalo trace antique collection" only as a whole phrase', () => {
    expect(k('Buffalo Trace Kentucky Straight Bourbon 750ml')).toBe('buffalo trace|p|b|s750');
    expect(k('Buffalo Trace Antique Collection Sazerac Rye 18 Year'))
      .not.toBe(k('Buffalo Trace Bourbon'));
  });

  it('treats a missing size as 750 ml but keeps stated other sizes apart', () => {
    expect(k('Blantons Single Barrel Bourbon')).toBe(k('Blantons Single Barrel Bourbon 750ml'));
    expect(k('Blantons Single Barrel Bourbon', '1.75L')).not.toBe(k('Blantons Single Barrel Bourbon'));
    expect(k('Blantons Single Barrel Bourbon 1L')).not.toBe(k('Blantons Single Barrel Bourbon'));
  });

  it('keeps proof and rye in the key (missing vs present proof stays split, the safe direction)', () => {
    expect(k('George T Stagg 2024 Release 138.7 Proof')).not.toBe(k('George T. Stagg 2024 Release'));
    expect(k('Sazerac Rye Whiskey')).not.toBe(k('Sazerac Whiskey'));
  });
});

describe('Japanese text', () => {
  const k = (title: string, variantTitle: string | null = null) => bottleKey({ title, variantTitle });

  it('parseSizeMl reads ㎖, full-width and plain ml', () => {
    expect(parseSizeMl('サントリー 山崎 12年 700㎖')).toBe(700);
    expect(parseSizeMl('容量 700ml')).toBe(700);
    expect(parseSizeMl('ｍｌ表記 ７００ｍｌ')).toBe(700);
    expect(parseSizeMl('1.75L')).toBe(1750);
    expect(parseSizeMl('１．７５Ｌ')).toBe(1750);
    expect(parseSizeMl('山崎 12年 シングルモルト')).toBeNull();
  });

  it('isWhiskyProduct recognises Japanese whisky words', () => {
    for (const title of ['山崎 12年 シングルモルトウイスキー', 'ニッカ ウィスキー', 'ウヰスキー 白州', 'ｳｲｽｷｰ 響', '竹鶴 ブレンデッド 700ml', 'ウイスキ']) {
      expect(isWhiskyProduct({ title, productType: '', tags: [] }), title).toBe(true);
    }
  });

  it('isWhiskyProduct rejects Japanese non-whisky', () => {
    expect(isWhiskyProduct({ title: '梅酒', productType: 'リキュール', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: '芋焼酎 ウイスキー樽貯蔵', productType: '', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: '純米大吟醸 日本酒', productType: '', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: 'ウイスキーグラス', productType: '', tags: [] })).toBe(false);
    expect(isWhiskyProduct({ title: 'ウイスキー ギフト券', productType: '', tags: [] })).toBe(false);
  });

  it('isWhiskyProduct with whiskyOnlyCatalog drops the whisky-word requirement but keeps every reject term', () => {
    const plain = { title: '山崎 12年 700ml', productType: '', tags: [] };
    expect(isWhiskyProduct(plain, { whiskyOnlyCatalog: true })).toBe(true);
    expect(isWhiskyProduct(plain)).toBe(false);
    expect(isWhiskyProduct(plain, { whiskyOnlyCatalog: false })).toBe(false);
    const glass = { title: 'ウイスキーグラス', productType: '', tags: [] };
    expect(isWhiskyProduct(glass, { whiskyOnlyCatalog: true })).toBe(false);
    expect(isWhiskyProduct(glass)).toBe(false);
    expect(isWhiskyProduct({ title: '梅酒 700ml', productType: '', tags: [] }, { whiskyOnlyCatalog: true })).toBe(false);
    expect(isWhiskyProduct({ title: 'Some Cabernet Sauvignon 750ml', productType: '', tags: [] }, { whiskyOnlyCatalog: true })).toBe(false);
  });

  it('isWhiskyProduct rejects case sales, sets and glass bundles with or without whiskyOnlyCatalog', () => {
    for (const title of ['【ケース販売】ラガヴーリン 8年', 'ラガヴーリン 8年 ケース 6本', '山崎 飲み比べセット', '白州 3本セット', '響 ギフト 2本セット', '【グラス付き】I.W.ハーパー 12年（正規）']) {
      expect(isWhiskyProduct({ title, productType: '', tags: [] }), title).toBe(false);
      expect(isWhiskyProduct({ title, productType: '', tags: [] }, { whiskyOnlyCatalog: true }), `flag: ${title}`).toBe(false);
      expect(isWhiskyProduct({ title: `${title} ウイスキー`, productType: 'ウイスキー', tags: [] }), `worded: ${title}`).toBe(false);
    }
    expect(isWhiskyProduct({ title: 'サントリー 山崎 12年 700ml', productType: '', tags: [] }, { whiskyOnlyCatalog: true })).toBe(true);
  });

  it('rejects only sale-shaped case/set wording: premium single bottles in a case and サマセット are kept', () => {
    for (const title of ['響 30年 専用ケース付き 700ml', 'マッカラン 25年 木製ケース入り', 'グレンフィディック 18年 ウッドケース', 'サマセット 12年']) {
      expect(isWhiskyProduct({ title, productType: '', tags: [] }, { whiskyOnlyCatalog: true }), title).toBe(true);
      expect(isWhiskyProduct({ title: `${title} ウイスキー`, productType: '', tags: [] }), `worded: ${title}`).toBe(true);
    }
    for (const title of [
      '【ケース販売】ラガヴーリン 8年', 'ラガヴーリン 8年 ケース 6本', 'ラガヴーリン 8年 ケース（12本）', '山崎 飲み比べセット',
      '白州 ×6本', '白州 x 6本', '知多 12本入り', '知多 6本入', '白州 3本セット', '響 ギフトセット', 'ラフロイグ ケース売り', '山崎 セット販売',
    ]) {
      expect(isWhiskyProduct({ title, productType: '', tags: [] }, { whiskyOnlyCatalog: true }), title).toBe(false);
    }
  });

  it('multi-bottle counts must be 2 or more; single-bottle wording, cask finishes and gift tins pass', () => {
    const flag = { whiskyOnlyCatalog: true };
    for (const title of [
      '響 21年 700ml×1本', 'マッカラン 12年 1本入り化粧箱', '山崎 12年 1本セット', '白州 1本組', '梅酒樽フィニッシュ 山崎',
      'グレンモーレンジィ ギフト缶入り', 'ラフロイグ 10年 化粧缶付き 700ml',
    ]) {
      expect(isWhiskyProduct({ title, productType: '', tags: [] }, flag), title).toBe(true);
    }
    for (const title of [
      '白州 ×2本', '知多 12本入', '白州 3本セット', '山崎 2本組', '響 十二本入り', '山崎 二本セット', 'ウイスキー 詰め合わせ', 'ウイスキー 詰合せ',
      '（単品）三郎丸蒸留所のスモーキーハイボール【三郎丸蒸留所】', '角 缶チューハイ', '山崎 350ml缶', 'ハイボール 缶 350ml', '梅酒', 'チョーヤ 梅酒 720ml',
    ]) {
      expect(isWhiskyProduct({ title, productType: '', tags: [] }, flag), title).toBe(false);
    }
  });

  it('a size labelled 容量 wins over another size in the text, for parseSizeMl and bottleKey alike', () => {
    expect(parseSizeMl('山崎 12年 750ml 容量 700ml')).toBe(700);
    expect(parseSizeMl('山崎 12年 750ml 容量：1L')).toBe(1000);
    const key = bottleKey({ title: '山崎 12年 750ml', variantTitle: '容量 700ml' });
    expect(key).toMatch(/\|s700$/);
    expect(key).toBe(bottleKey({ title: '山崎 12年 700ml', variantTitle: null }));
    expect(bottleKey({ title: '山崎 12年', variantTitle: '容量 700ml' })).toBe(bottleKey({ title: '山崎 12年 700ml', variantTitle: null }));
  });

  it('normalizeText keeps Han, kana and the long-vowel mark', () => {
    expect(normalizeText('山崎 12年')).toBe('山崎 12年');
    expect(normalizeText('ラフロイグ')).toBe('ラフロイグ');
    expect(normalizeText('山崎・１２年（ＮＶ）')).toBe('山崎 12年 nv');
  });

  it('normalizeText keeps voiced kana distinct and folds half-width kana', () => {
    expect(normalizeText('ガ')).not.toBe(normalizeText('カ'));
    expect(normalizeText('ﾊﾞｰﾎﾞﾝ')).toBe('バーボン');
    expect(normalizeText('ぱ')).toBe('ぱ');
  });

  it('bottleKey separates Japanese bottles and reads the size', () => {
    expect(k('山崎 12年 700ml')).not.toBe(k('白州 12年 700ml'));
    expect(k('山崎 12年 700ml')).not.toBe(k('山崎 18年 700ml'));
    expect(k('山崎 12年 700ml')).toBe(k('山崎 12年 ７００㎖'));
    expect(k('山崎 12年', '700ml')).toBe(k('山崎 12年 700ml'));
    expect(k('山崎 12年 700ml')).toMatch(/\|s700$/);
    expect(k('山崎 12年 700ml')).toMatch(/^\S/);
  });
});

describe('Japanese bottle keys at script boundaries', () => {
  const k = (title: string, variantTitle: string | null = null) => bottleKey({ title, variantTitle });

  it('spaced and unspaced forms of the same bottle share one key', () => {
    expect(k('山崎12年 700ml')).toBe(k('山崎 12年 700ml'));
    expect(k('サントリー山崎12年')).toBe(k('サントリー 山崎 12年'));
    expect(k('サントリー山崎12年ウイスキー')).toBe(k('サントリー 山崎 12年 ウイスキー'));
    expect(k('サントリー山崎12年 シングルモルト 700ml')).toBe(k('サントリー 山崎 12年 シングルモルト 700ml'));
  });

  it('splits at CJK boundaries only, never inside Latin or digit runs', () => {
    expect(k('山崎12年')).toBe('12 山崎|p|b|s750');
    expect(k('白州B524 12年')).toContain('|bB524|');
    expect(k('山崎 12yr 700ml')).toContain('12yr');
    expect(k('ニッカ Coffey Grain')).toBe('coffey grain ニッカ|p|b|s750');
  });

  it('treats 年 and the whisky/bourbon category words as stopwords', () => {
    const keys = ['山崎12年 700ml', '山崎 12年 700ml', 'サントリー山崎12年', 'サントリー山崎12年ウイスキー'].map((t) => k(t));
    for (const key of keys) {
      const tokens = key.split('|')[0].split(' ');
      expect(tokens).toContain('12');
      expect(tokens).not.toContain('年');
    }
    expect(k('山崎12年 700ml')).toBe(k('山崎 12年 700ml'));
    expect(k('サントリー山崎12年')).toBe(k('サントリー山崎12年ウイスキー'));
    for (const word of ['ウィスキー', 'ウヰスキー']) {
      expect(k(`サントリー山崎12年${word}`)).toBe(k('サントリー山崎12年'));
    }
    expect(k('バーボン ワイルドターキー')).toBe(k('ワイルドターキー'));
    // category words only: the bottle name and the age still separate bottles
    expect(k('サントリー山崎12年ウイスキー')).not.toBe(k('サントリー白州12年ウイスキー'));
    expect(k('サントリー山崎12年ウイスキー')).not.toBe(k('サントリー山崎18年ウイスキー'));
  });

  it('keeps the long-vowel mark with its kana run', () => {
    expect(k('らーめん')).toBe('らーめん|p|b|s750');
    expect(k('サントリー')).toBe('サントリー|p|b|s750');
  });

  it('still tells different Japanese bottles apart', () => {
    expect(k('サントリー山崎12年')).not.toBe(k('サントリー白州12年'));
    expect(k('山崎12年')).not.toBe(k('山崎18年'));
    expect(k('山崎12年 700ml')).not.toBe(k('山崎12年 1L'));
  });
});

describe('isWhiskyProduct Latin edge cases', () => {
  const w = (title: string, productType = '') => isWhiskyProduct({ title, productType, tags: [] });
  it('accepts a trademark sign after a word (NFKC must not break \\b)', () => {
    expect(w('Bulleit Rye™')).toBe(true);
    expect(w('Bulleit Rye™ Frontier Whiskey')).toBe(true);
    expect(w('Bulleit Bourbon®')).toBe(true);
  });
  it('still rejects non-whisky with a trademark sign', () => {
    expect(w('Craft Cans™ Sampler Whiskey')).toBe(false);
    expect(w('Whisky Glass™ Set')).toBe(false);
  });
  it('グラス: rejects glassware, keeps Glasgow', () => {
    expect(w('グラスゴー蒸溜所 ウイスキー')).toBe(true);
    expect(w('ウイスキーグラス')).toBe(false);
    expect(w('テイスティンググラス')).toBe(false);
    expect(w('テイスティンググラス ウイスキー用')).toBe(false);
  });
});

interface RegressionRow {
  title: string;
  variantTitle: string | null;
  productType: string;
  source: string;
  key: string;
  norm: string;
  whisky: boolean;
  whiskyTyped: boolean;
  size: number | null;
  proof: number | null;
  batch: string | null;
}

describe('regression against the pre-Japanese parser (3ce1042)', () => {
  const rows = regression as RegressionRow[];
  const txt = (r: RegressionRow) => `${r.title} ${r.variantTitle ?? ''}`;
  it('has a meaningful number of recorded titles, including non-ASCII Latin', () => {
    expect(rows.length).toBeGreaterThanOrEqual(200);
    expect(rows.filter((r) => r.source === 'db').length).toBeGreaterThanOrEqual(40);
    expect(rows.filter((r) => /[^ -~]/.test(r.title)).length).toBeGreaterThanOrEqual(20);
    expect(rows.some((r) => r.title.includes('™'))).toBe(true);
    expect(rows.some((r) => r.title.includes('é'))).toBe(true);
    expect(rows.some((r) => r.title.includes('®'))).toBe(true);
  });
  it('bottleKey and normalizeText outputs are byte-identical', () => {
    for (const r of rows) {
      expect(bottleKey({ title: r.title, variantTitle: r.variantTitle }), `key: ${r.title}`).toBe(r.key);
      expect(normalizeText(txt(r)), `norm: ${r.title}`).toBe(r.norm);
    }
  });
  it('isWhiskyProduct is unchanged (title-only, and with the real product type)', () => {
    for (const r of rows) {
      expect(isWhiskyProduct({ title: r.title, productType: '', tags: [] }), `whisky: ${r.title}`).toBe(r.whisky);
      expect(isWhiskyProduct({ title: r.title, productType: r.productType, tags: [] }), `typed: ${r.title}`).toBe(r.whiskyTyped);
    }
  });
  it('parseSizeMl, parseProof and parseBatch are unchanged', () => {
    for (const r of rows) {
      expect(parseSizeMl(txt(r)), `size: ${r.title}`).toBe(r.size);
      expect(parseProof(txt(r)), `proof: ${r.title}`).toBe(r.proof);
      expect(parseBatch(txt(r)), `batch: ${r.title}`).toBe(r.batch);
    }
  });
});
