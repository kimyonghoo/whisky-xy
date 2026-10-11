'use client';

import { Component, useCallback, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { LocateFixed, MapPin } from 'lucide-react';
import type { MapStore, MapViewId } from '@/lib/map-view';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Notice } from '@/components/Notice';
import type { FocusRequest, ViewRequest } from './StoreMap';
import { NumberDot, OfferLine, StoreActions, StoreBadges } from './StoreParts';

function MapLoading() {
  const d = useDict();
  return (
    <div className="relative size-full">
      <Skeleton className="size-full rounded-none" />
      <p role="status" className="sr-only">
        {d.map.loading}
      </p>
    </div>
  );
}

// Leaflet touches `window` on import: client-only, and kept out of the server bundle.
const StoreMap = dynamic(() => import('./StoreMap'), { ssr: false, loading: () => <MapLoading /> });

/** If the map chunk or Leaflet fails, keep the page: the list below still has every store and action. */
class MapBoundary extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex size-full items-center justify-center bg-muted p-4">
          <Notice tone="danger" className="max-w-sm bg-card">
            {this.props.message}
          </Notice>
        </div>
      );
    }
    return this.props.children;
  }
}

const TILE_ERROR_THRESHOLD = 4;
const DESKTOP = '(min-width: 64rem)';

export function StoreMapPanel({
  stores,
  initialView,
  views,
  bottleMode,
}: {
  stores: MapStore[];
  initialView: MapViewId;
  /** Live cities of the selected city's country: one view button each. */
  views: MapViewId[];
  bottleMode: boolean;
}) {
  const d = useDict();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [tileErrors, setTileErrors] = useState(0);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const nonce = useRef(0);

  const scrollBehavior = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const showView = (view: MapViewId) => {
    setSelectedId(null);
    setViewRequest({ view, nonce: ++nonce.current });
  };

  const showOnMap = (id: string) => {
    setSelectedId(id);
    setFocusRequest({ id, nonce: ++nonce.current });
    // On phones the list sits under the map: bring the map back into view.
    const box = mapBoxRef.current;
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) box.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    }
  };

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    // Desktop: the map is sticky beside the list, so reveal the matching row. On phones the popup is the answer.
    if (window.matchMedia(DESKTOP).matches) {
      itemRefs.current.get(id)?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    }
  }, []);
  const onDeselect = useCallback((id: string) => setSelectedId((cur) => (cur === id ? null : cur)), []);
  const onTileError = useCallback(() => setTileErrors((n) => n + 1), []);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:order-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label={d.map.regionNav} className="flex gap-2">
            {views.map((id) => (
              <Button key={id} variant="outline" size="sm" onClick={() => showView(id)}>
                <MapPin aria-hidden />
                {d.city[id]}
              </Button>
            ))}
          </nav>
          {bottleMode && (
            <ul aria-label={d.map.legendLabel} className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-full bg-primary" />
                {d.map.legendHas}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-full border border-soldout-line bg-soldout-bg" />
                {d.map.legendNone}
              </li>
            </ul>
          )}
        </div>

        <div
          ref={mapBoxRef}
          role="region"
          aria-label={d.map.mapLabel}
          className="relative isolate h-[min(55svh,26rem)] min-h-72 scroll-mt-20 overflow-hidden rounded-2xl border bg-muted shadow-card lg:h-[calc(100svh-10rem)] lg:max-h-[42rem]"
        >
          <MapBoundary message={d.map.mapError}>
            <StoreMap
              stores={stores}
              initialView={initialView}
              selectedId={selectedId}
              viewRequest={viewRequest}
              focusRequest={focusRequest}
              onSelect={onSelect}
              onDeselect={onDeselect}
              onTileError={onTileError}
            />
          </MapBoundary>
          {tileErrors >= TILE_ERROR_THRESHOLD && (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000]">
              <Notice tone="caution" className="bg-caution-bg/95 p-3 shadow-raised">
                {d.map.tileError}
              </Notice>
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="stores-h" className="flex flex-col gap-3 lg:order-1">
        <div className="flex items-baseline gap-2">
          <h2 id="stores-h" className="text-xl font-bold tracking-tight">
            {d.map.listHeading}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular">{d.map.storeCount(stores.length)}</span>
        </div>
        <ol className="flex flex-col gap-3">
          {stores.map((s) => {
            const selected = s.id === selectedId;
            return (
              <li
                key={s.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(s.id, el);
                  else itemRefs.current.delete(s.id);
                }}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex scroll-mt-24 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card transition-colors',
                  s.dimmed && 'bg-muted/50 shadow-none',
                  selected && 'border-primary ring-2 ring-primary/25',
                )}
              >
                <button
                  type="button"
                  onClick={() => showOnMap(s.id)}
                  aria-pressed={selected}
                  className="group -m-1 flex min-h-11 items-start gap-3 rounded-lg p-1 text-left"
                >
                  <NumberDot store={s} className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span lang="en" className="text-base leading-snug font-semibold underline-offset-4 group-hover:underline">
                      {s.name}
                    </span>
                    <StoreBadges store={s} />
                    <span lang="en" className="text-sm text-muted-foreground">
                      {s.address}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                    <LocateFixed aria-hidden className="size-4" />
                    <span className="hidden sm:inline">{selected ? d.map.selected : d.map.showOnMap}</span>
                    <span className="sr-only sm:hidden">{d.map.showOnMap}</span>
                  </span>
                </button>
                <OfferLine store={s} />
                {s.onlineOnly && <p className="text-sm text-muted-foreground">{d.card.onlineOnlyNote}</p>}
                {s.lowReliability && <p className="text-sm text-caution-fg">{d.card.lowReliabilityTitle}</p>}
                <StoreActions store={s} />
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
