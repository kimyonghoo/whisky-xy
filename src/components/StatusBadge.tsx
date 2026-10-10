import { BadgeCheck, CircleCheck, CircleHelp, CircleX, Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ko } from '@/lib/i18n/ko';

export type StatusKind = 'instock' | 'unverified' | 'soldout' | 'unreliable' | 'stale' | 'live';

const CONFIG = {
  instock: { variant: 'instock', Icon: CircleCheck, label: ko.stock.inStock },
  unverified: { variant: 'stale', Icon: CircleHelp, label: ko.stock.unverified },
  soldout: { variant: 'soldout', Icon: CircleX, label: ko.stock.soldOut },
  unreliable: { variant: 'caution', Icon: TriangleAlert, label: ko.stock.unreliable },
  stale: { variant: 'stale', Icon: Clock, label: ko.stale.warning },
  live: { variant: 'info', Icon: BadgeCheck, label: ko.freshness.justNow },
} as const;

/** One status = one color + one icon + one word. Never color alone. */
export function StatusBadge({
  kind,
  size = 'sm',
  label,
  className,
}: {
  kind: StatusKind;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  const { variant, Icon, label: fallback } = CONFIG[kind];
  return (
    <Badge variant={variant} size={size} className={className}>
      <Icon aria-hidden />
      {label ?? fallback}
    </Badge>
  );
}
