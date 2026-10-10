'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Map as MapIcon, Scale, Search } from 'lucide-react';
import { ko } from '@/lib/i18n/ko';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: ko.nav.search, Icon: Search, match: (p: string) => p === '/' || p.startsWith('/card') },
  { href: '/map', label: ko.nav.map, Icon: MapIcon, match: (p: string) => p.startsWith('/map') },
  { href: '/compare', label: ko.nav.compare, Icon: Scale, match: (p: string) => p.startsWith('/compare') },
  { href: '/watchlist', label: ko.nav.watchlist, short: ko.nav.watchlistShort, Icon: Heart, match: (p: string) => p.startsWith('/watchlist') },
] as const;

function Items({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-center sm:gap-1">
      {ITEMS.map((item) => {
        const { href, label, Icon, match } = item;
        const short = 'short' in item ? item.short : undefined;
        const active = pathname !== null && match(pathname);
        return (
          <li key={href}>
            <Link
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
            </Link>
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
