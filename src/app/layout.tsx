import type { Metadata, Viewport } from 'next';
// Pretendard, self-hosted from the npm package: unicode-range subsets, so a page only
// downloads the Korean/Latin slices it actually renders. No runtime CDN.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { ko } from '@/lib/i18n/ko';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/SiteChrome';
import './globals.css';

export const metadata: Metadata = {
  title: { default: ko.site.title, template: `%s · ${ko.site.title}` },
  description: ko.site.description,
};

export const viewport: Viewport = {
  themeColor: '#fbf8f3',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SkipLink />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
