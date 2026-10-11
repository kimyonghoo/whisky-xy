import type { Dict } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Brand mark: a pot still inside a two-ring compass, drawn in thin lines.
 * Strokes use currentColor, so the colour comes from a text token (gold `text-primary` by default).
 * src/app/icon.svg is the same art on black, simplified for 16px (no inner ring, heavier strokes).
 */
export function BrandMark({ className }: { className?: string }) {
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
      <circle cx="16" cy="16" r="14.5" />
      <circle cx="16" cy="16" r="12" strokeOpacity=".4" />
      <path d="M12 23h8M13 23c-2-2-2.5-5-1-7.5 1-1.6 2.5-2.3 4-2.3s3 .7 4 2.3c1.5 2.5 1 5.5-1 7.5" />
      <path d="M16 13.2V9.5l4-2.5M20 7v3.2" />
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
