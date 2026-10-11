'use client';

import { formatUsd } from '@/lib/money';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: { main: 'text-lg', sub: 'text-xs', cap: 'text-xs' },
  md: { main: 'text-2xl', sub: 'text-sm', cap: 'text-xs' },
  xl: { main: 'text-5xl sm:text-6xl', sub: 'text-lg', cap: 'text-sm' },
} as const;

/**
 * Price display pattern.
 * - emphasis "tax": tax-included is the big number (lists sorted by what you pay).
 * - emphasis "shelf": pre-tax is the big number (matches the tag on the shelf).
 * Both always show the other price as a secondary line, with an explicit label.
 */
export function PriceBlock({
  priceCents,
  taxIncludedCents,
  emphasis,
  size = 'md',
  dimmed = false,
  caption,
  align = 'start',
  className,
}: {
  priceCents: number;
  taxIncludedCents: number;
  emphasis: 'tax' | 'shelf';
  size?: keyof typeof SIZE;
  dimmed?: boolean;
  caption?: string | null;
  align?: 'start' | 'end';
  className?: string;
}) {
  const d = useDict();
  const s = SIZE[size];
  const main = emphasis === 'tax' ? taxIncludedCents : priceCents;
  const sub = emphasis === 'tax' ? d.row.preTax(formatUsd(priceCents)) : d.row.taxIncluded(formatUsd(taxIncludedCents));
  const cap = caption === undefined ? (emphasis === 'tax' ? d.group.lowestHint : null) : caption;
  return (
    <div className={cn('flex flex-col', align === 'end' ? 'items-end text-right' : 'items-start', className)}>
      {cap && <span className={cn('font-semibold tracking-tight text-muted-foreground', s.cap)}>{cap}</span>}
      <span
        className={cn(
          'font-bold leading-none tracking-tight tabular',
          s.main,
          size === 'xl' && 'mt-1',
          dimmed ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {formatUsd(main)}
      </span>
      <span className={cn('mt-1 text-muted-foreground tabular', s.sub)}>{sub}</span>
    </div>
  );
}
