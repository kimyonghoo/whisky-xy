import { botUserAgent } from '@/lib/bot-ua';
import type { FetchFn } from '@/lib/shopify/client';
import { LIVE_MAX_BYTES, liveFetch } from '@/lib/shopify/http';
import { parseRobots, type Robots } from '@/lib/pagecrawl/robots';

export type CrawlStopReason =
  | 'robots-unavailable'
  | 'http-403'
  | 'http-429'
  | 'http-503'
  | 'errors'
  | 'challenge'
  | 'budget'
  | 'crawl-delay';

/** Stop this store for this run: every later `get` rethrows the same instance without a request. */
export class CrawlStopped extends Error {
  reason: CrawlStopReason;
  constructor(reason: CrawlStopReason, detail?: string) {
    super(detail ? `Crawl stopped (${reason}): ${detail}` : `Crawl stopped (${reason})`);
    this.name = 'CrawlStopped';
    this.reason = reason;
  }
}

/** The page is gone (404/410). Normal for removed products: does not stop the crawl or count as an error. */
export class PageGone extends Error {
  status: number;
  path: string;
  constructor(status: number, path: string) {
    super(`${path}: gone (HTTP ${status})`);
    this.name = 'PageGone';
    this.status = status;
    this.path = path;
  }
}

/**
 * This path will not be requested: robots.txt disallows it, or it is not an absolute path on the
 * configured origin. Non-stopping: the crawl may continue with other paths, and it is not an error.
 */
export class PathDisallowed extends Error {
  path: string;
  constructor(path: string, why: string) {
    super(`Not requesting ${JSON.stringify(path)}: ${why}`);
    this.name = 'PathDisallowed';
    this.path = path;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONSECUTIVE_ERRORS = 3;
const MIN_ALLOWED_DELAY_MS = 3000;
const MAX_ALLOWED_REQUESTS = 300;
/** A Crawl-delay above this means the site does not want to be crawled at a useful rate: skip the run. */
const MAX_CRAWL_DELAY_MS = 60_000;
/** setTimeout clamps anything above this to 1 ms. */
const MAX_TIMER_MS = 2 ** 31 - 1;
const PRODUCT_TOKEN = 'WhiskyPortalBot';

async function realSleep(ms: number): Promise<void> {
  let left = ms;
  while (left > 0) {
    const chunk = Math.min(left, MAX_TIMER_MS);
    await new Promise<void>((r) => setTimeout(r, chunk));
    left -= chunk;
  }
}

/** Decode with the Content-Type charset, else a `<meta charset>` in the first 2 KB, else UTF-8. */
function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  let label = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType ?? '')?.[1];
  if (!label) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
    label = /<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_:.-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(label ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export interface PoliteFetcher {
  get(path: string): Promise<string>;
  used(): number;
}

export interface PoliteFetcherOptions {
  /** https origin of the store. */
  origin: string;
  fetchFn?: FetchFn;
  /** Minimum gap between request starts in ms: finite and at least 3000 (the default). */
  minDelayMs?: number;
  /** Requests per run, robots.txt included: 1 to 300. Default 300. */
  maxRequests?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Fetched { res: Response; status: number; body: string | null }

const isCfChallengeHeader = (res: Response): boolean =>
  (res.headers.get('cf-mitigated') ?? '').trim().toLowerCase() === 'challenge';

/** A bot-challenge page. A `/cdn-cgi/challenge-platform/` script alone is normal on Cloudflare sites. */
function isChallenge(f: Fetched): boolean {
  if (isCfChallengeHeader(f.res)) return true;
  if (f.body === null) return false;
  if (f.status === 403 || f.status === 503) return f.body.includes('cf-chl') || f.body.includes('challenge-platform');
  if (f.status >= 200 && f.status < 300) return f.body.includes('cf-chl-') || /<title>\s*just a moment/i.test(f.body);
  return false;
}

/**
 * The single gate for page-crawl requests. Loads robots.txt first (fail closed), then serves `get(path)`
 * one request at a time, paced and budgeted. Never retries, never follows redirects, and once a stop
 * condition is hit every later `get` rethrows it without touching the network.
 *
 * Pacing and the budget are per fetcher instance: the caller creates one per store per run.
 * Concurrent `get` calls are queued and run strictly one after another.
 */
export async function createPoliteFetcher(opts: PoliteFetcherOptions): Promise<PoliteFetcher> {
  const minDelayMs = opts.minDelayMs ?? MIN_ALLOWED_DELAY_MS;
  const maxRequests = opts.maxRequests ?? MAX_ALLOWED_REQUESTS;
  if (!Number.isFinite(minDelayMs) || minDelayMs < MIN_ALLOWED_DELAY_MS) {
    throw new RangeError(`minDelayMs must be a finite number >= ${MIN_ALLOWED_DELAY_MS}, got ${minDelayMs}`);
  }
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > MAX_ALLOWED_REQUESTS) {
    throw new RangeError(`maxRequests must be an integer from 1 to ${MAX_ALLOWED_REQUESTS}, got ${maxRequests}`);
  }
  const parsedOrigin = new URL(opts.origin);
  if (parsedOrigin.protocol !== 'https:') throw new Error(`Unsupported origin (https only): ${opts.origin}`);
  const origin = parsedOrigin.origin;
  const fetchFn = opts.fetchFn ?? liveFetch; // liveFetch streams with a 3 MB body cap
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? (() => performance.now());
  const maxBytes = LIVE_MAX_BYTES;
  const userAgent = botUserAgent();

  let used = 0;
  let lastStart: number | null = null;
  let consecutiveErrors = 0;
  let stopped: CrawlStopped | null = null;
  let robots: Robots = { isAllowed: () => false, crawlDelayMs: null };
  let effectiveDelayMs = minDelayMs;

  const stop = (reason: CrawlStopReason, detail?: string): CrawlStopped => {
    stopped = new CrawlStopped(reason, detail);
    return stopped;
  };

  /** One counted, paced request for a wire path (`pathname + search`). Callers have checked stop state, robots and budget. */
  async function request(wire: string): Promise<Fetched> {
    if (lastStart !== null) {
      const elapsed = Math.max(0, now() - lastStart);
      await sleep(Math.max(0, effectiveDelayMs - elapsed));
    }
    lastStart = now();
    used++;
    const res = await fetchFn(`${origin}${wire}`, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ja' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
    });
    const status = res.status;
    if (res.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
      return { res, status, body: null };
    }
    // Only bodies we may use or inspect for a challenge are read.
    const wantBody = (status >= 200 && status < 300) || status === 403 || status === 503;
    if (!wantBody) return { res, status, body: null };
    try {
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${wire}: response too large (> ${maxBytes} bytes)`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new Error(`${wire}: response too large (> ${maxBytes} bytes)`);
      return { res, status, body: decodeBody(bytes, res.headers.get('content-type')) };
    } catch (e) {
      // A 403/503 stops the store whatever its body; only the challenge check needs the body.
      if (status === 403 || status === 503) return { res, status, body: null };
      throw e;
    }
  }

  // robots.txt: the first request. Only 404 means "no rules"; anything else that is not a usable 2xx stops the run.
  let fetched: Fetched;
  try {
    fetched = await request('/robots.txt');
  } catch (e) {
    throw stop('robots-unavailable', e instanceof Error ? e.message : String(e));
  }
  if (fetched.status === 404) {
    robots = parseRobots('', PRODUCT_TOKEN);
  } else if (fetched.status >= 200 && fetched.status < 300 && fetched.body !== null) {
    // Header only: robots.txt text (e.g. a Disallow for /cdn-cgi/challenge-platform/) must never read as a challenge.
    if (isCfChallengeHeader(fetched.res)) throw stop('challenge', 'robots.txt');
    robots = parseRobots(fetched.body, PRODUCT_TOKEN);
  } else {
    throw stop('robots-unavailable', `robots.txt HTTP ${fetched.status || fetched.res.type}`);
  }
  if ((robots.crawlDelayMs ?? 0) > MAX_CRAWL_DELAY_MS) {
    throw stop('crawl-delay', `${robots.crawlDelayMs} ms exceeds ${MAX_CRAWL_DELAY_MS} ms`);
  }
  effectiveDelayMs = Math.max(minDelayMs, robots.crawlDelayMs ?? 0);

  function countError(message: string): Error {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return stop('errors', message);
    return new Error(message);
  }

  async function doGet(path: string): Promise<string> {
    if (stopped) throw stopped;
    // Same-origin absolute paths only. Robots is matched on, and the request sent to, the exact
    // WHATWG-normalised path (dot segments resolved, non-ASCII encoded), so the two cannot differ.
    if (!path.startsWith('/') || path.includes('#') || /[\\\s\x00-\x1f\x7f]/.test(path)) {
      throw new PathDisallowed(path, `only absolute paths on ${origin} are allowed`);
    }
    const u = new URL(path, origin);
    if (u.origin !== origin) throw new PathDisallowed(path, `not on ${origin}`);
    const wire = u.pathname + u.search;
    if (!robots.isAllowed(wire)) throw new PathDisallowed(path, 'disallowed by robots.txt');
    if (used >= maxRequests) throw stop('budget');

    let f: Fetched;
    try {
      f = await request(wire);
    } catch (e) {
      throw countError(`${wire}: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (isChallenge(f)) throw stop('challenge', wire);
    const { status } = f;
    if (status === 403 || status === 429 || status === 503) throw stop(`http-${status}` as CrawlStopReason, wire);
    if (status === 404 || status === 410) throw new PageGone(status, wire);
    if (status >= 200 && status < 300 && f.body !== null) {
      consecutiveErrors = 0;
      return f.body;
    }
    if (f.res.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
      throw countError(`${wire}: unexpected redirect (HTTP ${status || 'opaqueredirect'})`);
    }
    throw countError(`${wire}: HTTP ${status}`);
  }

  // Calls run strictly one after another so pacing and the budget hold under Promise.all.
  // A rejection must not break the chain.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    used: () => used,
    get(path: string): Promise<string> {
      const run = chain.then(() => doGet(path));
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
