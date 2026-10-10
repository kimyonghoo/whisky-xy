import { StatusBadge } from '@/components/StatusBadge';
import type { StockState } from '@/lib/freshness';

/** Stock status plus the low-reliability flag for stores whose stock data can't be trusted. */
export function StockBadge({
  stock,
  reliability,
  size = 'sm',
}: {
  stock: StockState;
  reliability: 'high' | 'low';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind={stock} size={size} />
      {reliability === 'low' && <StatusBadge kind="unreliable" size={size} />}
    </span>
  );
}
