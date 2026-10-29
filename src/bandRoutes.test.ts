import { describe, expect, it } from 'vitest';
import { availabilityPath, bandPath, rigPath, setListPath, sharedSetListPath } from './bandRoutes';

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

  it('builds the gear and rig path under the band, encoded', () => {
    expect(rigPath('abc-123')).toBe('/bands/abc-123/rig');
    expect(rigPath('../tab-editor')).toBe('/bands/..%2Ftab-editor/rig');
    expect(availabilityPath('abc-123')).toBe('/bands/abc-123/availability');
  });

  it('builds the public shared path from the set list id only (no band id leaks into the URL)', () => {
    expect(sharedSetListPath('sl-1')).toBe('/shared/sl-1');
  });

  it('encodes hostile set list ids in the shared path', () => {
    expect(sharedSetListPath('../bands')).toBe('/shared/..%2Fbands');
    expect(sharedSetListPath('a b?x=1#h')).toBe('/shared/a%20b%3Fx%3D1%23h');
  });
});
