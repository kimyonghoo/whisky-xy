import { timingSafeEqual } from 'node:crypto';

/** Cookie that carries the admin key. httpOnly, set only by a server action. */
export const ADMIN_COOKIE = 'admin_key';
/** 180 days, in seconds. */
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * True only when an admin key is configured and the cookie equals it.
 * Constant-time on the bytes; unequal lengths return false without calling
 * `timingSafeEqual` (which would throw).
 */
export function isAdmin(cookieValue: string | undefined, adminKey: string | undefined): boolean {
  if (!adminKey || !cookieValue) return false;
  const a = Buffer.from(cookieValue, 'utf8');
  const b = Buffer.from(adminKey, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE,
  };
}
