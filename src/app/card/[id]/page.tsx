import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ArrowLeft, ExternalLink, History, MapPin, Navigation, Phone } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { getListing, getPriceHistory } from '@/lib/listings';
import { recheckListing } from '@/lib/recheck';
import { getStore } from '@/lib/stores';
import { cardMeta, mapsUrl, nyDate, parseCardId, safeHttpsUrl, telHref } from '@/lib/card';
import { freshness, stockState } from '@/lib/freshness';
import { formatUsd, withTaxCents } from '@/lib/money';
import { ko } from '@/lib/i18n/ko';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { BottleHeader } from '@/components/BottleHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { PriceBlock } from '@/components/PriceBlock';
import { Notice } from '@/components/Notice';
import { CityChip } from '@/components/StoreLine';
import { CardSkeleton } from '@/components/Skeletons';
import { ShareCardButton } from '@/components/CopyLinkButton';
import { RecheckButton } from './RecheckButton';
import { ClerkMode } from './ClerkMode';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseCardId((await params).id);
  if (id === null) return {};
  await connection();
  const listing = await getListing(await getDb(), id);
  const store = listing && getStore(listing.storeId);
  if (!listing || !store) return {};
  const m = cardMeta(listing, store);
  return {
    title: m.title,
    description: m.description,
    openGraph: { title: m.title, description: m.description, ...(m.image ? { images: [m.image] } : {}) },
  };
}

export default function CardPage({ params }: Props) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <CardView params={params} />
    </Suspense>
  );
}

async function CardView({ params }: Props) {
  const id = parseCardId((await params).id);
  if (id === null) notFound();
  // Live recheck + relative freshness are per-request by nature.
  await connection();
  const db = await getDb();
  const result = await recheckListing(db, id);
  if (!result) notFound();
  const { listing, status } = result;
  const store = getStore(listing.storeId);
  if (!store) notFound();
  const history = await getPriceHistory(db, id);

  const image = safeHttpsUrl(listing.imageUrl);
  const storeUrl = safeHttpsUrl(listing.url);
  const taxIncluded = withTaxCents(listing.priceCents, store.taxRate);
  const detail = [listing.sizeMl != null ? `${listing.sizeMl} ml` : null, listing.proof != null ? `${listing.proof} proof` : null, listing.batch]
    .filter(Boolean)
    .join(' · ');
  const now = new Date();
  const stale = freshness(listing.checkedAt, now).stale;
  // After a failed live check, an "available" row older than 48 h reads "재고 확인 필요".
  const stock = stockState(listing, now);
  const live = status === 'updated' || status === 'cached';
  const lowReliability = store.stockReliability === 'low';
  const tel = telHref(store.phone);

  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-4 pb-8 sm:pt-6">
      <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 self-start text-muted-foreground' })}>
        <ArrowLeft aria-hidden />
        {ko.card.backToSearch}
      </Link>

      <BottleHeader
        variant="hero"
        headingLevel="h1"
        title={listing.title}
        subtitle={listing.variantTitle}
        imageUrl={image}
        spec={listing}
      />

      {/* Price + stock: the decision. */}
      <section aria-labelledby="status-h" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
        <h2 id="status-h" className="sr-only">
          {ko.card.statusHeading}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind={stock} size="lg" />
          {lowReliability && <StatusBadge kind="unreliable" size="lg" />}
        </div>
        <PriceBlock
          priceCents={listing.priceCents}
          taxIncludedCents={taxIncluded}
          emphasis="shelf"
          size="xl"
          caption={ko.card.shelfPrice}
          dimmed={stock !== 'instock'}
        />
        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <FreshnessIndicator checkedAt={listing.checkedAt} showDate size="md" />
            {live && <StatusBadge kind="live" size="sm" label={ko.card.liveChecked} />}
          </div>
          <RecheckButton id={listing.id} />
        </div>
      </section>

      {lowReliability && (
        <Notice
          tone="caution"
          title={ko.card.lowReliabilityTitle}
          action={
            <a href={tel} className={buttonVariants({ variant: 'outline', className: 'border-caution-line' })}>
              <Phone aria-hidden />
              {ko.card.call} · <span className="tabular">{store.phone}</span>
            </a>
          }
        >
          {ko.card.lowReliabilityBody}
        </Notice>
      )}
      {status === 'failed' && (
        <Notice tone="danger" urgent title={ko.card.recheckFailed}>
          {ko.card.recheckFailedHint}
        </Notice>
      )}
      {status === 'gone' && <Notice tone="caution" urgent title={ko.card.gone} />}
      {status === 'throttled' && (
        <Notice tone="info" title={ko.card.throttledTitle}>
          {ko.card.throttledHint}
        </Notice>
      )}
      {stale && status !== 'failed' && <Notice tone="stale" title={ko.stale.warning}>{ko.card.staleHint}</Notice>}

      {/* Store + primary actions. On phones the actions dock to the bottom edge (thumb reach). */}
      <section aria-labelledby="store-h" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{ko.card.storeHeading}</p>
          <h2 id="store-h" className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {store.name}
            <CityChip city={store.city} />
          </h2>
          <p className="flex gap-2 text-base leading-snug">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <span lang="en">{store.address}</span>
          </p>
          <p className="flex items-center gap-2 text-base">
            <Phone aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <a href={tel} className="inline-flex items-center font-medium underline-offset-4 tabular hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11">
              {store.phone}
            </a>
          </p>
        </div>
        {(store.onlineOnly || store.note) && (
          <div className="flex flex-col gap-2">
            {store.onlineOnly && <Notice tone="info">{ko.card.onlineOnlyNote}</Notice>}
            {store.note && <Notice tone="info">{store.note}</Notice>}
          </div>
        )}
        <div
          data-sticky-actions
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-3 border-t bg-background/95 px-4 pt-3 shadow-raised backdrop-blur-md safe-bottom sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none"
        >
          <a
            href={mapsUrl(store.address)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'default', size: 'xl' })}
          >
            <Navigation aria-hidden />
            {ko.card.directions}
          </a>
          <a href={tel} className={buttonVariants({ variant: 'outline', size: 'xl' })}>
            <Phone aria-hidden />
            {ko.card.call}
          </a>
        </div>
        <p className="text-sm text-muted-foreground">{ko.card.note}</p>
        {storeUrl && (
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
          >
            {ko.card.storePage}
            <ExternalLink aria-hidden className="size-4" />
          </a>
        )}
      </section>

      <ClerkMode title={listing.title} imageUrl={image} detail={detail} price={formatUsd(listing.priceCents)} />

      <ShareCardButton path={`/card/${listing.id}`} title={listing.title} className="w-full" />

      <details className="group/hist rounded-2xl border bg-card shadow-card">
        <summary className="flex min-h-14 items-center gap-2 px-5 text-base font-semibold">
          <History aria-hidden className="size-5 text-muted-foreground" />
          {ko.card.history}
          <span className={badgeVariants({ variant: 'secondary', className: 'ml-auto tabular' })}>{history.length}</span>
        </summary>
        <div className="border-t px-5 pt-2 pb-4">
          {history.length === 0 ? (
            <p className="py-2 text-base text-muted-foreground">{ko.card.noHistory}</p>
          ) : (
            <table className="w-full text-base tabular">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">{ko.card.historyDate}</th>
                  <th scope="col" className="py-2 text-right font-medium">{ko.card.historyPrice}</th>
                  <th scope="col" className="py-2 text-right font-medium">{ko.card.historyStock}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5">{nyDate(h.recordedAt)}</td>
                    <td className="py-2.5 text-right font-semibold">{formatUsd(h.priceCents)}</td>
                    <td className="py-2.5 text-right">
                      <Badge variant={h.available ? 'instock' : 'soldout'} size="sm">
                        {h.available ? ko.stock.inStock : ko.stock.soldOut}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </main>
  );
}
