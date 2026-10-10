import https from 'node:https';
import http from 'node:http';
import type { FetchFn } from '@/lib/shopify/client';

type Transport = Pick<typeof https, 'request'> | Pick<typeof http, 'request'>;

// Minimal-header HTTP client: sends only the headers given (no fetch-metadata headers),
// never follows redirects, and resolves to a standard Response.
export function createStoreFetch(transport: Transport): FetchFn {
  return ((input: string | URL | Request, init: RequestInit = {}) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal ?? undefined;
      if (signal?.aborted) return reject(signal.reason);
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const req = (transport.request as typeof https.request)(url, { method: init.method ?? 'GET', headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => {
          signal?.removeEventListener('abort', onAbort);
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
      req.on('error', (e) => { signal?.removeEventListener('abort', onAbort); reject(e); });
      req.end();
    })) as FetchFn;
}

export const storeFetch: FetchFn = createStoreFetch(https);
