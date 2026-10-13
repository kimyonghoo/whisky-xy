import { describe, it, expect } from 'vitest';
import { stripControls } from '@/lib/text-controls';

describe('stripControls', () => {
  it('drops C0 and C1 controls (and DEL), turning tab, LF and CR into spaces', () => {
    expect(stripControls('a\u001b[31mb\tc\nd\re\u0000f\u007fg\u0085h\u009bi')).toBe('a[31mb c d efghi');
  });

  it('leaves ordinary text, Japanese and symbols alone', () => {
    expect(stripControls('山崎 12年 700ml & ¥27,500 — “x”')).toBe('山崎 12年 700ml & ¥27,500 — “x”');
  });
});
