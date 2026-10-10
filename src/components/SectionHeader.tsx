import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Section heading: icon + title + optional count chip + one-line sub. */
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
          'flex items-center gap-2.5 font-bold tracking-tight',
          tone === 'primary' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl',
        )}
      >
        {Icon && (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-border text-foreground/70',
            )}
          >
            <Icon aria-hidden className="size-[1.125rem]" />
          </span>
        )}
        {title}
        {count && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-semibold text-muted-foreground tabular">{count}</span>
        )}
      </Heading>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
