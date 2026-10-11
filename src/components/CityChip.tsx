'use client';

import type { CityId } from '@/lib/geo';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function CityChip({ city, className }: { city: CityId; className?: string }) {
  const d = useDict();
  return (
    <Badge variant="secondary" size="sm" className={cn('font-sans font-medium text-muted-foreground', className)}>
      {d.city[city]}
    </Badge>
  );
}
