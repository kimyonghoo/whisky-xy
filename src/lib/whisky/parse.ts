// Pure text parsing helpers for whisky listings. No DB, no network.

const WHISKY_RE =
  /whisk(e)?y|bourbon|scotch|\brye\b|single malt|ウイスキー|ウィスキー|ウヰスキー|ウイスキ|シングルモルト|ブレンデッド/i;
const ALWAYS_REJECT_RE =
  /liqueur|cocktail|\bcans?\b|\d+-pack|tequila|mezcal|gift card|glass(es|ware)?\b|bitters|リキュール|梅酒(?!樽)|焼酎|日本酒|グラス(?!ゴー)|ギフト券|ハイボール(?!に|用|向)|缶チューハイ|(?<!\d)(?:250|350|500)\s*ml\s*缶(?!入|付)|(?<!ギフト|化粧|専用)缶\s*(?:250|350|500)\s*ml|ケース販売|ケース売り|(?<!\d)(?:[2-9]|\d{2,}|[二三四五六七八九十]+)\s*本\s*(?:入り?|セット|組)|[×xX]\s*(?:[2-9]|\d{2,})\s*本|ケース\s*[（(]?\s*\d+\s*本|飲み比べセット|ギフトセット|セット販売|詰め?合わ?せ/i;
// The Japanese multi-bottle terms are rejected because their price is not one bottle's price:
// case sales (ケース販売, ケース売り, ケース 6本, ケース（12本）), N本入り / N本セット / N本組 / ×N本 with N >= 2
// (digits or kanji numerals; `1本入り化粧箱` and `700ml×1本` are single bottles), and sets (飲み比べセット,
// ギフトセット, セット販売, 詰め合わせ / 詰合せ). Only sale-shaped wording counts: a bare ケース or セット is a
// single bottle's box (専用ケース付き, 木製ケース入り, ウッドケース) or part of a name (サマセット).
// グラス付き (glass bundles) is rejected through グラス. Ready-to-drink cans are rejected (ハイボール,
// 缶チューハイ, and `350ml缶` / `缶 350ml` at the RTD sizes 250/350/500 ml), but not a bare 缶 or a 700 ml
// bottle in a gift tin (ギフト缶入り, 700ml缶入り, 化粧缶). ハイボールに / 用 / 向 (a pairing: 知多 ハイボールにおすすめ)
// is a whisky; a title that is itself a highball (スモーキーハイボール) is not.
// 梅酒 (plum liqueur) is rejected, 梅酒樽 (a plum-liqueur cask finish) is not.
// Wine/grape and beer terms only reject when productType is not itself whisky-like
// (cask-finished whisky legitimately mentions port, cabernet, etc.).
const NON_WHISKY_TYPE_REJECT_RE =
  /\bwine\b|cabernet|sauvignon|chardonnay|\b(beer|stout|ale|ipa|lager|porter)\b/i;

// Full NFKC fold for matching only (half-width katakana ｳｲｽｷｰ, full-width Latin). Never used
// to build stored text; pure-ASCII input is returned unchanged.
function foldForMatch(text: string): string {
  return text.normalize('NFKC');
}

/**
 * Is this a whisky bottle? `whiskyOnlyCatalog` is for sources that only list whisky (a store's
 * whisky category): the positive whisky-word requirement is dropped, since titles there often
 * carry no such word (`山崎 12年`), but every reject term still applies (glasses, liqueurs, wine...).
 */
export function isWhiskyProduct(
  p: { title: string; productType: string; tags: string[] },
  opts?: { whiskyOnlyCatalog?: boolean },
): boolean {
  const rawTitle = p.title;
  const rawType = p.productType;
  const rawAll = `${p.title} ${p.productType} ${p.tags.join(' ')}`;
  const title = foldForMatch(rawTitle);
  const type = foldForMatch(rawType);
  const all = foldForMatch(rawAll);
  // Every test runs on the raw text and on the NFKC-folded text. Folding can break a Latin
  // word boundary (Rye + trademark sign becomes RyeTM), so raw matches keep their old meaning
  // and folding only adds matches (half-width katakana, full-width Latin).
  const any = (re: RegExp, ...texts: string[]) => texts.some((t) => re.test(t));
  if (any(ALWAYS_REJECT_RE, rawTitle, rawType, title, type)) return false;
  const typeIsWhisky = any(WHISKY_RE, rawType, type);
  if (!typeIsWhisky && any(NON_WHISKY_TYPE_REJECT_RE, rawTitle, rawType, title, type)) return false;
  if (opts?.whiskyOnlyCatalog === true) return true;
  return any(WHISKY_RE, rawAll, all);
}

/** Narrow width fold used before size/proof/batch matching: full-width ASCII (U+FF01-FF5E)
 *  to ASCII, ideographic space to a space, and the square-ml / square-liter compatibility glyphs to `ml` / `l`.
 *  Deliberately not full NFKC, which would also rewrite `º` (the proof marker) to `o`.
 *  ASCII input is returned unchanged. */
function foldWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\u3396/g, 'ml') // U+3396 (square ml)
    .replace(/\u3351/g, 'l'); // U+3351 (square liter)
}

const ML_RE = /(\d+(?:\.\d+)?)\s*ml\b/i; // the square-ml sign is folded to "ml" by foldWidth first
const LITER_RE = /(\d+(?:\.\d+)?)\s*(?:liters?|litres?|l)\b/i;

// A size labelled 容量 (volume), e.g. a store's spec row carried as `容量 700ml`. It wins over any
// other size in the text. ASCII text never contains it, so ASCII sizes and keys are unchanged.
const LABELLED_ML_RE = /容量\s*[:：]?\s*(\d+(?:\.\d+)?)\s*ml\b/i;
const LABELLED_LITER_RE = /容量\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:liters?|litres?|l)\b/i;

function plainSizeMatch(text: string): { ml: number; match: string } | null {
  const m = ML_RE.exec(text);
  if (m) return { ml: Math.round(parseFloat(m[1])), match: m[0] };
  const l = LITER_RE.exec(text);
  if (l) return { ml: Math.round(parseFloat(l[1]) * 1000), match: l[0] };
  return null;
}

/** The size and the text matches to strip from a key: a labelled 容量 size also strips the
 *  first other size, so `X 750ml` + `容量 700ml` keys like `X 700ml`. */
function sizeMatch(rawText: string): { ml: number; matches: string[] } | null {
  const text = foldWidth(rawText);
  const lm = LABELLED_ML_RE.exec(text);
  const ll = lm ? null : LABELLED_LITER_RE.exec(text);
  const hit = lm ? { ml: Math.round(parseFloat(lm[1])), match: lm[0] }
    : ll ? { ml: Math.round(parseFloat(ll[1]) * 1000), match: ll[0] }
    : null;
  if (hit) {
    const other = plainSizeMatch(text.replace(hit.match, ' '));
    return { ml: hit.ml, matches: other ? [hit.match, other.match] : [hit.match] };
  }
  const plain = plainSizeMatch(text);
  return plain ? { ml: plain.ml, matches: [plain.match] } : null;
}

export function parseSizeMl(text: string): number | null {
  return sizeMatch(text)?.ml ?? null;
}

// Order matters: "94 Proof" / "Proof 94" / "94º". Degree sign and ordinal sign both accepted.
const PROOF_PATTERNS = [
  /(?<![\d.])(\d{2,3}(?:\.\d)?)\s*proof\b/gi,
  /\bproof\s*(\d{2,3}(?:\.\d)?)(?![\d.]*\d)(?!\s*(?:ml|cl|l)\b)/gi,
  /(?<![\d.])(\d{2,3})\s*[º°]/g,
];

function proofMatch(text: string): { proof: number; match: string } | null {
  for (const re of PROOF_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const v = parseFloat(m[1]);
      if (v >= 60 && v <= 160) return { proof: v, match: m[0] };
    }
  }
  return null;
}

export function parseProof(text: string): number | null {
  return proofMatch(text)?.proof ?? null;
}

const BATCH_NUM_RE =
  /(?<!\b(?:small|single)\s+)batch\s*#?\s*([0-9]+(?:[a-z](?![a-z]))?)(?!\d)(?!\s*(?:proof|yrs?|years?|yo)\b)/i;
const BATCH_CODE_RE = /\b([abc]\d{3})\b/i;

function batchMatch(text: string): { batch: string; match: string } | null {
  const m = BATCH_NUM_RE.exec(text);
  if (m) {
    const batch = m[1].replace(/^0+(?=\d)/, '').toUpperCase();
    return { batch, match: m[0] };
  }
  const c = BATCH_CODE_RE.exec(text);
  if (c) return { batch: c[1].toUpperCase(), match: c[0] };
  return null;
}

export function parseBatch(text: string): string | null {
  return batchMatch(text)?.batch ?? null;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    // Strip accents (Café -> cafe) but keep the kana voicing marks U+3099/U+309A, which
    // NFKC below recombines (ガ stays distinct from カ).
    .replace(/(?:(?![\u3099\u309a])\p{M})+/gu, '')
    .normalize('NFKC')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}ー]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HAS_CJK_RE = /[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]/u;

type CharClass = 'han' | 'kata' | 'hira' | 'digit' | 'latin' | 'space';

function charClass(ch: string, prev: CharClass | null): CharClass {
  if (ch === ' ') return 'space';
  if (ch === 'ー') return prev === 'hira' || prev === 'kata' ? prev : 'kata'; // ー joins the preceding kana run
  if (/\p{Script=Han}/u.test(ch)) return 'han';
  if (/\p{Script=Katakana}/u.test(ch)) return 'kata';
  if (/\p{Script=Hiragana}/u.test(ch)) return 'hira';
  if (/[0-9]/.test(ch)) return 'digit';
  return 'latin';
}

/** Japanese titles are often written without spaces (`山崎12年`, `サントリー山崎12年`). For key
 *  tokenizing, put a space wherever a CJK run meets a different class (Han, Katakana, Hiragana,
 *  digit, Latin). Latin and digits are never split from each other (`b524`, `12yr`). Text with
 *  no CJK is returned untouched, so ASCII keys do not change. */
function splitCjkBoundaries(text: string): string {
  if (!HAS_CJK_RE.test(text)) return text;
  let out = '';
  let prev: CharClass | null = null;
  for (const ch of text) {
    const cls = charClass(ch, prev);
    if (prev && prev !== 'space' && cls !== 'space' && prev !== cls) {
      const cjk = (c: CharClass) => c === 'han' || c === 'kata' || c === 'hira';
      if (cjk(prev) || cjk(cls)) out += ' ';
    }
    out += ch;
    prev = cls;
  }
  return out;
}

// Words that never identify a bottle: generic category/marketing words. Identity words
// (`rye`, `jr`, `george`, `t`, years, `barrel`, `proof`) are deliberately NOT here, so
// Stagg / Stagg Jr / George T. Stagg and different release years stay separate. The Japanese
// 年 (year), ウイスキー spellings (whisky) and バーボン (bourbon) are stopwords like their English forms.
const STOPWORDS = new Set([
  'whiskey', 'whisky', 'the', 'kentucky', 'tennessee', 'straight',
  'default', 'title', 'year', 'years', 'old', 'yr',
  'bourbon', 'release', 'edition', 'bottle',
  '年', 'ウイスキー', 'ウィスキー', 'ウヰスキー', 'バーボン',
]);

// Whole phrases removed from the normalized text before tokenizing. Phrases only:
// stripping `buffalo`/`trace` separately would collapse "Buffalo Trace Bourbon".
const STRIP_PHRASES_RE = /\b(?:buffalo trace antique collection|btac)\b/g;

/** Size used in the key when the title states none: sub-200 ml is filtered out at
 *  ingest and 1 L / 1.75 L are almost always stated, so "no size" means 750 ml. */
export const DEFAULT_KEY_SIZE_ML = 750;

export function bottleKey(p: { title: string; variantTitle: string | null }): string {
  const text = foldWidth(`${p.title} ${p.variantTitle ?? ''}`);
  const size = sizeMatch(text);
  const proof = proofMatch(text);
  const batch = batchMatch(text);

  let stripped = text;
  for (const m of [...(size?.matches ?? []), proof?.match, batch?.match]) {
    if (m) stripped = stripped.replace(m, ' ');
  }

  const tokens = splitCjkBoundaries(normalizeText(stripped))
    .replace(STRIP_PHRASES_RE, ' ')
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
  return (
    [...new Set(tokens)].sort().join(' ') +
    `|p${proof?.proof ?? ''}|b${batch?.batch ?? ''}|s${size?.ml ?? DEFAULT_KEY_SIZE_ML}`
  );
}
