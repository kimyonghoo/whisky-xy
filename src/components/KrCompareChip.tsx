import Link from 'next/link';
import { CircleSlash, ExternalLink, Link2 } from 'lucide-react';
import type { BottleGroup } from '@/lib/search';
import { dailyshotUrl } from '@/lib/dailyshot/client';
import { KR_STALE_AFTER_MS, formatKrw, fxDateLabel, isFxStale, linkKrHref } from '@/lib/kr-view';
import { ko } from '@/lib/i18n/ko';
import { krCheaperRatio, type KrComparison } from '@/lib/compare';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { PriceCompareChip, VERDICT_STYLE } from '@/components/PriceCompareChip';
import { StatusBadge } from '@/components/StatusBadge';

type Kr = NonNullable<BottleGroup['kr']>;

/**
 * "386,179원(60%) 이득" / "한국이 50,000원(8%) 더 싸요" / "한국이 2.7배 싸요 · 1,066,000원 차이" / "가격이 같아요".
 * The sign decides the wording; a loss is measured against the US price (never > 100 %).
 */
export function diffLabel(c: Pick<KrComparison, 'diffKrw' | 'savingsPct' | 'krCheaperPct' | 'usKrw'>): string {
  if (c.diffKrw > 0) return ko.compare.gain(formatKrw(c.diffKrw), ko.compare.pct(c.savingsPct));
  if (c.diffKrw < 0) {
    const pct = c.krCheaperPct ?? 0;
    if (pct >= 50) return ko.compare.krCheaperTimes(krCheaperRatio(c), formatKrw(-c.diffKrw));
    return ko.compare.krCheaper(formatKrw(-c.diffKrw), ko.compare.pct(pct));
  }
  return ko.compare.same;
}

/**
 * Korea comparison band inside a search-result group header (design-system §8.9).
 * Uses its own section's best in-stock price (computed in `searchListings`).
 * Admins also get the link/relink action; everyone else sees nothing for unlinked bottles.
 */
export function KrCompareChip({
  kr,
  bottleKey,
  displayTitle,
  admin,
  now,
  q,
}: {
  q: string;
  kr: BottleGroup['kr'];
  bottleKey: string;
  displayTitle: string;
  admin: boolean;
  now: Date;
}) {
  const href = linkKrHref(bottleKey, displayTitle, q);
  if (!kr) {
    if (!admin) return null;
    return (
      <div className="px-4 pb-4 sm:px-5">
        <Link
          href={href}
          aria-label={ko.compare.linkLabel(displayTitle)}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'border-dashed' })}
        >
          <Link2 aria-hidden />
          {ko.compare.link}
        </Link>
      </div>
    );
  }

  const { compare } = kr;
  const v = compare ? VERDICT_STYLE[compare.verdict] : null;
  return (
    <section aria-label={ko.compare.heading} className="px-4 pb-4 sm:px-5">
      <div className={cn('flex flex-col gap-2.5 rounded-xl border p-3 sm:p-3.5', v ? v.band : 'border-border bg-muted/60')}>
        {compare ? <Verdict kr={kr} compare={compare} /> : <Unavailable kr={kr} />}
        <Meta kr={kr} now={now}>
          {admin && (
            <Link
              href={href}
              aria-label={ko.compare.relinkLabel(displayTitle)}
              className={buttonVariants({ variant: 'outline', size: 'xs', className: 'ml-auto' })}
            >
              <Link2 aria-hidden />
              {ko.compare.relink}
            </Link>
          )}
        </Meta>
      </div>
    </section>
  );
}

function Verdict({ kr, compare }: { kr: Kr; compare: NonNullable<Kr['compare']> }) {
  const v = VERDICT_STYLE[compare.verdict];
  const kLine = ko.compare.krLowest(formatKrw(kr.link.lowPriceKrw));
  const uLine = ko.compare.usApprox(formatKrw(compare.usKrw));
  const diff = diffLabel(compare);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="sr-only">{ko.compare.srSummary(ko.compare.verdict[compare.verdict], kLine, uLine, diff)}</p>
      <div aria-hidden className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <PriceCompareChip verdict={compare.verdict} size="md" />
        <span className={cn('text-lg leading-tight font-extrabold tracking-tight tabular sm:text-xl', v.ink)}>{diff}</span>
      </div>
      <p aria-hidden className="text-sm font-medium text-foreground/85 tabular">
        {kLine} <span className="text-muted-foreground">·</span> {uLine}
      </p>
    </div>
  );
}

function Unavailable({ kr }: { kr: Kr }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground/85">
        <CircleSlash aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {kr.fx ? ko.compare.noStock : ko.compare.noFx}
      </p>
      <p className="text-sm text-muted-foreground tabular">
        {ko.compare.krLowest(formatKrw(kr.link.lowPriceKrw))}
        {!kr.fx && <span className="sr-only">. {ko.compare.noFxHint}</span>}
      </p>
    </div>
  );
}

function Meta({ kr, now, children }: { kr: Kr; now: Date; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-foreground/10 pt-2.5 text-xs">
      <a
        href={dailyshotUrl(kr.link.dailyshotProductId)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ko.compare.dailyshotLabel(kr.link.nameKo)}
        className="inline-flex min-h-6 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
      >
        {ko.compare.dailyshotLink}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      <FreshnessIndicator checkedAt={kr.link.checkedAt} now={now} staleAfterMs={KR_STALE_AFTER_MS} prefix={ko.compare.dailyshot} />
      {kr.fx &&
        (isFxStale(kr.fx.date, now) ? (
          <StatusBadge kind="stale" label={ko.compare.fxStale(fxDateLabel(kr.fx.date))} />
        ) : (
          <span className="font-medium text-muted-foreground tabular">
            {ko.compare.fxUsed(formatRate(kr.fx.usdKrw), fxDateLabel(kr.fx.date))}
          </span>
        ))}
      {children}
    </div>
  );
}

/** 1380.25 → "1,380" (display only; the comparison uses the exact rate). */
export function formatRate(usdKrw: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(usdKrw);
}
