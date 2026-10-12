'use client';

import { useId, useLayoutEffect, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check } from 'lucide-react';
import {
  CASKS, DEFAULT_CASK, DEFAULT_THEME, THEME_COLOR, THEME_MODES, caskCookieFor, isCask, isThemeMode, readThemePrefs, themeCookieFor,
  type Cask, type ThemeMode,
} from '@/lib/theme';
import { useDict } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** Drop colours per cask (Tailwind needs whole class names; the values are tokens in globals.css). */
const SWATCH: Record<Cask, string> = {
  bourbon: 'bg-cask-bourbon',
  oloroso: 'bg-cask-oloroso',
  madeira: 'bg-cask-madeira',
  px: 'bg-cask-px',
  port: 'bg-cask-port',
};

/** Puts the choice on `<html>` (CSS follows at once), remembers it, and recolours the browser chrome. */
function applyPrefs(theme: ThemeMode, cask: Cask) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.cask = cask;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', THEME_COLOR[theme]);
}

/** The brand's rocks glass, simplified for 20px: rim, body, base and whisky in the current accent. */
function GlassIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      <path d="M7.2 15Q16 16.5 24.8 15L24 26Q16 27.6 8 26Z" className="fill-primary" stroke="none" />
      <ellipse cx="16" cy="7" rx="10" ry="1.6" />
      <path d="M6 7 8 26Q16 27.6 24 26L26 7" />
      <path d="M7.2 15Q16 16.5 24.8 15" className="stroke-primary" />
    </svg>
  );
}

/** Up/Down/Home/End move focus between the cask buttons (Tab still works too). */
function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-cask-option]')];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  e.preventDefault();
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
  items[next].focus();
}

const headingClass = 'mb-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase';

/**
 * The open menu's body: the mode switch, then the five casks. Exported so it can be rendered on its
 * own in tests (a closed popover renders nothing on the server).
 */
export function ThemeMenuContent({
  theme,
  cask,
  onTheme,
  onCask,
}: {
  theme: ThemeMode;
  cask: Cask;
  onTheme: (t: ThemeMode) => void;
  onCask: (c: Cask) => void;
}) {
  const d = useDict();
  const id = useId();
  return (
    <div className="flex flex-col gap-4 p-4">
      <section>
        <h3 id={`${id}-mode`} className={headingClass}>
          {d.theme.mode}
        </h3>
        <div role="group" aria-labelledby={`${id}-mode`} className="grid grid-cols-2 overflow-hidden rounded-md border border-border-strong">
          {THEME_MODES.map((t) => {
            const on = t === theme;
            return (
              <button
                key={t}
                type="button"
                data-theme-mode={t}
                aria-pressed={on}
                onClick={() => onTheme(t)}
                className={cn(
                  'min-h-9 px-3 text-sm transition-colors outline-offset-[-3px] pointer-coarse:min-h-11',
                  on ? 'bg-primary-soft font-semibold text-primary shadow-[inset_0_-2px_0_var(--primary)]' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {d.theme.modes[t]}
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h3 id={`${id}-cask`} className={headingClass}>
          {d.theme.cask}
        </h3>
        <ul aria-labelledby={`${id}-cask`} className="flex flex-col gap-0.5" onKeyDown={onListKeyDown}>
          {CASKS.map((c) => {
            const on = c === cask;
            const name = d.theme.casks[c];
            return (
              <li key={c}>
                <button
                  type="button"
                  data-cask-option={c}
                  aria-pressed={on}
                  onClick={() => onCask(c)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors outline-offset-[-3px] hover:bg-muted',
                    on && 'bg-primary-soft hover:bg-primary-soft',
                  )}
                >
                  {/* A drop of the cask's colour; the hairline keeps the darkest drops visible on dark surfaces. */}
                  <span
                    aria-hidden
                    className={cn('size-5.5 shrink-0 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] ring-1 ring-foreground/15 ring-inset', SWATCH[c])}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-foreground">{name.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {name.en !== name.name && (
                        <>
                          <span lang="en">{name.en}</span>
                          {' · '}
                        </>
                      )}
                      {name.sub}
                    </span>
                  </span>
                  <Check aria-hidden className={cn('ml-auto size-4 shrink-0 text-primary', !on && 'invisible')} strokeWidth={2.5} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/**
 * Header display menu: a small glass filled with the current accent. Opens mode (light/dark) and
 * whisky colour. A pick applies at once (on `<html>`) and is remembered in a cookie; no reload.
 */
export function ThemeMenu() {
  const d = useDict();
  const [open, setOpen] = useState(false);
  // Server and first client render use the defaults; the real values are read when the menu opens.
  const [prefs, setPrefs] = useState<{ theme: ThemeMode; cask: Cask }>({ theme: DEFAULT_THEME, cask: DEFAULT_CASK });

  // The inline script sets <html data-theme data-cask> before paint. In development, Strict Mode's
  // remount resets <html> to its JSX attributes, so re-apply the stored choice. This also recolours
  // a theme-color meta that hydration added after the script ran.
  useLayoutEffect(() => {
    const stored = readThemePrefs(document.cookie);
    applyPrefs(stored.theme, stored.cask);
  }, []);

  function onOpenChange(next: boolean) {
    // <html> is the source of truth (it is what the page shows, even if cookies are blocked).
    if (next) {
      const { theme, cask } = document.documentElement.dataset;
      setPrefs({ theme: isThemeMode(theme) ? theme : DEFAULT_THEME, cask: isCask(cask) ? cask : DEFAULT_CASK });
    }
    setOpen(next);
  }

  function pickTheme(theme: ThemeMode) {
    document.cookie = themeCookieFor(theme);
    applyPrefs(theme, prefs.cask);
    setPrefs({ ...prefs, theme });
  }

  function pickCask(cask: Cask) {
    document.cookie = caskCookieFor(cask);
    applyPrefs(prefs.theme, cask);
    setPrefs({ ...prefs, cask });
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        aria-label={d.theme.label}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border-strong text-foreground transition-colors hover:border-primary/60 hover:bg-muted data-popup-open:border-primary/60 data-popup-open:bg-muted pointer-coarse:size-11"
      >
        <GlassIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className="w-[min(19rem,calc(100vw-1.5rem))] origin-(--transform-origin) rounded-md border border-border-strong bg-popover text-popover-foreground shadow-overlay transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Popover.Title className="sr-only">{d.theme.label}</Popover.Title>
            <ThemeMenuContent theme={prefs.theme} cask={prefs.cask} onTheme={pickTheme} onCask={pickCask} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
