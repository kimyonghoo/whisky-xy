import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LANG_COOKIE, isLocale } from '@/lib/i18n';

/**
 * Locale routing. Every page lives under /ko or /en. An unprefixed URL is redirected to the locale
 * in the `wi_lang` cookie, or Korean. Accept-Language is deliberately never consulted.
 * The target depends on a cookie, so the redirect is a temporary 307 that must never be cached
 * (a cached 308 would keep sending a user who switched to EN back to /ko).
 * An unknown first segment ('/xx/map') is not a locale: it is prefixed like any path and 404s.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isLocale(pathname.split('/')[1])) return NextResponse.next();
  if (pathname.startsWith('/_next/') || pathname === '/api' || pathname.startsWith('/api/') || /\.[^/]+$/.test(pathname)) {
    return NextResponse.next();
  }
  const cookie = request.cookies.get(LANG_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  const res = NextResponse.redirect(url, 307);
  res.headers.set('Cache-Control', 'private, no-store');
  res.headers.set('Vary', 'Cookie');
  return res;
}

export const config = {
  // Skip Next internals, API routes and files with an extension (icon.svg, robots.txt, ...).
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
};
