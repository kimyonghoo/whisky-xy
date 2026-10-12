import { BottleImage } from '@/components/BottleImage';
import { SpecChips, type BottleSpec } from '@/components/SpecChips';

/**
 * Bottle identity: photo + title + spec chips.
 * `title` is the displayed name (`displayBottleName().primary`): the store's English name, or on /ko
 * its Korean reading. `original` is then the store's English name, kept as a smaller line under the
 * title so it can be matched on the shelf and on the store's site.
 * "hero" is the buy-card header (photo first, big title); "compact" is for lists.
 */
export function BottleHeader({
  title,
  original = null,
  subtitle,
  imageUrl,
  spec,
  variant = 'compact',
  headingLevel = 'h3',
  children,
}: {
  title: string;
  original?: string | null;
  subtitle?: string | null;
  imageUrl: string | null;
  spec: BottleSpec;
  variant?: 'compact' | 'hero';
  headingLevel?: 'h1' | 'h2' | 'h3';
  children?: React.ReactNode;
}) {
  const H = headingLevel;
  // Without an original the title is the English store name itself.
  const titleLang = original ? undefined : 'en';
  if (variant === 'hero') {
    return (
      <header className="flex flex-col gap-4">
        <BottleImage src={imageUrl} alt={title} eager className="aspect-[4/3] max-h-80 w-full rounded-lg" />
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <H lang={titleLang} className="font-serif text-[1.75rem] leading-[1.2] font-medium text-balance sm:text-4xl">
              {title}
            </H>
            {original && (
              <p lang="en" className="text-base leading-snug text-muted-foreground">
                {original}
              </p>
            )}
          </div>
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
        <div className="flex min-w-0 flex-col gap-0.5">
          <H lang={titleLang} className="line-clamp-2 text-base leading-snug font-semibold tracking-tight sm:text-lg">
            {title}
            {subtitle && <span className="font-medium text-muted-foreground"> · {subtitle}</span>}
          </H>
          {original && (
            <p lang="en" className="line-clamp-2 text-xs leading-snug text-muted-foreground sm:text-sm">
              {original}
            </p>
          )}
        </div>
        <SpecChips spec={{ sizeMl: spec.sizeMl, proof: spec.proof, batch: spec.batch }} />
        {children}
      </div>
    </div>
  );
}
