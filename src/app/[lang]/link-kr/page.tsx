import { Suspense } from 'react';
import type { Metadata } from 'next';
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
import { localizePath, type Dict } from '@/lib/i18n';
import { getDict, getLocale } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
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
import { KeyGate } from '@/app/[lang]/watchlist/KeyGate';
import { ConnectForm, UnlinkForm } from './LinkForms';

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDict();
  return { title: d.linkKr.title, robots: { index: false, follow: false } };
}

type RawParams = Record<string, string | string[] | undefined>;

const MAX_DS_QUERY = 80;

function firstString(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? '').trim();
}

export default async function LinkKrPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const d = await getDict();
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={d.linkKr.eyebrow} title={d.linkKr.title} lead={d.linkKr.lead} />
      {/* Cookie + searchParams are request data: they stream in behind this boundary. */}
      <Suspense fallback={<PanelSkeleton d={d} />}>
        <LinkKrView searchParams={searchParams} d={d} />
      </Suspense>
    </main>
  );
}

function PanelSkeleton({ d }: { d: Dict }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {d.linkKr.loading}
      </p>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  );
}

async function LinkKrView({ searchParams, d }: { searchParams: Promise<RawParams>; d: Dict }) {
  const jar = await cookies();
  if (!isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY)) return <KeyGate body={d.linkKr.gateBody} />;

  const raw = await searchParams;
  const bottleKey = parseBottleParam(raw.bottle);
  await connection();
  const db = await getDb();
  // bottleKey comes from the URL: only keys of existing public listings are accepted.
  const bottle = bottleKey ? await getBottleSummary(db, bottleKey) : null;
  if (!bottle) {
    return (
      <EmptyState icon={PackageSearch} title={d.linkKr.missingTitle} description={d.linkKr.missingHint}>
        <LocaleLink href="/" className={buttonVariants({ variant: 'default' })}>
          <Search aria-hidden />
          {d.linkKr.backToSearch}
        </LocaleLink>
      </EmptyState>
    );
  }

  const from = firstString(raw.from).slice(0, MAX_FROM_Q);
  const q = (firstString(raw.q) || brandQuery(bottle.title)).slice(0, MAX_DS_QUERY);
  const link = (await getKrLinks(db, [bottle.bottleKey])).get(bottle.bottleKey) ?? null;
  const now = new Date();
  const locale = await getLocale();

  return (
    <div className="flex flex-col gap-6">
      <LocaleLink
        href={searchHref({ q: returnQuery(from, bottle.title) })}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 self-start' })}
      >
        <ArrowLeft aria-hidden />
        {d.linkKr.backToResults}
      </LocaleLink>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <UsSummary bottle={bottle} d={d} />
        <CurrentLink link={link} bottleKey={bottle.bottleKey} now={now} d={d} />
      </div>

      <section aria-labelledby="ds-h" className="flex flex-col gap-4">
        <h2 id="ds-h" className="text-xl font-bold tracking-tight">
          {d.linkKr.searchHeading}
        </h2>
        {/* GET form: works without JS and keeps the query in the URL. */}
        <form role="search" action={localizePath(locale, '/link-kr')} className="flex flex-col gap-2">
          <input type="hidden" name="bottle" value={bottle.bottleKey} />
          {from && <input type="hidden" name="from" value={from} />}
          <label htmlFor="ds-q" className="text-sm font-semibold">
            {d.linkKr.searchLabel}
          </label>
          <div className="flex gap-2">
            <Input
              id="ds-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={d.linkKr.searchPlaceholder}
              maxLength={MAX_DS_QUERY}
              autoComplete="off"
              aria-describedby="ds-q-hint"
              className="flex-1"
            />
            <Button type="submit" className="h-11 shrink-0">
              <Search aria-hidden />
              {d.linkKr.searchSubmit}
            </Button>
          </div>
          <p id="ds-q-hint" className="text-sm text-muted-foreground">
            {d.linkKr.searchHint}
          </p>
        </form>
        {q && (
          <Suspense key={q} fallback={<ResultsSkeleton d={d} />}>
            <DailyshotResults q={q} bottle={bottle.bottleKey} from={from} currentId={link?.dailyshotProductId ?? null} d={d} />
          </Suspense>
        )}
      </section>
    </div>
  );
}

function UsSummary({ bottle, d }: { bottle: BottleSummary; d: Dict }) {
  return (
    <section aria-labelledby="us-h" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <h2 id="us-h" className="text-sm font-semibold text-primary">
        {d.linkKr.usHeading}
      </h2>
      <BottleHeader title={bottle.title} imageUrl={bottle.imageUrl} spec={bottle} headingLevel="h3">
        <p className="text-sm font-medium text-muted-foreground tabular">
          {bottle.bestTaxIncludedCents !== null ? d.linkKr.usLowest(formatUsd(bottle.bestTaxIncludedCents)) : d.linkKr.usSoldOut}
        </p>
        <p className="text-xs font-medium text-muted-foreground tabular">{d.group.stores(bottle.inStockCount, bottle.storeCount)}</p>
      </BottleHeader>
    </section>
  );
}

function CurrentLink({ link, bottleKey, now, d }: { link: KrLink | null; bottleKey: string; now: Date; d: Dict }) {
  return (
    <section aria-labelledby="cur-h" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <h2 id="cur-h" className="text-sm font-semibold text-primary">
        {d.linkKr.currentHeading}
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
              <p className="text-base font-bold tabular">{d.compare.krLowest(formatKrw(link.lowPriceKrw))}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <FreshnessIndicator checkedAt={link.checkedAt} now={now} staleAfterMs={KR_STALE_AFTER_MS} prefix={d.compare.dailyshot} />
                <a
                  href={dailyshotUrl(link.dailyshotProductId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={d.compare.dailyshotLabel(link.nameKo)}
                  className="inline-flex min-h-6 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
                >
                  {d.compare.dailyshotLink}
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
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{d.linkKr.noneLinked}</p>
      )}
    </section>
  );
}

function ResultsSkeleton({ d }: { d: Dict }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {d.linkKr.searching}
      </p>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** Admin-only live search (one outbound Dailyshot request per query). Never rendered on public pages. */
async function DailyshotResults({ q, bottle, from, currentId, d }: { q: string; bottle: string; from: string; currentId: string | null; d: Dict }) {
  let results: DailyshotCandidate[];
  try {
    results = await searchDailyshot(q);
  } catch {
    return (
      <Notice tone="danger" urgent title={d.linkKr.searchFailed}>
        {d.linkKr.searchHint}
      </Notice>
    );
  }
  if (results.length === 0) {
    return <EmptyState icon={SearchX} title={d.search.noResults} description={d.linkKr.noResults(q)} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm font-medium text-muted-foreground">
        {d.linkKr.resultsCount(q, results.length)}
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
                        {d.linkKr.current}
                      </Badge>
                    )}
                  </p>
                  {c.nameEn && (
                    <p lang="en" className="line-clamp-2 text-sm text-muted-foreground">
                      {c.nameEn}
                    </p>
                  )}
                  <p className="text-base font-bold tabular">{d.linkKr.from(formatKrw(c.priceKrw))}</p>
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
