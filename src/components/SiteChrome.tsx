import { Suspense } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { STORES } from '@/lib/stores';
import { ko } from '@/lib/i18n/ko';
import { Wordmark } from '@/components/Wordmark';
import { NavLinks, NavLinksFallback } from '@/components/NavLinks';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={ko.nav.home} className="-m-1 rounded-lg p-1">
          <Wordmark />
        </Link>
        <nav aria-label={ko.nav.label}>
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const storeCount = STORES.filter((s) => s.publicAllowed).length;
  return (
    <footer className="mt-auto border-t bg-muted/50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p className="flex gap-2.5 leading-relaxed text-foreground/80">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{ko.footer.disclaimer}</span>
        </p>
        <ul className="flex flex-col gap-1 pl-6.5 leading-relaxed">
          <li>{ko.footer.tax}</li>
          <li>{ko.footer.coverage(storeCount)}</li>
        </ul>
        <p className="pl-6.5 text-xs font-semibold tracking-wide">{ko.site.title}</p>
      </div>
    </footer>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-lg bg-foreground px-4 py-3 font-semibold text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {ko.site.skipToContent}
    </a>
  );
}
