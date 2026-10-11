'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  OSM_TILE_URL, STORE_ZOOM, cityView, mapTileConfig, type MapStore, type MapViewId,
} from '@/lib/map-view';
import type { Dict } from '@/lib/i18n';
import { useDict } from '@/lib/i18n/client';
import { StorePopupContent, storeStateText } from './StoreParts';

export interface ViewRequest {
  view: MapViewId;
  nonce: number;
}
export interface FocusRequest {
  id: string;
  nonce: number;
}

export interface StoreMapProps {
  stores: MapStore[];
  initialView: MapViewId;
  selectedId: string | null;
  viewRequest: ViewRequest | null;
  focusRequest: FocusRequest | null;
  onSelect: (id: string) => void;
  onDeselect: (id: string) => void;
  onTileError: () => void;
}

// Inlined at build time. OSM is the fallback; see mapTileConfig for the usage-policy note.
const TILES = mapTileConfig(process.env.NEXT_PUBLIC_MAP_TILE_URL, process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION);
// Standard OSM tiles are light; on the dark site they are inverted in CSS (globals.css, .map-tiles-dark),
// which keeps label contrast. A configured provider is shown as-is (it may already be dark).
const TILE_CLASS = TILES.url === OSM_TILE_URL ? 'map-tiles-dark' : undefined;
const BOUNDS_PADDING: L.PointExpression = [28, 28];
const CITY_MAX_ZOOM = 13;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Marker icon built with DOM APIs (textContent only), never an HTML string.
 * The 44px outer box is the touch target; the 30px dot is the visual.
 */
function markerIcon(store: MapStore, d: Dict): L.DivIcon {
  const dot = document.createElement('span');
  dot.className = [
    'store-marker-dot flex size-[1.875rem] items-center justify-center rounded-full border-2 text-sm font-bold tabular shadow-raised',
    'transition-transform duration-150 group-data-[selected]/marker:scale-125 group-data-[selected]/marker:ring-4 group-data-[selected]/marker:ring-honey/70',
    store.dimmed ? 'border-soldout-line bg-soldout-bg text-soldout-fg' : 'border-background bg-primary text-primary-foreground',
  ].join(' ');
  const num = document.createElement('span');
  num.setAttribute('aria-hidden', 'true');
  num.textContent = String(store.n);
  const label = document.createElement('span');
  label.className = 'sr-only';
  label.textContent = d.map.markerLabel(store.n, store.name, storeStateText(store, d));
  dot.append(num, label);
  return L.divIcon({
    html: dot,
    className: 'store-marker group/marker flex items-center justify-center',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -16],
  });
}

function Controller({
  stores,
  markers,
  viewRequest,
  focusRequest,
}: {
  stores: MapStore[];
  markers: React.RefObject<Map<string, L.Marker>>;
  viewRequest: ViewRequest | null;
  focusRequest: FocusRequest | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!viewRequest) return;
    const animate = !reducedMotion();
    map.closePopup();
    const target = cityView(stores, viewRequest.view);
    if ('bounds' in target) map.flyToBounds(target.bounds, { padding: BOUNDS_PADDING, maxZoom: CITY_MAX_ZOOM, animate });
    else if (animate) map.flyTo(target.center, target.zoom);
    else map.setView(target.center, target.zoom, { animate: false });
  }, [map, viewRequest, stores]);

  useEffect(() => {
    if (!focusRequest) return;
    const marker = markers.current.get(focusRequest.id);
    if (!marker) return;
    const target = marker.getLatLng();
    const zoom = Math.max(map.getZoom(), STORE_ZOOM);
    const open = () => {
      marker.openPopup();
    };
    const here = map.getZoom() === zoom && map.latLngToContainerPoint(target).distanceTo(map.getSize().divideBy(2)) < 2;
    if (here || reducedMotion()) {
      if (!here) map.setView(target, zoom, { animate: false });
      open();
      return;
    }
    map.once('moveend', open);
    map.flyTo(target, zoom, { duration: 0.8 });
    return () => {
      map.off('moveend', open);
    };
  }, [map, markers, focusRequest]);

  return null;
}

export default function StoreMap({
  stores,
  initialView,
  selectedId,
  viewRequest,
  focusRequest,
  onSelect,
  onDeselect,
  onTileError,
}: StoreMapProps) {
  const d = useDict();
  const markers = useRef(new Map<string, L.Marker>());
  const icons = useMemo(() => new Map(stores.map((s) => [s.id, markerIcon(s, d)])), [stores, d]);

  // Selection styling toggles a data attribute instead of swapping icons, so keyboard focus on a marker survives.
  useEffect(() => {
    for (const [id, m] of markers.current) {
      const el = m.getElement();
      if (!el) continue;
      if (id === selectedId) el.setAttribute('data-selected', '');
      else el.removeAttribute('data-selected');
      el.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
    }
  }, [selectedId]);

  const target = cityView(stores, initialView);
  const initial =
    'bounds' in target
      ? { bounds: L.latLngBounds(target.bounds), boundsOptions: { padding: BOUNDS_PADDING, maxZoom: CITY_MAX_ZOOM } }
      : { center: target.center, zoom: target.zoom };

  return (
    <MapContainer {...initial} scrollWheelZoom={false} className="size-full font-sans">
      <TileLayer url={TILES.url} attribution={TILES.attribution} className={TILE_CLASS} eventHandlers={{ tileerror: onTileError }} />
      {stores.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={icons.get(s.id)!}
          title={s.name}
          zIndexOffset={s.dimmed ? 0 : 500}
          riseOnHover
          ref={(m) => {
            if (m) markers.current.set(s.id, m);
            else markers.current.delete(s.id);
          }}
          eventHandlers={{
            click: () => onSelect(s.id),
            popupclose: () => onDeselect(s.id),
          }}
        >
          <Popup autoPanPadding={[16, 16]} maxWidth={280} minWidth={200}>
            <StorePopupContent store={s} />
          </Popup>
        </Marker>
      ))}
      <Controller stores={stores} markers={markers} viewRequest={viewRequest} focusRequest={focusRequest} />
    </MapContainer>
  );
}
