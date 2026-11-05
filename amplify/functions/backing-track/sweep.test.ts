import { beforeEach, describe, expect, it } from 'vitest';
import { committedKey } from '../../../src/backingTrackFormat';
import { BAND, FakeDb, FakeS3, LIST, MP3, SONG, SUB } from './fakes';
import type { TrackRow } from './ports';
import { sweepOrphans } from './sweep';

const NOW = 1_700_000_000_000;
const OLD = NOW - 60 * 60 * 1000;
let n = 0;
const uuid = () => `f0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

let s3: FakeS3;
let db: FakeDb;
const deps = () => ({ s3, db, now: () => NOW });

/** An object in the bucket; `row` decides whether (and how) a row owns it. */
function put(options: { old?: boolean; row?: 'matching' | 'other-key' | 'none' } = {}) {
  const trackId = uuid();
  const key = committedKey({ sub: SUB, bandId: BAND, songId: SONG, trackId, ext: 'mp3' });
  s3.now = options.old === false ? NOW : OLD;
  s3.put(key, MP3, { contentType: 'audio/mpeg' });
  const kind = options.row ?? 'none';
  if (kind !== 'none') {
    const row: TrackRow = {
      id: trackId, owner: SUB, bandId: BAND, setListId: LIST, songId: SONG, label: 'x', forTags: [],
      key: kind === 'matching' ? key : `${key}.other`, contentType: 'audio/mpeg', bytes: 1, format: 1, createdAt: 'x', updatedAt: 'x',
    };
    db.tracks.set(trackId, row);
  }
  return { key, trackId };
}

beforeEach(() => {
  n = 0;
  s3 = new FakeS3();
  db = new FakeDb();
});

describe('sweepOrphans', () => {
  it('reports orphans in a dry run and deletes nothing', async () => {
    const orphan = put({ row: 'none' });
    const report = await sweepOrphans(deps(), { dryRun: true, limit: 10 });
    expect(report).toEqual({ scanned: 1, orphans: [orphan.key], truncated: false });
    expect(s3.objects.has(orphan.key)).toBe(true);
  });

  it('deletes an old object with no row, and one whose row names a different key', async () => {
    const none = put({ row: 'none' });
    const other = put({ row: 'other-key' });
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 10 });
    expect(report.orphans.sort()).toEqual([none.key, other.key].sort());
    expect(s3.objects.size).toBe(0);
  });

  it('keeps an object a row owns', async () => {
    const live = put({ row: 'matching' });
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 10 });
    expect(report.orphans).toEqual([]);
    expect(s3.objects.has(live.key)).toBe(true);
  });

  it('never touches a recent object (an in-flight commit\'s copy)', async () => {
    const fresh = put({ row: 'none', old: false });
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 10 });
    expect(report.orphans).toEqual([]);
    expect(s3.objects.has(fresh.key)).toBe(true);
  });

  it('leaves keys it cannot parse for a human', async () => {
    s3.now = OLD;
    s3.put('bt/not/a/real/key.mp3', MP3);
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 10 });
    expect(report.orphans).toEqual([]);
    expect(s3.objects.size).toBe(1);
  });

  it('stops at the limit and says so, so the run can be repeated', async () => {
    for (let i = 0; i < 5; i += 1) put({ row: 'none' });
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 2 });
    expect(report.orphans).toHaveLength(2);
    expect(report.truncated).toBe(true);
    expect(s3.objects.size).toBe(3);
  });

  it('skips an object that was re-copied between the listing and the delete', async () => {
    const orphan = put({ row: 'none' });
    const realHead = s3.head.bind(s3);
    s3.head = async (key: string) => {
      if (key === orphan.key) s3.objects.get(key)!.lastModified = NOW; // a retried commit copied it again
      return realHead(key);
    };
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 10 });
    expect(report.orphans).toEqual([]);
    expect(s3.objects.has(orphan.key)).toBe(true);
  });

  it('skips an object whose row appeared between the first check and the delete', async () => {
    const orphan = put({ row: 'none' });
    const realHead = s3.head.bind(s3);
    s3.head = async (key: string) => {
      const head = await realHead(key);
      // The commit's row lands right after the object is checked.
      db.tracks.set(orphan.trackId, {
        id: orphan.trackId, owner: SUB, bandId: BAND, setListId: LIST, songId: SONG, label: 'x', forTags: [],
        key: orphan.key, contentType: 'audio/mpeg', bytes: 1, format: 1, createdAt: 'x', updatedAt: 'x',
      });
      return head;
    };
    const report = await sweepOrphans(deps(), { dryRun: false, limit: 10 });
    expect(report.orphans).toEqual([]);
    expect(s3.objects.has(orphan.key)).toBe(true);
  });
});
