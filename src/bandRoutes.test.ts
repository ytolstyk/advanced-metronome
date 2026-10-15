import { describe, expect, it } from 'vitest';
import { bandPath, setListPath } from './bandRoutes';

describe('bandRoutes', () => {
  it('builds plain paths for normal ids', () => {
    expect(bandPath('abc-123')).toBe('/bands/abc-123');
    expect(setListPath('abc-123', 'sl-1')).toBe('/bands/abc-123/setlists/sl-1');
  });

  it('encodes hostile ids so a row can never redirect to another route', () => {
    expect(bandPath('../tab-editor')).toBe('/bands/..%2Ftab-editor');
    expect(bandPath('x?join=ABC#frag')).toBe('/bands/x%3Fjoin%3DABC%23frag');
    expect(setListPath('b', 'a/b')).toBe('/bands/b/setlists/a%2Fb');
  });
});
