import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A small outlined count next to a heading ("12종", "3개"), shared so every list counts alike. */
export const countTagClass =
  'inline-flex items-center rounded-sm border border-border-strong px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground tabular';

/** Section heading: optional line icon + serif title + optional count + one-line sub. */
export function SectionHeader({
  id,
  icon: Icon,
  title,
  count,
  sub,
  tone = 'primary',
  as: Heading = 'h2',
  className,
}: {
  id?: string;
  icon?: LucideIcon;
  title: string;
  count?: string;
  sub?: string;
  tone?: 'primary' | 'secondary';
  as?: 'h2' | 'h3' | 'span';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Heading
        id={id}
        className={cn(
          'flex flex-wrap items-center gap-x-2.5 gap-y-1 font-serif font-medium',
          tone === 'primary' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl',
        )}
      >
        {Icon && <Icon aria-hidden className={cn('size-[1.125rem] shrink-0', tone === 'primary' ? 'text-primary' : 'text-muted-foreground')} />}
        {title}
        {count && <span className={countTagClass}>{count}</span>}
      </Heading>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
