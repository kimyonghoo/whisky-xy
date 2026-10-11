import { cn } from '@/lib/utils';

/** Top-of-page title block for list/tool screens (watchlist, map, comparison): gold eyebrow, serif title. */
export function PageHeader({
  eyebrow,
  title,
  titleLang,
  lead,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  /** e.g. "en" when the title is an English product name. */
  titleLang?: string;
  lead?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-2.5 border-b pb-6 sm:pb-8', className)}>
      {eyebrow && <p className="text-xs font-medium tracking-[0.06em] text-primary">{eyebrow}</p>}
      <h1 lang={titleLang} className="font-serif text-[1.75rem] leading-tight font-medium text-balance sm:text-4xl">
        {title}
      </h1>
      {lead && <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground sm:text-base">{lead}</p>}
      {children}
    </header>
  );
}
