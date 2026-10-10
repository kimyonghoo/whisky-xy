'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ko } from '@/lib/i18n/ko';

export function ClerkMode({ title, imageUrl, detail }: { title: string; imageUrl: string | null; detail: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <Button type="button" className="h-14 w-full text-lg" onClick={() => setOpen(true)}>
        {ko.card.showClerk}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 overflow-y-auto bg-white p-6 text-center text-black"
        >
          {imageUrl && (
            // Hotlinked from the store CDN on purpose (never copied).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={title} referrerPolicy="no-referrer" className="max-h-[40vh] w-auto object-contain" />
          )}
          <h2 className="text-4xl font-bold leading-tight sm:text-6xl">{title}</h2>
          <p className="text-2xl font-semibold sm:text-4xl">{detail}</p>
          <p className="text-3xl font-bold sm:text-5xl">{ko.card.clerkQuestion}</p>
          <p className="text-base text-neutral-500">{ko.card.clerkClose}</p>
        </div>
      )}
    </>
  );
}
