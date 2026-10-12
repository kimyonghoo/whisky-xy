import { useId } from 'react';
import type { Dict } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Brand mark: a cut-crystal rocks glass (rim, diamond-cut band, heavy base, whisky line), in thin lines.
 * Strokes use currentColor, so the colour comes from a text token (gold `text-primary` by default).
 * While a page loads, sherry-coloured whisky rises in the glass (`.pour-liquid`, driven by
 * `<html data-pour>`; see src/lib/pour.ts). src/app/icon.svg is the same glass simplified for 16px.
 */
export function BrandMark({ className }: { className?: string }) {
  const clip = `glass-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-8 shrink-0 text-primary', className)}
    >
      <defs>
        <clipPath id={clip}>
          <path d="M6.6 8.4 8.3 25.4Q16 26.8 23.7 25.4L25.4 8.4Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`} stroke="none">
        <g className="pour-liquid">
          <path className="pour-wave" d="M0 15q2-1 4 0t4 0 4 0 4 0 4 0 4 0 4 0 4 0 4 0 4 0V30H0Z" />
        </g>
      </g>
      <ellipse cx="16" cy="7" rx="10" ry="1.6" />
      <path d="M6 7 8 26Q16 27.6 24 26L26 7" />
      <path d="M8.3 23Q16 24.4 23.7 23" />
      <path d="M7.2 15Q16 16.5 24.8 15" />
      <path d="M8 20 10 17 12 20 14 17 16 20 18 17 20 20 22 17 24 20M8.3 20 10 23 12 20 14 23 16 20 18 23 20 20 22 23 23.7 20" strokeOpacity=".5" />
    </svg>
  );
}

/** Mark + `WHISKY INDEX` in tracked Cormorant Garamond capitals. The name comes from the dictionary. */
export function Wordmark({ d }: { d: Dict }) {
  return (
    <span className="flex items-center gap-2 sm:gap-3">
      <BrandMark className="max-sm:size-6" />
      {/* Phones have only the menu button beside it (city and language sit on a second row), so the name always fits. */}
      <span className="font-display text-[0.9375rem] leading-none font-semibold tracking-[0.16em] whitespace-nowrap text-foreground uppercase sm:text-[1.0625rem] sm:tracking-[0.2em]">
        {d.site.title}
      </span>
    </span>
  );
}
