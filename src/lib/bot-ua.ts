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

function siteOrigin(siteUrl: string | undefined): string {
  if (!siteUrl) return FALLBACK;
  try {
    const url = new URL(siteUrl.trim());
    if ((url.protocol === 'https:' || url.protocol === 'http:') && /^[\x21-\x7e]+$/.test(url.origin)) return url.origin;
  } catch {
    // fall through
  }
  if (!warned) {
    warned = true;
    console.warn('SITE_URL is not a valid http(s) URL; using the localhost fallback in the crawler User-Agent.');
  }
  return FALLBACK;
}
