'use client';

import { createContext, useContext, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { endPour, startPour } from '@/lib/pour';

type Ctx = { pending: boolean; navigate: (href: string) => void };

const SearchNav = createContext<Ctx | null>(null);

export function useSearchNav(): Ctx | null {
  return useContext(SearchNav);
}

/**
 * Holds the pending state of a search navigation so the form can show progress
 * and the previous results dim (instead of vanishing) until new ones arrive.
 */
export function SearchShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string) => {
    startPour();
    startTransition(() => router.push(href));
  };
  // Re-running the same search keeps the URL, so the pour ends with the transition, not the URL change.
  useEffect(() => {
    if (!pending) endPour();
  }, [pending]);
  return <SearchNav.Provider value={{ pending, navigate }}>{children}</SearchNav.Provider>;
}

export function ResultsRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  const pending = useSearchNav()?.pending ?? false;
  return (
    <div
      aria-busy={pending}
      className={cn('flex flex-col gap-8 transition-opacity duration-200', pending && 'pointer-events-none opacity-50', className)}
    >
      {children}
    </div>
  );
}
