import Link from 'next/link';
import type { ListingRow as Row } from '@/lib/search';
import { REGION_LABEL } from '@/lib/stores';
import { formatUsd } from '@/lib/money';
import { ko } from '@/lib/i18n/ko';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { StockBadge } from '@/components/StockBadge';
import { FreshnessBadge } from '@/components/FreshnessBadge';
import { CopyLinkButton } from '@/components/CopyLinkButton';

export function ListingRowView({ row, bottleKey, q }: { row: Row; bottleKey: string; q: string }) {
  const watchHref = `/watchlist?q=${encodeURIComponent(q || row.title)}`;
  const mapHref = `/map?bottle=${encodeURIComponent(bottleKey)}`;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{row.store.name}</span>
          <span className="text-xs text-muted-foreground">{REGION_LABEL[row.store.region]}</span>
          {row.store.onlineOnly && <Badge variant="secondary">{ko.row.onlineOnly}</Badge>}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-lg font-semibold tabular-nums">{formatUsd(row.priceCents)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {ko.row.taxIncluded(formatUsd(row.taxIncludedCents))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StockBadge available={row.available} reliability={row.store.stockReliability} />
          <FreshnessBadge checkedAt={row.checkedAt} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyLinkButton path={`/card/${row.id}`} />
        <Link href={watchHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {ko.row.watch}
        </Link>
        <Link href={mapHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {ko.row.map}
        </Link>
      </div>
    </li>
  );
}
