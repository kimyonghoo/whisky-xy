import type { Metadata, Viewport } from 'next';
// Pretendard, self-hosted from the npm package: unicode-range subsets, so a page only
// downloads the Korean/Latin slices it actually renders. No runtime CDN.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { LOCALES, dictFor } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { DictProvider } from '@/lib/i18n/client';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/SiteChrome';
import '../globals.css';

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const d = dictFor(await getLocale());
  return {
    title: { default: d.site.title, template: `%s · ${d.site.title}` },
    description: d.site.description,
  };
}

export const viewport: Viewport = {
  themeColor: '#fbf8f3',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
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
