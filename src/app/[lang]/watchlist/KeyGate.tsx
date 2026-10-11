'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { CircleAlert, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDict, useLocale } from '@/lib/i18n/client';
import { loginAction, type LoginState } from './actions';

/**
 * Admin key gate. A wrong key (or no key configured on the server) shows the same inline error,
 * so the form never reveals whether ADMIN_KEY is set.
 */
export function KeyGate({ body }: { body?: string }) {
  const d = useDict();
  const locale = useLocale();
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = state.error;

  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  return (
    <section
      aria-labelledby="gate-h"
      className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-7"
    >
      <div className="flex flex-col items-start gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <KeyRound aria-hidden className="size-6" />
        </span>
        <h2 id="gate-h" className="text-xl font-bold tracking-tight sm:text-2xl">
          {d.watch.gate.title}
        </h2>
        <p className="text-[0.9375rem] text-muted-foreground">{body ?? d.watch.gate.body}</p>
      </div>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="lang" value={locale} />
        <label htmlFor="admin-key" className="text-sm font-semibold">
          {d.watch.gate.keyLabel}
        </label>
        <div className="relative">
          <Input
            ref={inputRef}
            id="admin-key"
            name="key"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            maxLength={256}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'admin-key-error' : undefined}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? d.watch.gate.hide : d.watch.gate.show}
            aria-pressed={show}
            className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-11"
          >
            {show ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        </div>
        <p id="admin-key-error" role="alert" className="flex min-h-5 items-start gap-1.5 text-sm font-semibold text-danger-fg">
          {error && (
            <>
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </>
          )}
        </p>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
          {pending ? d.watch.gate.submitting : d.watch.gate.submit}
        </Button>
      </form>
    </section>
  );
}
