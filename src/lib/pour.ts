/**
 * Navigation progress ("the pour"): the header line and the brand glass fill while the next page
 * loads. State lives on `<html data-pour>` so the server-rendered mark and the line only need CSS
 * (globals.css, "Pour" section); this module only flips that attribute.
 *
 * Under ~150 ms the pour is cancelled silently, so prefetched pages never flash it.
 */
const QUICK_MS = 150;
const DONE_MS = 450;
const SAFETY_MS = 15_000;

let startedAt = 0;
let doneTimer: ReturnType<typeof setTimeout> | undefined;
let safetyTimer: ReturnType<typeof setTimeout> | undefined;

function root(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

export function startPour(): void {
  const el = root();
  if (!el) return;
  clearTimeout(doneTimer);
  clearTimeout(safetyTimer);
  startedAt = Date.now();
  el.dataset.pour = 'filling';
  // A navigation that never commits (offline, aborted) must not leave the glass pouring forever.
  safetyTimer = setTimeout(endPour, SAFETY_MS);
}

export function endPour(): void {
  const el = root();
  if (!el || el.dataset.pour !== 'filling') return;
  clearTimeout(safetyTimer);
  if (Date.now() - startedAt < QUICK_MS) {
    delete el.dataset.pour;
    return;
  }
  el.dataset.pour = 'done';
  doneTimer = setTimeout(() => {
    if (el.dataset.pour === 'done') delete el.dataset.pour;
  }, DONE_MS);
}

/** What a click needs to look like for the pour to start: a plain left click on an in-app link. */
export type ClickInfo = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export type AnchorInfo = {
  href: string;
  target: string;
  download: boolean;
};

/**
 * True when clicking this anchor will make the app router navigate to a different page:
 * same origin, same tab, no modifier keys, and a different path or query (hash-only jumps and
 * links to the current URL don't load anything).
 */
export function isPageNavigation(click: ClickInfo, anchor: AnchorInfo, current: URL): boolean {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.download || (anchor.target !== '' && anchor.target !== '_self')) return false;
  let next: URL;
  try {
    next = new URL(anchor.href, current);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) return false;
  return next.pathname !== current.pathname || next.search !== current.search;
}
