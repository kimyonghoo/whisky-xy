import { liveFetch } from '@/lib/shopify/http';
import type { FetchFn } from '@/lib/shopify/client';

const BASE = 'https://dailyshot.co';
const MAX_HTML_CHARS = 2_000_000;
const MAX_JSON_CHARS = 1_000_000;
const MAX_NODES = 200_000;
const MAX_RESULTS = 20;

export interface DailyshotCandidate { productId: string; nameKo: string; nameEn: string | null; priceKrw: number; imageUrl: string | null }
export interface DailyshotPrice { lowPriceKrw: number; highPriceKrw: number | null; offerCount: number | null }

export const dailyshotUrl = (productId: string) => `${BASE}/m/item/${productId}`;

function headers(): Record<string, string> {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  return { Accept: 'text/html', 'User-Agent': `WhiskyPortalBot/0.1 (+${siteUrl})` };
}

async function getHtml(url: string, fetchFn: FetchFn, allow404 = false): Promise<{ status: number; html: string }> {
  const res = await fetchFn(url, { headers: headers(), signal: AbortSignal.timeout(15_000), redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) throw new Error(`dailyshot: unexpected redirect (HTTP ${res.status})`);
  if (allow404 && res.status === 404) return { status: 404, html: '' };
  if (!res.ok) throw new Error(`dailyshot: HTTP ${res.status}`);
  const html = await res.text();
  if (html.length > MAX_HTML_CHARS) throw new Error('dailyshot: page too large');
  return { status: res.status, html };
}

function scriptJson(html: string, openTag: RegExp): unknown[] {
  const out: unknown[] = [];
  const re = new RegExp(`${openTag.source}([\\s\\S]*?)</script>`, 'g');
  for (const m of html.matchAll(re)) {
    const raw = m[1];
    if (raw.length > MAX_JSON_CHARS) throw new Error('dailyshot: embedded JSON too large');
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* skip malformed block */
    }
  }
  return out;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export async function searchDailyshot(q: string, opts: { fetchFn?: FetchFn } = {}): Promise<DailyshotCandidate[]> {
  const fetchFn = opts.fetchFn ?? liveFetch;
  const { html } = await getHtml(`${BASE}/m/search/result?q=${encodeURIComponent(q)}`, fetchFn);
  const blocks = scriptJson(html, /<script[^>]*id="__NEXT_DATA__"[^>]*>/);
  const best = new Map<string, DailyshotCandidate>();
  // Iterative walk with a node budget, so hostile nesting cannot overflow the stack.
  const stack: unknown[] = [...blocks].reverse();
  let visited = 0;
  while (stack.length > 0 && visited++ < MAX_NODES) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    if (!isRec(node)) continue;
    if (typeof node.top_product_id === 'number' && typeof node.price === 'number' && typeof node.name === 'string') {
      const productId = String(node.top_product_id);
      const cand: DailyshotCandidate = {
        productId,
        nameKo: node.name,
        nameEn: typeof node.en_name === 'string' && node.en_name ? node.en_name : null,
        priceKrw: node.price,
        imageUrl: typeof node.thumbnail_image === 'string' && node.thumbnail_image.startsWith('https://') ? node.thumbnail_image : null,
      };
      const prev = best.get(productId);
      if (!prev || cand.priceKrw < prev.priceKrw) best.set(productId, cand);
    }
    const vals = Object.values(node);
    for (let i = vals.length - 1; i >= 0; i--) if (isRec(vals[i])) stack.push(vals[i]);
  }
  return [...best.values()].slice(0, MAX_RESULTS);
}

export async function fetchDailyshotPrice(productId: string, opts: { fetchFn?: FetchFn } = {}): Promise<DailyshotPrice | null> {
  if (!/^\d{1,12}$/.test(productId)) throw new Error('dailyshot: invalid product id');
  const fetchFn = opts.fetchFn ?? liveFetch;
  const { status, html } = await getHtml(dailyshotUrl(productId), fetchFn, true);
  if (status === 404) return null;
  const blocks = scriptJson(html, /<script[^>]*type="application\/ld\+json"[^>]*>/);
  const product = blocks
    .flatMap((b) => (Array.isArray(b) ? b : [b]))
    .find((b) => isRec(b) && b['@type'] === 'Product') as Record<string, unknown> | undefined;
  const offers = product?.offers;
  if (!isRec(offers)) return null;
  if (offers.priceCurrency !== 'KRW') throw new Error('dailyshot: expected KRW currency');
  const low = offers.lowPrice ?? offers.price;
  if (typeof low !== 'number' || !Number.isFinite(low) || low <= 0) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { lowPriceKrw: low, highPriceKrw: num(offers.highPrice), offerCount: num(offers.offerCount) };
}
