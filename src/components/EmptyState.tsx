import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Empty / no-results / not-found / error pattern: icon, title, one-line reason, next action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  as: Heading = 'h2',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  as?: 'h1' | 'h2';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card/60 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon aria-hidden className="size-7" />
      </span>
      <Heading className="text-xl font-bold tracking-tight">{title}</Heading>
      {description && <div className="max-w-md text-base text-muted-foreground">{description}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
