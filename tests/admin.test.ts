import { describe, it, expect } from 'vitest';
import { isAdmin } from '@/lib/admin';

describe('isAdmin', () => {
  it('is false when no admin key is configured', () => {
    expect(isAdmin('k', undefined)).toBe(false);
    expect(isAdmin('k', '')).toBe(false);
    expect(isAdmin('', '')).toBe(false);
    expect(isAdmin(undefined, undefined)).toBe(false);
  });

  it('compares the cookie with the key', () => {
    expect(isAdmin('wrong', 'secret')).toBe(false);
    expect(isAdmin('secret', 'secret')).toBe(true);
  });

  it('returns false (no throw) for missing or different-length values', () => {
    expect(isAdmin(undefined, 'secret')).toBe(false);
    expect(isAdmin('', 'secret')).toBe(false);
    expect(isAdmin('secret!', 'secret')).toBe(false);
    expect(isAdmin('secre', 'secret')).toBe(false);
  });

  it('compares bytes, so multibyte strings of equal char length do not throw', () => {
    expect(isAdmin('ab', 'é')).toBe(false);
    expect(isAdmin('éé', 'éé')).toBe(true);
  });
});
