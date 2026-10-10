import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { ArrowLeft, ExternalLink, SearchX, Search, PackageSearch } from 'lucide-react';
import { ADMIN_COOKIE, isAdmin } from '@/lib/admin';
import { getDb } from '@/lib/db/client';
import { getKrLinks } from '@/lib/krlinks';
import { getBottleSummary, type BottleSummary } from '@/lib/krcompare';
import { searchDailyshot, dailyshotUrl, type DailyshotCandidate } from '@/lib/dailyshot/client';
import { KR_STALE_AFTER_MS, MAX_FROM_Q, brandQuery, formatKrw, returnQuery } from '@/lib/kr-view';
import { parseBottleParam } from '@/lib/map-view';
import { searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import type { KrLink } from '@/lib/db/schema';
import { ko } from '@/lib/i18n/ko';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { BottleHeader } from '@/components/BottleHeader';
import { BottleImage } from '@/components/BottleImage';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { KeyGate } from '@/app/watchlist/KeyGate';
import { ConnectForm, UnlinkForm } from './LinkForms';

export const metadata: Metadata = {
  title: ko.linkKr.title,
  robots: { index: false, follow: false },
};

type RawParams = Record<string, string | string[] | undefined>;

const MAX_DS_QUERY = 80;

function firstString(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? '').trim();
}

export default function LinkKrPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={ko.linkKr.eyebrow} title={ko.linkKr.title} lead={ko.linkKr.lead} />
      {/* Cookie + searchParams are request data: they stream in behind this boundary. */}
      <Suspense fallback={<PanelSkeleton />}>
        <LinkKrView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {ko.linkKr.loading}
      </p>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  );
}

async function LinkKrView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const jar = await cookies();
  if (!isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY)) return <KeyGate body={ko.linkKr.gateBody} />;

  const raw = await searchParams;
  const bottleKey = parseBottleParam(raw.bottle);
  await connection();
  const db = await getDb();
  // bottleKey comes from the URL: only keys of existing public listings are accepted.
  const bottle = bottleKey ? await getBottleSummary(db, bottleKey) : null;
  if (!bottle) {
    return (
      <EmptyState icon={PackageSearch} title={ko.linkKr.missingTitle} description={ko.linkKr.missingHint}>
        <Link href="/" className={buttonVariants({ variant: 'default' })}>
          <Search aria-hidden />
          {ko.linkKr.backToSearch}
        </Link>
      </EmptyState>
    );
  }

  const from = firstString(raw.from).slice(0, MAX_FROM_Q);
  const q = (firstString(raw.q) || brandQuery(bottle.title)).slice(0, MAX_DS_QUERY);
  const link = (await getKrLinks(db, [bottle.bottleKey])).get(bottle.bottleKey) ?? null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={searchHref({ q: returnQuery(from, bottle.title) })}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 self-start' })}
      >
        <ArrowLeft aria-hidden />
        {ko.linkKr.backToResults}
      </Link>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <UsSummary bottle={bottle} />
        <CurrentLink link={link} bottleKey={bottle.bottleKey} now={now} />
      </div>

      <section aria-labelledby="ds-h" className="flex flex-col gap-4">
        <h2 id="ds-h" className="text-xl font-bold tracking-tight">
          {ko.linkKr.searchHeading}
        </h2>
        {/* GET form: works without JS and keeps the query in the URL. */}
        <form role="search" action="/link-kr" className="flex flex-col gap-2">
          <input type="hidden" name="bottle" value={bottle.bottleKey} />
          {from && <input type="hidden" name="from" value={from} />}
          <label htmlFor="ds-q" className="text-sm font-semibold">
            {ko.linkKr.searchLabel}
          </label>
          <div className="flex gap-2">
            <Input
              id="ds-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={ko.linkKr.searchPlaceholder}
              maxLength={MAX_DS_QUERY}
              autoComplete="off"
              aria-describedby="ds-q-hint"
              className="flex-1"
            />
            <Button type="submit" className="h-11 shrink-0">
              <Search aria-hidden />
              {ko.linkKr.searchSubmit}
            </Button>
          </div>
          <p id="ds-q-hint" className="text-sm text-muted-foreground">
            {ko.linkKr.searchHint}
          </p>
        </form>
        {q && (
          <Suspense key={q} fallback={<ResultsSkeleton />}>
            <DailyshotResults q={q} bottle={bottle.bottleKey} from={from} currentId={link?.dailyshotProductId ?? null} />
          </Suspense>
        )}
      </section>
    </div>
  );
}

function UsSummary({ bottle }: { bottle: BottleSummary }) {
  return (
    <section aria-labelledby="us-h" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <h2 id="us-h" className="text-sm font-semibold text-primary">
        {ko.linkKr.usHeading}
      </h2>
      <BottleHeader title={bottle.title} imageUrl={bottle.imageUrl} spec={bottle} headingLevel="h3">
        <p className="text-sm font-medium text-muted-foreground tabular">
          {bottle.bestTaxIncludedCents !== null ? ko.linkKr.usLowest(formatUsd(bottle.bestTaxIncludedCents)) : ko.linkKr.usSoldOut}
        </p>
        <p className="text-xs font-medium text-muted-foreground tabular">{ko.group.stores(bottle.inStockCount, bottle.storeCount)}</p>
      </BottleHeader>
    </section>
  );
}

function CurrentLink({ link, bottleKey, now }: { link: KrLink | null; bottleKey: string; now: Date }) {
  return (
    <section aria-labelledby="cur-h" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <h2 id="cur-h" className="text-sm font-semibold text-primary">
        {ko.linkKr.currentHeading}
      </h2>
      {link ? (
        <>
          <div className="flex min-w-0 gap-3.5">
            <BottleImage src={link.imageUrl} alt={link.nameKo} className="size-[4.5rem] sm:size-20" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="line-clamp-2 leading-snug font-semibold">{link.nameKo}</p>
              {link.nameEn && (
                <p lang="en" className="line-clamp-1 text-sm text-muted-foreground">
                  {link.nameEn}
                </p>
              )}
              <p className="text-base font-bold tabular">{ko.compare.krLowest(formatKrw(link.lowPriceKrw))}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <FreshnessIndicator checkedAt={link.checkedAt} now={now} staleAfterMs={KR_STALE_AFTER_MS} prefix={ko.compare.dailyshot} />
                <a
                  href={dailyshotUrl(link.dailyshotProductId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={ko.compare.dailyshotLabel(link.nameKo)}
                  className="inline-flex min-h-6 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
                >
                  {ko.compare.dailyshotLink}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
          <div className="border-t pt-3">
            <UnlinkForm bottle={bottleKey} />
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{ko.linkKr.noneLinked}</p>
      )}
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {ko.linkKr.searching}
      </p>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** Admin-only live search (one outbound Dailyshot request per query). Never rendered on public pages. */
async function DailyshotResults({ q, bottle, from, currentId }: { q: string; bottle: string; from: string; currentId: string | null }) {
  let results: DailyshotCandidate[];
  try {
    results = await searchDailyshot(q);
  } catch {
    return (
      <Notice tone="danger" urgent title={ko.linkKr.searchFailed}>
        {ko.linkKr.searchHint}
      </Notice>
    );
  }
  if (results.length === 0) {
    return <EmptyState icon={SearchX} title={ko.search.noResults} description={ko.linkKr.noResults(q)} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm font-medium text-muted-foreground">
        {ko.linkKr.resultsCount(q, results.length)}
      </p>
      <ul className="flex flex-col gap-3">
        {results.map((c) => {
          const current = c.productId === currentId;
          return (
            <li
              key={c.productId}
              className={cn(
                'flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:gap-4',
                current && 'border-primary/30 bg-primary-soft/45',
              )}
            >
              <div className="flex min-w-0 flex-1 gap-3.5">
                <BottleImage src={c.imageUrl} alt={c.nameKo} className="size-[4.5rem] sm:size-20" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="leading-snug font-semibold">{c.nameKo}</span>
                    {current && (
                      <Badge variant="default" size="sm">
                        {ko.linkKr.current}
                      </Badge>
                    )}
                  </p>
                  {c.nameEn && (
                    <p lang="en" className="line-clamp-2 text-sm text-muted-foreground">
                      {c.nameEn}
                    </p>
                  )}
                  <p className="text-base font-bold tabular">{ko.linkKr.from(formatKrw(c.priceKrw))}</p>
                </div>
              </div>
              <ConnectForm bottle={bottle} from={from} candidate={c} current={current} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
