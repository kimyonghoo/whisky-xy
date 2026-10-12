'use client';

import { useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startPour } from '@/lib/pour';
import { Popover } from '@base-ui/react/popover';
import { Tabs } from '@base-ui/react/tabs';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTRIES, CITIES, citiesOf, getCity, isCityId, storesIn, type City, type CityId, type CountryId } from '@/lib/geo';
import { cityCookieFor, withCity } from '@/lib/city-cookie';
import type { Dict } from '@/lib/i18n';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** Store counts per city, fixed at build time (the store list is static data). */
const STORE_COUNT = Object.fromEntries(CITIES.map((c) => [c.id, storesIn(c.id).length])) as Record<CityId, number>;

// Desktop: a hairline box beside the nav. Below `lg` it sits in the header's second row, where a box
// between the header lines looked boxed-in, so it is plain text there (dot, name, chevron) that turns gold.
const triggerClass =
  'group/city inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-border-strong px-3 text-[0.8125rem] font-medium whitespace-nowrap text-foreground transition-colors hover:border-primary/50 hover:bg-muted data-popup-open:border-primary/60 data-popup-open:bg-muted pointer-coarse:min-h-11 max-lg:-ml-1 max-lg:border-transparent max-lg:px-1 max-lg:hover:border-transparent max-lg:hover:bg-transparent max-lg:hover:text-primary max-lg:data-popup-open:border-transparent max-lg:data-popup-open:bg-transparent max-lg:data-popup-open:text-primary';

function TriggerFace({ city, d }: { city: City; d: Dict }) {
  return (
    <>
      <span className="sr-only">{d.citySelect.label}, </span>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="truncate">{d.citySelect.current(d.country[city.country], d.city[city.id])}</span>
      <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-popup-open/city:rotate-180" />
    </>
  );
}

/**
 * The small English line under a city name in the menu ("New York", "California"), or null when it
 * would only repeat what is already shown: the city's own name, or its country (Tokyo · Japan).
 */
export function citySubLabel(city: City, d: Dict): string | null {
  const sub = city.subEn.trim();
  if (!sub) return null;
  const same = (a: string) => a.trim().toLowerCase() === sub.toLowerCase();
  if (same(d.city[city.id]) || same(d.countryEn[city.country]) || same(d.country[city.country])) return null;
  return sub;
}

/** Up/Down/Home/End move focus between the city buttons of one list (Tab still works too). */
function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-city]')];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  if (items.length === 0) return;
  e.preventDefault();
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
  items[next].focus();
}

/**
 * The open selector's body: countries on the left (a vertical tab list), the chosen country's
 * cities on the right with store counts. Exported so it can be rendered on its own in tests.
 */
export function CityMenuContent({ current, onPick }: { current: CityId; onPick: (id: CityId) => void }) {
  const d = useDict();
  const [country, setCountry] = useState<CountryId>(getCity(current)?.country ?? 'us');
  return (
    <Tabs.Root
      value={country}
      onValueChange={(v) => setCountry(v as CountryId)}
      orientation="vertical"
      className="grid grid-cols-[minmax(6.5rem,8.5rem)_1fr]"
    >
      <Tabs.List activateOnFocus aria-label={d.citySelect.countryLabel} className="flex flex-col border-r py-2">
        {COUNTRIES.map((id) => {
          const live = citiesOf(id).some((c) => c.status === 'live');
          return (
            <Tabs.Tab
              key={id}
              value={id}
              className="flex min-h-11 flex-col items-start justify-center border-l-2 border-transparent px-4 py-2 text-left text-sm text-muted-foreground transition-colors outline-offset-[-3px] hover:text-foreground data-active:border-primary data-active:bg-primary-soft data-active:text-foreground"
            >
              {d.country[id]}
              {!live && <span className="text-[0.6875rem] text-faint">{d.citySelect.soon}</span>}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
      {COUNTRIES.map((id) => (
        // keepMounted: every city is in the DOM (hidden), so the full list is server-renderable.
        <Tabs.Panel key={id} value={id} keepMounted className="p-2 outline-offset-[-3px]">
          <ul className="flex flex-col gap-0.5" onKeyDown={onListKeyDown}>
            {citiesOf(id).map((c) => {
              const on = c.id === current;
              const sub = citySubLabel(c, d);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    data-city={c.id}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => onPick(c.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors outline-offset-[-3px] hover:bg-muted',
                      on && 'bg-primary-soft hover:bg-primary-soft',
                    )}
                  >
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <span className={cn('font-medium', c.status === 'soon' && !on ? 'text-muted-foreground' : 'text-foreground')}>{d.city[c.id]}</span>
                      {sub && (
                        <span lang="en" className="text-xs text-faint">
                          {sub}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs tabular">
                      {on && <Check aria-hidden className="size-3.5 text-primary" strokeWidth={2.5} />}
                      {c.status === 'soon' ? (
                        <span className="text-faint">{d.citySelect.soon}</span>
                      ) : (
                        <span className={on ? 'text-primary' : 'text-muted-foreground'}>{d.citySelect.storesCount(STORE_COUNT[c.id])}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

/** Non-interactive stand-in while the request-time city is unknown (same footprint as the trigger). */
export function CitySelectFallback() {
  const d = useDict();
  return (
    <span aria-hidden className={cn(triggerClass, 'text-muted-foreground')}>
      <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
      {d.citySelect.label}
    </span>
  );
}

/**
 * Header city selector: `● 미국 · 브루클린 ▾`. A valid `?city=` wins over the cookie city the
 * server passed in. Picking a live city remembers it (cookie); a coming-soon city is only put in
 * the URL. Either way the current page reloads with `?city=` set and its other params kept.
 */
export function CitySelect({ initial }: { initial: CityId }) {
  const d = useDict();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  // The layout (and its cookie read) is not re-rendered on client navigation, so the last live
  // pick is tracked here for pages without `?city=`.
  const [remembered, setRemembered] = useState<CityId>(initial);
  const popupRef = useRef<HTMLDivElement>(null);

  const urlCity = params.get('city');
  const current = getCity(isCityId(urlCity) ? urlCity : remembered)!;

  function pick(id: CityId) {
    setOpen(false);
    const city = getCity(id)!;
    const cookie = cityCookieFor(city);
    if (cookie) {
      document.cookie = cookie;
      setRemembered(id);
    }
    if (id === current.id) return;
    const query = params.toString();
    startPour();
    router.push(withCity(`${pathname}${query ? `?${query}` : ''}`, id));
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger data-city-trigger className={triggerClass}>
        <TriggerFace city={current} d={d} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup
            ref={popupRef}
            // Keyboard and mouse open on the current city; touch keeps the default (the popup itself).
            initialFocus={(type) => (type === 'touch' ? true : (popupRef.current?.querySelector<HTMLElement>('button[aria-current="true"]') ?? true))}
            className="w-[min(25rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-hidden rounded-md border border-border-strong bg-popover text-popover-foreground shadow-overlay transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
          >
            <Popover.Title className="sr-only">{d.citySelect.label}</Popover.Title>
            <CityMenuContent current={current.id} onPick={pick} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
