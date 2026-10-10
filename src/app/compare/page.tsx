import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { CircleSlash, Scale, Search } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { listKrComparisons } from '@/lib/krcompare';
import { fxDateLabel, isFxStale } from '@/lib/kr-view';
import { ko } from '@/lib/i18n/ko';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { formatRate } from '@/components/KrCompareChip';
import { SavingsChart, SavingsLegend } from './SavingsChart';

export const metadata: Metadata = {
  title: ko.ranking.eyebrow,
  description: ko.ranking.lead,
};

/** Public, read-only. Never triggers a live Dailyshot request: it reads stored links only. */
export default function ComparePage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={ko.ranking.eyebrow} title={ko.ranking.title} lead={ko.ranking.lead} />
      {/* DB read + relative times are per-request: they stream in behind this boundary. */}
      <Suspense fallback={<CompareSkeleton />}>
        <CompareView />
      </Suspense>
    </main>
  );
}

function CompareSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {ko.ranking.loading}
      </p>
      <Skeleton className="h-28 w-full rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-52 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function SearchAction() {
  return (
    <Link href="/" className={buttonVariants({ variant: 'default' })}>
      <Search aria-hidden />
      {ko.ranking.goSearch}
    </Link>
  );
}

async function CompareView() {
  await connection();
  const now = new Date();
  const r = await listKrComparisons(await getDb(), now);

  if (!r.fx && r.linked > 0) {
    return (
      <EmptyState icon={CircleSlash} title={ko.ranking.noFxTitle} description={ko.ranking.noFxBody}>
        <SearchAction />
      </EmptyState>
    );
  }
  if (r.rows.length === 0 || !r.fx) {
    return (
      <EmptyState icon={Scale} title={ko.ranking.emptyTitle} description={r.linked > 0 ? ko.ranking.emptyNoStockBody : ko.ranking.emptyBody}>
        <SearchAction />
      </EmptyState>
    );
  }

  const fxDate = fxDateLabel(r.fx.date);
  const rate = formatRate(r.fx.usdKrw);
  return (
    <>
      <section aria-labelledby="rank-h" className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 id="rank-h" className="text-xl font-bold tracking-tight sm:text-2xl">
            {ko.ranking.listHeading}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular">
            {ko.ranking.count(r.rows.length)}
          </span>
        </div>
        {isFxStale(r.fx.date, now) && (
          <Notice tone="stale" title={ko.compare.fxStale(fxDate)}>
            {ko.ranking.fxFooter(rate, fxDate)}
          </Notice>
        )}
        <SavingsLegend />
        <SavingsChart rows={r.rows} now={now} />
        {r.notInStock > 0 && <p className="text-sm text-muted-foreground">{ko.ranking.notInStock(r.notInStock)}</p>}
      </section>
      <footer className="flex flex-col gap-1 border-t pt-5 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground/85 tabular">{ko.ranking.fxFooter(rate, fxDate)}</p>
        <p>{ko.ranking.footnote}</p>
      </footer>
    </>
  );
}
