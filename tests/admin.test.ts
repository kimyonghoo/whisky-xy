import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  ADMIN_KEY_MIN_LENGTH,
  ADMIN_SESSION_MAX_AGE,
  checkAdminKey,
  createAdminSession,
  isAdmin,
  usableAdminKey,
} from '@/lib/admin';

const KEY = 'k'.repeat(16) + 'Q7v_2xLm-9pZr4Tw'; // 32 chars
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);

describe('admin key floor', () => {
  it('disables admin (with one server log) when ADMIN_KEY is shorter than 32 chars', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const short = 'x'.repeat(ADMIN_KEY_MIN_LENGTH - 1);
    expect(usableAdminKey(short)).toBeNull();
    expect(checkAdminKey(short, short)).toBe(false);
    expect(createAdminSession(short)).toBeNull();
    expect(usableAdminKey(short)).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toMatch(/shorter than 32/);
    err.mockRestore();
  });
  it('accepts a 32+ char key; unset key disables admin', () => {
    expect(usableAdminKey(KEY)).toBe(KEY);
    expect(usableAdminKey(undefined)).toBeNull();
    expect(usableAdminKey('')).toBeNull();
  });
});

describe('checkAdminKey', () => {
  it('matches only the exact key, any length input, no throw', () => {
    expect(checkAdminKey(KEY, KEY)).toBe(true);
    expect(checkAdminKey(KEY + '!', KEY)).toBe(false);
    expect(checkAdminKey(KEY.slice(1), KEY)).toBe(false);
    expect(checkAdminKey('é', KEY)).toBe(false);
    expect(checkAdminKey(undefined, KEY)).toBe(false);
    expect(checkAdminKey(KEY, undefined)).toBe(false);
  });
});

describe('signed admin session', () => {
  it('never contains the key and verifies with the same key', () => {
    const s = createAdminSession(KEY, NOW)!;
    expect(s).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]{43}$/);
    expect(s).not.toContain(KEY);
    expect(isAdmin(s, KEY, NOW)).toBe(true);
    expect(isAdmin(s, KEY, NOW + 29 * 86_400_000)).toBe(true);
  });

  it('the raw key itself is not a valid session (old cookies stop working)', () => {
    expect(isAdmin(KEY, KEY, NOW)).toBe(false);
  });

  it('expires after 30 days and rejects far-future issued-at', () => {
    const s = createAdminSession(KEY, NOW)!;
    expect(isAdmin(s, KEY, NOW + (ADMIN_SESSION_MAX_AGE + 1) * 1000)).toBe(false);
    expect(isAdmin(createAdminSession(KEY, NOW + 3_600_000)!, KEY, NOW)).toBe(false);
  });

  it('is revoked by rotating ADMIN_KEY', () => {
    const s = createAdminSession(KEY, NOW)!;
    expect(isAdmin(s, KEY.replace('Q', 'R'), NOW)).toBe(false);
  });

  it('rejects tampering: changed iat, changed signature, wrong format', () => {
    const s = createAdminSession(KEY, NOW)!;
    const [, iat, sig] = s.split('.');
    expect(isAdmin(`v1.${Number(iat) + 1}.${sig}`, KEY, NOW)).toBe(false);
    expect(isAdmin(`v1.${iat}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, KEY, NOW)).toBe(false);
    expect(isAdmin(`v2.${iat}.${sig}`, KEY, NOW)).toBe(false);
    expect(isAdmin(`v1.${iat}.${sig}x`, KEY, NOW)).toBe(false);
    expect(isAdmin('', KEY, NOW)).toBe(false);
    expect(isAdmin(undefined, KEY, NOW)).toBe(false);
  });

  it('uses HMAC-SHA256 over "admin-session.v1.<iat>"', () => {
    const iat = Math.floor(NOW / 1000);
    const sig = createHmac('sha256', KEY).update(`admin-session.v1.${iat}`).digest('base64url');
    expect(createAdminSession(KEY, NOW)).toBe(`v1.${iat}.${sig}`);
  });

  it('a session is invalid when admin is disabled by a short key', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const short = 'short-key';
    const iat = Math.floor(NOW / 1000);
    const forged = `v1.${iat}.${createHmac('sha256', short).update(`admin-session.v1.${iat}`).digest('base64url')}`;
    expect(isAdmin(forged, short, NOW)).toBe(false);
    err.mockRestore();
  });
});
