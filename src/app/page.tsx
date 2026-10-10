import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { MapPin, Plane, SearchX, X } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { searchListings, type BottleGroup } from '@/lib/search';
import { parseSearchForm } from '@/lib/search-form';
import { activeFilterCount, capGroups, nextShowCount, parseShowCount, searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import { ko } from '@/lib/i18n/ko';
import { REGION_LABEL, STORES, type Region } from '@/lib/stores';
import { buttonVariants } from '@/components/ui/button';
import { BottleResult } from '@/components/BottleResult';
import { EmptyState } from '@/components/EmptyState';
import { SectionHeader } from '@/components/SectionHeader';
import { SearchSkeleton } from '@/components/Skeletons';
import { ResultsRegion, SearchShell } from '@/components/search/SearchShell';
import { SearchForm, type SearchFormValues } from '@/components/search/SearchForm';
import { ShowMoreLink } from '@/components/search/ShowMoreLink';

type RawParams = Record<string, string | string[] | undefined>;

export default function Home({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchView searchParams={searchParams} />
    </Suspense>
  );
}

function firstString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

const exampleChip =
  'inline-flex h-9 items-center rounded-full border border-border-strong bg-card px-3.5 text-sm font-medium text-foreground shadow-card transition-colors hover:border-primary/50 hover:bg-primary-soft pointer-coarse:min-h-11';

function Examples({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2.5 text-sm font-semibold text-muted-foreground">{ko.search.tryLabel}</p>
      <ul className="flex flex-wrap justify-center gap-2">
        {ko.search.examples.map((ex) => (
          <li key={ex}>
            <Link href={searchHref({ q: ex })} prefetch={false} className={exampleChip} lang="en">
              {ex}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Hero({ values }: { values: SearchFormValues }) {
  const stores = STORES.filter((s) => s.publicAllowed);
  const regions: Region[] = ['brooklyn', 'nj', 'ca'];
  return (
    <main id="main" className="flex-1">
      <section className="border-b bg-[radial-gradient(120%_80%_at_50%_0%,var(--primary-soft)_0%,transparent_70%)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 pt-12 pb-14 text-center sm:px-6 sm:pt-20 sm:pb-20">
          <p className="text-sm font-bold tracking-[0.12em] text-primary">{ko.search.heroEyebrow}</p>
          <h1 className="text-[2rem] leading-[1.15] font-extrabold tracking-tight text-balance sm:text-5xl">{ko.search.heroTitle}</h1>
          <p className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">{ko.search.heroLead}</p>
          <div className="w-full max-w-2xl text-left">
            <SearchShell>
              <SearchForm values={values} filterCount={0} variant="hero" />
            </SearchShell>
          </div>
          <Examples className="mt-1" />
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-12 sm:grid-cols-[1fr_auto] sm:px-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{ko.search.howTitle}</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {ko.search.how.map((step, i) => (
              <li key={step.title} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-card">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{step.title}</span>
                  <span className="text-sm text-muted-foreground">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="sm:w-52">
          <h2 className="text-lg font-bold tracking-tight">{ko.search.coverageTitle}</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {regions.map((r) => (
              <li key={r} className="flex items-center gap-2">
                <MapPin aria-hidden className="size-4 text-primary" />
                {ko.search.coverageRegion(REGION_LABEL[r], stores.filter((s) => s.region === r).length)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function FilterChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={ko.search.removeFilter(label)}
      className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground py-1 pr-2 pl-3 text-sm font-semibold text-background transition-opacity hover:opacity-85 pointer-coarse:min-h-11"
    >
      {label}
      <X aria-hidden className="size-4" />
    </Link>
  );
}

function GroupList({ groups, q }: { groups: BottleGroup[]; q: string }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <BottleResult key={g.bottleKey} group={g} q={q} />
      ))}
    </div>
  );
}

async function SearchView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const params = parseSearchForm(raw);
  const values: SearchFormValues = {
    q: params.q,
    region: params.region ?? '',
    min: firstString(raw.min),
    max: firstString(raw.max),
    inStock: Boolean(params.inStockOnly),
  };

  if (!params.q) return <Hero values={values} />;
  // Results show relative times ("3시간 전 확인"), so they must render per request.
  await connection();

  const { main, ca } = await searchListings(await getDb(), params);
  const none = main.length === 0 && ca.length === 0;
  const panelFilters = activeFilterCount(params) - (params.inStockOnly ? 1 : 0);

  // Rendering is capped per section; the query itself is unchanged.
  const mainShow = parseShowCount(raw.main);
  const caShow = parseShowCount(raw.ca);
  const mainCap = capGroups(main, mainShow);
  const caCap = capGroups(ca, caShow);
  const showMain = main.length > 0 || params.region !== 'ca';
  const caOpen = main.length === 0 || params.region === 'ca' || raw.ca !== undefined;

  const chips: { label: string; href: string }[] = [];
  if (params.region) chips.push({ label: REGION_LABEL[params.region], href: searchHref(raw, { region: undefined, main: undefined, ca: undefined }) });
  if (params.minCents != null) chips.push({ label: ko.search.priceMin(formatUsd(params.minCents)), href: searchHref(raw, { min: undefined, main: undefined, ca: undefined }) });
  if (params.maxCents != null) chips.push({ label: ko.search.priceMax(formatUsd(params.maxCents)), href: searchHref(raw, { max: undefined, main: undefined, ca: undefined }) });

  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <SearchShell>
        <SearchForm key={searchHref(raw, { main: undefined, ca: undefined })} values={values} filterCount={panelFilters} />

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">{ko.search.activeFilters}</span>
            {chips.map((c) => (
              <FilterChip key={c.label} {...c} />
            ))}
          </div>
        )}

        <ResultsRegion className="mt-2">
          {none ? (
            <EmptyState
              icon={SearchX}
              title={ko.search.noResults}
              description={
                <div className="flex flex-col gap-3">
                  <p>{ko.search.noResultsHint(params.q)}</p>
                  <ul className="flex flex-col gap-1 text-left text-sm">
                    {ko.search.noResultsTips.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span aria-hidden className="text-primary">
                          •
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              }
            >
              {activeFilterCount(params) > 0 && (
                <Link href={searchHref({ q: params.q })} className={buttonVariants({ variant: 'default' })}>
                  {ko.search.filtersReset}
                </Link>
              )}
              <Examples className="mt-2" />
            </EmptyState>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground" role="status">
                {ko.search.resultSummary(params.q, main.length + ca.length)}
              </p>

              {showMain && (
                <section aria-labelledby="main-h" className="flex flex-col gap-4">
                  <SectionHeader
                    id="main-h"
                    icon={MapPin}
                    title={ko.search.mainHeading}
                    count={ko.search.bottlesCount(main.length)}
                    sub={ko.search.mainSub}
                  />
                  {main.length === 0 ? (
                    <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-muted-foreground">{ko.search.sectionEmpty}</p>
                  ) : (
                    <GroupList groups={mainCap.visible} q={params.q} />
                  )}
                  {mainCap.hiddenCount > 0 && (
                    <ShowMoreLink
                      href={searchHref(raw, { main: String(nextShowCount(mainShow, main.length)) })}
                      label={ko.search.showMore(mainCap.hiddenCount)}
                    />
                  )}
                </section>
              )}

              {ca.length > 0 && (
                <section aria-labelledby="ca-h" className="flex flex-col gap-4 rounded-3xl border bg-muted/60 p-3 pt-5 sm:p-5">
                  <SectionHeader
                    id="ca-h"
                    icon={Plane}
                    tone="secondary"
                    title={ko.search.caHeading}
                    count={ko.search.bottlesCount(ca.length)}
                    sub={ko.search.caSub}
                    className="px-1 sm:px-0"
                  />
                  <details open={caOpen} className="group/ca flex flex-col">
                    <summary
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'lg',
                        className: 'w-full list-none group-open/ca:hidden',
                      })}
                    >
                      {ko.search.caToggle(ca.length)}
                    </summary>
                    <div className="flex flex-col gap-4">
                      <GroupList groups={caCap.visible} q={params.q} />
                      {caCap.hiddenCount > 0 && (
                        <ShowMoreLink
                          href={searchHref(raw, { ca: String(nextShowCount(caShow, ca.length)) })}
                          label={ko.search.showMore(caCap.hiddenCount)}
                        />
                      )}
                    </div>
                  </details>
                </section>
              )}
            </>
          )}
        </ResultsRegion>
      </SearchShell>
    </main>
  );
}
