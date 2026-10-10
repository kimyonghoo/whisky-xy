import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Admin session cookie. It never contains ADMIN_KEY itself, only a signed, expiring session:
 *   v1.<issued-at unix seconds>.<base64url HMAC-SHA256(key = ADMIN_KEY, "admin-session.v1.<iat>")>
 * Rotating ADMIN_KEY revokes every session. In production the `__Host-` prefix makes browsers
 * require Secure + Path=/ + no Domain, so no subdomain can set or read it.
 */
export const ADMIN_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-admin' : 'admin_session';
/** Cookie name used before signed sessions (it held the raw key). Cleared on login/logout. */
export const LEGACY_ADMIN_COOKIE = 'admin_key';
/** Session lifetime, in seconds (30 days). Checked server-side from the signed iat. */
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
/** Shorter keys disable admin entirely: a weak key must never ship. */
export const ADMIN_KEY_MIN_LENGTH = 32;
/** Fixed delay on a wrong key: with a 32+ char random key brute force is infeasible. */
export const WRONG_KEY_DELAY_MS = 400;

const SESSION_RE = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;
const CLOCK_SKEW_S = 300;

let warnedShortKey = false;

/** ADMIN_KEY when it is long enough, else null (logs once on the server why admin is off). */
export function usableAdminKey(adminKey: string | undefined): string | null {
  if (!adminKey) return null;
  if (adminKey.length < ADMIN_KEY_MIN_LENGTH) {
    if (!warnedShortKey) {
      warnedShortKey = true;
      console.error(
        `[admin] ADMIN_KEY is shorter than ${ADMIN_KEY_MIN_LENGTH} characters, so admin pages are disabled. ` +
          `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
      );
    }
    return null;
  }
  return adminKey;
}

function sign(key: string, iat: number): string {
  return createHmac('sha256', key).update(`admin-session.v1.${iat}`).digest('base64url');
}

/** Constant-time check of a typed key against ADMIN_KEY (hashing first equalises lengths). */
export function checkAdminKey(input: string | undefined, adminKey: string | undefined): boolean {
  const key = usableAdminKey(adminKey);
  if (!key || !input) return false;
  const a = createHash('sha256').update(input, 'utf8').digest();
  const b = createHash('sha256').update(key, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** A new signed session value, or null when admin is disabled. */
export function createAdminSession(adminKey: string | undefined, now: number = Date.now()): string | null {
  const key = usableAdminKey(adminKey);
  if (!key) return null;
  const iat = Math.floor(now / 1000);
  return `v1.${iat}.${sign(key, iat)}`;
}

/**
 * True only when admin is enabled and the cookie is a well-formed, unexpired session signed
 * with the current ADMIN_KEY. Signatures are compared with timingSafeEqual.
 */
export function isAdmin(cookieValue: string | undefined, adminKey: string | undefined, now: number = Date.now()): boolean {
  const key = usableAdminKey(adminKey);
  if (!key || !cookieValue) return false;
  const m = SESSION_RE.exec(cookieValue);
  if (!m) return false;
  const iat = Number(m[1]);
  const age = now / 1000 - iat;
  if (age < -CLOCK_SKEW_S || age > ADMIN_SESSION_MAX_AGE) return false;
  const got = Buffer.from(m[2], 'utf8');
  const expected = Buffer.from(sign(key, iat), 'utf8');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Required by the __Host- prefix in production.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  };
}

/** Options that expire the cookie (keeps Secure/Path so a __Host- cookie is really removed). */
export function expiredCookieOptions() {
  return { ...adminCookieOptions(), maxAge: 0 };
}
