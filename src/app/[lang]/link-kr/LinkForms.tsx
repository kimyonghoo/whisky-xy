'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { BadgeCheck, CircleAlert, Link2, LoaderCircle, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict, useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { connectKrAction, unlinkKrAction, type LinkState, type UnlinkState } from './actions';

function ErrorLine({ id, error }: { id?: string; error?: string }) {
  return (
    <p id={id} role="alert" className={cn('flex items-start gap-1.5 text-sm font-semibold text-danger-fg', !error && 'sr-only')}>
      {error && (
        <>
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </>
      )}
    </p>
  );
}

/** "이 상품으로 연결". On success the action redirects back to search, so only errors come back. */
export function ConnectForm({
  bottle,
  from,
  candidate,
  current,
}: {
  bottle: string;
  from: string;
  candidate: { productId: string; nameKo: string; nameEn: string | null; imageUrl: string | null };
  current: boolean;
}) {
  const d = useDict();
  const locale = useLocale();
  const [state, action, pending] = useActionState<LinkState, FormData>(connectKrAction, {});
  const errId = `connect-${candidate.productId}-err`;
  return (
    <form action={action} className="flex flex-col items-stretch gap-2 sm:items-end">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="bottle" value={bottle} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="productId" value={candidate.productId} />
      <input type="hidden" name="nameKo" value={candidate.nameKo} />
      <input type="hidden" name="nameEn" value={candidate.nameEn ?? ''} />
      <input type="hidden" name="imageUrl" value={candidate.imageUrl ?? ''} />
      <Button
        type="submit"
        variant={current ? 'outline' : 'default'}
        size="sm"
        disabled={pending}
        aria-label={d.linkKr.connectLabel(candidate.nameKo)}
        aria-describedby={state.error ? errId : undefined}
        className="w-full sm:w-auto"
      >
        {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Link2 aria-hidden />}
        {pending ? d.linkKr.connecting : d.linkKr.connect}
      </Button>
      <ErrorLine id={errId} error={state.error} />
    </form>
  );
}

/** "연결 해제" with an inline confirm step (focus moves to the safe choice). */
export function UnlinkForm({ bottle }: { bottle: string }) {
  const d = useDict();
  const locale = useLocale();
  const [state, action, pending] = useActionState<UnlinkState, FormData>(unlinkKrAction, {});
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (state.ok) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-instock-fg">
        <BadgeCheck aria-hidden className="size-4 shrink-0" />
        {d.linkKr.unlinked}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="bottle" value={bottle} />
      {confirming ? (
        <>
          <span className="text-sm font-semibold">{d.linkKr.confirmUnlink}</span>
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Unlink aria-hidden />}
            {pending ? d.linkKr.unlinking : d.linkKr.confirmYes}
          </Button>
          <Button ref={cancelRef} type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
            {d.linkKr.confirmNo}
          </Button>
        </>
      ) : (
        <Button ref={triggerRef} type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
          <Unlink aria-hidden />
          {d.linkKr.unlink}
        </Button>
      )}
      <ErrorLine error={state.error} />
    </form>
  );
}
