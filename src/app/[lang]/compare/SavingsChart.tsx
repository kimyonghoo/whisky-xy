import { ChevronRight, ExternalLink } from 'lucide-react';
import type { KrRankRow } from '@/lib/krcompare';
import { dailyshotUrl } from '@/lib/dailyshot/client';
import { KR_STALE_AFTER_MS, barPct, formatKrw } from '@/lib/kr-view';
import { searchHref } from '@/lib/search-view';
import { formatUsd } from '@/lib/money';
import { freshness } from '@/lib/freshness';
import type { Dict } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { BottleImage } from '@/components/BottleImage';
import { SpecChips } from '@/components/BottleHeader';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { PriceCompareChip, VERDICT_STYLE } from '@/components/PriceCompareChip';
import { diffLabel } from '@/components/KrCompareChip';
import { RankMarker } from '@/components/StoreLine';
import { CityChip } from '@/components/CityChip';
import { StatusBadge } from '@/components/StatusBadge';
import { LocaleLink } from '@/components/LocaleLink';

/**
 * Savings ranking: one row per bottle, two horizontal bars (Korea lowest vs US tax-included in KRW)
 * on ONE zero-based KRW scale shared by every row, with direct value labels. Hand-built HTML,
 * no chart library. Bars are decorative (aria-hidden); each row carries a full sr-only sentence.
 */
export function SavingsChart({ rows, now, d }: { rows: KrRankRow[]; now: Date; d: Dict }) {
  const max = Math.max(0, ...rows.flatMap((r) => [r.link.lowPriceKrw, r.compare.usKrw]));
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <SavingsRow key={r.bottleKey} row={r} rank={i + 1} max={max} now={now} d={d} />
      ))}
    </ol>
  );
}

function SavingsRow({ row, rank, max, now, d }: { row: KrRankRow; rank: number; max: number; now: Date; d: Dict }) {
  const { compare, link, best } = row;
  const v = VERDICT_STYLE[compare.verdict];
  const kr = formatKrw(link.lowPriceKrw);
  const us = formatKrw(compare.usKrw);
  const diff = diffLabel(compare, d);
  // M6: a low-reliability store's stock flag can't be trusted; say so next to the price base.
  const lowReliability = best.store.stockReliability === 'low';
  const store = `${best.store.name} · ${d.city[best.store.city]}${lowReliability ? ` · ${d.stock.unreliable}` : ''}`;
  const titleId = `cmp-${rank}-t`;
  const usStale = freshness(best.checkedAt, now, undefined, d).stale;
  return (
    <li
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-3.5 rounded-2xl border bg-card p-4 shadow-card sm:p-5', rank === 1 && 'border-primary/25 bg-primary-soft/45')}
    >
      <p className="sr-only">
        {d.ranking.srRow(rank, d.compare.verdict[compare.verdict], d.compare.krLowest(kr), d.compare.usApprox(us), store, diff)}
      </p>

      <div className="flex items-start gap-3">
        <RankMarker rank={rank} />
        <BottleImage src={row.imageUrl} alt="" className="size-14 sm:size-16" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 id={titleId} className="text-base leading-snug font-semibold tracking-tight sm:text-lg">
            <LocaleLink
              href={searchHref({ q: row.title })}
              aria-label={d.ranking.searchThis(row.title)}
              className="group inline-flex items-start gap-0.5 rounded-sm underline-offset-4 hover:underline"
              lang="en"
            >
              <span className="line-clamp-2">{row.title}</span>
              <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground sm:mt-1" />
            </LocaleLink>
          </h3>
          <SpecChips spec={row} />
          <p aria-hidden className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-muted-foreground">
            <span className="sr-only">{d.ranking.usStoreLabel}</span>
            <span lang="en" className="font-semibold text-foreground/85">
              {best.store.name}
            </span>
            <CityChip city={best.store.city} />
            {lowReliability && <StatusBadge kind="unreliable" size="sm" />}
            <span className="tabular">{d.row.taxIncluded(formatUsd(best.taxIncludedCents))}</span>
          </p>
        </div>
        <PriceCompareChip verdict={compare.verdict} size="md" className="hidden sm:inline-flex" d={d} />
      </div>

      <div aria-hidden className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <Bar label={d.ranking.rowKr} value={kr} pct={barPct(link.lowPriceKrw, max)} barClass="bg-kr-bar" />
        <Bar label={d.ranking.rowUs} value={us} pct={barPct(compare.usKrw, max)} barClass={v.bar} strong />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
        <PriceCompareChip verdict={compare.verdict} size="md" className="sm:hidden" d={d} />
        <span aria-hidden className={cn('text-base font-extrabold tracking-tight tabular sm:text-lg', v.ink)}>
          {diff}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {usStale && <FreshnessIndicator checkedAt={best.checkedAt} now={now} prefix={d.ranking.usStoreStale} />}
          <FreshnessIndicator checkedAt={link.checkedAt} now={now} staleAfterMs={KR_STALE_AFTER_MS} prefix={d.compare.dailyshot} />
          <a
            href={dailyshotUrl(link.dailyshotProductId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={d.compare.dailyshotLabel(link.nameKo)}
            className="inline-flex min-h-6 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
          >
            {d.compare.dailyshotLink}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </span>
      </div>
    </li>
  );
}

function Bar({ label, value, pct, barClass, strong = false }: { label: string; value: string; pct: number; barClass: string; strong?: boolean }) {
  return (
    <>
      <span className="w-7 text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex h-3.5 items-center">
        <span className={cn('block h-full rounded-r-full rounded-l-sm', barClass)} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn('text-right text-sm tabular', strong ? 'font-bold text-foreground' : 'font-medium text-foreground/80')}>{value}</span>
    </>
  );
}

/** Legend: Korea bar, US bar (verdict-coloured) and the five verdict tiers with their thresholds. */
export function SavingsLegend({ d }: { d: Dict }) {
  const tiers = ['must', 'big', 'good', 'small', 'worse'] as const;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-4 text-sm">
      <ul aria-label={d.ranking.legendLabel} className="flex flex-wrap gap-x-5 gap-y-1.5">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-6 rounded-r-full rounded-l-sm bg-kr-bar" />
          {d.ranking.legendKr}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="flex h-3 w-6 overflow-hidden rounded-r-full rounded-l-sm">
            <span className="flex-1 bg-verdict-must" />
            <span className="flex-1 bg-verdict-good" />
            <span className="flex-1 bg-verdict-worse" />
          </span>
          {d.ranking.legendUs}
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">{d.ranking.scaleNote}</p>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{d.ranking.tiersLabel}</p>
        <dl className="flex flex-wrap gap-x-3 gap-y-2">
          {tiers.map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <dt>
                <PriceCompareChip verdict={t} d={d} />
              </dt>
              <dd className="text-xs font-medium text-muted-foreground tabular">{d.ranking.tiers[t]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
