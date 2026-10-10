import { StatusBadge } from '@/components/StatusBadge';

/** Stock status plus the low-reliability flag for stores whose stock data can't be trusted. */
export function StockBadge({
  available,
  reliability,
  size = 'sm',
}: {
  available: boolean;
  reliability: 'high' | 'low';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind={available ? 'instock' : 'soldout'} size={size} />
      {reliability === 'low' && <StatusBadge kind="unreliable" size={size} />}
    </span>
  );
}
