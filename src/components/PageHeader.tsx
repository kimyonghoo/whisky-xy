import { cn } from '@/lib/utils';

/** Top-of-page title block for list/tool screens (watchlist, map, comparison). */
export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-2', className)}>
      {eyebrow && <p className="text-sm font-semibold tracking-wide text-primary">{eyebrow}</p>}
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
      {lead && <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">{lead}</p>}
      {children}
    </header>
  );
}
