// Korean readings of bottle names for /ko. Pure: no DB, no React.
// The glossary is data (KO_BRANDS, KO_TERMS) kept apart from the algorithm, so it can grow freely.
// Readings follow the spellings Korean retailers and Dailyshot use.
import type { Dict, Locale } from '@/lib/i18n';

/**
 * Brands and distilleries, matched at the start of a name (longest phrase wins). Matching ignores
 * case, apostrophes (curly or straight), periods and hyphens: "Blantons", "blanton’s" and
 * "Blanton's" are one entry; so are "E.H. Taylor" and "E. H. Taylor"
 * (spellings without the periods, such as "EH Taylor", are separate entries). A leading "The" is dropped.
 */
export const KO_BRANDS: Readonly<Record<string, string>> = {
  // Scotch: Islay
  Ardbeg: '아드벡',
  Lagavulin: '라가불린',
  Laphroaig: '라프로익',
  Bowmore: '보모어',
  Bruichladdich: '브룩라디',
  'Port Charlotte': '포트 샬롯',
  Octomore: '옥토모어',
  Bunnahabhain: '부나하벤',
  'Caol Ila': '쿨일라',
  Kilchoman: '킬호만',
  Ardnahoe: '아드나호',
  // Scotch: Speyside
  Macallan: '맥캘란',
  Glenfiddich: '글렌피딕',
  Glenlivet: '글렌리벳',
  Balvenie: '발베니',
  Aberlour: '아벨라워',
  Mortlach: '모틀락',
  Glenfarclas: '글렌파클라스',
  GlenAllachie: '글렌알라키',
  Benriach: '벤리악',
  Craigellachie: '크라이겔라키',
  Glenrothes: '글렌로티스',
  'Glen Rothes': '글렌로티스',
  'Glen Grant': '글렌 그란트',
  'Glen Moray': '글렌 모레이',
  'Glen Elgin': '글렌 엘긴',
  Cardhu: '카듀',
  Cragganmore: '크라간모어',
  Aultmore: '올트모어',
  Tamdhu: '탐듀',
  Speyburn: '스페이번',
  Knockando: '녹칸두',
  Benromach: '벤로막',
  Strathisla: '스트라스아일라',
  Longmorn: '롱몬',
  Linkwood: '링크우드',
  Tomintoul: '토민타울',
  Tormore: '토모어',
  Singleton: '싱글톤',
  // Scotch: Highland
  GlenDronach: '글렌드로낙',
  Glenmorangie: '글렌모렌지',
  Dalmore: '달모어',
  Oban: '오반',
  Clynelish: '클라이넬리시',
  Brora: '브로라',
  Dalwhinnie: '달위니',
  Aberfeldy: '애버펠디',
  'Old Pulteney': '올드 풀트니',
  Glengoyne: '글렌고인',
  Deanston: '딘스턴',
  Tomatin: '토마틴',
  'Glen Garioch': '글렌 기리',
  'Glen Ord': '글렌 오드',
  Ardmore: '아드모어',
  Balblair: '발블레어',
  Edradour: '에드라두어',
  'Royal Lochnagar': '로열 로크나가',
  'Loch Lomond': '로크 로몬드',
  Tullibardine: '툴리바딘',
  Glencadam: '글렌카담',
  Fettercairn: '페터캐런',
  'Blair Athol': '블레어 아솔',
  'Ben Nevis': '벤 네비스',
  Wolfburn: '울프번',
  AnCnoc: '아녹',
  Glenglassaugh: '글렌글라쏘',
  // Scotch: Islands
  Talisker: '탈리스커',
  'Highland Park': '하이랜드 파크',
  Scapa: '스카파',
  'Isle of Jura': '아일 오브 주라',
  Jura: '주라',
  'Isle of Arran': '아일 오브 아란',
  Arran: '아란',
  Tobermory: '토버모리',
  Ledaig: '레칙',
  // Scotch: Campbeltown
  Springbank: '스프링뱅크',
  Longrow: '롱로우',
  Hazelburn: '헤이즐번',
  Kilkerran: '킬커란',
  'Glen Scotia': '글렌스코시아',
  // Scotch: Lowland
  Auchentoshan: '오켄토션',
  Glenkinchie: '글렌킨치',
  Bladnoch: '블라드녹',
  Rosebank: '로즈뱅크',
  // Scotch: blends and bottlers
  'Johnnie Walker': '조니 워커',
  'Chivas Regal': '시바스 리갈',
  Chivas: '시바스',
  'Monkey Shoulder': '몽키 숄더',
  "Ballantine's": '발렌타인',
  Ballantine: '발렌타인',
  "Dewar's": '듀어스',
  "Buchanan's": '부캐넌스',
  'Royal Salute': '로열 살루트',
  'Famous Grouse': '페이머스 그라우스',
  'Cutty Sark': '커티삭',
  "Grant's": '그랜츠',
  'Compass Box': '컴파스 박스',
  Signatory: '시그나토리',
  'Gordon & MacPhail': '고든 앤 맥페일',
  // Japan
  Yamazaki: '야마자키',
  Hakushu: '하쿠슈',
  Hibiki: '히비키',
  Suntory: '산토리',
  Toki: '토키',
  Nikka: '니카',
  Yoichi: '요이치',
  Miyagikyo: '미야기쿄',
  Taketsuru: '다케츠루',
  Chichibu: '치치부',
  "Ichiro's Malt": '이치로즈 몰트',
  Mars: '마르스',
  Komagatake: '코마가타케',
  Akashi: '아카시',
  Hatozaki: '하토자키',
  Kanosuke: '카노스케',
  Shizuoka: '시즈오카',
  Fuji: '후지',
  Kurayoshi: '쿠라요시',
  Shibui: '시부이',
  // Taiwan, India
  Kavalan: '카발란',
  Amrut: '암룻',
  'Paul John': '폴 존',
  // Ireland
  Jameson: '제임슨',
  Redbreast: '레드브레스트',
  'Green Spot': '그린 스팟',
  'Yellow Spot': '옐로 스팟',
  Midleton: '미들턴',
  Powers: '파워스',
  Bushmills: '부쉬밀',
  'Tullamore D.E.W.': '툴라모어 듀',
  'Tullamore Dew': '툴라모어 듀',
  Teeling: '틸링',
  "Writers' Tears": '라이터스 티어스',
  Kilbeggan: '킬베간',
  Connemara: '코네마라',
  Paddy: '패디',
  Slane: '슬레인',
  // Canada
  'Crown Royal': '크라운 로열',
  'Canadian Club': '캐나디안 클럽',
  // Bourbon and rye: Buffalo Trace and the Antique Collection
  'Buffalo Trace': '버팔로 트레이스',
  Stagg: '스태그',
  'Stagg Jr.': '스태그 주니어',
  'George T. Stagg': '조지 T. 스태그',
  'Eagle Rare': '이글 레어',
  "Blanton's": '블랑톤',
  Weller: '웰러',
  'W. L. Weller': 'W.L. 웰러',
  'Old Weller': '올드 웰러',
  'William Larue Weller': '윌리엄 라루 웰러',
  'E.H. Taylor': '이 에이치 테일러',
  'Colonel E.H. Taylor': '커널 이 에이치 테일러',
  'EH Taylor': '이 에이치 테일러',
  'Colonel EH Taylor': '커널 이 에이치 테일러',
  Sazerac: '사제락',
  'Thomas H. Handy': '토마스 H. 핸디',
  'Pappy Van Winkle': '패피 반 윙클',
  "Pappy Van Winkle's": '패피 반 윙클',
  'Old Rip Van Winkle': '올드 립 반 윙클',
  'Van Winkle': '반 윙클',
  'Elmer T. Lee': '엘머 T. 리',
  'Rock Hill Farms': '락 힐 팜스',
  Benchmark: '벤치마크',
  // Bourbon and rye: other houses
  'Wild Turkey': '와일드 터키',
  "Russell's Reserve": '러셀스 리저브',
  'Four Roses': '포 로지스',
  "Maker's Mark": '메이커스 마크',
  'Woodford Reserve': '우드포드 리저브',
  Woodford: '우드포드',
  "Michter's": '믹터스',
  "Booker's": '부커스',
  "Baker's": '베이커스',
  'Basil Hayden': '베이질 헤이든',
  "Basil Hayden's": '베이질 헤이든',
  'Knob Creek': '놉 크릭',
  'Jim Beam': '짐 빔',
  'Old Forester': '올드 포레스터',
  'Elijah Craig': '엘라이저 크레이그',
  Larceny: '라세니',
  'Heaven Hill': '헤븐 힐',
  'Evan Williams': '에반 윌리엄스',
  'Old Fitzgerald': '올드 피츠제럴드',
  "Parker's Heritage": '파커스 헤리티지',
  'Henry McKenna': '헨리 맥케나',
  "Jack Daniel's": '잭 다니엘스',
  'Gentleman Jack': '젠틀맨 잭',
  'George Dickel': '조지 디켈',
  Bulleit: '불렛',
  "Angel's Envy": '엔젤스 엔비',
  Willett: '윌렛',
  "Noah's Mill": '노아스 밀',
  'Old Grand-Dad': '올드 그랜대드',
  'Very Old Barton': '베리 올드 바톤',
  'King of Kentucky': '킹 오브 켄터키',
  'Kentucky Owl': '켄터키 아울',
  "Jefferson's": '제퍼슨스',
  'High West': '하이 웨스트',
  WhistlePig: '휘슬피그',
  'Whistle Pig': '휘슬피그',
  Rittenhouse: '리튼하우스',
  Pikesville: '파익스빌',
  'Old Overholt': '올드 오버홀트',
  'Orphan Barrel': '오펀 배럴',
  'Blood Oath': '블러드 오스',
  'Little Book': '리틀 북',
  "Hardin's Creek": '하딘스 크릭',
  'New Riff': '뉴 리프',
  'Wilderness Trail': '와일더니스 트레일',
  'Smoke Wagon': '스모크 왜건',
  Penelope: '페넬로페',
  'Bardstown Bourbon Company': '바즈타운 버번 컴퍼니',
  'Old Elk': '올드 엘크',
  'Uncle Nearest': '엉클 니어리스트',
  'Garrison Brothers': '개리슨 브라더스',
  Balcones: '발코네스',
  Westland: '웨스트랜드',
  Redemption: '리뎀션',
  Rebel: '레벨',
  'Rebel Yell': '레벨 옐',
  'Ezra Brooks': '에즈라 브룩스',
  'Old Taylor': '올드 테일러',
  'Old Charter': '올드 차터',
  'Calumet Farm': '칼루멧 팜',
  'Smooth Ambler': '스무스 앰블러',
  'Rabbit Hole': '래빗 홀',
  'Widow Jane': '위도우 제인',
  "Clyde May's": '클라이드 메이스',
  "Heaven's Door": '헤븐스 도어',
  'Kings County': '킹스 카운티',
  'Barrell Craft Spirits': '배럴 크래프트 스피릿츠',
  Barrell: '배럴',
  // More Japan and Ireland
  Akkeshi: '아케시',
  'West Cork': '웨스트 코크',
};

/**
 * Category and term phrases after the brand (longest match first; same matching rules as brands).
 * Brand names are also read when they appear later in a name ("Suntory Yamazaki").
 * Words in neither list stay in English as written.
 */
export const KO_TERMS: Readonly<Record<string, string>> = {
  // Categories (full phrases first; the parts below cover other orders)
  'Single Malt Scotch Whisky': '싱글 몰트 스카치 위스키',
  'Kentucky Straight Bourbon Whiskey': '켄터키 스트레이트 버번 위스키',
  'Straight Rye Whiskey': '스트레이트 라이 위스키',
  'Blended Scotch Whisky': '블렌디드 스카치 위스키',
  'Japanese Whisky': '재패니즈 위스키',
  'Irish Whiskey': '아이리시 위스키',
  'Single Malt': '싱글 몰트',
  Single: '싱글',
  'Blended Malt': '블렌디드 몰트',
  'Pot Still': '팟 스틸',
  Whisky: '위스키',
  Whiskey: '위스키',
  Bourbon: '버번',
  Rye: '라이',
  Scotch: '스카치',
  Malt: '몰트',
  Grain: '그레인',
  Blended: '블렌디드',
  Blend: '블렌드',
  Straight: '스트레이트',
  Kentucky: '켄터키',
  Tennessee: '테네시',
  American: '아메리칸',
  Canadian: '캐나디안',
  Japanese: '재패니즈',
  Irish: '아이리시',
  Wheat: '위트',
  Corn: '콘',
  Islay: '아일라',
  Speyside: '스페이사이드',
  Highland: '하이랜드',
  Lowland: '로우랜드',
  Campbeltown: '캠벨타운',
  // Bottling terms
  'Cask Strength': '캐스크 스트렝스',
  'Barrel Strength': '배럴 스트렝스',
  'Barrel Proof': '배럴 프루프',
  'Full Proof': '풀 프루프',
  'Single Barrel': '싱글 배럴',
  'Small Batch': '스몰 배치',
  'Bottled in Bond': '보틀드 인 본드',
  'Sherry Cask': '셰리 캐스크',
  'Sherry Oak': '셰리 오크',
  'Port Cask': '포트 캐스크',
  'Double Cask': '더블 캐스크',
  'Triple Cask': '트리플 캐스크',
  'Double Oaked': '더블 오크드',
  'Triple Wood': '트리플 우드',
  'Fine Oak': '파인 오크',
  'French Oak': '프렌치 오크',
  'Distillers Edition': '디스틸러스 에디션',
  "Distiller's Edition": '디스틸러스 에디션',
  'Limited Edition': '리미티드 에디션',
  'Special Release': '스페셜 릴리스',
  'Special Reserve': '스페셜 리저브',
  'Private Selection': '프라이빗 셀렉션',
  'Rare Breed': '레어 브리드',
  'Antique Collection': '앤티크 컬렉션',
  'Black Label': '블랙 라벨',
  'Red Label': '레드 라벨',
  'Blue Label': '블루 라벨',
  'Green Label': '그린 라벨',
  'Gold Label': '골드 라벨',
  'Double Black': '더블 블랙',
  'Pedro Ximenez': '페드로 히메네스',
  Reserve: '리저브',
  Edition: '에디션',
  Batch: '배치',
  Barrel: '배럴',
  Cask: '캐스크',
  Casks: '캐스크',
  Sherry: '셰리',
  Oloroso: '올로로소',
  Madeira: '마데이라',
  Oak: '오크',
  Peated: '피티드',
  Finish: '피니시',
  Release: '릴리스',
  Limited: '리미티드',
  Select: '셀렉트',
  Original: '오리지널',
  Classic: '클래식',
  Signature: '시그니처',
  Collection: '컬렉션',
  Antique: '앤티크',
  'Fine & Rare': '파인 앤 레어',
  'Very Rare': '베리 레어',
  Rare: '레어',
  'Family Reserve': '패밀리 리저브',
  'Family Estate': '패밀리 에스테이트',
  Private: '프라이빗',
  Special: '스페셜',
  Series: '시리즈',
};

/** Lowercase, apostrophes dropped, periods and hyphens as spaces: one key per spelling family. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Glossary {
  map: Map<string, string>;
  /** Longest phrase, in normalized words. */
  maxWords: number;
}

function build(src: Readonly<Record<string, string>>): Glossary {
  const map = new Map<string, string>();
  let maxWords = 1;
  for (const [en, ko] of Object.entries(src)) {
    const k = norm(en);
    map.set(k, ko);
    maxWords = Math.max(maxWords, k.split(' ').length);
  }
  return { map, maxWords };
}

const BRANDS = build(KO_BRANDS);
const TERMS = build(KO_TERMS);

/** Bottle sizes and gift packaging the store appended; the size is already a chip. */
const SIZE_RE = /\(?\b\d+(?:\.\d+)?\s*(?:ml|cl|ltr|liters?|litres?|l)\b\.?\)?/gi;
const GIFT_RE = /\(?\s*(?:\bw\/\s*|\bwith\s+)?\bgift\s*(?:box(?:ed)?|set|pack)\b\s*\)?/gi;
/** 12 Year Old, 12 Years, 12 Yr., 12-Year, 12YO, 12yrs, 11year Old → 12년. */
const AGE_RE = /(^|[\s("'])(\d{1,2})\s*-?\s*(?:years?|yrs?|y\.?o)\.?(?:\s*-?\s*old)?(?=$|[\s,)"'/])/gi;

/** A word's matching core: edge punctuation (quotes, commas, brackets) stripped. */
const EDGE_RE = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}.'’]*)$/u;

function split(word: string): { lead: string; core: string; tail: string } {
  const m = EDGE_RE.exec(word)!;
  return { lead: m[1], core: m[2], tail: m[3] };
}

/** Longest glossary phrase starting at `words[i]`: [words consumed, Korean], or null. */
function longest(words: string[], i: number, g: Glossary): [number, string] | null {
  for (let n = Math.min(g.maxWords, words.length - i); n > 0; n--) {
    const slice = words.slice(i, i + n);
    // Edge punctuation may sit only on the outside of the phrase.
    if (slice.some((w, j) => !split(w).core || (j > 0 && split(w).lead) || (j < n - 1 && split(w).tail))) continue;
    const ko = g.map.get(norm(slice.map((w) => split(w).core).join(' ')));
    if (ko) return [n, ko];
  }
  return null;
}

/**
 * The Korean reading of an English bottle name, or null when its brand or distillery is not in the
 * glossary. Ages become N년, known terms are read in Korean, everything else (sub-names, numbers,
 * batch codes, vintages, proof) stays as written and in order; size and gift-box noise is dropped.
 */
export function koreanBottleName(english: string): string | null {
  const cleaned = english
    .replace(SIZE_RE, ' ')
    .replace(GIFT_RE, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(AGE_RE, (_, pre: string, n: string) => `${pre}${n}년`)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,/–-]+$/, '');
  let words = cleaned.split(' ').filter(Boolean);
  if (words.length > 1 && /^the$/i.test(words[0]) && longest(words, 1, BRANDS)) words = words.slice(1);
  if (!longest(words, 0, BRANDS)) return null;

  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    // The brand comes first; after it, the longer of a term or a (sub-)brand phrase wins.
    const name = longest(words, i, BRANDS);
    const term = i === 0 ? null : longest(words, i, TERMS);
    const hit = name && (!term || name[0] > term[0]) ? name : term;
    if (hit) {
      const [n, ko] = hit;
      out.push(`${split(words[i]).lead}${ko}${split(words[i + n - 1]).tail}`);
      i += n;
    } else out.push(words[i++]);
  }
  return out.join(' ');
}

export interface DisplayName {
  /** The name to show as the title (and to use in alt text and labels). */
  primary: string;
  /** The store's English name, shown as a smaller line under a Korean title; null when the title is English. */
  original: string | null;
}

/**
 * The bottle name to show. /en: the English name as is. /ko: the Dailyshot Korean name when the
 * bottle is linked, else the glossary reading, with the English kept as `original`; English only
 * when neither exists.
 */
export function displayBottleName({ english, nameKo, locale }: { english: string; nameKo?: string | null; locale: Locale }): DisplayName {
  if (locale !== 'ko') return { primary: english, original: null };
  const ko = nameKo?.trim() || koreanBottleName(english);
  return ko ? { primary: ko, original: english } : { primary: english, original: null };
}

/** The name as quoted in share and page titles: "Korean (English)" on /ko, else the name alone. */
export function quotedBottleName(name: DisplayName, d: Dict): string {
  return name.original ? d.bottleName.withOriginal(name.primary, name.original) : name.primary;
}
