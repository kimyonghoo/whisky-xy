import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { CircleSlash, Scale, Search } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { listKrComparisons } from '@/lib/krcompare';
import { fxDateLabel, isFxStale } from '@/lib/kr-view';
import type { Dict } from '@/lib/i18n';
import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { formatRate } from '@/components/KrCompareChip';
import { SavingsChart, SavingsLegend } from './SavingsChart';

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDict();
  return { title: d.ranking.eyebrow, description: d.ranking.lead };
}

/** Public, read-only. Never triggers a live Dailyshot request: it reads stored links only. */
export default async function ComparePage() {
  const d = await getDict();
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={d.ranking.eyebrow} title={d.ranking.title} lead={d.ranking.lead} />
      {/* DB read + relative times are per-request: they stream in behind this boundary. */}
      <Suspense fallback={<CompareSkeleton d={d} />}>
        <CompareView d={d} />
      </Suspense>
    </main>
  );
}

function CompareSkeleton({ d }: { d: Dict }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {d.ranking.loading}
      </p>
      <Skeleton className="h-28 w-full rounded-lg" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-52 w-full rounded-lg" />
      ))}
    </div>
  );
}

function SearchAction({ d }: { d: Dict }) {
  return (
    <LocaleLink href="/" className={buttonVariants({ variant: 'default' })}>
      <Search aria-hidden />
      {d.ranking.goSearch}
    </LocaleLink>
  );
}

async function CompareView({ d }: { d: Dict }) {
  await connection();
  const now = new Date();
  const r = await listKrComparisons(await getDb(), now);

  if (!r.fx && r.linked > 0) {
    return (
      <EmptyState icon={CircleSlash} title={d.ranking.noFxTitle} description={d.ranking.noFxBody}>
        <SearchAction d={d} />
      </EmptyState>
    );
  }
  if (r.rows.length === 0 || !r.fx) {
    return (
      <EmptyState icon={Scale} title={d.ranking.emptyTitle} description={r.linked > 0 ? d.ranking.emptyNoStockBody : d.ranking.emptyBody}>
        <SearchAction d={d} />
      </EmptyState>
    );
  }

  const fxDate = fxDateLabel(r.fx.date);
  const rate = formatRate(r.fx.usdKrw);
  return (
    <>
      <section aria-labelledby="rank-h" className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 id="rank-h" className="font-serif text-xl font-medium sm:text-2xl">
            {d.ranking.listHeading}
          </h2>
          <span className="rounded-sm border border-border-strong px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular">
            {d.ranking.count(r.rows.length)}
          </span>
        </div>
        {isFxStale(r.fx.date, now) && (
          <Notice tone="stale" title={d.compare.fxStale(fxDate)}>
            {d.ranking.fxFooter(rate, fxDate)}
          </Notice>
        )}
        <SavingsLegend d={d} />
        <SavingsChart rows={r.rows} now={now} d={d} />
        {r.notInStock > 0 && <p className="text-sm text-muted-foreground">{d.ranking.notInStock(r.notInStock)}</p>}
      </section>
      <footer className="flex flex-col gap-1 border-t pt-5 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground/85 tabular">{d.ranking.fxFooter(rate, fxDate)}</p>
        <p>{d.ranking.footnote}</p>
      </footer>
    </>
  );
}
