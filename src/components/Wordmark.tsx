import { ko } from '@/lib/i18n/ko';
import { cn } from '@/lib/utils';

/** Brand mark: a copper tile with a rocks glass holding a honey pour. Same art as app/icon.svg. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M11.4 17h9.2l-.7 6.1a1.2 1.2 0 0 1-1.2 1.1h-5.4a1.2 1.2 0 0 1-1.2-1.1z" fill="var(--honey)" />
      <path
        d="M9.5 8.5h13l-1.7 15.1a2.4 2.4 0 0 1-2.4 2.1h-4.8a2.4 2.4 0 0 1-2.4-2.1z"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="text-[0.9375rem] font-extrabold tracking-tight sm:text-base">{ko.site.title}</span>
        {!compact && (
          <span className="mt-1 hidden text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground sm:block">
            {ko.site.wordmarkSub}
          </span>
        )}
      </span>
    </span>
  );
}
