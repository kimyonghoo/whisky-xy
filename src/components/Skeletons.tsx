import { Skeleton } from '@/components/ui/skeleton';
import { ko } from '@/lib/i18n/ko';

function ResultCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="flex gap-4 p-4 sm:p-5">
        <Skeleton className="size-[4.5rem] rounded-xl sm:size-24" />
        <div className="flex flex-1 flex-col gap-2.5">
          <Skeleton className="h-5 w-4/5" />
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="hidden h-12 w-28 sm:block" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 border-t px-4 py-4 sm:px-5">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-44 rounded-full" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <p role="status" className="sr-only">
        {ko.loading}
      </p>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-7 w-48" />
      <ResultCardSkeleton />
      <ResultCardSkeleton />
    </main>
  );
}

export function CardSkeleton() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
      <p role="status" className="sr-only">
        {ko.loadingCard}
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
