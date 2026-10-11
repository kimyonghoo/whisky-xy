'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleAlert, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

type Result = { tone: 'success' | 'info' | 'caution' | 'danger'; text: string };

const TONE = {
  success: { cls: 'text-instock-fg', Icon: BadgeCheck },
  info: { cls: 'text-info-fg', Icon: Info },
  caution: { cls: 'text-caution-fg', Icon: TriangleAlert },
  danger: { cls: 'text-danger-fg', Icon: CircleAlert },
} as const;

/**
 * Live recheck: idle → pending ("확인 중…", spinning icon) → result line
 * ("방금 확인했습니다" / cached / gone / failed), then the page refreshes with the new data.
 */
export function RecheckButton({ id, className }: { id: number; className?: string }) {
  const d = useDict();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const working = busy || pending;

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/recheck/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { status?: string };
      setResult(
        data.status === 'updated'
          ? { tone: 'success', text: d.card.recheckUpdated }
          : data.status === 'cached'
            ? { tone: 'info', text: d.card.recheckCached }
            : data.status === 'gone'
              ? { tone: 'caution', text: d.card.gone }
              : data.status === 'throttled'
                ? { tone: 'caution', text: d.card.recheckThrottled }
                : { tone: 'danger', text: d.card.recheckFailed },
      );
      startTransition(() => router.refresh());
    } catch {
      setResult({ tone: 'danger', text: d.card.recheckFailed });
    } finally {
      setBusy(false);
    }
  }

  const t = result ? TONE[result.tone] : null;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={run} disabled={working} aria-describedby={`recheck-${id}`}>
        <RefreshCw aria-hidden className={cn(working && 'motion-safe:animate-spin')} />
        {working ? d.card.rechecking : d.card.recheck}
      </Button>
      <p id={`recheck-${id}`} role="status" aria-live="polite" className={cn('flex min-h-6 items-center gap-1.5 text-[0.9375rem] font-semibold', t?.cls)}>
        {t && result && (
          <>
            <t.Icon aria-hidden className="size-4 shrink-0" />
            {result.text}
          </>
        )}
      </p>
    </div>
  );
}
