import { botUserAgent } from '@/lib/bot-ua';
import type { FetchFn } from '@/lib/shopify/client';
import { LIVE_MAX_BYTES, liveFetch } from '@/lib/shopify/http';
import { parseRobots, type Robots } from '@/lib/pagecrawl/robots';

export type CrawlStopReason =
  | 'robots-unavailable'
  | 'disallowed'
  | 'http-403'
  | 'http-429'
  | 'http-503'
  | 'errors'
  | 'challenge'
  | 'budget';

/** The crawl of this store must not continue (or, for `disallowed`, this path must not be requested). */
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

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONSECUTIVE_ERRORS = 3;
const PRODUCT_TOKEN = 'WhiskyPortalBot';
const CHALLENGE_MARKERS = ['cf-chl', 'challenge-platform'];

const realSleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export interface PoliteFetcher {
  get(path: string): Promise<string>;
  used(): number;
}

export interface PoliteFetcherOptions {
  origin: string;
  fetchFn?: FetchFn;
  /** Minimum gap between request starts. Default 3000. */
  minDelayMs?: number;
  /** Requests per run, robots.txt included. Default 300. */
  maxRequests?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Fetched { res: Response; status: number; body: string | null }

/**
 * The single gate for page-crawl requests. Loads robots.txt first (fail closed), then serves `get(path)`
 * one request at a time, paced and budgeted. Never retries, never follows redirects, and once a stop
 * condition is hit every later `get` rethrows it without touching the network.
 */
export async function createPoliteFetcher(opts: PoliteFetcherOptions): Promise<PoliteFetcher> {
  const parsedOrigin = new URL(opts.origin);
  if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') {
    throw new Error(`Unsupported origin: ${opts.origin}`);
  }
  const origin = parsedOrigin.origin;
  const fetchFn = opts.fetchFn ?? liveFetch; // liveFetch streams with a 3 MB body cap
  const minDelayMs = opts.minDelayMs ?? 3000;
  const maxRequests = opts.maxRequests ?? 300;
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

  /** One counted, paced request. The caller has already checked stop state, path and budget. */
  async function request(path: string): Promise<Fetched> {
    if (lastStart !== null) {
      const elapsed = Math.max(0, now() - lastStart);
      await sleep(Math.max(0, effectiveDelayMs - elapsed));
    }
    lastStart = now();
    used++;
    const res = await fetchFn(`${origin}${path}`, {
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
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${path}: response too large (> ${maxBytes} bytes)`);
      const body = await res.text();
      if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error(`${path}: response too large (> ${maxBytes} bytes)`);
      return { res, status, body };
    } catch (e) {
      // A 403/503 stops the store whatever its body; only the challenge check needs the body.
      if (status === 403 || status === 503) return { res, status, body: null };
      throw e;
    }
  }

  const isChallenge = (f: Fetched): boolean =>
    f.res.headers.get('cf-mitigated') !== null ||
    (f.body !== null && CHALLENGE_MARKERS.some((m) => f.body!.includes(m)));

  // robots.txt: the first request. Only 404 means "no rules"; anything else that is not a usable 2xx stops the run.
  if (maxRequests < 1) throw stop('budget');
  let fetched: Fetched;
  try {
    fetched = await request('/robots.txt');
  } catch (e) {
    throw stop('robots-unavailable', e instanceof Error ? e.message : String(e));
  }
  // Only a 2xx robots.txt can be a challenge; every other non-404 status is plain robots-unavailable.
  if (fetched.status >= 200 && fetched.status < 300 && isChallenge(fetched)) throw stop('challenge', 'robots.txt');
  if (fetched.status === 404) {
    robots = parseRobots('', PRODUCT_TOKEN);
  } else if (fetched.status >= 200 && fetched.status < 300 && fetched.body !== null) {
    robots = parseRobots(fetched.body, PRODUCT_TOKEN);
  } else {
    throw stop('robots-unavailable', `robots.txt HTTP ${fetched.status || fetched.res.type}`);
  }
  effectiveDelayMs = Math.max(minDelayMs, robots.crawlDelayMs ?? 0);

  function countError(message: string): Error {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return stop('errors', message);
    return new Error(message);
  }

  return {
    used: () => used,

    async get(path: string): Promise<string> {
      if (stopped) throw stopped;
      // Same-origin absolute paths only: no full URLs, protocol-relative URLs, or control characters.
      if (!path.startsWith('/') || path.startsWith('//') || /[\\\s\x00-\x1f\x7f]/.test(path)) {
        throw new Error(`Refusing path ${JSON.stringify(path)}: only absolute paths on ${origin} are allowed`);
      }
      if (new URL(path, origin).origin !== origin) {
        throw new Error(`Refusing path ${JSON.stringify(path)}: not on ${origin}`);
      }
      if (!robots.isAllowed(path)) throw new CrawlStopped('disallowed', path);
      if (used >= maxRequests) throw stop('budget');

      let f: Fetched;
      try {
        f = await request(path);
      } catch (e) {
        throw countError(`${path}: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (isChallenge(f)) throw stop('challenge', path);
      const { status } = f;
      if (status === 403 || status === 429 || status === 503) throw stop(`http-${status}` as CrawlStopReason, path);
      if (status === 404 || status === 410) throw new PageGone(status, path);
      if (status >= 200 && status < 300 && f.body !== null) {
        consecutiveErrors = 0;
        return f.body;
      }
      if (f.res.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
        throw countError(`${path}: unexpected redirect (HTTP ${status || 'opaqueredirect'})`);
      }
      throw countError(`${path}: HTTP ${status}`);
    },
  };
}
