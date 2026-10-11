'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Search, SlidersHorizontal } from 'lucide-react';
import { searchHref } from '@/lib/search-view';
import { SIZE_OPTIONS, sizeLabel } from '@/lib/search-form';
import { localizePath } from '@/lib/i18n';
import { useDict, useLocale } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useSearchNav } from '@/components/search/SearchShell';
import { LocaleLink } from '@/components/LocaleLink';

export interface SearchFormValues {
  q: string;
  /** Explicit `?city=` from the URL, kept as a hidden field so a new query stays in that city. */
  city?: string;
  /** Bottle size in ml as a string, '' = any. */
  size: string;
  min: string;
  max: string;
  inStock: boolean;
  /** Store-scoped search (`?store=`): kept as a hidden field so a new query stays in that store. */
  store?: string;
}

const chip =
  'inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold text-foreground shadow-card transition-colors select-none hover:bg-muted pointer-coarse:min-h-11';

/**
 * Search form. Works as a plain GET form without JS; with JS it navigates in a
 * transition (results dim while loading). The in-stock chip applies instantly; fields inside the
 * 필터 popover apply only on 적용 so several can be set together. Esc / outside click close the popover.
 */
export function SearchForm({
  values,
  filterCount,
  variant = 'bar',
}: {
  values: SearchFormValues;
  filterCount: number;
  variant?: 'hero' | 'bar';
}) {
  const d = useDict();
  const locale = useLocale();
  const nav = useSearchNav();
  const pending = nav?.pending ?? false;
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function closeFilters(returnFocus: boolean) {
    if (detailsRef.current) detailsRef.current.open = false;
    if (returnFocus) summaryRef.current?.focus();
  }

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFilters(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      // Clicking elsewhere closes without stealing focus from what was clicked.
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) closeFilters(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [filtersOpen]);
  const hero = variant === 'hero';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!nav) return; // fall back to a normal GET submit
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === 'string' ? v.trim() : '';
    };
    const q = get('q');
    const store = get('store');
    if (!q && !store) {
      e.currentTarget.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
      return;
    }
    if (detailsRef.current?.open) closeFilters(true);
    // A new search always starts from the first page of each section.
    nav.navigate(localizePath(locale, searchHref({ q, store, city: get('city'), size: get('size'), min: get('min'), max: get('max'), inStock: get('inStock') })));
  }

  function onChange(e: React.ChangeEvent<HTMLFormElement>) {
    const t = e.target as unknown as HTMLInputElement | HTMLSelectElement;
    // Only the in-stock chip (outside the popover) applies instantly.
    const instant = t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'checkbox' && !t.closest('details');
    const q = formRef.current?.querySelector<HTMLInputElement>('input[name="q"]')?.value.trim();
    if (instant && (q || values.store)) formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={localizePath(locale, '/')}
      role="search"
      onSubmit={onSubmit}
      onChange={onChange}
      className="relative flex flex-col gap-3"
    >
      {values.store && <input type="hidden" name="store" value={values.store} />}
      {values.city && <input type="hidden" name="city" value={values.city} />}
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{d.search.inputLabel}</span>
          <Search
            aria-hidden
            className={cn('pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground', hero ? 'size-5' : 'size-[1.125rem]')}
          />
          <Input
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder={values.store ? d.store.placeholder : d.search.placeholder}
            // Browsing a store's list on a phone shouldn't pop the keyboard.
            autoFocus={!values.q && !values.store}
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={200}
            className={cn(hero ? 'h-14 rounded-xl pl-11 text-lg shadow-raised' : 'h-12 pl-10')}
          />
        </label>
        <Button type="submit" size={hero ? 'xl' : 'lg'} className="min-w-12 px-4 sm:px-6" disabled={pending}>
          {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Search aria-hidden />}
          <span className="sr-only sm:not-sr-only">{pending ? d.search.pending : d.search.submit}</span>
        </Button>
      </div>

      {!hero && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(chip, 'group/chk cursor-pointer has-checked:border-instock has-checked:bg-instock-bg has-checked:text-instock-fg has-focus-visible:outline-3 has-focus-visible:outline-ring')}>
            <input type="checkbox" name="inStock" value="1" defaultChecked={values.inStock} className="peer sr-only" />
            <span
              aria-hidden
              className="flex size-4 items-center justify-center rounded border border-border-strong bg-card peer-checked:border-instock peer-checked:bg-instock peer-checked:text-white"
            >
              <Check className="size-3 opacity-0 group-has-checked/chk:opacity-100" strokeWidth={3} />
            </span>
            {d.search.inStockOnly}
          </label>

          <details ref={detailsRef} className="group/filters" onToggle={(e) => setFiltersOpen(e.currentTarget.open)}>
            <summary ref={summaryRef} className={cn(chip, 'list-none group-open/filters:border-foreground/40 group-open/filters:bg-muted')}>
              <SlidersHorizontal aria-hidden className="size-4" />
              {d.search.filters}
              {filterCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular">
                  {filterCount}
                </span>
              )}
            </summary>
            <div className="absolute inset-x-0 top-full z-30 mt-2 flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-raised sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
                <label className="flex flex-col gap-1.5 text-sm font-semibold max-sm:col-span-2">
                  {d.search.sizeLabel}
                  <NativeSelect name="size" defaultValue={values.size}>
                    <option value="">{d.search.sizeAll}</option>
                    {SIZE_OPTIONS.map((ml) => (
                      <option key={ml} value={ml}>
                        {sizeLabel(ml)}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  {d.search.minLabel}
                  <Input name="min" inputMode="decimal" defaultValue={values.min} placeholder="0" className="tabular" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  {d.search.maxLabel}
                  <Input name="max" inputMode="decimal" defaultValue={values.max} placeholder="500" className="tabular" />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2">
                <LocaleLink href={searchHref({ q: values.q, store: values.store, city: values.city })} className={buttonVariants({ variant: 'ghost' })}>
                  {d.search.filtersReset}
                </LocaleLink>
                <Button type="submit">{d.search.filtersApply}</Button>
              </div>
            </div>
          </details>
        </div>
      )}
    </form>
  );
}
