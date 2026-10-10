import { freshness } from '@/lib/freshness';
import { ko } from '@/lib/i18n/ko';
import { Badge } from '@/components/ui/badge';

export function FreshnessBadge({ checkedAt, now = new Date() }: { checkedAt: Date; now?: Date }) {
  const f = freshness(checkedAt, now);
  if (f.stale) {
    return (
      <Badge
        variant="outline"
        className="h-auto border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        ⚠ {ko.stale.warning} · {f.label}
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">{f.label}</span>;
}
