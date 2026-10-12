import { ChevronRight, Map as MapIcon, Star } from 'lucide-react';
import type { ListingRow } from '@/lib/search';
import type { Dict } from '@/lib/i18n';
import type { CityId } from '@/lib/geo';
import { bottleMapHref, watchPrefillHref } from '@/lib/search-view';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { StockBadge } from '@/components/StockBadge';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { PriceBlock } from '@/components/PriceBlock';
import { CopyLinkButton } from '@/components/CopyLinkButton';
import { CityChip } from '@/components/CityChip';
import { LocaleLink } from '@/components/LocaleLink';

/** Rank marker for ranked lists: 1 is a gold ring, others a hairline ring, unranked a dash. */
export function RankMarker({ rank }: { rank: number | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular',
        rank === 1 && 'border border-primary text-primary',
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
export function StoreLine({
  row,
  rank,
  bottleKey,
  q,
  city,
  now,
  d,
}: {
  row: ListingRow;
  rank: number | null;
  bottleKey: string;
  q: string;
  /** The page's city: the map and watch links keep it so they open where the visitor is looking. */
  city: CityId;
  now: Date;
  d: Dict;
}) {
  const watchHref = watchPrefillHref(q || row.title, city);
  const mapHref = bottleMapHref(bottleKey, city);
  const best = rank === 1;
  return (
    <li className={cn('flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5', best && 'relative before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary')}>
      <LocaleLink
        href={`/card/${row.id}`}
        prefetch={false}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <RankMarker rank={rank} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold underline-offset-4 group-hover:underline">{row.store.name}</span>
            <CityChip city={row.store.city} />
            {row.store.onlineOnly && (
              <Badge variant="outline" size="sm">
                {d.row.onlineOnly}
              </Badge>
            )}
            {best && <span className="sr-only">{d.row.rankBest}</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StockBadge stock={row.stock} reliability={row.store.stockReliability} />
            <FreshnessIndicator checkedAt={row.checkedAt} now={now} />
          </span>
        </span>
        <PriceBlock
          priceCents={row.priceCents}
          taxIncludedCents={row.taxIncludedCents}
          emphasis="tax"
          size="sm"
          caption={d.row.taxIncludedCaption}
          align="end"
          dimmed={row.stock !== 'instock'}
        />
        <ChevronRight aria-hidden className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
      </LocaleLink>
      <div className="flex flex-wrap gap-1.5 pl-10 sm:pl-0">
        <CopyLinkButton path={`/card/${row.id}`} />
        <LocaleLink href={watchHref} prefetch={false} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <Star aria-hidden />
          {d.row.watch}
        </LocaleLink>
        <LocaleLink href={mapHref} prefetch={false} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <MapIcon aria-hidden />
          {d.row.map}
        </LocaleLink>
      </div>
    </li>
  );
}
