import { ChevronDown } from 'lucide-react';
import type { BottleGroup } from '@/lib/search';
import { ROWS_PER_GROUP, summarizeGroup } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import { approxKrw, formatKrw, fxDateLabel } from '@/lib/kr-view';
import type { FxRate } from '@/lib/db/schema';
import { ko } from '@/lib/i18n/ko';
import { Card } from '@/components/ui/card';
import { BottleHeader } from '@/components/BottleHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { CityChip, StoreLine } from '@/components/StoreLine';
import { KrCompareChip } from '@/components/KrCompareChip';

/**
 * One bottle in search results: identity + best in-stock price + Korea comparison + ranked store list.
 * `admin` adds the "한국 가격 연결" action; `now` keeps relative times consistent within a render.
 */
export function BottleResult({
  group,
  q,
  admin = false,
  now,
  fx = null,
}: {
  group: BottleGroup;
  q: string;
  admin?: boolean;
  now: Date;
  /** Latest USD→KRW rate; when present the lowest price also shows a rounded 원화 amount. */
  fx?: FxRate | null;
}) {
  const s = summarizeGroup(group);
  const krw = s.cheapest && fx ? formatKrw(approxKrw(s.cheapest.taxIncludedCents, fx.usdKrw)) : null;
  const ranks = new Map<number, number>();
  let n = 0;
  // Rank only confirmed in-stock offers; "재고 확인 필요" and sold-out rows get a dash.
  for (const r of group.rows) if (r.stock === 'instock') ranks.set(r.id, ++n);
  const head = group.rows.slice(0, ROWS_PER_GROUP);
  const rest = group.rows.slice(ROWS_PER_GROUP);
  const line = (r: (typeof group.rows)[number]) => (
    <StoreLine key={r.id} row={r} rank={ranks.get(r.id) ?? null} bottleKey={group.bottleKey} q={q} now={now} />
  );

  return (
    <Card as="article">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <BottleHeader title={group.displayTitle} subtitle={group.displayVariant} imageUrl={group.imageUrl} spec={group}>
          <div className="flex flex-wrap items-center gap-1.5">
            {s.regions.map((r) => (
              <CityChip key={r} city={r} />
            ))}
            <span className="text-xs font-medium text-muted-foreground tabular">{ko.group.stores(s.inStockCount, s.storeCount)}</span>
          </div>
        </BottleHeader>
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/70 px-3.5 py-2.5 sm:min-w-40 sm:flex-col sm:items-end sm:bg-transparent sm:p-0 sm:text-right">
          {s.cheapest ? (
            <>
              <span className="text-sm font-semibold text-primary">
                {ko.group.lowest} <span className="font-medium text-muted-foreground">· {ko.group.lowestHint}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="text-2xl leading-none font-bold tracking-tight tabular sm:text-[1.75rem]">
                  {formatUsd(s.cheapest.taxIncludedCents)}
                </span>
                {krw && fx && (
                  <span className="text-sm font-medium text-muted-foreground tabular" title={ko.group.krwApproxLabel(krw, fxDateLabel(fx.date))}>
                    <span aria-hidden>{ko.group.krwApprox(krw)}</span>
                    <span className="sr-only">{ko.group.krwApproxLabel(krw, fxDateLabel(fx.date))}</span>
                  </span>
                )}
              </span>
            </>
          ) : s.unverifiedCount > 0 ? (
            <StatusBadge kind="unverified" size="md" label={ko.group.noConfirmedStock} />
          ) : (
            <StatusBadge kind="soldout" size="md" label={ko.group.allSoldOut} />
          )}
        </div>
      </div>
      <KrCompareChip q={q} kr={group.kr} bottleKey={group.bottleKey} displayTitle={group.displayTitle} admin={admin} now={now} />
      <ol className="divide-y border-t" aria-label={group.displayTitle}>
        {head.map(line)}
      </ol>
      {rest.length > 0 && (
        <details className="group/more border-t">
          <summary className="flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:bg-muted/60">
            {ko.group.moreStores(rest.length)}
            <ChevronDown aria-hidden className="size-4 transition-transform group-open/more:rotate-180" />
          </summary>
          <ol className="divide-y border-t" start={head.length + 1}>
            {rest.map(line)}
          </ol>
        </details>
      )}
    </Card>
  );
}
