import { describe, expect, it } from 'vitest';

/**
 * The public shared-set-list page is the ONE signed-out read path. These checks keep the guest
 * auth mode and the guest-only entry points from spreading into other modules unnoticed.
 */
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const filesUsing = (needle: string): string[] =>
  Object.entries(sources)
    .filter(([, text]) => text.includes(needle))
    .map(([path]) => (path.startsWith('./') ? `api/${path.slice(2)}` : path.replace(/^\.\.\//, '')))
    .sort();

describe('guest read boundary', () => {
  it('names the guest auth mode only in the type and the reader resolver', () => {
    expect(filesUsing('identityPool')).toEqual(['api/bandsShared.ts', 'bandTypes.ts']);
  });

  it('only the public loader calls the guest-only row fetch', () => {
    expect(filesUsing('fetchPublicSetListRows')).toEqual(['api/bandReads.ts', 'api/sharedSetListApi.ts']);
  });

  it('only the public loader resolves a reader', () => {
    expect(filesUsing('resolveReader')).toEqual(['api/bandsShared.ts', 'api/sharedSetListApi.ts']);
  });
});
