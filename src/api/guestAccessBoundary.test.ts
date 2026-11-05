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

  it('band click tracks are signed-in only: no guest-capable module reads them', () => {
    // The model, the metadata read and the payload API are used by the signed-in paths below and
    // never by the public loader; a click track on the shared page would need a guest rule first.
    expect(filesUsing('models.SongClickTrack')).toEqual(['api/bandReads.ts', 'api/songTracksApi.ts']);
    expect(filesUsing('listSongTrackMeta')).toEqual(['api/bandReads.ts', 'api/setListsApi.ts']);
    expect(filesUsing('songTracksApi')).toEqual(['api/setListsApi.ts', 'components/ClickTrack/SaveToBandDialog.tsx', 'hooks/useSongTracks.ts']);
  });

  it('backing tracks are signed-in only: the public loader and its row fetch never touch them', () => {
    // No guest rule exists on the model; this keeps a later edit from wiring tracks (or their signed audio links) into the public page.
    // The model is read in exactly one module (the set list read and the per-song probe both live there).
    expect(filesUsing('models.BackingTrack')).toEqual(['api/bandReads.ts']);
    expect(filesUsing('listBackingTracks')).toEqual(['api/bandReads.ts', 'api/setListsApi.ts']);
    expect(filesUsing('ackingTrack')).not.toContain('api/sharedSetListApi.ts');
    const reads = Object.entries(sources).find(([path]) => path.endsWith('/bandReads.ts'))?.[1] ?? '';
    const publicFetch = reads.slice(reads.indexOf('export async function fetchPublicSetListRows'));
    expect(publicFetch.length).toBeGreaterThan(0);
    expect(publicFetch).not.toMatch(/backingTracks|BackingTrack/);
  });
});
