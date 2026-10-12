// Pure text parsing helpers for whisky listings. No DB, no network.

const WHISKY_RE =
  /whisk(e)?y|bourbon|scotch|\brye\b|single malt|ウイスキー|ウィスキー|ウヰスキー|ウイスキ|シングルモルト|ブレンデッド/i;
const ALWAYS_REJECT_RE =
  /liqueur|cocktail|\bcans?\b|\d+-pack|tequila|mezcal|gift card|glass(es|ware)?\b|bitters|リキュール|梅酒|焼酎|日本酒|グラス|ギフト券/i;
// Wine/grape and beer terms only reject when productType is not itself whisky-like
// (cask-finished whisky legitimately mentions port, cabernet, etc.).
const NON_WHISKY_TYPE_REJECT_RE =
  /\bwine\b|cabernet|sauvignon|chardonnay|\b(beer|stout|ale|ipa|lager|porter)\b/i;

// Full NFKC fold for matching only (half-width katakana ｳｲｽｷｰ, full-width Latin). Never used
// to build stored text; pure-ASCII input is returned unchanged.
function foldForMatch(text: string): string {
  return text.normalize('NFKC');
}

export function isWhiskyProduct(p: { title: string; productType: string; tags: string[] }): boolean {
  const title = foldForMatch(p.title);
  const productType = foldForMatch(p.productType);
  if (ALWAYS_REJECT_RE.test(title) || ALWAYS_REJECT_RE.test(productType)) return false;
  const typeIsWhisky = WHISKY_RE.test(productType);
  if (!typeIsWhisky && (NON_WHISKY_TYPE_REJECT_RE.test(title) || NON_WHISKY_TYPE_REJECT_RE.test(productType))) {
    return false;
  }
  return WHISKY_RE.test(`${title} ${productType} ${foldForMatch(p.tags.join(' '))}`);
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

function sizeMatch(rawText: string): { ml: number; match: string } | null {
  const text = foldWidth(rawText);
  const m = ML_RE.exec(text);
  if (m) return { ml: Math.round(parseFloat(m[1])), match: m[0] };
  const l = LITER_RE.exec(text);
  if (l) return { ml: Math.round(parseFloat(l[1]) * 1000), match: l[0] };
  return null;
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

// Words that never identify a bottle: generic category/marketing words. Identity words
// (`rye`, `jr`, `george`, `t`, years, `barrel`, `proof`) are deliberately NOT here, so
// Stagg / Stagg Jr / George T. Stagg and different release years stay separate.
const STOPWORDS = new Set([
  'whiskey', 'whisky', 'the', 'kentucky', 'tennessee', 'straight',
  'default', 'title', 'year', 'years', 'old', 'yr',
  'bourbon', 'release', 'edition', 'bottle',
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
  for (const m of [size?.match, proof?.match, batch?.match]) {
    if (m) stripped = stripped.replace(m, ' ');
  }

  const tokens = normalizeText(stripped)
    .replace(STRIP_PHRASES_RE, ' ')
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
  return (
    [...new Set(tokens)].sort().join(' ') +
    `|p${proof?.proof ?? ''}|b${batch?.batch ?? ''}|s${size?.ml ?? DEFAULT_KEY_SIZE_ML}`
  );
}
