'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, Check, ChevronDown, CircleAlert, Info, LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WATCH_CITY_IDS, LINE_SIBLINGS, splitTerms, suggestExcludes, type WatchField } from '@/lib/watch-form';
import type { CityId } from '@/lib/geo';
import type { Dict } from '@/lib/i18n';
import { useDict, useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { createWatchAction, type CreateState } from './actions';

export interface WatchFormDefaults {
  label: string;
  include: string;
  exclude: string;
  batch: string;
  sizeMl: string;
  maxPrice: string;
  cities: CityId[];
}

const EMPTY: WatchFormDefaults = { label: '', include: '', exclude: '', batch: '', sizeMl: '', maxPrice: '', cities: ['brooklyn', 'nj'] };

function fromState(values: CreateState['values']): WatchFormDefaults {
  const s = (k: string) => (typeof values?.[k] === 'string' ? (values[k] as string) : '');
  const r = Array.isArray(values?.cities) ? (values.cities as string[]) : [];
  return {
    label: s('label'),
    include: s('include'),
    exclude: s('exclude'),
    batch: s('batch'),
    sizeMl: s('sizeMl'),
    maxPrice: s('maxPrice'),
    cities: WATCH_CITY_IDS.filter((x) => r.includes(x)),
  };
}

/** Hint for a known bottle line (e.g. Stagg), shown while the excludes are the suggested ones. */
function lineHintFor(include: string, d: Dict): string | null {
  for (const t of splitTerms(include)) {
    if (Object.hasOwn(LINE_SIBLINGS, t) && d.watch.lineHint[t]) return d.watch.lineHint[t];
  }
  return null;
}

/**
 * Create-a-watch form. Server-validated via useActionState; on error the form re-mounts with what
 * the user typed and focuses the offending field. Exclude terms auto-follow the include terms
 * (Stagg → jr, junior, george) until the user edits them.
 */
export function WatchForm({ initial }: { initial: WatchFormDefaults }) {
  const d = useDict();
  const [state, action, pending] = useActionState<CreateState, FormData>(createWatchAction, { seq: 0 });
  // Error → keep what was typed. Success → a clean form. First render → the ?q= prefill.
  const defaults = state.error ? fromState(state.values) : state.ok ? EMPTY : initial;
  return (
    <section aria-labelledby="new-watch-h" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="new-watch-h" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Plus aria-hidden className="size-5 text-primary" />
          {d.watch.formHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{d.watch.formSub}</p>
      </div>
      <FormBody key={state.seq} defaults={defaults} action={action} pending={pending} state={state} />
    </section>
  );
}

function FormBody({
  defaults,
  action,
  pending,
  state,
}: {
  defaults: WatchFormDefaults;
  action: (fd: FormData) => void;
  pending: boolean;
  state: CreateState;
}) {
  const d = useDict();
  const locale = useLocale();
  const id = useId();
  const [include, setInclude] = useState(defaults.include);
  const [exclude, setExclude] = useState(defaults.exclude);
  // Excludes follow the include terms only while they still equal the suggestion.
  const [excludeTouched, setExcludeTouched] = useState(defaults.exclude !== suggestExcludes(splitTerms(defaults.include)).join(', '));
  const formRef = useRef<HTMLFormElement>(null);
  const errField: WatchField | undefined = state.error ? state.field : undefined;
  const advancedOpen = Boolean(defaults.label || defaults.batch || defaults.sizeMl || errField === 'label' || errField === 'batch' || errField === 'sizeMl');

  useEffect(() => {
    if (!errField) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${errField}"]`);
    el?.focus();
  }, [errField]);

  const hint = lineHintFor(include, d);
  const showLineHint = hint !== null && exclude === suggestExcludes(splitTerms(include)).join(', ') && exclude !== '';

  function onIncludeChange(v: string) {
    setInclude(v);
    if (!excludeTouched) setExclude(suggestExcludes(splitTerms(v)).join(', '));
  }

  const fieldError = (f: WatchField) =>
    errField === f ? (
      <p id={`${id}-${f}-err`} className="flex items-start gap-1.5 text-sm font-semibold text-danger-fg">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    ) : null;
  const invalid = (f: WatchField, hintId?: string) => ({
    'data-field': f,
    'aria-invalid': errField === f ? true : undefined,
    'aria-describedby': [errField === f ? `${id}-${f}-err` : null, hintId].filter(Boolean).join(' ') || undefined,
  });
  const labelCls = 'text-sm font-semibold';
  const hintCls = 'text-sm text-muted-foreground';
  const optional = <span className="ml-1 font-medium text-muted-foreground">({d.watch.fields.optional})</span>;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="citiesSubmitted" value="1" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-include`} className={labelCls}>
          {d.watch.fields.include}
        </label>
        <Input
          id={`${id}-include`}
          name="include"
          value={include}
          onChange={(e) => onIncludeChange(e.target.value)}
          placeholder={d.watch.fields.includePlaceholder}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={300}
          required
          lang="en"
          {...invalid('include', `${id}-include-hint`)}
        />
        {fieldError('include')}
        <p id={`${id}-include-hint`} className={hintCls}>
          {d.watch.fields.includeHint}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-exclude`} className={labelCls}>
          {d.watch.fields.exclude}
          {optional}
        </label>
        <Input
          id={`${id}-exclude`}
          name="exclude"
          value={exclude}
          onChange={(e) => {
            setExclude(e.target.value);
            setExcludeTouched(true);
          }}
          placeholder={d.watch.fields.excludePlaceholder}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={300}
          lang="en"
          {...invalid('exclude', `${id}-exclude-hint`)}
        />
        {fieldError('exclude')}
        <div id={`${id}-exclude-hint`} className="flex flex-col gap-1.5">
          {showLineHint && (
            <p className="flex items-start gap-1.5 rounded-lg border border-info-line bg-info-bg px-3 py-2 text-sm font-medium text-info-fg">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {hint}
            </p>
          )}
          <p className={hintCls}>{d.watch.fields.excludeHint}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-price`} className={labelCls}>
          {d.watch.fields.maxPrice}
          {optional}
        </label>
        <div className="relative max-w-60">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            id={`${id}-price`}
            name="maxPrice"
            inputMode="decimal"
            defaultValue={defaults.maxPrice}
            placeholder={d.watch.fields.maxPricePlaceholder}
            autoComplete="off"
            maxLength={20}
            className="pl-7 tabular"
            {...invalid('maxPrice', `${id}-price-hint`)}
          />
        </div>
        {fieldError('maxPrice')}
        <p id={`${id}-price-hint`} className={hintCls}>
          {d.watch.fields.maxPriceHint}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-cities-hint`}>
        <legend className={cn(labelCls, 'mb-1.5')}>{d.watch.fields.cities}</legend>
        <div className="flex flex-wrap gap-2">
          {WATCH_CITY_IDS.map((r, i) => (
            <label
              key={r}
              className="group/chk inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold shadow-card transition-colors select-none hover:bg-muted has-checked:border-primary/60 has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring pointer-coarse:min-h-11"
            >
              <input
                type="checkbox"
                name="cities"
                value={r}
                defaultChecked={defaults.cities.includes(r)}
                className="peer sr-only"
                {...(i === 0 ? invalid('cities') : {})}
              />
              <span
                aria-hidden
                className="flex size-4 items-center justify-center rounded border border-border-strong bg-card text-white peer-checked:border-primary peer-checked:bg-primary"
              >
                <Check className="size-3 opacity-0 group-has-checked/chk:opacity-100" strokeWidth={3} />
              </span>
              {d.city[r]}
            </label>
          ))}
        </div>
        {fieldError('cities')}
        <p id={`${id}-cities-hint`} className={hintCls}>
          {d.watch.fields.citiesHint}
        </p>
      </fieldset>

      <details open={advancedOpen} className="group/adv rounded-xl border bg-muted/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold pointer-coarse:min-h-11">
          {d.watch.fields.advanced}
          <ChevronDown aria-hidden className="size-4 transition-transform group-open/adv:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 border-t px-4 pt-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-label`} className={labelCls}>
              {d.watch.fields.label}
              {optional}
            </label>
            <Input
              id={`${id}-label`}
              name="label"
              defaultValue={defaults.label}
              autoComplete="off"
              maxLength={80}
              {...invalid('label', `${id}-label-hint`)}
            />
            {fieldError('label')}
            <p id={`${id}-label-hint`} className={hintCls}>
              {d.watch.fields.labelHint}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-batch`} className={labelCls}>
                {d.watch.fields.batch}
              </label>
              <Input
                id={`${id}-batch`}
                name="batch"
                defaultValue={defaults.batch}
                placeholder={d.watch.fields.batchPlaceholder}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={24}
                {...invalid('batch')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-size`} className={labelCls}>
                {d.watch.fields.size}
              </label>
              <Input
                id={`${id}-size`}
                name="sizeMl"
                inputMode="numeric"
                defaultValue={defaults.sizeMl}
                placeholder={d.watch.fields.sizePlaceholder}
                autoComplete="off"
                maxLength={5}
                className="tabular"
                {...invalid('sizeMl')}
              />
            </div>
          </div>
          {fieldError('batch')}
          {fieldError('sizeMl')}
        </div>
      </details>

      <div className="flex flex-col gap-2">
        {state.error && !errField && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger-fg">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {state.error}
          </p>
        )}
        {state.error && errField && (
          <p role="alert" className="sr-only">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start" disabled={pending}>
          {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Plus aria-hidden />}
          {pending ? d.watch.submitting : d.watch.submit}
        </Button>
        <p role="status" className="flex min-h-5 items-start gap-1.5 text-sm font-semibold text-instock-fg">
          {state.ok && state.message && (
            <>
              <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </>
          )}
        </p>
      </div>
    </form>
  );
}
