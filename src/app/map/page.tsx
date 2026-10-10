import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { X } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { bottleStoreOffers, storeAvailability } from '@/lib/listings';
import { buildMapStores, initialView, parseBottleParam } from '@/lib/map-view';
import { STORES } from '@/lib/stores';
import { ko } from '@/lib/i18n/ko';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { StoreMapPanel } from './StoreMapPanel';

export const metadata: Metadata = {
  title: ko.map.title,
  description: ko.map.lead(STORES.filter((s) => s.publicAllowed).length),
};

type RawParams = Record<string, string | string[] | undefined>;

export default function MapPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8">
      {/* searchParams + stock counts are request data: they stream in behind this boundary. */}
      <Suspense fallback={<MapPageSkeleton />}>
        <MapView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function MapPageSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        {ko.map.loading}
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

async function MapView({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const bottleKey = parseBottleParam(raw.bottle);
  // Stock counts change every crawl: per-request data, never part of a prerender.
  await connection();
  const db = await getDb();
  const [availability, bottle] = await Promise.all([
    storeAvailability(db),
    bottleKey ? bottleStoreOffers(db, bottleKey) : Promise.resolve(null),
  ]);
  const stores = buildMapStores(STORES, availability, bottle);
  const carrying = stores.filter((s) => !s.dimmed).length;

  return (
    <>
      {bottle ? (
        <PageHeader eyebrow={ko.map.bottleEyebrow} title={bottle.title} titleLang="en" lead={ko.map.bottleLead(carrying, stores.length)}>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href="/map" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <X aria-hidden />
              {ko.map.clearBottle}
            </Link>
          </div>
        </PageHeader>
      ) : (
        <PageHeader eyebrow={ko.map.eyebrow} title={ko.map.title} lead={ko.map.lead(stores.length)} />
      )}

      {bottleKey && !bottle && (
        <Notice tone="info" title={ko.map.bottleNotFound}>
          {ko.map.bottleNotFoundHint}
        </Notice>
      )}

      <StoreMapPanel stores={stores} initialView={initialView(stores)} bottleMode={bottle !== null} />
    </>
  );
}
