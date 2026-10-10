import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ko } from "@/lib/i18n/ko";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: ko.site.title,
  description: ko.site.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <nav className="mx-auto flex max-w-4xl items-center gap-5 px-4 py-3 text-sm font-medium">
            <Link href="/" className="font-semibold">
              {ko.site.title}
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              {ko.nav.search}
            </Link>
            <Link href="/map" className="text-muted-foreground hover:text-foreground">
              {ko.nav.map}
            </Link>
            <Link href="/watchlist" className="text-muted-foreground hover:text-foreground">
              {ko.nav.watchlist}
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
