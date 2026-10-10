import { GlassWater } from 'lucide-react';
import { safeHttpsUrl } from '@/lib/card';
import { cn } from '@/lib/utils';

/**
 * Product photo tile. Store photos are mostly on white, so the tile is always white.
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
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white', className)}>
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
        <GlassWater aria-hidden className="size-1/3 text-border-strong" />
      )}
    </div>
  );
}
