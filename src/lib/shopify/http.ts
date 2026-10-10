import https from 'node:https';
import http from 'node:http';
import type { FetchFn } from '@/lib/shopify/client';

type Transport = Pick<typeof https, 'request'> | Pick<typeof http, 'request'>;

/** Catalog pages (250 products with descriptions) are a few MB; anything far beyond is hostile or broken. */
export const CATALOG_MAX_BYTES = 15 * 1024 * 1024;
/** Live product .js, /cart.js and Dailyshot pages (whose parser caps HTML at 2M chars). */
export const LIVE_MAX_BYTES = 3 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor(host: string, maxBytes: number) {
    super(`${host}: response too large (> ${maxBytes} bytes)`);
    this.name = 'ResponseTooLargeError';
  }
}

// Minimal-header HTTP client: sends only the headers given (no fetch-metadata headers),
// never follows redirects, caps the body at `maxBytes` while streaming (memory stays bounded
// even if a server streams forever), and resolves to a standard Response.
export function createStoreFetch(transport: Transport, opts: { maxBytes?: number } = {}): FetchFn {
  const maxBytes = opts.maxBytes ?? CATALOG_MAX_BYTES;
  return ((input: string | URL | Request, init: RequestInit = {}) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal ?? undefined;
      if (signal?.aborted) return reject(signal.reason);
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const fail = (e: unknown) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      };
      const req = (transport.request as typeof https.request)(url, { method: init.method ?? 'GET', headers }, (res) => {
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          req.destroy();
          return fail(new ResponseTooLargeError(url.host, maxBytes));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            fail(new ResponseTooLargeError(url.host, maxBytes));
            return;
          }
          chunks.push(c);
        });
        res.on('error', fail);
        res.on('end', () => {
          signal?.removeEventListener('abort', onAbort);
          if (size > maxBytes) return;
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
            else if (v !== undefined) h.set(k, v);
          }
          const status = res.statusCode ?? 0;
          const body = [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
          resolve(new Response(body, { status, headers: h }));
        });
      });
      const onAbort = () => { req.destroy(); reject(signal!.reason); };
      signal?.addEventListener('abort', onAbort, { once: true });
      req.on('error', fail);
      req.end();
    })) as FetchFn;
}

/** Catalog crawl client (15 MB cap). */
export const storeFetch: FetchFn = createStoreFetch(https);
/** Live checks and Dailyshot (3 MB cap): these run inside user requests on Vercel. */
export const liveFetch: FetchFn = createStoreFetch(https, { maxBytes: LIVE_MAX_BYTES });
