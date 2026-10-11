'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  ADMIN_COOKIE,
  LEGACY_ADMIN_COOKIE,
  WRONG_KEY_DELAY_MS,
  adminCookieOptions,
  checkAdminKey,
  createAdminSession,
  expiredCookieOptions,
  isAdmin,
} from '@/lib/admin';
import { getDb } from '@/lib/db/client';
import { createWatch, deleteWatch, parseWatchForm, parseWatchId, type WatchField } from '@/lib/watches';
import { DEFAULT_LOCALE, LOCALES, dictFor, isLocale, localizePath, type Dict } from '@/lib/i18n';

export type LoginState = { error?: string };

export type CreateState = {
  /** Increments on every result so the client can tell submissions apart. */
  seq: number;
  ok?: boolean;
  message?: string;
  error?: string;
  field?: WatchField;
  /** Submitted raw values, echoed back on error so nothing the user typed is lost. */
  values?: Record<string, string | string[]>;
};

export type DeleteState = { ok?: boolean; error?: string };

const PATH = '/watchlist';

/** Root params are unavailable in Server Actions: forms post a hidden `lang`, whitelisted here. */
function dictOf(fd: FormData): Dict {
  const v = fd.get('lang');
  return dictFor(isLocale(v) ? v : DEFAULT_LOCALE);
}

function revalidateWatchlist() {
  for (const l of LOCALES) revalidatePath(localizePath(l, PATH));
}

async function adminFromCookie(): Promise<boolean> {
  const jar = await cookies();
  return isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY);
}

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const d = dictOf(fd);
  const key = fd.get('key');
  if (typeof key !== 'string' || key.length === 0) return { error: d.watch.gate.emptyKey };
  // Same message whether the key is wrong, too short, or ADMIN_KEY is unset: don't reveal configuration.
  const session = checkAdminKey(key, process.env.ADMIN_KEY) ? createAdminSession(process.env.ADMIN_KEY) : null;
  if (!session) {
    // Fixed delay on every wrong key slows guessing to a crawl.
    await new Promise((r) => setTimeout(r, WRONG_KEY_DELAY_MS));
    return { error: d.watch.gate.wrongKey };
  }
  const jar = await cookies();
  // The cookie holds a signed, expiring session, never the key itself.
  jar.set(ADMIN_COOKIE, session, adminCookieOptions());
  jar.set(LEGACY_ADMIN_COOKIE, '', expiredCookieOptions());
  revalidateWatchlist();
  return {};
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, '', expiredCookieOptions());
  jar.set(LEGACY_ADMIN_COOKIE, '', expiredCookieOptions());
  revalidateWatchlist();
}

function rawValues(fd: FormData): Record<string, string | string[]> {
  const get = (k: string) => {
    const v = fd.get(k);
    return typeof v === 'string' ? v.slice(0, 500) : '';
  };
  return {
    label: get('label'),
    include: get('include'),
    exclude: get('exclude'),
    batch: get('batch'),
    sizeMl: get('sizeMl'),
    maxPrice: get('maxPrice'),
    cities: fd.getAll('cities').filter((v): v is string => typeof v === 'string'),
  };
}

export async function createWatchAction(prev: CreateState, fd: FormData): Promise<CreateState> {
  const d = dictOf(fd);
  const seq = (prev?.seq ?? 0) + 1;
  if (!(await adminFromCookie())) return { seq, error: d.watch.sessionExpired, values: rawValues(fd) };
  const parsed = parseWatchForm(fd, d);
  if ('error' in parsed) return { seq, error: parsed.error, field: parsed.field, values: rawValues(fd) };
  try {
    await createWatch(await getDb(), parsed);
  } catch {
    return { seq, error: d.watch.saveFailed, values: rawValues(fd) };
  }
  revalidateWatchlist();
  return { seq, ok: true, message: d.watch.created(parsed.label) };
}

export async function deleteWatchAction(_prev: DeleteState, fd: FormData): Promise<DeleteState> {
  const d = dictOf(fd);
  if (!(await adminFromCookie())) return { error: d.watch.sessionExpired };
  const id = parseWatchId(fd.get('id'));
  if (id === null) return { error: d.watch.deleteFailed };
  try {
    // Already gone (e.g. deleted in another tab) counts as done: the list refreshes either way.
    await deleteWatch(await getDb(), id);
    revalidateWatchlist();
    return { ok: true };
  } catch {
    return { error: d.watch.deleteFailed };
  }
}
