import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStoreFetch } from '@/lib/shopify/http';

let server: http.Server;
let base: string;
let seen: http.IncomingHttpHeaders = {};
beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen = req.headers;
    if (req.url === '/redir') { res.writeHead(301, { Location: 'http://example.invalid/' }); return res.end(); }
    if (req.url === '/slow') return; // never responds
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end('{"a":1}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });
const f = createStoreFetch(http);

describe('storeFetch', () => {
  it('sends only the given headers and round-trips status/body', async () => {
    const res = await f(`${base}/x`, { headers: { 'User-Agent': 'Bot/1', Cookie: 'a=b', Accept: '*/*' } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ a: 1 });
    expect(Object.keys(seen).filter((k) => k.startsWith('sec-'))).toEqual([]);
    expect(seen['accept-language']).toBeUndefined();
    expect(seen['user-agent']).toBe('Bot/1');
    expect(seen.cookie).toBe('a=b');
  });
  it('returns 3xx unfollowed', async () => {
    const res = await f(`${base}/redir`, { headers: {}, redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('http://example.invalid/');
  });
  it('abort rejects', async () => {
    await expect(f(`${base}/slow`, { signal: AbortSignal.timeout(150) })).rejects.toBeTruthy();
  });
});
