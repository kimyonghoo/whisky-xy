'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Link2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

type CopyState = 'idle' | 'copied' | 'failed';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function useFlash() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function flash(next: CopyState) {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }
  return [state, flash] as const;
}

function StateIcon({ state, idle }: { state: CopyState; idle: React.ReactNode }) {
  if (state === 'copied') return <Check aria-hidden className="text-instock-fg" />;
  if (state === 'failed') return <CircleAlert aria-hidden className="text-danger-fg" />;
  return <>{idle}</>;
}

/** Copies the absolute buy-card URL (for pasting into KakaoTalk). */
export function CopyLinkButton({
  path,
  label,
  className,
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const d = useDict();
  const [state, flash] = useFlash();
  async function copy() {
    flash((await copyText(window.location.origin + path)) ? 'copied' : 'failed');
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className={cn('min-w-[8.5rem]', className)}>
      <StateIcon state={state} idle={<Link2 aria-hidden />} />
      <span aria-live="polite">{state === 'copied' ? d.copy.copied : state === 'failed' ? d.copy.failed : (label ?? d.row.copyCard)}</span>
    </Button>
  );
}

/** Opens the OS share sheet when available (phones), otherwise copies the link. */
export function ShareCardButton({ path, title, className }: { path: string; title: string; className?: string }) {
  const d = useDict();
  const [state, flash] = useFlash();
  async function share() {
    const url = window.location.origin + path;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    flash((await copyText(url)) ? 'copied' : 'failed');
  }
  return (
    <Button type="button" variant="outline" size="lg" onClick={share} className={className}>
      <StateIcon state={state} idle={<Share2 aria-hidden />} />
      <span aria-live="polite">{state === 'copied' ? d.copy.copied : state === 'failed' ? d.copy.failed : d.card.share}</span>
    </Button>
  );
}
