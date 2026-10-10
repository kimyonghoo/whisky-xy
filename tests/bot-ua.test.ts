import { describe, expect, it, vi } from 'vitest';
import { botUserAgent } from '@/lib/bot-ua';

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
