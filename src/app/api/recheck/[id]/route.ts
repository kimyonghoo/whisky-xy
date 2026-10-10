import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { recheckListing } from '@/lib/recheck';
import { parseCardId } from '@/lib/card';
import { isCrossSiteRequest } from '@/lib/request-origin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // A cross-site page must not be able to make visitors' browsers trigger store requests.
  if (isCrossSiteRequest(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // parseCardId bounds the id to int4, so a 12-digit id is a 400, not a Postgres error.
  const id = parseCardId((await params).id);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const result = await recheckListing(await getDb(), id);
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { listing, status } = result;
  return NextResponse.json({
    status,
    priceCents: listing.priceCents,
    available: listing.available,
    checkedAt: listing.checkedAt.toISOString(),
  });
}
