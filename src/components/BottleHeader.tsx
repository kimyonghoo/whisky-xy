import { BottleImage } from '@/components/BottleImage';
import { SpecChips, type BottleSpec } from '@/components/SpecChips';

export { SpecChips, type BottleSpec };

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
        <BottleImage src={imageUrl} alt={title} eager className="aspect-[4/3] max-h-80 w-full rounded-lg" />
        <div className="flex flex-col gap-2.5">
          <H lang="en" className="font-serif text-[1.75rem] leading-[1.2] font-medium text-balance sm:text-4xl">{title}</H>
          {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
          <SpecChips spec={{ sizeMl: spec.sizeMl, proof: spec.proof, batch: spec.batch }} size="lg" />
          {children}
        </div>
      </header>
    );
  }
  return (
    <div className="flex min-w-0 gap-3.5 sm:gap-4">
      <BottleImage src={imageUrl} alt={title} className="size-[4.5rem] sm:size-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <H className="line-clamp-2 text-base leading-snug font-semibold tracking-tight sm:text-lg">
          {title}
          {subtitle && <span className="font-medium text-muted-foreground"> · {subtitle}</span>}
        </H>
        <SpecChips spec={{ sizeMl: spec.sizeMl, proof: spec.proof, batch: spec.batch }} />
        {children}
      </div>
    </div>
  );
}
