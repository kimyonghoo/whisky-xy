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
        'flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center sm:py-14',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-md border border-border-strong text-primary">
        <Icon aria-hidden className="size-6" strokeWidth={1.5} />
      </span>
      <Heading className="mt-1 font-serif text-xl font-medium text-balance">{title}</Heading>
      {description && <div className="max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
