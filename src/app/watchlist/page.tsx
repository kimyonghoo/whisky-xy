import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { BellRing } from 'lucide-react';
import { ADMIN_COOKIE, isAdmin } from '@/lib/admin';
import { getDb } from '@/lib/db/client';
import { listWatches, splitTerms, suggestExcludes } from '@/lib/watches';
import { formatUsd } from '@/lib/money';
import { nyDate } from '@/lib/card';
import { searchHref } from '@/lib/search-view';
import { MAIN_REGIONS, type Region } from '@/lib/stores';
import type { Watch } from '@/lib/db/schema';
import { ko } from '@/lib/i18n/ko';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { KeyGate } from './KeyGate';
import { WatchForm, type WatchFormDefaults } from './WatchForm';
import { WatchList, type WatchItem } from './WatchList';
import { LogoutButton } from './LogoutButton';
import { logoutAction } from './actions';

export const metadata: Metadata = {
  title: ko.watch.title,
  robots: { index: false, follow: false },
};

type RawParams = Record<string, string | string[] | undefined>;

export default function WatchlistPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={ko.watch.eyebrow} title={ko.watch.title} lead={ko.watch.lead} />
      {/* Cookie + searchParams are request data: they stream in behind this boundary. */}
      <Suspense fallback={<WatchlistSkeleton />}>
        <WatchlistView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function WatchlistSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {ko.watch.loading}
      </p>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

const MAX_Q = 120;

function prefill(raw: RawParams): WatchFormDefaults {
  const q0 = raw.q;
  const q = ((Array.isArray(q0) ? q0[0] : q0) ?? '').trim().slice(0, MAX_Q);
  return {
    label: '',
    include: q,
    exclude: suggestExcludes(splitTerms(q)).join(', '),
    batch: '',
    sizeMl: '',
    maxPrice: '',
    regions: [...MAIN_REGIONS],
  };
}

function toItem(w: Watch): WatchItem {
  return {
    id: w.id,
    label: w.label,
    includeTerms: w.includeTerms,
    excludeTerms: w.excludeTerms,
    batch: w.batch,
    sizeMl: w.sizeMl,
    target: w.maxPriceCents != null ? ko.watch.item.targetValue(formatUsd(w.maxPriceCents)) : null,
    regions: w.regions.filter((r): r is Region => r === 'brooklyn' || r === 'nj' || r === 'ca'),
    created: nyDate(w.createdAt),
    searchHref: searchHref({ q: w.includeTerms.join(' ') }),
  };
}

async function WatchlistView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const jar = await cookies();
  if (!isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY)) return <KeyGate />;

  const raw = await searchParams;
  const initial = prefill(raw);
  // The list is per-request admin data (DB read, timestamps): never part of a prerender.
  await connection();
  const items = (await listWatches(await getDb())).map(toItem);
  // Arriving from a search ("관심 등록") means the form is the task: show it first on phones.
  const formFirst = initial.include !== '' || items.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <section aria-labelledby="list-h" className={formFirst ? 'order-2 lg:order-1' : 'order-1'}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 id="list-h" className="text-xl font-bold tracking-tight">
              {ko.watch.listHeading}
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular">
              {ko.watch.count(items.length)}
            </span>
          </div>
          {items.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title={ko.watch.empty.title}
              description={
                <div className="flex flex-col gap-3">
                  <p>{ko.watch.empty.body}</p>
                  <ol className="flex flex-col gap-1.5 text-left text-sm">
                    {ko.watch.empty.steps.map((s, i) => (
                      <li key={s} className="flex gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              }
            />
          ) : (
            <WatchList items={items} />
          )}
        </section>
        <div className={formFirst ? 'order-1 lg:order-2 lg:sticky lg:top-20' : 'order-2 lg:sticky lg:top-20'}>
          <WatchForm initial={initial} />
        </div>
      </div>

      <form action={logoutAction} className="flex justify-center border-t pt-6">
        <LogoutButton />
      </form>
    </div>
  );
}
