import { describe, it, expect } from 'vitest';
import { freshness } from '@/lib/freshness';

describe('freshness', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('labels and flags stale', () => {
    expect(freshness(new Date('2026-10-10T11:59:30Z'), now)).toEqual({ stale: false, label: '방금 확인' });
    expect(freshness(new Date('2026-10-10T11:15:00Z'), now)).toEqual({ stale: false, label: '45분 전 확인' });
    expect(freshness(new Date('2026-10-10T09:00:00Z'), now)).toEqual({ stale: false, label: '3시간 전 확인' });
    expect(freshness(new Date('2026-10-08T12:00:00Z'), now)).toEqual({ stale: true, label: '2일 전 확인' });
  });
});
