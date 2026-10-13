const FALLBACK = 'http://localhost:3000';
let warned = false;

/**
 * Honest crawler User-Agent: `WhiskyPortalBot/0.1 (+<site origin>)`.
 * HTTP headers must be ASCII, so SITE_URL is reduced to its origin (IDN hosts become punycode).
 * A missing or malformed SITE_URL falls back to localhost instead of failing every request.
 */
export function botUserAgent(siteUrl: string | undefined = process.env.SITE_URL): string {
  return `WhiskyPortalBot/0.1 (+${siteOrigin(siteUrl)})`;
}

function validOrigin(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const url = new URL(siteUrl.trim());
    if ((url.protocol === 'https:' || url.protocol === 'http:') && /^[\x21-\x7e]+$/.test(url.origin)) return url.origin;
  } catch {
    // fall through
  }
  return null;
}

const LOOPBACK_HOST_RE = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

/**
 * The contact origin the crawler User-Agent carries, or null when there is none a store could
 * reach: SITE_URL unset or invalid (the UA falls back to localhost) or a loopback host.
 * Crawls that must identify us (the Japanese stores) refuse to run without one.
 */
export function botContactOrigin(siteUrl: string | undefined = process.env.SITE_URL): string | null {
  const origin = validOrigin(siteUrl);
  if (origin === null || LOOPBACK_HOST_RE.test(new URL(origin).hostname)) return null;
  return origin;
}

function siteOrigin(siteUrl: string | undefined): string {
  if (!siteUrl) return FALLBACK;
  const origin = validOrigin(siteUrl);
  if (origin !== null) return origin;
  if (!warned) {
    warned = true;
    console.warn('SITE_URL is not a valid http(s) URL; using the localhost fallback in the crawler User-Agent.');
  }
  return FALLBACK;
}
