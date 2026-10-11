'use client';

import { useEffect, useRef, useState } from 'react';
import { Hand, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict } from '@/lib/i18n/client';

type WakeLock = { release: () => Promise<void> };

/**
 * Full-screen, high-contrast view to hand the phone to a clerk.
 * Off-white on black (the site theme, ~17:1), huge type, tap anywhere / Esc / close button to exit.
 * Keeps the screen awake while open where the browser supports it.
 */
export function ClerkMode({
  title,
  imageUrl,
  detail,
  price,
}: {
  title: string;
  imageUrl: string | null;
  detail: string;
  price?: string;
}) {
  const d = useDict();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        // Only one focusable control inside: keep focus on it.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    window.addEventListener('keydown', onKey);

    let lock: WakeLock | null = null;
    let cancelled = false;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock;
    wl?.request('screen')
      .then((l) => {
        if (cancelled) void l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      void lock?.release().catch(() => {});
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <Button ref={openerRef} type="button" variant="outline" size="xl" className="w-full" onClick={() => setOpen(true)}>
        <Hand aria-hidden />
        {d.card.showClerk}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col overflow-y-auto bg-background text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <p className="text-base font-medium text-muted-foreground">{d.card.clerkClose}</p>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label={d.card.clerkCloseButton}
              className="flex size-12 items-center justify-center rounded-md border border-border-strong text-foreground transition-colors hover:bg-muted"
            >
              <X aria-hidden className="size-7" />
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
            {imageUrl && (
              // Hotlinked from the store CDN on purpose (never copied); already https-checked.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="max-h-[36vh] w-auto rounded-md object-contain" />
            )}
            <h2 lang="en" className="text-[2.5rem] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-6xl">
              {title}
            </h2>
            {detail && (
              <p lang="en" className="text-3xl font-bold tabular sm:text-4xl">
                {detail}
              </p>
            )}
            {price && (
              <p lang="en" className="text-2xl font-semibold text-muted-foreground tabular sm:text-3xl">
                {price}
              </p>
            )}
            <p lang="en" className="mt-2 rounded-md border-2 border-primary px-6 py-4 text-3xl font-extrabold text-primary sm:text-5xl">
              {d.card.clerkQuestion}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
