import { ChevronDown, ChevronsDown, Minus, PartyPopper, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Verdict } from '@/lib/compare';
import type { Dict } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Verdict styling (docs/design-system.md §3a). Icon + word + colour, never colour alone. */
export const VERDICT_STYLE: Record<
  Verdict,
  { Icon: LucideIcon; badge: string; icon?: string; band: string; ink: string; bar: string }
> = {
  must: {
    Icon: PartyPopper,
    badge: 'border-transparent bg-verdict-must text-on-solid ring-2 ring-verdict-must-line',
    icon: 'text-verdict-must-glow',
    band: 'border-verdict-must-line bg-verdict-must-bg border-2',
    ink: 'text-verdict-must-ink',
    bar: 'bg-verdict-must',
  },
  big: {
    Icon: ChevronsDown,
    badge: 'border-transparent bg-verdict-big text-on-solid',
    band: 'border-verdict-big-line bg-verdict-big-bg',
    ink: 'text-verdict-big-ink',
    bar: 'bg-verdict-big',
  },
  good: {
    Icon: ChevronDown,
    badge: 'border-verdict-good-line bg-verdict-good-bg text-verdict-good-ink',
    band: 'border-verdict-good-line bg-verdict-good-bg',
    ink: 'text-verdict-good-ink',
    bar: 'bg-verdict-good',
  },
  small: {
    Icon: Minus,
    badge: 'border-verdict-small-line bg-verdict-small-bg text-verdict-small-ink',
    band: 'border-verdict-small-line bg-verdict-small-bg',
    ink: 'text-verdict-small-ink',
    bar: 'bg-verdict-small',
  },
  worse: {
    Icon: TrendingUp,
    badge: 'border-transparent bg-verdict-worse text-on-solid',
    band: 'border-verdict-worse-line bg-verdict-worse-bg',
    ink: 'text-verdict-worse-ink',
    bar: 'bg-verdict-worse',
  },
};

const SIZE = {
  sm: 'h-6 px-2 text-xs [&>svg]:size-3.5',
  md: 'h-7 px-2.5 text-[0.8125rem] [&>svg]:size-4',
  lg: 'h-8 px-3 text-sm [&>svg]:size-4',
} as const;

/**
 * Korea-vs-US verdict chip (five ordinal tiers from `compareKr`). Pure price comparison:
 * no duty/customs math, and never shown on the buy card.
 */
export function PriceCompareChip({
  verdict,
  size = 'sm',
  className,
  d,
}: {
  verdict: Verdict;
  size?: keyof typeof SIZE;
  className?: string;
  d: Dict;
}) {
  const v = VERDICT_STYLE[verdict];
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-sm border font-semibold whitespace-nowrap [&>svg]:shrink-0',
        SIZE[size],
        v.badge,
        className,
      )}
    >
      <v.Icon aria-hidden className={v.icon} />
      {d.compare.verdict[verdict]}
    </span>
  );
}
