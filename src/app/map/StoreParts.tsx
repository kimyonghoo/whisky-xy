import Link from 'next/link';
import { ExternalLink, Navigation, Phone, Store as StoreIcon } from 'lucide-react';
import type { MapStore } from '@/lib/map-view';
import { ko } from '@/lib/i18n/ko';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { PriceBlock } from '@/components/PriceBlock';
import { RegionChip } from '@/components/StoreLine';

/**
 * Shared pieces of the store list rows and the map popups, so both always say the same thing.
 * Everything here renders through React (popups too): no HTML strings.
 */

/** The number shown on the marker and on the list row. Copper = carries; grey = doesn't. */
export function NumberDot({ store, className }: { store: MapStore; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular',
        store.dimmed ? 'border border-soldout-line bg-soldout-bg text-soldout-fg' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      {store.n}
    </span>
  );
}

/** Accessible one-line state, used for marker labels. */
export function storeStateText(store: MapStore): string {
  if (!store.offer) return store.inStockCount > 0 ? ko.map.inStockWhiskies(store.inStockCount) : ko.map.noWhiskies;
  if (store.offer.status === 'instock') return ko.map.offerInStock;
  if (store.offer.status === 'unverified') return ko.stock.unverified;
  return store.offer.status === 'soldout' ? ko.map.offerSoldOut : ko.map.offerNone;
}

/** Name-adjacent badges: region, online-only, unreliable stock flag. */
export function StoreBadges({ store }: { store: MapStore }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <RegionChip region={store.region} />
      {store.onlineOnly && (
        <Badge variant="outline" size="sm">
          {ko.row.onlineOnly}
        </Badge>
      )}
      {store.lowReliability && <StatusBadge kind="unreliable" />}
    </span>
  );
}

/** Stock line: whisky count (all bottles) or this bottle's status + cheapest price. */
export function OfferLine({ store, compact = false }: { store: MapStore; compact?: boolean }) {
  const o = store.offer;
  if (!o) {
    return (
      <p className={cn('flex items-center gap-1.5 text-sm font-medium tabular', store.inStockCount > 0 ? 'text-foreground' : 'text-muted-foreground')}>
        <StoreIcon aria-hidden className="size-4 text-muted-foreground" />
        {store.inStockCount > 0 ? ko.map.inStockWhiskies(store.inStockCount) : ko.map.noWhiskies}
      </p>
    );
  }
  if (o.status !== 'instock' || o.priceCents === null || o.taxIncludedCents === null) {
    if (o.status === 'unverified') return <StatusBadge kind="unverified" />;
    return <StatusBadge kind="soldout" label={o.status === 'soldout' ? ko.map.offerSoldOut : ko.map.offerNone} />;
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
      <StatusBadge kind="instock" label={ko.map.offerInStock} />
      <PriceBlock
        priceCents={o.priceCents}
        taxIncludedCents={o.taxIncludedCents}
        emphasis="tax"
        size="sm"
        caption={compact ? null : ko.row.taxIncludedCaption}
        align="end"
      />
    </div>
  );
}

/** 이 매장 위스키 보기 / 길찾기 / 전화. `primary` makes the store link the region's main action (popup). */
export function StoreActions({ store, primary = false, className }: { store: MapStore; primary?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      <Link
        href={store.storeHref}
        prefetch={false}
        className={buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm', className: primary ? 'w-full' : undefined })}
      >
        {ko.map.storeWhiskies}
      </Link>
      <a
        href={store.directionsHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ko.map.directionsLabel(store.name)}
        className={buttonVariants({ variant: primary ? 'outline' : 'ghost', size: 'sm', className: primary ? 'flex-1' : undefined })}
      >
        <Navigation aria-hidden />
        {ko.map.directions}
        <ExternalLink aria-hidden className="size-3.5 opacity-70" />
      </a>
      <a
        href={store.tel}
        aria-label={ko.map.callLabel(store.name, store.phone)}
        className={buttonVariants({ variant: primary ? 'outline' : 'ghost', size: 'sm', className: primary ? 'flex-1' : undefined })}
      >
        <Phone aria-hidden />
        {ko.map.call}
      </a>
    </div>
  );
}

/** Popup body (rendered by react-leaflet through a React portal). */
export function StorePopupContent({ store }: { store: MapStore }) {
  return (
    <div className="map-popup flex w-[15.5rem] max-w-full flex-col gap-2.5 font-sans text-foreground">
      <div className="flex flex-col gap-1">
        <p lang="en" className="pr-8 text-base leading-snug font-bold">
          {store.name}
        </p>
        <StoreBadges store={store} />
        <p lang="en" className="text-[0.8125rem] leading-snug text-muted-foreground">
          {store.address}
        </p>
      </div>
      <OfferLine store={store} compact />
      {store.offer && (
        <p className="text-[0.8125rem] text-muted-foreground tabular">
          {store.inStockCount > 0 ? ko.map.inStockWhiskies(store.inStockCount) : ko.map.noWhiskies}
        </p>
      )}
      {store.onlineOnly && <p className="text-[0.8125rem] leading-snug text-muted-foreground">{ko.card.onlineOnlyNote}</p>}
      {store.lowReliability && <p className="text-[0.8125rem] leading-snug text-caution-fg">{ko.card.lowReliabilityTitle}</p>}
      <StoreActions store={store} primary />
    </div>
  );
}
