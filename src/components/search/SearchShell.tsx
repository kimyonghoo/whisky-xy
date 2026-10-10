'use client';

import { createContext, useContext, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

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
  const navigate = (href: string) => startTransition(() => router.push(href));
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
