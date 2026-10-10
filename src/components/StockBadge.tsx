import { ko } from '@/lib/i18n/ko';
import { Badge } from '@/components/ui/badge';

export function StockBadge({ available, reliability }: { available: boolean; reliability: 'high' | 'low' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {available ? (
        <Badge className="bg-emerald-600 text-white">{ko.stock.inStock}</Badge>
      ) : (
        <Badge variant="secondary">{ko.stock.soldOut}</Badge>
      )}
      {reliability === 'low' && (
        <Badge variant="outline" className="border-amber-500 text-amber-800 dark:text-amber-300">
          {ko.stock.unreliable}
        </Badge>
      )}
    </span>
  );
}
