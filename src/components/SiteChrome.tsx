import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { Info } from 'lucide-react';
import { STORES } from '@/lib/stores';
import { CITY_COOKIE, resolveCity } from '@/lib/geo';
import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { Wordmark } from '@/components/Wordmark';
import { MobileMenu, MobileMenuFallback, NavLinks, NavLinksFallback } from '@/components/NavLinks';
import { CitySelect, CitySelectFallback } from '@/components/CitySelect';
import { LangSwitch, LangSwitchFallback } from '@/components/LangSwitch';
import { PourProgress } from '@/components/PourProgress';

/** Reads the remembered city at request time; the client component prefers a valid `?city=`. */
async function HeaderCity() {
  const jar = await cookies();
  return <CitySelect initial={resolveCity({ cookie: jar.get(CITY_COOKIE)?.value }).city.id} />;
}

/**
 * One row on desktop: mark, nav, city and language. Below `lg` the nav collapses into a menu
 * button and the city/language controls drop to a full-width second row (spec appendix B).
 * DOM order (mark, nav, menu button, city, language) matches the visual order at every width.
 */
export async function SiteHeader() {
  const d = await getDict();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto] items-center px-4 sm:px-6 lg:h-16 lg:grid-cols-[auto_1fr_auto] lg:gap-6">
        <LocaleLink href="/" aria-label={d.nav.home} className="-m-1 flex h-14 items-center justify-self-start rounded-md p-1 lg:h-auto">
          <Wordmark d={d} />
        </LocaleLink>
        <nav aria-label={d.nav.label} className="justify-self-center max-lg:hidden">
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
        <div className="lg:hidden">
          <Suspense fallback={<MobileMenuFallback />}>
            <MobileMenu />
          </Suspense>
        </div>
        <div className="col-span-2 -mx-4 flex min-h-11 items-center justify-between gap-3 px-4 pb-1 sm:-mx-6 sm:px-6 lg:col-span-1 lg:mx-0 lg:min-h-0 lg:px-0 lg:pb-0">
          <Suspense fallback={<CitySelectFallback />}>
            <HeaderCity />
          </Suspense>
          <Suspense fallback={<LangSwitchFallback />}>
            <LangSwitch />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={null}>
        <PourProgress />
      </Suspense>
    </header>
  );
}

export async function SiteFooter() {
  const d = await getDict();
  const storeCount = STORES.filter((s) => s.publicAllowed).length;
  return (
    <footer className="mt-auto border-t bg-muted/50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p className="flex gap-2.5 leading-relaxed text-foreground/80">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{d.footer.disclaimer}</span>
        </p>
        <ul className="flex flex-col gap-1 pl-6.5 leading-relaxed">
          <li>{d.footer.tax}</li>
          <li>{d.footer.coverage(storeCount)}</li>
        </ul>
        <p className="pl-6.5 text-xs font-semibold tracking-wide">{d.site.title}</p>
      </div>
    </footer>
  );
}

export async function SkipLink() {
  const d = await getDict();
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md border border-primary bg-popover px-4 py-3 font-semibold text-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {d.site.skipToContent}
    </a>
  );
}
