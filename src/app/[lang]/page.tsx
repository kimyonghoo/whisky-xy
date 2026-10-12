import { Suspense } from 'react';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { MapPin, SearchX, Store as StoreIcon, X } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { ADMIN_COOKIE, isAdmin } from '@/lib/admin';
import { SECTION_ROW_LIMIT, interpretQuery, searchListings, type SearchParams } from '@/lib/search';
import { literalPhrase, queryPhrase } from '@/lib/search-query';
import { parseSearchForm, searchFormValues, sizeLabel, type SearchFormValues } from '@/lib/search-form';
import { withCity } from '@/lib/city-cookie';
import { getLatestFx } from '@/lib/fx';
import { activeFilterCount, distinctBottleCount, searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import type { Dict } from '@/lib/i18n';
import { getDict } from '@/lib/i18n/server';
import { getStore, type Store } from '@/lib/stores';
import { COUNTRIES, CITY_COOKIE, citiesOf, isCityId, resolveCity, storesIn } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { LocaleLink } from '@/components/LocaleLink';
import { ComingSoonNotice } from '@/components/ComingSoonNotice';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { CityChip } from '@/components/CityChip';
import { CitySections } from '@/components/search/CitySections';
import { ResultsRegion, SearchShell } from '@/components/search/SearchShell';
import { SearchForm } from '@/components/search/SearchForm';
import { PinCityInUrl } from '@/components/search/PinCityInUrl';

type RawParams = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<RawParams> }) {
  const d = await getDict();
  return (
    // Fallback = the landing hero, so `/` (the common cold load) never flashes a results skeleton.
    // In-app searches navigate in a transition and keep the old results dimmed instead.
    <Suspense fallback={<Hero values={EMPTY_VALUES} d={d} />}>
      <SearchView searchParams={searchParams} />
    </Suspense>
  );
}

const EMPTY_VALUES: SearchFormValues = { q: '', size: '', min: '', max: '', inStock: false };

function firstString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** `CURATED` + underlined example searches (the hero and the no-results state). */
function Examples({ className, city, d }: { className?: string; city?: string; d: Dict }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1', className)}>
      <p lang="en" className="text-[0.6875rem] tracking-[0.2em] text-faint">
        {d.search.curatedLabel}
      </p>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {d.search.examples.map((ex) => (
          <li key={ex}>
            <LocaleLink
              href={searchHref({ q: ex, city })}
              prefetch={false}
              lang="en"
              className="group/ex inline-flex min-h-9 items-center text-[0.8125rem] text-secondary-foreground transition-colors hover:text-primary pointer-coarse:min-h-11"
            >
              <span className="border-b border-border-strong pb-0.5 transition-colors group-hover/ex:border-primary/60">{ex}</span>
            </LocaleLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live cities with their public store counts, grouped by country (soon cities are left out). */
function Coverage({ d }: { d: Dict }) {
  const byCountry = COUNTRIES.map((country) => ({ country, cities: citiesOf(country).filter((c) => c.status === 'live') })).filter(
    (g) => g.cities.length > 0,
  );
  return (
    <section aria-labelledby="coverage-h" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-baseline sm:gap-10 sm:px-6">
      <h2 id="coverage-h" className="shrink-0 font-serif text-base font-medium">
        {d.search.coverageTitle}
      </h2>
      <div className="flex flex-col gap-3">
        {byCountry.map(({ country, cities }) => (
          <div key={country} className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-6">
            <h3 lang="en" className="text-[0.6875rem] tracking-[0.28em] text-primary">
              {d.countryEn[country]}
            </h3>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {cities.map((c) => (
                <li key={c.id} className="tabular">
                  {d.search.coverageRegion(d.city[c.id], storesIn(c.id).length)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Hero({ values, d }: { values: SearchFormValues; d: Dict }) {
  return (
    <main id="main" className="flex-1">
      <section className="bg-[radial-gradient(70%_60%_at_50%_0%,var(--primary-soft)_0%,transparent_70%)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pt-12 pb-14 text-center sm:px-6 sm:pt-20 sm:pb-24">
          <p lang="en" className="text-[0.625rem] tracking-[0.3em] text-balance text-primary uppercase sm:text-[0.6875rem] sm:tracking-[0.36em]">
            {d.search.heroEyebrow}
          </p>
          <h1 className="mt-5 font-serif text-[1.75rem] leading-[1.35] font-medium text-balance sm:mt-6 sm:text-[2.5rem]">{d.search.heroTitle}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[0.9375rem] sm:leading-[1.7]">{d.search.heroLead}</p>
          <div className="mt-9 w-full max-w-xl text-left sm:mt-10">
            <SearchShell>
              <SearchForm values={values} filterCount={0} variant="hero" />
            </SearchShell>
          </div>
          <Examples className="mt-5 sm:mt-6" city={values.city} d={d} />
        </div>
      </section>
      <section aria-labelledby="how-h" className="border-y">
        <h2 id="how-h" className="sr-only">
          {d.search.howTitle}
        </h2>
        <ol className="mx-auto grid w-full max-w-5xl sm:grid-cols-3">
          {d.search.how.map((step) => (
            <li key={step.kicker} className="border-b px-5 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:px-7 sm:py-7 sm:last:border-r-0">
              <p lang="en" className="text-[0.6875rem] tracking-[0.28em] text-primary">
                {step.kicker}
              </p>
              <h3 className="mt-2 font-serif text-base font-medium">{step.title}</h3>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <Coverage d={d} />
    </main>
  );
}

function FilterChip({ href, label, d }: { href: string; label: string; d: Dict }) {
  return (
    <LocaleLink
      href={href}
      aria-label={d.search.removeFilter(label)}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-primary/60 py-1 pr-2 pl-3 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary-soft pointer-coarse:min-h-11"
    >
      {label}
      <X aria-hidden className="size-4" />
    </LocaleLink>
  );
}

async function SearchView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const d = await getDict();
  const raw = await searchParams;
  const filters = parseSearchForm(raw);
  const store = filters.storeId ? getStore(filters.storeId) : undefined;
  const cityParam = firstString(raw.city);
  const urlCity = resolveCity({ city: cityParam, region: firstString(raw.region), storeCity: store?.city });

  // `?store=` without a query lists that store's whole catalogue (capped per section like any search).
  // A coming-soon city never reaches the cookie: only live cities are ever stored there.
  // The landing page is prerendered without the cookie: it carries only a valid `?city=`.
  if (!filters.q && !store && !urlCity.soon) return <Hero values={searchFormValues(raw, filters, isCityId(cityParam) ? cityParam : undefined)} d={d} />;
  // Results show relative times ("3시간 전 확인"), so they must render per request.
  await connection();

  const jar = await cookies();
  const cookieCity = jar.get(CITY_COOKIE)?.value;
  const { city, soon } = resolveCity({ city: cityParam, region: firstString(raw.region), storeCity: store?.city, cookie: cookieCity });
  const params: SearchParams = { ...filters, city: city.id };
  // The resolved (whitelisted) city travels in every link and in the form, so a shared URL opens on
  // it (spec §5.5); a store page pins the store's city. `PinCityInUrl` fixes up the current address.
  const keepCity = city.id;
  const linkRaw = { ...raw, city: keepCity };
  const values = searchFormValues(raw, filters, keepCity);
  const reset = { show: undefined, others: undefined };

  if (soon) {
    return (
      <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <PinCityInUrl city={keepCity} />
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
  if (params.minCents != null) chips.push({ label: d.search.priceMin(formatUsd(params.minCents)), href: searchHref(linkRaw, { min: undefined, ...reset }) });
  if (params.maxCents != null) chips.push({ label: d.search.priceMax(formatUsd(params.maxCents)), href: searchHref(linkRaw, { max: undefined, ...reset }) });

  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <PinCityInUrl city={keepCity} />
      {store && <StoreScopeHeader d={d} store={store} clearHref={searchHref(linkRaw, { store: undefined, ...reset })} />}
      <SearchShell>
        <SearchForm key={searchHref(linkRaw, reset)} values={values} filterCount={panelFilters} />

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">{d.search.activeFilters}</span>
            {chips.map((c) => (
              <FilterChip key={c.label} {...c} d={d} />
            ))}
          </div>
        )}

        {searchedAs && (
          <p className="text-sm text-muted-foreground">
            {d.search.searchedAsPrefix}
            <span lang="en" className="font-semibold text-foreground">
              {searchedAs}
            </span>
            {d.search.searchedAsSuffix}
          </p>
        )}

        <ResultsRegion className="mt-2">
          {none && store ? (
            <EmptyState
              icon={SearchX}
              title={d.store.empty}
              description={params.q ? d.store.emptyQuery(params.q) : d.store.emptyHint}
            >
              {activeFilterCount(params) > 0 && (
                <LocaleLink href={searchHref({ q: params.q, store: store.id, city: keepCity })} className={buttonVariants({ variant: 'default' })}>
                  {d.search.filtersReset}
                </LocaleLink>
              )}
              {params.q && (
                <LocaleLink href={searchHref({ q: params.q, city: keepCity })} className={buttonVariants({ variant: activeFilterCount(params) > 0 ? 'outline' : 'default' })}>
                  {d.store.searchAll}
                </LocaleLink>
              )}
              <LocaleLink href={withCity('/map', keepCity)} className={buttonVariants({ variant: 'outline' })}>
                <MapPin aria-hidden />
                {d.nav.map}
              </LocaleLink>
            </EmptyState>
          ) : none ? (
            <EmptyState
              icon={SearchX}
              title={d.search.noResults}
              description={
                <div className="flex flex-col gap-3">
                  <p>{d.search.noResultsHint(params.q)}</p>
                  <ul className="flex flex-col gap-1 text-left text-sm">
                    {[...d.search.noResultsTips, ...(activeFilterCount(params) > 0 ? [d.search.noResultsFiltered] : [])].map((t) => (
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
                <LocaleLink href={searchHref({ q: params.q, city: keepCity })} className={buttonVariants({ variant: 'default' })}>
                  {d.search.filtersReset}
                </LocaleLink>
              )}
              <Examples className="mt-2" city={keepCity} d={d} />
            </EmptyState>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground" role="status">
                {store
                  ? params.q
                    ? d.store.summaryQuery(params.q, bottleTotal)
                    : d.store.summary(bottleTotal, truncated)
                  : d.search.resultSummary(params.q, bottleTotal)}
              </p>
              {store && truncated && <p className="-mt-1 text-sm text-muted-foreground">{d.store.truncatedHint}</p>}

              <CitySections sections={sections} selected={city.id} raw={linkRaw} q={params.q} admin={admin} now={now} fx={fx} />
            </>
          )}
        </ResultsRegion>
      </SearchShell>
    </main>
  );
}

/** Header for a store-scoped list (`/?store=<id>`), with a way back to all stores. */
function StoreScopeHeader({ store, clearHref, d }: { store: Store; clearHref: string; d: Dict }) {
  return (
    <header className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border-strong text-primary">
          <StoreIcon aria-hidden className="size-5" strokeWidth={1.5} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium tracking-[0.06em] text-primary">{d.store.eyebrow}</p>
          <h1 className="font-serif text-xl leading-snug font-medium text-balance sm:text-2xl">
            {d.store.headingPrefix && `${d.store.headingPrefix} `}
            <span lang="en">{store.name}</span>
            {d.store.headingSuffix && ` ${d.store.headingSuffix}`}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <CityChip city={store.city} />
            {store.onlineOnly && <span className="text-xs font-medium text-muted-foreground">{d.row.onlineOnly}</span>}
            {store.stockReliability === 'low' && <StatusBadge kind="unreliable" />}
          </div>
          <p lang="en" className="text-sm text-muted-foreground">
            {store.address}
          </p>
        </div>
      </div>
      <LocaleLink href={clearHref} aria-label={d.store.clearLabel(store.name)} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start sm:self-center' })}>
        <X aria-hidden />
        {d.store.clear}
      </LocaleLink>
    </header>
  );
}
