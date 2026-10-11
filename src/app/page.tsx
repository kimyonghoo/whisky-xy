import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { MapPin, SearchX, Store as StoreIcon, X } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { ADMIN_COOKIE, isAdmin } from '@/lib/admin';
import { SECTION_ROW_LIMIT, interpretQuery, searchListings, type SearchParams } from '@/lib/search';
import { literalPhrase, queryPhrase } from '@/lib/search-query';
import { parseSearchForm, sizeLabel } from '@/lib/search-form';
import { getLatestFx } from '@/lib/fx';
import { activeFilterCount, distinctBottleCount, searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import { ko } from '@/lib/i18n/ko';
import { STORES, getStore, type Store } from '@/lib/stores';
import { CITY_COOKIE, isCityId, liveCities, resolveCity } from '@/lib/geo';
import { buttonVariants } from '@/components/ui/button';
import { ComingSoonNotice } from '@/components/ComingSoonNotice';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { CityChip } from '@/components/StoreLine';
import { CitySections } from '@/components/search/CitySections';
import { ResultsRegion, SearchShell } from '@/components/search/SearchShell';
import { SearchForm, type SearchFormValues } from '@/components/search/SearchForm';

type RawParams = Record<string, string | string[] | undefined>;

export default function Home({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    // Fallback = the landing hero, so `/` (the common cold load) never flashes a results skeleton.
    // In-app searches navigate in a transition and keep the old results dimmed instead.
    <Suspense fallback={<Hero values={EMPTY_VALUES} />}>
      <SearchView searchParams={searchParams} />
    </Suspense>
  );
}

const EMPTY_VALUES: SearchFormValues = { q: '', size: '', min: '', max: '', inStock: false };

function firstString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

const exampleChip =
  'inline-flex h-9 items-center rounded-full border border-border-strong bg-card px-3.5 text-sm font-medium text-foreground shadow-card transition-colors hover:border-primary/50 hover:bg-primary-soft pointer-coarse:min-h-11';

function Examples({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2.5 text-sm font-semibold text-muted-foreground">{ko.search.curatedLabel}</p>
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
  const cities = liveCities();
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
            {ko.search.how.map((step) => (
              <li key={step.kicker} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-card">
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold tracking-[0.12em] text-primary tabular">{step.kicker}</span>
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
            {cities.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <MapPin aria-hidden className="size-4 text-primary" />
                {ko.search.coverageRegion(ko.city[c.id], stores.filter((s) => s.city === c.id).length)}
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

async function SearchView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const filters = parseSearchForm(raw);
  const store = filters.storeId ? getStore(filters.storeId) : undefined;
  const cityParam = firstString(raw.city);
  const urlCity = resolveCity({ city: cityParam, region: firstString(raw.region), storeCity: store?.city });
  const values: SearchFormValues = {
    q: filters.q,
    city: isCityId(cityParam) ? cityParam : undefined,
    size: filters.sizeMl != null ? String(filters.sizeMl) : '',
    min: firstString(raw.min),
    max: firstString(raw.max),
    inStock: Boolean(filters.inStockOnly),
    store: filters.storeId,
  };

  // `?store=` without a query lists that store's whole catalogue (capped per section like any search).
  // A coming-soon city never reaches the cookie: only live cities are ever stored there.
  if (!filters.q && !store && !urlCity.soon) return <Hero values={values} />;
  // Results show relative times ("3시간 전 확인"), so they must render per request.
  await connection();

  const jar = await cookies();
  const cookieCity = jar.get(CITY_COOKIE)?.value;
  const { city, soon } = resolveCity({ city: cityParam, region: firstString(raw.region), storeCity: store?.city, cookie: cookieCity });
  const params: SearchParams = { ...filters, city: city.id };
  // Links keep the city only when the URL already named one (a legacy ?region= is upgraded to ?city=).
  const keepCity = cityParam || raw.region ? city.id : undefined;
  const linkRaw = keepCity ? { ...raw, city: keepCity } : raw;
  const reset = { show: undefined, others: undefined };

  if (soon) {
    return (
      <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <SearchShell>
          <SearchForm values={values} filterCount={0} />
          <ComingSoonNotice city={city} backCity={resolveCity({ cookie: cookieCity }).city} />
        </SearchShell>
      </main>
    );
  }

  // One clock per render: the 48 h "재고 확인 필요" cut-off and the relative times agree.
  const now = new Date();
  const db = await getDb();
  // The rate converts every "최저가" to KRW, not just Korea-linked bottles.
  const terms = await interpretQuery(db, params.q);
  const [{ sections }, fx] = await Promise.all([searchListings(db, params, { now, terms }), getLatestFx(db)]);
  // Say so when the search ran on something other than what was typed (스태그 → stagg, sbbp, typo fixes).
  const searchedAs = params.q && queryPhrase(terms) !== literalPhrase(params.q) ? queryPhrase(terms) : null;
  // Admins see the "한국 가격 연결" action on each group; the cookie is re-checked by every action.
  const admin = isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY);
  const bottleTotal = distinctBottleCount(sections);
  const none = bottleTotal === 0;
  // A whole-store list can exceed the per-city query limit: say so instead of implying that's everything.
  const truncated = sections.some((sec) => sec.groups.reduce((n, g) => n + g.rows.length, 0) >= SECTION_ROW_LIMIT);
  const panelFilters = activeFilterCount(params) - (params.inStockOnly ? 1 : 0);

  const chips: { label: string; href: string }[] = [];
  if (params.sizeMl != null) chips.push({ label: sizeLabel(params.sizeMl), href: searchHref(linkRaw, { size: undefined, ...reset }) });
  if (params.minCents != null) chips.push({ label: ko.search.priceMin(formatUsd(params.minCents)), href: searchHref(linkRaw, { min: undefined, ...reset }) });
  if (params.maxCents != null) chips.push({ label: ko.search.priceMax(formatUsd(params.maxCents)), href: searchHref(linkRaw, { max: undefined, ...reset }) });

  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {store && <StoreScopeHeader store={store} clearHref={searchHref(linkRaw, { store: undefined, ...reset })} />}
      <SearchShell>
        <SearchForm key={searchHref(linkRaw, reset)} values={values} filterCount={panelFilters} />

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">{ko.search.activeFilters}</span>
            {chips.map((c) => (
              <FilterChip key={c.label} {...c} />
            ))}
          </div>
        )}

        {searchedAs && (
          <p className="text-sm text-muted-foreground">
            {ko.search.searchedAsPrefix}
            <span lang="en" className="font-semibold text-foreground">
              {searchedAs}
            </span>
            {ko.search.searchedAsSuffix}
          </p>
        )}

        <ResultsRegion className="mt-2">
          {none && store ? (
            <EmptyState
              icon={SearchX}
              title={ko.store.empty}
              description={params.q ? ko.store.emptyQuery(params.q) : ko.store.emptyHint}
            >
              {activeFilterCount(params) > 0 && (
                <Link href={searchHref({ q: params.q, store: store.id, city: keepCity })} className={buttonVariants({ variant: 'default' })}>
                  {ko.search.filtersReset}
                </Link>
              )}
              {params.q && (
                <Link href={searchHref({ q: params.q, city: keepCity })} className={buttonVariants({ variant: activeFilterCount(params) > 0 ? 'outline' : 'default' })}>
                  {ko.store.searchAll}
                </Link>
              )}
              <Link href="/map" className={buttonVariants({ variant: 'outline' })}>
                <MapPin aria-hidden />
                {ko.nav.map}
              </Link>
            </EmptyState>
          ) : none ? (
            <EmptyState
              icon={SearchX}
              title={ko.search.noResults}
              description={
                <div className="flex flex-col gap-3">
                  <p>{ko.search.noResultsHint(params.q)}</p>
                  <ul className="flex flex-col gap-1 text-left text-sm">
                    {[...ko.search.noResultsTips, ...(activeFilterCount(params) > 0 ? [ko.search.noResultsFiltered] : [])].map((t) => (
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
                <Link href={searchHref({ q: params.q, city: keepCity })} className={buttonVariants({ variant: 'default' })}>
                  {ko.search.filtersReset}
                </Link>
              )}
              <Examples className="mt-2" />
            </EmptyState>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground" role="status">
                {store
                  ? params.q
                    ? ko.store.summaryQuery(params.q, bottleTotal)
                    : ko.store.summary(bottleTotal, truncated)
                  : ko.search.resultSummary(params.q, bottleTotal)}
              </p>
              {store && truncated && <p className="-mt-1 text-sm text-muted-foreground">{ko.store.truncatedHint}</p>}

              <CitySections sections={sections} selected={city.id} raw={linkRaw} q={params.q} admin={admin} now={now} fx={fx} />
            </>
          )}
        </ResultsRegion>
      </SearchShell>
    </main>
  );
}

/** Header for a store-scoped list (`/?store=<id>`), with a way back to all stores. */
function StoreScopeHeader({ store, clearHref }: { store: Store; clearHref: string }) {
  return (
    <header className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <StoreIcon aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold text-primary">{ko.store.eyebrow}</p>
          <h1 className="text-xl leading-snug font-bold tracking-tight text-balance sm:text-2xl">
            <span lang="en">{store.name}</span> {ko.store.headingSuffix}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <CityChip city={store.city} />
            {store.onlineOnly && <span className="text-xs font-medium text-muted-foreground">{ko.row.onlineOnly}</span>}
            {store.stockReliability === 'low' && <StatusBadge kind="unreliable" />}
          </div>
          <p lang="en" className="text-sm text-muted-foreground">
            {store.address}
          </p>
        </div>
      </div>
      <Link href={clearHref} aria-label={ko.store.clearLabel(store.name)} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start sm:self-center' })}>
        <X aria-hidden />
        {ko.store.clear}
      </Link>
    </header>
  );
}
