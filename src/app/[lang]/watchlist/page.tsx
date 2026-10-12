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
import { DEFAULT_WATCH_CITIES } from '@/lib/watch-form';
import { isCityId } from '@/lib/geo';
import type { Watch } from '@/lib/db/schema';
import type { Dict } from '@/lib/i18n';
import { getDict } from '@/lib/i18n/server';
import { PageHeader } from '@/components/PageHeader';
import { countTagClass } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { KeyGate } from './KeyGate';
import { WatchForm, type WatchFormDefaults } from './WatchForm';
import { WatchList, type WatchItem } from './WatchList';
import { LogoutButton } from './LogoutButton';
import { logoutAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDict();
  return { title: d.watch.title, robots: { index: false, follow: false } };
}

type RawParams = Record<string, string | string[] | undefined>;

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const d = await getDict();
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow={d.watch.eyebrow} title={d.watch.title} lead={d.watch.lead} />
      {/* Cookie + searchParams are request data: they stream in behind this boundary. */}
      <Suspense fallback={<WatchlistSkeleton d={d} />}>
        <WatchlistView searchParams={searchParams} d={d} />
      </Suspense>
    </main>
  );
}

function WatchlistSkeleton({ d }: { d: Dict }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {d.watch.loading}
      </p>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
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
    cities: [...DEFAULT_WATCH_CITIES],
  };
}

function toItem(w: Watch, d: Dict): WatchItem {
  return {
    id: w.id,
    label: w.label,
    includeTerms: w.includeTerms,
    excludeTerms: w.excludeTerms,
    batch: w.batch,
    sizeMl: w.sizeMl,
    target: w.maxPriceCents != null ? d.watch.item.targetValue(formatUsd(w.maxPriceCents)) : null,
    cities: w.cities.filter(isCityId),
    created: nyDate(w.createdAt),
    searchHref: searchHref({ q: w.includeTerms.join(' ') }),
  };
}

async function WatchlistView({ searchParams, d }: { searchParams: Promise<RawParams>; d: Dict }) {
  // The session check reads the clock (expiry) and the list is per-request admin data: neither may
  // run in a prerender. With partial prefetching, cookies() resolves in the App Shell render, so it
  // is not a suspension point on its own; connection() must come before isAdmin's Date.now().
  await connection();
  const jar = await cookies();
  if (!isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY)) return <KeyGate />;

  const raw = await searchParams;
  const initial = prefill(raw);
  const items = (await listWatches(await getDb())).map((w) => toItem(w, d));
  // Arriving from a search ("관심 등록") means the form is the task: show it first on phones.
  const formFirst = initial.include !== '' || items.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <section aria-labelledby="list-h" className={formFirst ? 'order-2 lg:order-1' : 'order-1'}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 id="list-h" className="font-serif text-xl font-medium">
              {d.watch.listHeading}
            </h2>
            <span className={countTagClass}>
              {d.watch.count(items.length)}
            </span>
          </div>
          {items.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title={d.watch.empty.title}
              description={
                <div className="flex flex-col gap-3">
                  <p>{d.watch.empty.body}</p>
                  <ol className="flex flex-col gap-1.5 text-left text-sm">
                    {d.watch.empty.steps.map((s, i) => (
                      <li key={s} className="flex gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/70 text-xs font-semibold text-primary tabular">
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
