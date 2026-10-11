import { CircleSlash, ExternalLink, Link2 } from 'lucide-react';
import type { BottleGroup } from '@/lib/search';
import { dailyshotUrl } from '@/lib/dailyshot/client';
import { KR_STALE_AFTER_MS, formatKrw, fxDateLabel, isFxStale, linkKrHref } from '@/lib/kr-view';
import { ko } from '@/lib/i18n/ko';
import type { Dict } from '@/lib/i18n';
import { krCheaperRatio, type KrComparison } from '@/lib/compare';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { FreshnessIndicator } from '@/components/FreshnessIndicator';
import { PriceCompareChip, VERDICT_STYLE } from '@/components/PriceCompareChip';
import { StatusBadge } from '@/components/StatusBadge';
import { LocaleLink } from '@/components/LocaleLink';

type Kr = NonNullable<BottleGroup['kr']>;

/**
 * "386,179원(60%) 절약" / "한국이 50,000원(8%) 더 저렴" / "한국이 2.7배 저렴 · 1,066,000원 차이" / "가격 동일".
 * The sign decides the wording; a loss is measured against the US price (never > 100 %).
 */
export function diffLabel(c: Pick<KrComparison, 'diffKrw' | 'savingsPct' | 'krCheaperPct' | 'usKrw'>, d: Dict = ko): string {
  if (c.diffKrw > 0) return d.compare.gain(formatKrw(c.diffKrw, d), d.compare.pct(c.savingsPct));
  if (c.diffKrw < 0) {
    const pct = c.krCheaperPct ?? 0;
    if (pct >= 50) return d.compare.krCheaperTimes(krCheaperRatio(c), formatKrw(-c.diffKrw, d));
    return d.compare.krCheaper(formatKrw(-c.diffKrw, d), d.compare.pct(pct));
  }
  return d.compare.same;
}

/**
 * Korea comparison band inside a search-result group header (design-system §8.9).
 * Uses the US-wide lowest in-stock price, naming its city (computed in `searchListings`).
 * Admins also get the link/relink action; everyone else sees nothing for unlinked bottles.
 */
export function KrCompareChip({
  kr,
  bottleKey,
  displayTitle,
  admin,
  now,
  q,
  d,
}: {
  d: Dict;
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
        <LocaleLink
          href={href}
          aria-label={d.compare.linkLabel(displayTitle)}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'border-dashed' })}
        >
          <Link2 aria-hidden />
          {d.compare.link}
        </LocaleLink>
      </div>
    );
  }

  const { compare } = kr;
  const v = compare ? VERDICT_STYLE[compare.verdict] : null;
  return (
    <section aria-label={d.compare.heading} className="px-4 pb-4 sm:px-5">
      <div className={cn('flex flex-col gap-2.5 rounded-xl border p-3 sm:p-3.5', v ? v.band : 'border-border bg-muted/60')}>
        {compare ? <Verdict kr={kr} compare={compare} d={d} /> : <Unavailable kr={kr} d={d} />}
        <Meta kr={kr} now={now} d={d}>
          {admin && (
            <LocaleLink
              href={href}
              aria-label={d.compare.relinkLabel(displayTitle)}
              className={buttonVariants({ variant: 'outline', size: 'xs', className: 'ml-auto' })}
            >
              <Link2 aria-hidden />
              {d.compare.relink}
            </LocaleLink>
          )}
        </Meta>
      </div>
    </section>
  );
}

function Verdict({ kr, compare, d }: { kr: Kr; compare: NonNullable<Kr['compare']>; d: Dict }) {
  const v = VERDICT_STYLE[compare.verdict];
  const kLine = d.compare.krLowest(formatKrw(kr.link.lowPriceKrw, d));
  const uLine = d.compare.usApprox(formatKrw(compare.usKrw, d));
  const base = kr.baseCity ? d.compare.usBase(d.city[kr.baseCity]) : null;
  const diff = diffLabel(compare, d);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="sr-only">{d.compare.srSummary(d.compare.verdict[compare.verdict], kLine, base ? `${uLine}, ${base}` : uLine, diff)}</p>
      <div aria-hidden className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <PriceCompareChip verdict={compare.verdict} size="md" d={d} />
        <span className={cn('text-lg leading-tight font-extrabold tracking-tight tabular sm:text-xl', v.ink)}>{diff}</span>
      </div>
      <p aria-hidden className="text-sm font-medium text-foreground/85 tabular">
        {kLine} <span className="text-muted-foreground">·</span> {uLine}
        {base && <span className="text-muted-foreground"> ({base})</span>}
      </p>
    </div>
  );
}

function Unavailable({ kr, d }: { kr: Kr; d: Dict }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground/85">
        <CircleSlash aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {kr.fx ? d.compare.noStock : d.compare.noFx}
      </p>
      <p className="text-sm text-muted-foreground tabular">
        {d.compare.krLowest(formatKrw(kr.link.lowPriceKrw, d))}
        {!kr.fx && <span className="sr-only">. {d.compare.noFxHint}</span>}
      </p>
    </div>
  );
}

function Meta({ kr, now, d, children }: { kr: Kr; now: Date; d: Dict; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-foreground/10 pt-2.5 text-xs">
      <a
        href={dailyshotUrl(kr.link.dailyshotProductId)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={d.compare.dailyshotLabel(kr.link.nameKo)}
        className="inline-flex min-h-6 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
      >
        {d.compare.dailyshotLink}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      <FreshnessIndicator checkedAt={kr.link.checkedAt} now={now} staleAfterMs={KR_STALE_AFTER_MS} prefix={d.compare.dailyshot} />
      {kr.fx &&
        (isFxStale(kr.fx.date, now) ? (
          <StatusBadge kind="stale" label={d.compare.fxStale(fxDateLabel(kr.fx.date))} />
        ) : (
          <span className="font-medium text-muted-foreground tabular">
            {d.compare.fxUsed(formatRate(kr.fx.usdKrw), fxDateLabel(kr.fx.date))}
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
