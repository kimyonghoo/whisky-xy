import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

function req(path: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(path, 'https://whisky.example'), headers ? { headers } : undefined);
}

/** The redirect target (path + query), or null when the request passes through. */
function target(path: string, headers?: Record<string, string>): string | null {
  const res = proxy(req(path, headers));
  const loc = res.headers.get('location');
  if (!loc) return null;
  expect(res.status).toBe(308);
  const url = new URL(loc);
  return url.pathname + url.search;
}

describe('proxy', () => {
  it('redirects / to /ko', () => {
    expect(target('/')).toBe('/ko');
  });

  it('uses a valid wi_lang cookie', () => {
    expect(target('/card/123', { cookie: 'wi_lang=en' })).toBe('/en/card/123');
  });

  it('ignores an invalid wi_lang cookie', () => {
    expect(target('/card/123', { cookie: 'wi_lang=fr' })).toBe('/ko/card/123');
  });

  it('never reads Accept-Language', () => {
    expect(target('/map', { 'accept-language': 'en-US,en;q=0.9' })).toBe('/ko/map');
  });

  it('keeps the query string', () => {
    expect(target('/?q=stagg&region=ca')).toBe('/ko?q=stagg&region=ca');
  });

  it('lets locale paths through', () => {
    expect(target('/en/map')).toBeNull();
    expect(target('/ko')).toBeNull();
    expect(target('/en?q=x')).toBeNull();
  });

  it('lets api, _next and files through', () => {
    expect(target('/api/recheck/1')).toBeNull();
    expect(target('/_next/static/chunks/a.js')).toBeNull();
    expect(target('/icon.svg')).toBeNull();
  });

  it('prefixes an unknown locale-like segment, which then 404s', () => {
    expect(target('/xx/map')).toBe('/ko/xx/map');
    expect(target('/english')).toBe('/ko/english');
  });
});
