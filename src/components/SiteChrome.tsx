import { Suspense } from 'react';
import { Info } from 'lucide-react';
import { STORES } from '@/lib/stores';
import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { Wordmark } from '@/components/Wordmark';
import { NavLinks, NavLinksFallback } from '@/components/NavLinks';

export async function SiteHeader() {
  const d = await getDict();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <LocaleLink href="/" aria-label={d.nav.home} className="-m-1 flex items-center rounded-lg p-1 pointer-coarse:min-h-11">
          <Wordmark d={d} />
        </LocaleLink>
        <nav aria-label={d.nav.label}>
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>
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
      className="sr-only z-50 rounded-lg bg-foreground px-4 py-3 font-semibold text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {d.site.skipToContent}
    </a>
  );
}
