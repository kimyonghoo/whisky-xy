'use client';

import { usePathname } from 'next/navigation';
import { Heart, Map as MapIcon, Scale, Search } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { useDict, useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { LocaleLink } from '@/components/LocaleLink';

/** Unprefixed hrefs; `match` gets the pathname with the locale prefix removed. */
const ITEMS = [
  { href: '/', label: (d: Dict) => d.nav.search, Icon: Search, match: (p: string) => p === '/' || p.startsWith('/card') },
  { href: '/map', label: (d: Dict) => d.nav.map, Icon: MapIcon, match: (p: string) => p.startsWith('/map') },
  { href: '/compare', label: (d: Dict) => d.nav.compare, Icon: Scale, match: (p: string) => p.startsWith('/compare') },
  { href: '/watchlist', label: (d: Dict) => d.nav.watchlist, short: (d: Dict) => d.nav.watchlistShort, Icon: Heart, match: (p: string) => p.startsWith('/watchlist') },
] as const;

/** '/en/map' → '/map', '/ko' → '/'. */
function unprefixed(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}

function Items({ pathname }: { pathname: string | null }) {
  const d = useDict();
  const locale = useLocale();
  const path = pathname === null ? null : unprefixed(pathname, locale);
  return (
    <ul className="flex items-center sm:gap-1">
      {ITEMS.map((item) => {
        const { href, Icon, match } = item;
        const label = item.label(d);
        const short = 'short' in item ? item.short(d) : undefined;
        const active = path !== null && match(path);
        return (
          <li key={href}>
            <LocaleLink
              href={href}
              prefetch={href === '/'}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-11 items-center gap-1.5 rounded-lg px-2 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors sm:px-3 sm:text-sm',
                active ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="hidden size-4 sm:block" />
              {short ? (
                <>
                  <span className="sm:hidden" aria-hidden>
                    {short}
                  </span>
                  <span className="max-sm:sr-only">{label}</span>
                </>
              ) : (
                label
              )}
              {active && <span aria-hidden className="absolute inset-x-2 -bottom-[0.5625rem] h-0.5 rounded-full bg-primary sm:inset-x-3" />}
            </LocaleLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Static fallback while the pathname is unknown during prerender (no active state). */
export function NavLinksFallback() {
  return <Items pathname={null} />;
}

export function NavLinks() {
  return <Items pathname={usePathname()} />;
}
