import { Skeleton } from '@/components/ui/skeleton';
import type { Dict } from '@/lib/i18n';

export function CardSkeleton({ d }: { d: Dict }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
      <p role="status" className="sr-only">
        {d.loadingCard}
      </p>
      <Skeleton className="aspect-[4/3] max-h-80 w-full rounded-2xl" />
      <Skeleton className="h-9 w-11/12" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
    </main>
  );
}
