import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getListing, getPriceHistory } from '@/lib/listings';
import { recheckListing } from '@/lib/recheck';
import { getStore } from '@/lib/stores';
import { cardMeta, mapsUrl, nyDate, parseCardId, safeHttpsUrl, telHref } from '@/lib/card';
import { formatUsd, withTaxCents } from '@/lib/money';
import { ko } from '@/lib/i18n/ko';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { StockBadge } from '@/components/StockBadge';
import { FreshnessBadge } from '@/components/FreshnessBadge';
import { CopyLinkButton } from '@/components/CopyLinkButton';
import { RecheckButton } from './RecheckButton';
import { ClerkMode } from './ClerkMode';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseCardId((await params).id);
  if (id === null) return {};
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
    <Suspense
      fallback={<main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 text-base text-muted-foreground">{ko.loading}</main>}
    >
      <CardView params={params} />
    </Suspense>
  );
}

async function CardView({ params }: Props) {
  const id = parseCardId((await params).id);
  if (id === null) notFound();
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

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
      {image ? (
        // Hotlinked from the store CDN on purpose (never copied).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={listing.title} referrerPolicy="no-referrer" className="h-72 w-full rounded-xl bg-muted object-contain" />
      ) : (
        <div className="h-72 w-full rounded-xl bg-muted" aria-hidden />
      )}

      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold leading-tight">{listing.title}</h1>
        {listing.variantTitle && <p className="text-lg text-muted-foreground">{listing.variantTitle}</p>}
        <div className="flex flex-wrap gap-2">
          {listing.sizeMl != null && <Badge variant="secondary" className="h-8 px-3 text-lg">{listing.sizeMl} ml</Badge>}
          {listing.proof != null && <Badge variant="secondary" className="h-8 px-3 text-lg">{listing.proof} proof</Badge>}
          {listing.batch && <Badge variant="secondary" className="h-8 px-3 text-lg">{listing.batch}</Badge>}
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <p className="text-5xl font-bold tabular-nums">{formatUsd(listing.priceCents)}</p>
        <p className="text-xl text-muted-foreground tabular-nums">{ko.card.taxIncluded(formatUsd(taxIncluded))}</p>
      </section>

      <section className="flex flex-col gap-2 text-lg">
        <StockBadge available={listing.available} reliability={store.stockReliability} />
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessBadge checkedAt={listing.checkedAt} />
          <span className="text-sm text-muted-foreground">{nyDate(listing.checkedAt)}</span>
        </div>
        {status === 'failed' && (
          <p role="alert" className="rounded-lg border border-amber-500 bg-amber-100 p-3 text-base font-medium text-amber-900">
            {ko.card.recheckFailed}
          </p>
        )}
        {status === 'gone' && (
          <p role="alert" className="rounded-lg border border-amber-500 bg-amber-100 p-3 text-base font-medium text-amber-900">
            {ko.card.gone}
          </p>
        )}
      </section>

      {store.stockReliability === 'low' && (
        <p role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-100 p-4 text-lg font-semibold text-amber-900">
          {ko.card.lowReliability}
        </p>
      )}

      <RecheckButton id={listing.id} />

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-2xl font-semibold">{store.name}</h2>
        <p className="text-lg">{store.address}</p>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={mapsUrl(store.address)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'default', className: 'h-14 text-lg' })}
          >
            {ko.card.directions}
          </a>
          <a href={telHref(store.phone)} className={buttonVariants({ variant: 'outline', className: 'h-14 text-lg' })}>
            {ko.card.call}
          </a>
        </div>
        {storeUrl && (
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="text-base text-primary underline underline-offset-4">
            {ko.card.storePage}
          </a>
        )}
        <p className="text-base text-muted-foreground">{ko.card.note}</p>
      </section>

      <ClerkMode title={listing.title} imageUrl={image} detail={detail} />

      <div>
        <CopyLinkButton path={`/card/${listing.id}`} />
      </div>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-lg font-semibold">{ko.card.history}</summary>
        {history.length === 0 ? (
          <p className="mt-2 text-base text-muted-foreground">{ko.card.noHistory}</p>
        ) : (
          <ul className="mt-2 divide-y">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-base tabular-nums">
                <span>{nyDate(h.recordedAt)}</span>
                <span className="font-medium">{formatUsd(h.priceCents)}</span>
                <span className="text-muted-foreground">{h.available ? ko.stock.inStock : ko.stock.soldOut}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </main>
  );
}
