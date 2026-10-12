import { GlassWater } from 'lucide-react';
import { safeHttpsUrl } from '@/lib/card';
import { cn } from '@/lib/utils';

/**
 * Product photo under a display-case spotlight (`.bottle-spot` in globals.css): the photo is
 * multiplied over a warm light that fades into the surface, so a store's white background becomes
 * the light instead of a white box. Without a photo the tile stays dark with a glass icon.
 * Hotlinked from the store CDN on purpose (never copied); https-only.
 */
export function BottleImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const url = safeHttpsUrl(src);
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md',
        url ? 'bottle-spot' : 'border border-border bg-muted',
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-contain p-2"
        />
      ) : (
        <GlassWater aria-hidden className="size-1/3 text-faint" strokeWidth={1.25} />
      )}
    </div>
  );
}
