// Pure text parsing helpers for whisky listings. No DB, no network.

const WHISKY_RE = /whisk(e)?y|bourbon|scotch|\brye\b|single malt/i;
const REJECT_RE =
  /liqueur|cocktail|\bcans?\b|\d+-pack|tequila|mezcal|\bwine\b|cabernet|sauvignon|chardonnay|gift card|glass(es|ware)?\b|bitters/i;

export function isWhiskyProduct(p: { title: string; productType: string; tags: string[] }): boolean {
  if (REJECT_RE.test(p.title) || REJECT_RE.test(p.productType)) return false;
  return WHISKY_RE.test(`${p.title} ${p.productType} ${p.tags.join(' ')}`);
}

const ML_RE = /(\d+(?:\.\d+)?)\s*ml\b/i;
const LITER_RE = /(\d+(?:\.\d+)?)\s*(?:liters?|litres?|l)\b/i;

function sizeMatch(text: string): { ml: number; match: string } | null {
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
  /\bproof\s*(\d{2,3}(?:\.\d)?)(?![\d.]*\d)/gi,
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

const BATCH_NUM_RE = /batch\s*#?\s*([0-9]+[a-z]?)/i;
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
    .replace(/\p{M}+/gu, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'whiskey', 'whisky', 'the', 'kentucky', 'tennessee', 'straight',
  'default', 'title', 'year', 'years', 'old', 'yr',
]);

export function bottleKey(p: { title: string; variantTitle: string | null }): string {
  const text = `${p.title} ${p.variantTitle ?? ''}`;
  const size = sizeMatch(text);
  const proof = proofMatch(text);
  const batch = batchMatch(text);

  let stripped = text;
  for (const m of [size?.match, proof?.match, batch?.match]) {
    if (m) stripped = stripped.replace(m, ' ');
  }

  const tokens = normalizeText(stripped)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
  return (
    [...new Set(tokens)].sort().join(' ') +
    `|p${proof?.proof ?? ''}|b${batch?.batch ?? ''}|s${size?.ml ?? ''}`
  );
}
