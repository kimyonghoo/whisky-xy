import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Noto_Serif_KR } from 'next/font/google';
// Pretendard, self-hosted from the npm package: unicode-range subsets, so a page only
// downloads the Korean/Latin slices it actually renders. No runtime CDN.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { LOCALES, dictFor } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
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
const cormorant = Cormorant_Garamond({
  weight: '600',
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
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${notoSerifKr.variable} ${cormorant.variable} h-full antialiased`}>
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
