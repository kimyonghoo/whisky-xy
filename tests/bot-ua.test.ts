import { describe, expect, it, vi } from 'vitest';
import { botContactOrigin, botUserAgent } from '@/lib/bot-ua';

const ascii = (s: string) => /^[\x20-\x7e]+$/.test(s);

describe('botUserAgent', () => {
  it('uses the site origin', () => {
    expect(botUserAgent('https://whisky.example.com/some/path?x=1')).toBe('WhiskyPortalBot/0.1 (+https://whisky.example.com)');
  });

  it('falls back to localhost when unset', () => {
    expect(botUserAgent(undefined)).toBe('WhiskyPortalBot/0.1 (+http://localhost:3000)');
    expect(botUserAgent('')).toBe('WhiskyPortalBot/0.1 (+http://localhost:3000)');
  });

  it('never emits non-ASCII header values', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const v of ['https://내사이트.com', '내 사이트 주소', 'https://site.com/경로', 'ftp://x.com', 'javascript:alert(1)']) {
      expect(ascii(botUserAgent(v))).toBe(true);
    }
    expect(botUserAgent('내 사이트 주소')).toBe('WhiskyPortalBot/0.1 (+http://localhost:3000)');
    expect(botUserAgent('https://내사이트.com')).toMatch(/^WhiskyPortalBot\/0\.1 \(\+https:\/\/xn--/);
    vi.restoreAllMocks();
  });
});

describe('botContactOrigin', () => {
  it('is the origin carried in the User-Agent when SITE_URL is a usable public URL', () => {
    expect(botContactOrigin('https://whisky-xy.vercel.app')).toBe('https://whisky-xy.vercel.app');
    expect(botContactOrigin('https://whisky.example.com/x?y=1')).toBe('https://whisky.example.com');
  });

  it('is null when the User-Agent would fall back to (or carry) an unreachable localhost URL', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const v of [undefined, '', '   ', 'not a url', 'ftp://x.com', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]/']) {
      expect(botContactOrigin(v), String(v)).toBeNull();
    }
    vi.restoreAllMocks();
  });

  it('reads SITE_URL from the environment by default', () => {
    vi.stubEnv('SITE_URL', 'https://whisky-xy.vercel.app');
    expect(botContactOrigin()).toBe('https://whisky-xy.vercel.app');
    vi.stubEnv('SITE_URL', '');
    expect(botContactOrigin()).toBeNull();
    vi.unstubAllEnvs();
  });
});
