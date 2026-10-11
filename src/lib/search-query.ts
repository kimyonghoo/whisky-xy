// Query understanding for search: Korean spellings, community abbreviations, typo fixes.
// Pure; the vocabulary (words seen in listings) is passed in by the caller.
import { normalizeText } from '@/lib/whisky/parse';

/**
 * Korean spellings → English listing words. Keys have no spaces ("잭 다니엘" is matched as
 * "잭다니엘"); values may be '' for words that add nothing to a whisky search (위스키, 년).
 */
const KO_TERMS: Record<string, string> = {
  // American whiskey
  스태그: 'stagg', 스텍: 'stagg', 스택: 'stagg', 조지티스태그: 'george t stagg',
  잭다니엘: 'jack daniels', 잭다니엘스: 'jack daniels', 잭대니얼: 'jack daniels', 잭대니얼스: 'jack daniels', 잭: 'jack',
  블랜튼: 'blanton', 블랜톤: 'blanton', 블랑톤: 'blanton', 블랑튼: 'blanton', 블렌튼: 'blanton',
  웰러: 'weller', 윌리엄라루웰러: 'william larue weller',
  이글레어: 'eagle rare', 버팔로트레이스: 'buffalo trace', 버펄로트레이스: 'buffalo trace',
  와일드터키: 'wild turkey', 레어브리드: 'rare breed', 러셀: 'russell', 러셀리저브: 'russell reserve',
  메이커스마크: 'makers mark', 메이커스: 'makers', 놉크릭: 'knob creek', 녹크릭: 'knob creek',
  우드포드: 'woodford', 우드포드리저브: 'woodford reserve', 짐빔: 'jim beam', 포로지스: 'four roses',
  엘리야크레이그: 'elijah craig', 엘라이자크레이그: 'elijah craig', 일라이자크레이그: 'elijah craig', 일라이저크레이그: 'elijah craig',
  올드포레스터: 'old forester', 파피: 'pappy', 패피: 'pappy', 페피: 'pappy', 반윙클: 'van winkle',
  헤븐힐: 'heaven hill', 사제락: 'sazerac', 이에이치테일러: 'e h taylor', 테일러: 'taylor',
  에반윌리엄스: 'evan williams', 윌렛: 'willett', 부커스: 'bookers', 베이커스: 'bakers', 바톤: 'barton',
  올드피츠제럴드: 'old fitzgerald', 미치터스: 'michters', 엔젤스엔비: 'angels envy', 앤젤스엔비: 'angels envy',
  하이웨스트: 'high west', 블랙: 'black',
  // Scotch & world
  맥캘란: 'macallan', 맥켈란: 'macallan', 글렌피딕: 'glenfiddich', 글렌리벳: 'glenlivet', 발베니: 'balvenie',
  라가불린: 'lagavulin', 라프로익: 'laphroaig', 아드벡: 'ardbeg', 탈리스커: 'talisker', 보모어: 'bowmore',
  쿨일라: 'caol ila', 글렌드로낙: 'glendronach', 글렌모렌지: 'glenmorangie', 달모어: 'dalmore',
  스프링뱅크: 'springbank', 킬호만: 'kilchoman', 조니워커: 'johnnie walker', 발렌타인: 'ballantine',
  시바스리갈: 'chivas regal', 히비키: 'hibiki', 야마자키: 'yamazaki', 하쿠슈: 'hakushu', 니카: 'nikka',
  카발란: 'kavalan', 제임슨: 'jameson', 레드브레스트: 'redbreast',
  // Styles and specs
  싱글배럴: 'single barrel', 배럴프루프: 'barrel proof', 캐스크스트렝스: 'cask strength', 스몰배치: 'small batch',
  싱글몰트: 'single malt', 보틀드인본드: 'bottled in bond', 풀프루프: 'full proof', 프루프: 'proof',
  셰리: 'sherry', 버번: 'bourbon', 라이: 'rye', 리저브: 'reserve', 스페셜: 'special',
  위스키: '', 위스키가: '', 년: '', 년산: '',
};
const KO_MAX_KEY = Math.max(...Object.keys(KO_TERMS).map((k) => k.length));

/** Community abbreviations → listing words. The literal is still tried too. */
const ABBREVIATIONS: Record<string, string> = {
  sbbp: 'single barrel barrel proof',
  jdsbbp: 'jack daniels single barrel barrel proof',
  jdsb: 'jack daniels single barrel',
  jd: 'jack daniels',
  bib: 'bottled in bond',
  ecbp: 'elijah craig barrel proof',
  wfp: 'weller full proof',
  wsr: 'weller special reserve',
  wlw: 'william larue weller',
  gts: 'george t stagg',
  eht: 'e h taylor',
  kcsb: 'knob creek single barrel',
  pvw: 'pappy van winkle',
  btac: 'antique collection',
  bp: 'barrel proof',
  cs: 'cask strength',
};

const HANGUL_RUN_RE = /[ㄱ-ㆎ가-힣]+(?:\s+[ㄱ-ㆎ가-힣]+)*/g;

/** Replaces each Hangul run with its English words (longest dictionary match first; unknown syllables drop). */
export function translateKorean(q: string): string {
  return q.replace(HANGUL_RUN_RE, (run) => {
    const s = run.replace(/\s+/g, '');
    const out: string[] = [];
    for (let i = 0; i < s.length; ) {
      let hit = 0;
      for (let len = Math.min(KO_MAX_KEY, s.length - i); len > 0; len--) {
        if (s.slice(i, i + len) in KO_TERMS) {
          hit = len;
          break;
        }
      }
      if (hit) {
        out.push(KO_TERMS[s.slice(i, i + hit)]);
        i += hit;
      } else i++;
    }
    return ` ${out.join(' ')} `;
  });
}

/** Words in listings' search text with how many listings use each. */
export type Vocab = Map<string, number>;

/** Optimal string alignment distance (Levenshtein + adjacent swaps), stopping early past `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** A rare literal match (often a typo in a listing title) still gets a fix when the fix is this much more common. */
const TYPO_RATIO = 5;

/**
 * The most common listing word within typo distance of `token`, or null when the token is fine
 * as typed: it matches plenty of listings (search matches substrings) or nothing is close enough.
 * Store titles have typos too, so a literal hit in a handful of listings doesn't rule out a fix.
 */
export function correctToken(token: string, vocab: Vocab): string | null {
  if (token.length < 3 || /\d/.test(token)) return null;
  let literal = 0;
  for (const [w, n] of vocab) if (w.includes(token)) literal += n;
  const max = token.length >= 8 ? 2 : 1;
  let best = token;
  let bestDist = max + 1;
  let bestCount = 0;
  for (const [w, n] of vocab) {
    if (w === token || w.length < 3 || /\d/.test(w)) continue;
    const dist = editDistance(token, w, max);
    if (dist < bestDist || (dist === bestDist && n > bestCount)) {
      best = w;
      bestDist = dist;
      bestCount = n;
    }
  }
  return bestDist <= max && bestCount >= Math.max(1, literal * TYPO_RATIO) ? best : null;
}

/** "daniels" → "daniel": the stem still matches the plural as a substring, and the bare form too. */
function stem(token: string): string {
  return token.length >= 5 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;
}

/** One query word: listings must match at least one alternative, i.e. every token in it. */
export type QueryTerm = string[][];

/**
 * Turns a raw query into search terms. The first alternative of each term is the preferred
 * reading (abbreviation expanded, typo fixed); together they form the phrase used for ranking.
 */
export function parseQuery(q: string, vocab?: Vocab): QueryTerm[] {
  const words = normalizeText(translateKorean(q)).split(' ').filter(Boolean);
  const terms: QueryTerm[] = [];
  for (const w of words) {
    const abbr = ABBREVIATIONS[w];
    if (abbr) {
      terms.push([abbr.split(' ').map(stem), [w]]);
      continue;
    }
    const s = stem(w);
    const fix = vocab ? correctToken(s, vocab) : null;
    // The literal stays as a fallback alternative, so a fix can only add matches.
    terms.push(fix ? [[fix], [s]] : [[s]]);
  }
  return terms;
}

/**
 * What was typed, normalized the same way minus the interpretation. When it differs from
 * `queryPhrase`, the page says what was actually searched ("‘스태그’ → stagg").
 */
export function literalPhrase(q: string): string {
  return normalizeText(q).split(' ').filter(Boolean).map(stem).join(' ');
}

/** The preferred reading as one phrase, for ranking exact phrase matches first. */
export function queryPhrase(terms: QueryTerm[]): string {
  return terms.map((t) => t[0].join(' ')).join(' ');
}

/**
 * True when consecutive words of `text` start with the phrase's words in order:
 * "jack daniel single" matches "… jack daniels single barrel …".
 */
export function matchesPhrase(text: string, phrase: string): boolean {
  const want = phrase.split(' ').filter(Boolean);
  const words = text.split(' ');
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((p, k) => words[i + k].startsWith(p))) return true;
  }
  return false;
}
