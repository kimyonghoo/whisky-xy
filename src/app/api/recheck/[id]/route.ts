import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { recheckListing } from '@/lib/recheck';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const result = await recheckListing(await getDb(), Number(id));
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { listing, status } = result;
  return NextResponse.json({
    status,
    priceCents: listing.priceCents,
    available: listing.available,
    checkedAt: listing.checkedAt.toISOString(),
  });
}
