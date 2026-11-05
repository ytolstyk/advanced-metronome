/** In-memory S3 and DynamoDB for the Lambda core tests. */
import type {
  BandItem,
  CopyResult,
  HeadResult,
  MemberItem,
  S3Port,
  DbPort,
  SetListItem,
  SongItem,
  TrackRow,
} from './ports';
import type { StoredObject } from './rules';

export const SUB = 'a1b2c3d4-1111-4111-8111-111111111111';
export const OTHER = 'a1b2c3d4-2222-4222-8222-222222222222';
export const BAND = 'b2c3d4e5-3333-4333-8333-333333333333';
export const SONG = 'c3d4e5f6-4444-4444-8444-444444444444';
export const LIST = 'd4e5f6a7-5555-4555-8555-555555555555';
export const TRACK = 'e5f6a7b8-6666-4666-8666-666666666666';

export const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
export const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // "ID3"
export const HTML = bytes('<!DOCTYPE html><html>');

interface FakeObject {
  body: Uint8Array;
  size: number;
  etag: string;
  contentType: string | undefined;
  track: string | undefined;
  lastModified: number;
}

export class FakeS3 implements S3Port {
  objects = new Map<string, FakeObject>();
  private etags = 0;
  now = 1_000_000;

  put(key: string, body: Uint8Array, options: { contentType?: string; track?: string; size?: number } = {}) {
    this.etags += 1;
    this.objects.set(key, {
      body,
      size: options.size ?? body.length,
      etag: `"etag-${this.etags}"`,
      contentType: options.contentType,
      track: options.track,
      lastModified: this.now,
    });
  }

  async head(key: string): Promise<HeadResult | null> {
    const o = this.objects.get(key);
    return o ? { etag: o.etag, size: o.size, contentType: o.contentType, track: o.track, lastModified: o.lastModified } : null;
  }

  async readStart(key: string, length: number, ifMatch: string) {
    const o = this.objects.get(key);
    return o && o.etag === ifMatch ? o.body.slice(0, length) : null;
  }

  async copy(source: string, destination: string, options: { ifMatch: string; contentType: string }): Promise<CopyResult> {
    const o = this.objects.get(source);
    if (!o) return 'missing';
    if (o.etag !== options.ifMatch) return 'changed';
    this.put(destination, o.body, { contentType: options.contentType, size: o.size });
    return 'ok';
  }

  async remove(key: string) {
    this.objects.delete(key);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, o]) => ({ key, size: o.size, lastModified: o.lastModified }));
  }

  async presignPost(args: { key: string; policy: { fields: Record<string, string> }; expiresSeconds: number }) {
    return { url: `https://bucket.test/${args.expiresSeconds}`, fields: { ...args.policy.fields } };
  }
}

export class FakeDb implements DbPort {
  band: BandItem | null = {
    id: BAND,
    owner: OTHER,
    setListIds: [LIST],
    archivedSetListIds: [],
    bannedSubs: [],
    hiddenSongIds: [],
  };
  members = new Map<string, MemberItem>([[`${BAND}/${SUB}`, { bandId: BAND, owner: SUB }]]);
  setList: SetListItem | null = { id: LIST, bandId: BAND };
  song: SongItem | null = { id: SONG, bandId: BAND, setListId: LIST };
  tracks = new Map<string, TrackRow>();
  onCreate: (() => void) | null = null;
  failReads = false;

  private guard() {
    if (this.failReads) throw new Error('boom');
  }
  async getBand(id: string) {
    this.guard();
    return this.band && this.band.id === id ? this.band : null;
  }
  async getMember(bandId: string, sub: string) {
    this.guard();
    return this.members.get(`${bandId}/${sub}`) ?? null;
  }
  async getSetList(id: string) {
    this.guard();
    return this.setList && this.setList.id === id ? this.setList : null;
  }
  async getSong(id: string) {
    this.guard();
    return this.song && this.song.id === id ? this.song : null;
  }
  async getTrack(id: string) {
    return this.tracks.get(id) ?? null;
  }
  async createTrack(row: TrackRow) {
    if (this.tracks.has(row.id)) return false;
    this.tracks.set(row.id, row);
    this.onCreate?.();
    return true;
  }
  async deleteTrack(id: string, owner: string) {
    if (this.tracks.get(id)?.owner === owner) this.tracks.delete(id);
  }
  async countTracks(by: { songId: string } | { bandId: string }) {
    return (await this.listTracks(by, Number.MAX_SAFE_INTEGER)).length;
  }
  async listTracks(by: { songId: string } | { bandId: string }, max: number) {
    return [...this.tracks.values()]
      .filter((t) => ('songId' in by ? t.songId === by.songId : t.bandId === by.bandId))
      .slice(0, max);
  }
  async updateTrackMeta(id: string, owner: string, patch: { label: string; forTags: string[]; updatedAt: string }) {
    const row = this.tracks.get(id);
    if (!row || row.owner !== owner) return null;
    const next = { ...row, label: patch.label, forTags: patch.forTags, updatedAt: patch.updatedAt };
    this.tracks.set(id, next);
    return next;
  }
}

