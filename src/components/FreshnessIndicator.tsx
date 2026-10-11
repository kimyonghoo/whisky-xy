'use client';

import { Clock } from 'lucide-react';
import { freshness } from '@/lib/freshness';
import { nyDate } from '@/lib/card';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * Data-freshness indicator. Fresh data is quiet (clock + relative time);
 * stale data (> 24h) always gets the stale badge.
 * A Client Component (for the locale), so pass `now` from the server render: a client-side default
 * clock could disagree with the server's and break hydration.
 */
export function FreshnessIndicator({
  checkedAt,
  now,
  showDate = false,
  size = 'sm',
  staleAfterMs,
  prefix,
  className,
}: {
  checkedAt: Date;
  now: Date;
  showDate?: boolean;
  size?: 'sm' | 'md';
  /** Defaults to 24 h (store data). Dailyshot prices use 7 days. */
  staleAfterMs?: number;
  /** Source name shown before the time, e.g. "데일리샷". */
  prefix?: string;
  className?: string;
}) {
  const d = useDict();
  const f = freshness(checkedAt, now, staleAfterMs, d);
  const label = prefix ? `${prefix} ${f.label}` : f.label;
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {f.stale ? (
        <StatusBadge kind="stale" size={size} label={`${d.stale.warning} · ${label}`} />
      ) : (
        <span className={cn('inline-flex items-center gap-1 font-medium text-muted-foreground', text)}>
          <Clock aria-hidden className={size === 'md' ? 'size-4' : 'size-3.5'} />
          <time dateTime={checkedAt.toISOString()}>{label}</time>
        </span>
      )}
      {showDate && <span className={cn('text-muted-foreground tabular', text)}>{d.freshness.nyTime(nyDate(checkedAt))}</span>}
    </span>
  );
}
