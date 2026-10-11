import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { X } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { bottleStoreOffers, storeAvailability } from '@/lib/listings';
import { buildMapStores, initialView, parseBottleParam } from '@/lib/map-view';
import { STORES } from '@/lib/stores';
import { CITY_COOKIE, citiesOf, resolveCity } from '@/lib/geo';
import type { Dict } from '@/lib/i18n';
import { getDict } from '@/lib/i18n/server';
import { LocaleLink } from '@/components/LocaleLink';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { ComingSoonNotice } from '@/components/ComingSoonNotice';
import { StoreMapPanel } from './StoreMapPanel';

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDict();
  return { title: d.map.title, description: d.map.lead(STORES.filter((s) => s.publicAllowed).length) };
}

type RawParams = Record<string, string | string[] | undefined>;

export default async function MapPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const d = await getDict();
  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8">
      {/* searchParams + stock counts are request data: they stream in behind this boundary. */}
      <Suspense fallback={<MapPageSkeleton d={d} />}>
        <MapView searchParams={searchParams} d={d} />
      </Suspense>
    </main>
  );
}

function MapPageSkeleton({ d }: { d: Dict }) {
  return (
    <>
      <p role="status" className="sr-only">
        {d.map.loading}
      </p>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-11/12 max-w-xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:gap-6">
        <div className="flex flex-col gap-3 lg:order-2">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <Skeleton className="h-[min(55svh,26rem)] min-h-72 rounded-2xl lg:h-[calc(100svh-10rem)] lg:max-h-[42rem]" />
        </div>
        <div className="flex flex-col gap-3 lg:order-1">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </>
  );
}

async function MapView({ searchParams, d }: { searchParams: Promise<RawParams>; d: Dict }) {
  const raw = await searchParams;
  const bottleKey = parseBottleParam(raw.bottle);
  const cityParam = Array.isArray(raw.city) ? raw.city[0] : raw.city;
  const cookieCity = (await cookies()).get(CITY_COOKIE)?.value;
  const { city, soon } = resolveCity({ city: cityParam, cookie: cookieCity });
  if (soon) return <ComingSoonNotice city={city} backCity={resolveCity({ cookie: cookieCity }).city} />;
  // Stock counts change every crawl: per-request data, never part of a prerender.
  await connection();
  const db = await getDb();
  const [availability, bottle] = await Promise.all([
    storeAvailability(db),
    bottleKey ? bottleStoreOffers(db, bottleKey) : Promise.resolve(null),
  ]);
  const stores = buildMapStores(STORES, availability, bottle, d);
  const carrying = stores.filter((s) => !s.dimmed).length;

  return (
    <>
      {bottle ? (
        <PageHeader eyebrow={d.map.bottleEyebrow} title={bottle.title} titleLang="en" lead={d.map.bottleLead(carrying, stores.length)}>
          <div className="mt-1 flex flex-wrap gap-2">
            <LocaleLink href="/map" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <X aria-hidden />
              {d.map.clearBottle}
            </LocaleLink>
          </div>
        </PageHeader>
      ) : (
        <PageHeader eyebrow={d.map.eyebrow} title={d.map.title} lead={d.map.lead(stores.length)} />
      )}

      {bottleKey && !bottle && (
        <Notice tone="info" title={d.map.bottleNotFound}>
          {d.map.bottleNotFoundHint}
        </Notice>
      )}

      <StoreMapPanel
        stores={stores}
        initialView={initialView(stores, city.id)}
        views={citiesOf(city.country).filter((c) => c.status === 'live').map((c) => c.id)}
        bottleMode={bottle !== null}
      />
    </>
  );
}
