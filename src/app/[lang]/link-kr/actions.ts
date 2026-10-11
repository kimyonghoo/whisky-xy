'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isAdmin } from '@/lib/admin';
import { getDb } from '@/lib/db/client';
import { fetchDailyshotPrice, type DailyshotPrice } from '@/lib/dailyshot/client';
import { deleteKrLink, upsertKrLink } from '@/lib/krlinks';
import { getBottleSummary } from '@/lib/krcompare';
import { parseProductId, returnQuery } from '@/lib/kr-view';
import { parseBottleParam } from '@/lib/map-view';
import { safeHttpsUrl } from '@/lib/card';
import { searchHref } from '@/lib/search-view';
import { DEFAULT_LOCALE, LOCALES, dictFor, isLocale, localizePath, type Locale } from '@/lib/i18n';

export type LinkState = { error?: string };
export type UnlinkState = { ok?: boolean; error?: string };

const MAX_NAME = 200;

async function adminFromCookie(): Promise<boolean> {
  const jar = await cookies();
  return isAdmin(jar.get(ADMIN_COOKIE)?.value, process.env.ADMIN_KEY);
}

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
}

function name(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s && s.length <= MAX_NAME ? s : null;
}

/** Root params are unavailable in Server Actions: the form posts a hidden `lang`, whitelisted here. */
function localeOf(fd: FormData): Locale {
  const v = fd.get('lang');
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

function revalidateAll() {
  for (const l of LOCALES) {
    revalidatePath(localizePath(l, '/'));
    revalidatePath(localizePath(l, '/compare'));
    revalidatePath(localizePath(l, '/link-kr'));
  }
}

/** "이 상품으로 연결": re-check admin, validate inputs, fetch the live Dailyshot price, upsert, go back to search. */
export async function connectKrAction(_prev: LinkState, fd: FormData): Promise<LinkState> {
  const locale = localeOf(fd);
  const d = dictFor(locale);
  if (!(await adminFromCookie())) return { error: d.linkKr.sessionExpired };

  const bottleKey = parseBottleParam(str(fd, 'bottle'));
  const productId = parseProductId(fd.get('productId'));
  const nameKo = name(str(fd, 'nameKo'));
  if (!bottleKey || !productId || !nameKo) return { error: d.linkKr.invalid };

  const db = await getDb();
  // bottleKey comes from the client: it must belong to an existing public listing.
  const bottle = await getBottleSummary(db, bottleKey);
  if (!bottle) return { error: d.linkKr.invalid };

  let price: DailyshotPrice | null;
  try {
    price = await fetchDailyshotPrice(productId);
  } catch {
    return { error: d.linkKr.linkFailed };
  }
  if (!price) return { error: d.linkKr.productGone };

  try {
    await upsertKrLink(
      db,
      {
        bottleKey: bottle.bottleKey,
        productId,
        nameKo,
        nameEn: name(str(fd, 'nameEn')),
        imageUrl: safeHttpsUrl(str(fd, 'imageUrl')),
        price,
      },
      new Date(),
    );
  } catch {
    return { error: d.linkKr.saveFailed };
  }

  revalidateAll();
  // Internal path only: searchHref always starts with "/" and encodes the query; the locale is whitelisted.
  redirect(localizePath(locale, searchHref({ q: returnQuery(str(fd, 'from'), bottle.title) })));
}

/** "연결 해제": re-check admin, validate the bottle, delete the link. Stays on the page. */
export async function unlinkKrAction(_prev: UnlinkState, fd: FormData): Promise<UnlinkState> {
  const d = dictFor(localeOf(fd));
  if (!(await adminFromCookie())) return { error: d.linkKr.sessionExpired };
  const bottleKey = parseBottleParam(str(fd, 'bottle'));
  if (!bottleKey) return { error: d.linkKr.invalid };
  try {
    const db = await getDb();
    if (!(await getBottleSummary(db, bottleKey))) return { error: d.linkKr.invalid };
    await deleteKrLink(db, bottleKey);
  } catch {
    return { error: d.linkKr.unlinkFailed };
  }
  revalidateAll();
  return { ok: true };
}
