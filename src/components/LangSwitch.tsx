'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LOCALES, localizePath, type Locale } from '@/lib/i18n';
import { useDict, useLocale } from '@/lib/i18n/client';
import { langCookieFor } from '@/lib/city-cookie';
import { cn } from '@/lib/utils';

/** `KO / EN`. Each code links to the same page and query under that locale; the choice is remembered. */
function Switch({ href }: { href: (locale: Locale) => string }) {
  const d = useDict();
  const locale = useLocale();
  return (
    <div role="group" aria-label={d.lang.label} className="flex items-center text-xs font-medium tracking-[0.12em]">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && (
            <span aria-hidden className="text-faint">
              /
            </span>
          )}
          <Link
            href={href(l)}
            hrefLang={l}
            lang={l}
            aria-label={d.lang.names[l]}
            aria-current={l === locale ? 'true' : undefined}
            prefetch={false}
            onClick={() => {
              document.cookie = langCookieFor(l);
            }}
            className={cn(
              'flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11',
              l === locale ? 'text-foreground' : 'text-muted-foreground hover:text-primary',
            )}
          >
            {d.lang[l]}
          </Link>
        </span>
      ))}
    </div>
  );
}

/** While the URL is unknown (prerender of a dynamic route): each locale's home. Replaced on hydration. */
export function LangSwitchFallback() {
  return <Switch href={(l) => localizePath(l, '/')} />;
}

export function LangSwitch() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return <Switch href={(l) => localizePath(l, `${pathname}${query ? `?${query}` : ''}`)} />;
}
