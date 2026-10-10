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
import { ko } from '@/lib/i18n/ko';

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

function revalidateAll() {
  revalidatePath('/');
  revalidatePath('/compare');
  revalidatePath('/link-kr');
}

/** "이 상품으로 연결": re-check admin, validate inputs, fetch the live Dailyshot price, upsert, go back to search. */
export async function connectKrAction(_prev: LinkState, fd: FormData): Promise<LinkState> {
  if (!(await adminFromCookie())) return { error: ko.linkKr.sessionExpired };

  const bottleKey = parseBottleParam(str(fd, 'bottle'));
  const productId = parseProductId(fd.get('productId'));
  const nameKo = name(str(fd, 'nameKo'));
  if (!bottleKey || !productId || !nameKo) return { error: ko.linkKr.invalid };

  const db = await getDb();
  // bottleKey comes from the client: it must belong to an existing public listing.
  const bottle = await getBottleSummary(db, bottleKey);
  if (!bottle) return { error: ko.linkKr.invalid };

  let price: DailyshotPrice | null;
  try {
    price = await fetchDailyshotPrice(productId);
  } catch {
    return { error: ko.linkKr.linkFailed };
  }
  if (!price) return { error: ko.linkKr.productGone };

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
    return { error: ko.linkKr.saveFailed };
  }

  revalidateAll();
  // Internal path only: searchHref always starts with "/" and encodes the query.
  redirect(searchHref({ q: returnQuery(str(fd, 'from'), bottle.title) }));
}

/** "연결 해제": re-check admin, validate the bottle, delete the link. Stays on the page. */
export async function unlinkKrAction(_prev: UnlinkState, fd: FormData): Promise<UnlinkState> {
  if (!(await adminFromCookie())) return { error: ko.linkKr.sessionExpired };
  const bottleKey = parseBottleParam(str(fd, 'bottle'));
  if (!bottleKey) return { error: ko.linkKr.invalid };
  try {
    const db = await getDb();
    if (!(await getBottleSummary(db, bottleKey))) return { error: ko.linkKr.invalid };
    await deleteKrLink(db, bottleKey);
  } catch {
    return { error: ko.linkKr.unlinkFailed };
  }
  revalidateAll();
  return { ok: true };
}
