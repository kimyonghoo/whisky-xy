/**
 * Cheap CSRF hardening for state-changing API routes: true when a browser tells us the request
 * comes from another site. Requests without Origin / Sec-Fetch-Site (curl, server-to-server) are
 * not "cross-site" here; those are bounded by the per-store live budget instead.
 */
export function isCrossSiteRequest(req: Request, siteUrl: string | undefined = process.env.SITE_URL): boolean {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return true;

  const origin = req.headers.get('origin');
  if (!origin) return false;
  if (origin === 'null') return true;

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(req.url).origin);
  } catch {
    // relative/invalid URL: rely on Host below
  }
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? (req.url.startsWith('https:') ? 'https' : 'http');
    allowed.add(`${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`);
  }
  if (siteUrl) {
    try {
      allowed.add(new URL(siteUrl).origin);
    } catch {
      // ignore a malformed SITE_URL
    }
  }
  return !allowed.has(origin);
}
