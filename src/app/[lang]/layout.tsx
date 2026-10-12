import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Noto_Serif_KR } from 'next/font/google';
// Pretendard, self-hosted from the npm package: unicode-range subsets, so a page only
// downloads the Korean/Latin slices it actually renders. No runtime CDN.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { LOCALES, dictFor } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { DEFAULT_CASK, DEFAULT_THEME, THEME_COLOR, themeBootScript } from '@/lib/theme';
import { DictProvider } from '@/lib/i18n/client';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/SiteChrome';
import '../globals.css';

// Serif faces are self-hosted by next/font at build time (no runtime Google request).
// Noto Serif KR is split into unicode-range slices; only the latin slice exists as a named
// subset, so preloading is off and the browser fetches just the Korean slices a page renders.
const notoSerifKr = Noto_Serif_KR({
  weight: ['500', '700'],
  subsets: ['latin'],
  preload: false,
  display: 'swap',
  variable: '--font-noto-serif-kr',
});
// 600 roman for the wordmark capitals; 400 italic only for its `hisky` tail.
const cormorant = Cormorant_Garamond({
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cormorant',
});

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const d = dictFor(await getLocale());
  return {
    title: { default: d.site.slogan, template: `%s · ${d.site.title}` },
    description: d.site.description,
  };
}

export const viewport: Viewport = {
  // Light is the default; the theme script below swaps it for a stored dark preference.
  themeColor: THEME_COLOR[DEFAULT_THEME],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
};

// Built from constants only (src/lib/theme.ts), never from request data.
const THEME_BOOT = themeBootScript();

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    // The layout never reads the theme cookies (that would make every page dynamic). It renders the
    // default, and the inline script swaps in the stored mode and cask before first paint.
    <html
      lang={locale}
      data-theme={DEFAULT_THEME}
      data-cask={DEFAULT_CASK}
      suppressHydrationWarning
      className={`${notoSerifKr.variable} ${cormorant.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <DictProvider locale={locale}>
          <SkipLink />
          <SiteHeader />
          {children}
          <SiteFooter />
        </DictProvider>
      </body>
    </html>
  );
}
