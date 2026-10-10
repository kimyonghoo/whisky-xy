import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottleResult } from '@/components/BottleResult';
import type { BottleGroup, ListingRow } from '@/lib/search';
import type { StockState } from '@/lib/freshness';
import { getStore } from '@/lib/stores';
import { ko } from '@/lib/i18n/ko';

const now = new Date('2026-10-11T12:00:00Z');

function row(id: number, storeId: string, cents: number, stock: StockState, hoursOld: number): ListingRow {
  const store = getStore(storeId)!;
  return {
    id, storeId, store, stock, taxIncludedCents: cents, priceCents: cents, available: stock !== 'soldout',
    title: 'Weller Full Proof', variantTitle: null, checkedAt: new Date(now.getTime() - hoursOld * 3_600_000),
  } as unknown as ListingRow;
}

function group(rows: ListingRow[]): BottleGroup {
  const confirmed = rows.filter((r) => r.stock === 'instock').map((r) => r.taxIncludedCents);
  return {
    bottleKey: 'k', displayTitle: 'Weller Full Proof', sizeMl: 750, proof: null, batch: null, imageUrl: null, rows,
    bestAvailableCents: confirmed.length ? Math.min(...confirmed) : null,
  };
}

const render = (g: BottleGroup) => renderToStaticMarkup(<BottleResult group={g} q="weller" now={now} />);

describe('BottleResult status branches', () => {
  it('ranks only confirmed rows; an unverified row shows "재고 확인 필요" and no rank', () => {
    const html = render(group([row(1, 'dewinespot', 9000, 'instock', 2), row(2, 'winechateau', 5000, 'unverified', 500), row(3, 'grainvine', 9500, 'soldout', 2)]));
    expect(html).toContain(ko.stock.unverified);
    expect(html).toContain(ko.stock.inStock);
    expect(html).toContain(ko.stock.soldOut);
    // one numbered rank (1) and two dashes
    expect(html.match(/>1</g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).not.toMatch(/aria-hidden="true"[^>]*>2</);
    expect(html.match(/>–</g)?.length).toBe(2);
    expect(html).toContain(ko.row.rankBest);
  });

  it('shows "재고 확인 필요" instead of a price when no row is confirmed', () => {
    const html = render(group([row(2, 'winechateau', 5000, 'unverified', 500)]));
    expect(html).toContain(ko.group.noConfirmedStock);
    expect(html).not.toContain(ko.group.lowest);
    expect(html).not.toContain(ko.row.rankBest);
  });

  it('shows the stale badge for old rows and the low-reliability flag for low stores', () => {
    const html = render(group([row(1, 'liquorcave', 9000, 'instock', 30)]));
    expect(html).toContain(ko.stale.warning);
    expect(html).toContain(ko.stock.unreliable);
  });

  it('says all sold out when nothing is available', () => {
    const html = render(group([row(3, 'grainvine', 9500, 'soldout', 2)]));
    expect(html).toContain(ko.group.allSoldOut);
  });
});
