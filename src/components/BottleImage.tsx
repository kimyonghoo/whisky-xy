import { GlassWater } from 'lucide-react';
import { safeHttpsUrl } from '@/lib/card';
import { cn } from '@/lib/utils';

/**
 * Product photo on a dark tile. The tile itself is never light: while a photo loads, or when a
 * store's image fails, the visitor sees the dark tile, not a white box. Store photos keep their own
 * (often white) background as content, letterboxed on the dark tile.
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
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-contain p-1.5"
        />
      ) : (
        <GlassWater aria-hidden className="size-1/3 text-faint" strokeWidth={1.25} />
      )}
    </div>
  );
}
