'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Popover } from '@base-ui/react/popover';
import { Heart, Map as MapIcon, Menu as MenuIcon, Scale, Search, X } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { useDict, useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { LocaleLink } from '@/components/LocaleLink';

/** Unprefixed hrefs; `match` gets the pathname with the locale prefix removed. */
const ITEMS = [
  { href: '/', label: (d: Dict) => d.nav.search, Icon: Search, match: (p: string) => p === '/' || p.startsWith('/card') },
  { href: '/map', label: (d: Dict) => d.nav.map, Icon: MapIcon, match: (p: string) => p.startsWith('/map') },
  { href: '/compare', label: (d: Dict) => d.nav.compare, Icon: Scale, match: (p: string) => p.startsWith('/compare') },
  { href: '/watchlist', label: (d: Dict) => d.nav.watchlist, Icon: Heart, match: (p: string) => p.startsWith('/watchlist') },
] as const;

/** '/en/map' → '/map', '/ko' → '/'. */
function unprefixed(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}

function Items({ pathname, column = false, onNavigate }: { pathname: string | null; column?: boolean; onNavigate?: () => void }) {
  const d = useDict();
  const locale = useLocale();
  const path = pathname === null ? null : unprefixed(pathname, locale);
  return (
    <ul className={column ? 'flex flex-col py-1' : 'flex items-center gap-1'}>
      {ITEMS.map((item) => {
        const { href, Icon, match } = item;
        const active = path !== null && match(path);
        return (
          <li key={href}>
            <LocaleLink
              href={href}
              prefetch={href === '/'}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'relative flex items-center whitespace-nowrap transition-colors',
                column
                  ? 'min-h-12 gap-3 border-l-2 px-4 text-[0.9375rem]'
                  : 'h-11 gap-1.5 rounded-md px-3 text-sm',
                active
                  ? cn('text-foreground', column && 'border-primary bg-primary-soft')
                  : cn('text-muted-foreground hover:text-foreground', column ? 'border-transparent hover:bg-muted' : 'hover:bg-muted'),
              )}
            >
              <Icon aria-hidden className={cn('size-4', !column ? 'hidden' : active ? 'text-primary' : 'text-faint')} />
              {item.label(d)}
              {active && !column && <span aria-hidden className="absolute inset-x-3 -bottom-[0.5625rem] h-px bg-primary" />}
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

/** Desktop navigation (a row in the header bar). */
export function NavLinks() {
  return <Items pathname={usePathname()} />;
}

function MobileMenuView({ pathname }: { pathname: string | null }) {
  const d = useDict();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={d.nav.menu}
        className="-mr-2 flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:text-foreground"
      >
        {open ? <X aria-hidden className="size-5" /> : <MenuIcon aria-hidden className="size-5" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={10} collisionPadding={12} className="z-50">
          <Popover.Popup className="w-[min(20rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-hidden rounded-md border border-border-strong bg-popover text-popover-foreground shadow-overlay transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <nav aria-label={d.nav.label}>
              <Items pathname={pathname} column onNavigate={() => setOpen(false)} />
            </nav>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function MobileMenuFallback() {
  return <MobileMenuView pathname={null} />;
}

/** Phones and tablets: the nav collapses into a menu button. */
export function MobileMenu() {
  return <MobileMenuView pathname={usePathname()} />;
}
