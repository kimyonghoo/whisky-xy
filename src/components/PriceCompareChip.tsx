import { Equal, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { compareTier } from '@/lib/search-view';
import { ko } from '@/lib/i18n/ko';

/**
 * KRW-vs-USD comparison chip (Task 15). Pure price comparison only:
 * no duty/customs math, and never shown on the buy card.
 * `savingsRatio` = (koreaKrw - usKrw) / koreaKrw.
 */
export function PriceCompareChip({ savingsRatio, size = 'sm' }: { savingsRatio: number; size?: 'sm' | 'md' }) {
  const tier = compareTier(savingsRatio);
  const pct = Math.round(Math.abs(savingsRatio) * 100);
  if (tier === 'savings-big') {
    return (
      <Badge variant="solid" size={size}>
        <TrendingDown aria-hidden />
        {ko.compare.cheaperInUs(pct)}
      </Badge>
    );
  }
  if (tier === 'savings-small') {
    return (
      <Badge variant="instock" size={size}>
        <TrendingDown aria-hidden />
        {ko.compare.cheaperInUs(pct)}
      </Badge>
    );
  }
  if (tier === 'same') {
    return (
      <Badge variant="soldout" size={size}>
        <Equal aria-hidden />
        {ko.compare.similar}
      </Badge>
    );
  }
  return (
    <Badge variant="danger" size={size}>
      <TrendingUp aria-hidden />
      {ko.compare.cheaperInKorea(pct)}
    </Badge>
  );
}
