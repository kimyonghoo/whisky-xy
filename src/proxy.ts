import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LANG_COOKIE, isLocale } from '@/lib/i18n';

/**
 * Locale routing. Every page lives under /ko or /en. An unprefixed URL is redirected (308) to the
 * locale in the `wi_lang` cookie, or Korean. Accept-Language is deliberately never consulted.
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
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Skip Next internals, API routes and files with an extension (icon.svg, robots.txt, ...).
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
};
