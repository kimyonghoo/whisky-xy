'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ko } from '@/lib/i18n/ko';

export function RecheckButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/recheck/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { status?: string };
      setMessage(
        data.status === 'updated'
          ? ko.card.recheckUpdated
          : data.status === 'cached'
            ? ko.card.recheckCached
            : data.status === 'gone'
              ? ko.card.gone
              : ko.card.recheckFailed,
      );
      startTransition(() => router.refresh());
    } catch {
      setMessage(ko.card.recheckFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="h-12 text-base" onClick={run} disabled={busy || pending}>
        {busy || pending ? ko.card.rechecking : ko.card.recheck}
      </Button>
      {message && (
        <p role="status" className="text-base text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
