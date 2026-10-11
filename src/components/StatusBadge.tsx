'use client';

import { BadgeCheck, CircleCheck, CircleHelp, CircleX, Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useDict } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';

export type StatusKind = 'instock' | 'unverified' | 'soldout' | 'unreliable' | 'stale' | 'live';

const CONFIG = {
  instock: { variant: 'instock', Icon: CircleCheck, label: (d: Dict) => d.stock.inStock },
  unverified: { variant: 'stale', Icon: CircleHelp, label: (d: Dict) => d.stock.unverified },
  soldout: { variant: 'soldout', Icon: CircleX, label: (d: Dict) => d.stock.soldOut },
  unreliable: { variant: 'caution', Icon: TriangleAlert, label: (d: Dict) => d.stock.unreliable },
  stale: { variant: 'stale', Icon: Clock, label: (d: Dict) => d.stale.warning },
  live: { variant: 'info', Icon: BadgeCheck, label: (d: Dict) => d.freshness.justNow },
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
  const d = useDict();
  const { variant, Icon, label: fallback } = CONFIG[kind];
  return (
    <Badge variant={variant} size={size} className={className}>
      <Icon aria-hidden />
      {label ?? fallback(d)}
    </Badge>
  );
}
