import { Badge } from '@/components/ui/badge';
import { BottleImage } from '@/components/BottleImage';
import { cn } from '@/lib/utils';

export interface BottleSpec {
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
}

/** "750 ml", "101 proof", batch: the facts that tell near-identical bottles apart. */
export function SpecChips({ spec, size = 'sm', className }: { spec: BottleSpec; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const items = [
    spec.sizeMl != null ? `${spec.sizeMl} ml` : null,
    spec.proof != null ? `${spec.proof} proof` : null,
    spec.batch,
  ].filter((x): x is string => Boolean(x));
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((t) => (
        <Badge key={t} variant="spec" size={size} className="tabular">
          {t}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Bottle identity: photo + exact English title + spec chips.
 * "hero" is the buy-card header (photo first, big title); "compact" is for lists.
 */
export function BottleHeader({
  title,
  subtitle,
  imageUrl,
  spec,
  variant = 'compact',
  headingLevel = 'h3',
  children,
}: {
  title: string;
  subtitle?: string | null;
  imageUrl: string | null;
  spec: BottleSpec;
  variant?: 'compact' | 'hero';
  headingLevel?: 'h1' | 'h2' | 'h3';
  children?: React.ReactNode;
}) {
  const H = headingLevel;
  if (variant === 'hero') {
    return (
      <header className="flex flex-col gap-4">
        <BottleImage src={imageUrl} alt={title} eager className="aspect-[4/3] max-h-80 w-full rounded-2xl shadow-card" />
        <div className="flex flex-col gap-2.5">
          <H className="text-[1.75rem] leading-[1.2] font-bold tracking-tight text-balance sm:text-4xl">{title}</H>
          {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
          <SpecChips spec={spec} size="lg" />
          {children}
        </div>
      </header>
    );
  }
  return (
    <div className="flex min-w-0 gap-3.5 sm:gap-4">
      <BottleImage src={imageUrl} alt={title} className="size-[4.5rem] sm:size-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <H className="line-clamp-2 text-base leading-snug font-semibold tracking-tight sm:text-lg">{title}</H>
        <SpecChips spec={spec} />
        {children}
      </div>
    </div>
  );
}
