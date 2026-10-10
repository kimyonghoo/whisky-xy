import Link from 'next/link';
import { ChevronRight, Map as MapIcon, Star } from 'lucide-react';
import type { ListingRow } from '@/lib/search';
import { REGION_LABEL, type Region } from '@/lib/stores';
import { ko } from '@/lib/i18n/ko';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { StockBadge } from '@/components/StockBadge';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { PriceBlock } from '@/components/PriceBlock';
import { CopyLinkButton } from '@/components/CopyLinkButton';

export function RegionChip({ region, className }: { region: Region; className?: string }) {
  return (
    <Badge variant="secondary" size="sm" className={cn('font-medium text-muted-foreground', className)}>
      {REGION_LABEL[region]}
    </Badge>
  );
}

/** Rank marker for ranked lists: 1 is filled copper, others outlined, unranked a dash. */
export function RankMarker({ rank }: { rank: number | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular',
        rank === 1 && 'bg-primary text-primary-foreground',
        rank !== null && rank > 1 && 'border border-border-strong text-foreground/80',
        rank === null && 'text-muted-foreground',
      )}
    >
      {rank ?? '–'}
    </span>
  );
}

/**
 * One store's offer for a bottle, as a row in a ranked list.
 * The main area opens the buy card; secondary actions sit beside it.
 * Card links never prefetch: rendering a card triggers a live store check.
 */
export function StoreLine({ row, rank, bottleKey, q }: { row: ListingRow; rank: number | null; bottleKey: string; q: string }) {
  const watchHref = `/watchlist?q=${encodeURIComponent(q || row.title)}`;
  const mapHref = `/map?bottle=${encodeURIComponent(bottleKey)}`;
  const best = rank === 1;
  return (
    <li className={cn('flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5', best && 'bg-primary-soft/45')}>
      <Link
        href={`/card/${row.id}`}
        prefetch={false}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <RankMarker rank={rank} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold underline-offset-4 group-hover:underline">{row.store.name}</span>
            <RegionChip region={row.store.region} />
            {row.store.onlineOnly && (
              <Badge variant="outline" size="sm">
                {ko.row.onlineOnly}
              </Badge>
            )}
            {best && <span className="sr-only">{ko.row.rankBest}</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StockBadge available={row.available} reliability={row.store.stockReliability} />
            <FreshnessIndicator checkedAt={row.checkedAt} />
          </span>
        </span>
        <PriceBlock
          priceCents={row.priceCents}
          taxIncludedCents={row.taxIncludedCents}
          emphasis="tax"
          size="sm"
          caption={null}
          align="end"
          dimmed={!row.available}
        />
        <ChevronRight aria-hidden className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
      </Link>
      <div className="flex flex-wrap gap-1.5 pl-10 sm:pl-0">
        <CopyLinkButton path={`/card/${row.id}`} />
        <Link href={watchHref} prefetch={false} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <Star aria-hidden />
          {ko.row.watch}
        </Link>
        <Link href={mapHref} prefetch={false} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <MapIcon aria-hidden />
          {ko.row.map}
        </Link>
      </div>
    </li>
  );
}
