import { describe, it, expect } from 'vitest';
import { STORES, getStore } from '@/lib/stores';

describe('stores', () => {
  it('has unique ids and complete data', () => {
    expect(new Set(STORES.map((s) => s.id)).size).toBe(STORES.length);
    for (const s of STORES) {
      expect(s.domain).not.toMatch(/^https?:/);
      expect(s.lat).not.toBe(0);
      expect(s.phone).not.toBe('');
    }
  });
  it('flags reliability and online-only', () => {
    expect(getStore('liquorcave')?.stockReliability).toBe('low');
    expect(getStore('coolvines')?.stockReliability).toBe('low');
    expect(getStore('bittersandbottles')?.onlineOnly).toBe(true);
  });
});
