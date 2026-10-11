'use client';

import { Badge } from '@/components/ui/badge';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export interface BottleSpec {
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
}

/** "750 ml", "101 proof", batch: the facts that tell near-identical bottles apart. */
export function SpecChips({ spec, size = 'sm', className }: { spec: BottleSpec; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const d = useDict();
  const items = [
    spec.sizeMl != null ? d.spec.size(spec.sizeMl) : null,
    spec.proof != null ? d.spec.proof(spec.proof) : null,
    spec.batch,
  ].filter((x): x is string => Boolean(x));
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((t) => (
        <Badge key={t} variant="spec" size={size} lang="en" className="tabular">
          {t}
        </Badge>
      ))}
    </div>
  );
}
