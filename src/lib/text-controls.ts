/**
 * Text from a store (or decoded from its HTML entities, e.g. `&#27;`) with the C0 and C1 control
 * characters and DEL removed, so it can never drive a terminal (ANSI escapes) or break a line.
 * Tab, LF and CR become spaces; every other control is dropped.
 */
export function stripControls(s: string): string {
  return s.replace(/[\t\n\r]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
