// Reads the schema.org Product/Offer facts a store page publishes in JSON-LD. Pure: no network.

export interface JsonLdOffer {
  name: string | null;
  sku: string | null;
  /** The price exactly as published (e.g. "5478" or "27,500"); parse it with `parsePriceMinor`. */
  price: string | null;
  currency: string | null;
  /** Only an explicit schema.org value counts; anything else is null (never guessed). */
  availability: 'in' | 'out' | null;
}

const LD_SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

const IN_STOCK = new Set(['instock', 'limitedavailability', 'onlineonly']);
const OUT_OF_STOCK = new Set(['outofstock', 'soldout', 'discontinued']);

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);

function hasType(n: Node, type: string): boolean {
  const t = n['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/** Every object reachable through top-level arrays and `@graph`. */
function nodes(v: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(v)) for (const x of v) nodes(x, out);
  else if (isNode(v)) {
    out.push(v);
    if (v['@graph'] !== undefined) nodes(v['@graph'], out);
  }
  return out;
}

const str = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};

const text = (v: unknown): string | null => (typeof v === 'string' ? str(v) : null);

function availabilityOf(v: unknown): 'in' | 'out' | null {
  if (typeof v !== 'string') return null;
  const key = v.trim().replace(/^https?:\/\/schema\.org\//i, '').toLowerCase();
  if (IN_STOCK.has(key)) return 'in';
  if (OUT_OF_STOCK.has(key)) return 'out';
  return null;
}

function offerFacts(o: Node): Pick<JsonLdOffer, 'price' | 'currency' | 'availability'> & { sku: string | null } {
  // An AggregateOffer has a range (lowPrice/highPrice), not one price: no price.
  const spec = isNode(o.priceSpecification) ? o.priceSpecification : null;
  const aggregate = hasType(o, 'AggregateOffer');
  return {
    price: aggregate ? null : (str(o.price) ?? (spec ? str(spec.price) : null)),
    currency: text(o.priceCurrency) ?? (spec ? text(spec.priceCurrency) : null),
    availability: availabilityOf(o.availability),
    sku: str(o.sku),
  };
}

/**
 * The first schema.org `Product` in the page's JSON-LD blocks (top level, arrays or `@graph`),
 * with its offer's price, currency and availability. Invalid JSON blocks are skipped. An `offers`
 * array is used only when its offers agree; otherwise price and availability are null. Returns
 * null when there is no Product at all.
 */
export function parseJsonLdOffer(html: string): JsonLdOffer | null {
  for (const m of html.matchAll(LD_SCRIPT_RE)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ''));
    } catch {
      continue;
    }
    const product = nodes(data).find((n) => hasType(n, 'Product'));
    if (!product) continue;

    const offers = (Array.isArray(product.offers) ? product.offers : [product.offers]).filter(isNode).map(offerFacts);
    const first = offers[0];
    const agree = first !== undefined && offers.every(
      (o) => o.price === first.price && o.currency === first.currency && o.availability === first.availability,
    );
    return {
      name: text(product.name),
      sku: str(product.sku) ?? (agree ? first.sku : null),
      price: agree ? first.price : null,
      currency: first !== undefined && offers.every((o) => o.currency === first.currency) ? first.currency : null,
      availability: agree ? first.availability : null,
    };
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', yen: '¥' };

/** Decodes the common HTML entities in one pass (so `&amp;amp;` becomes `&amp;`, not `&`). */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}
