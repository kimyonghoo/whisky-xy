// Locale helpers shared by the proxy, server code, client components and tests.
// No server-only imports here: the server getters live in ./server, the React context in ./client.
import { ko } from './ko';
import { en } from './en';

export type Locale = 'ko' | 'en';
export const LOCALES: readonly Locale[] = ['ko', 'en'];
export const DEFAULT_LOCALE: Locale = 'ko';
/** Remembers the chosen language for unprefixed URLs (set by the language switch). */
export const LANG_COOKIE = 'wi_lang';

/**
 * `ko` is declared `as const`, so `typeof ko` holds literal strings ('검색', not string) that no
 * translation could satisfy. `Widen` keeps the exact shape (keys, nesting, function signatures,
 * array element types) and relaxes only the literals.
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends (...args: infer A) => infer R
      ? (...args: A) => Widen<R>
      : T extends readonly (infer U)[]
        ? readonly Widen<U>[]
        : T extends object
          ? { readonly [K in keyof T]: Widen<T[K]> }
          : T;

/** Dictionary shape: `ko` is the source of truth; every locale must match it key for key. */
export type Dict = Widen<typeof ko>;

const DICTS: Record<Locale, Dict> = { ko, en };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function dictFor(locale: Locale): Dict {
  return DICTS[locale];
}

/** The locale prefix of a pathname ('/en/map' → 'en'), or null. */
function localeOf(pathname: string): Locale | null {
  const first = pathname.split('/')[1];
  return isLocale(first) ? first : null;
}

/**
 * '/card/5' → '/en/card/5', '/?q=x' → '/en?q=x'. An existing locale prefix is replaced, not stacked.
 * Absolute URLs, protocol-relative URLs, fragments and `/api/*` are returned unchanged.
 */
export function localizePath(locale: Locale, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const cut = path.search(/[?#]/);
  let pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? '' : path.slice(cut);
  if (pathname === '/api' || pathname.startsWith('/api/')) return path;
  const current = localeOf(pathname);
  if (current) pathname = pathname.slice(current.length + 1) || '/';
  return `/${locale}${pathname === '/' ? '' : pathname}${rest}`;
}
