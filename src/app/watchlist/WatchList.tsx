'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, CircleAlert, LoaderCircle, Minus, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { CityChip } from '@/components/StoreLine';
import { watchRegionCity, type WatchRegion } from '@/lib/watch-form';
import { ko } from '@/lib/i18n/ko';
import { cn } from '@/lib/utils';
import { deleteWatchAction, type DeleteState } from './actions';

/** Display-ready watch (formatted on the server). */
export interface WatchItem {
  id: number;
  label: string;
  includeTerms: string[];
  excludeTerms: string[];
  batch: string | null;
  sizeMl: number | null;
  target: string | null;
  regions: WatchRegion[];
  created: string;
  searchHref: string;
}

/**
 * Watch cards + one live region that announces deletions. A deleted card unmounts with the
 * revalidated list, so the announcement comes from diffing the previous and current items.
 */
export function WatchList({ items }: { items: WatchItem[] }) {
  const [prev, setPrev] = useState(items);
  const [announce, setAnnounce] = useState('');
  if (prev !== items) {
    // Adjust state during render when props change (no effect needed).
    const ids = new Set(items.map((w) => w.id));
    const gone = prev.filter((w) => !ids.has(w.id));
    setPrev(items);
    if (gone.length === 1) setAnnounce(ko.watch.deleted(gone[0].label));
  }
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className={cn('text-sm font-semibold text-instock-fg', !announce && 'sr-only')}>
        {announce && (
          <span className="flex items-center gap-1.5">
            <BadgeCheck aria-hidden className="size-4 shrink-0" />
            {announce}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((w) => (
          <li key={w.id}>
            <WatchCard item={w} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TermList({ kind, terms }: { kind: 'include' | 'exclude'; terms: string[] }) {
  const Icon = kind === 'include' ? Plus : Minus;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <dt className="w-9 shrink-0 text-xs font-semibold text-muted-foreground">{ko.watch.item[kind]}</dt>
      {terms.map((t) => (
        <dd key={t}>
          <Badge
            variant={kind === 'include' ? 'spec' : 'soldout'}
            size="md"
            lang="en"
            className="h-auto min-h-7 max-w-full py-0.5 whitespace-normal"
          >
            <Icon aria-hidden />
            {t}
          </Badge>
        </dd>
      ))}
    </div>
  );
}

function WatchCard({ item }: { item: WatchItem }) {
  const [confirming, setConfirming] = useState(false);
  // The server action is passed as-is so the form keeps its progressive-enhancement wiring.
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteWatchAction, {});
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Confirm step: focus the safe choice. Cancel: return focus to 삭제.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const headingId = `watch-${item.id}-h`;
  return (
    <article
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      className={cn('flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card transition-opacity sm:p-5', pending && 'opacity-60')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-base leading-snug font-semibold sm:text-lg">
            {item.label}
          </h3>
          <p className="text-xs font-medium text-muted-foreground tabular">{ko.watch.item.since(item.created)}</p>
        </div>
        <p
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular',
            item.target ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Tag aria-hidden className="size-3.5" />
          <span className="sr-only">{ko.watch.item.target}</span>
          {item.target ?? ko.watch.item.anyPrice}
        </p>
      </div>

      <dl className="flex flex-col gap-2">
        <TermList kind="include" terms={item.includeTerms} />
        {item.excludeTerms.length > 0 && <TermList kind="exclude" terms={item.excludeTerms} />}
        <div className="flex flex-wrap items-center gap-1.5">
          <dt className="w-9 shrink-0 text-xs font-semibold text-muted-foreground">{ko.watch.item.regions}</dt>
          {item.regions.map((r) => (
            <dd key={r}>
              <CityChip city={watchRegionCity(r)} />
            </dd>
          ))}
          {item.batch && (
            <dd>
              <Badge variant="spec" size="sm" lang="en">
                {ko.watch.item.batch(item.batch)}
              </Badge>
            </dd>
          )}
          {item.sizeMl != null && (
            <dd>
              <Badge variant="spec" size="sm" className="tabular">
                {ko.watch.item.size(item.sizeMl)}
              </Badge>
            </dd>
          )}
        </div>
      </dl>

      <form action={action} className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        <input type="hidden" name="id" value={item.id} />
        {state.error && (
          <p role="alert" className="mr-auto flex items-start gap-1.5 text-sm font-semibold text-danger-fg">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {state.error}
          </p>
        )}
        {confirming || pending ? (
          <>
            <span className="mr-auto text-sm font-semibold" aria-live="polite">
              {pending ? ko.watch.item.deleting : ko.watch.item.confirmDelete}
            </span>
            <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              {ko.watch.item.confirmNo}
            </Button>
            <Button type="submit" variant="destructive" size="sm" disabled={pending}>
              {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <Trash2 aria-hidden />}
              {pending ? ko.watch.item.deleting : ko.watch.item.confirmYes}
            </Button>
          </>
        ) : (
          <>
            <Link href={item.searchHref} prefetch={false} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Search aria-hidden />
              {ko.watch.item.search}
            </Link>
            <Button
              ref={deleteRef}
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger-fg hover:bg-danger-bg"
              onClick={() => setConfirming(true)}
              aria-label={ko.watch.item.deleteLabel(item.label)}
            >
              <Trash2 aria-hidden />
              {ko.watch.item.delete}
            </Button>
          </>
        )}
      </form>
    </article>
  );
}
