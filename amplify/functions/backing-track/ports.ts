/**
 * The handler core talks to AWS only through these two small, app-shaped interfaces, so Vitest can
 * drive every race and error branch with in-memory fakes. `adapters.ts` implements them with the SDK.
 */
import type { Schema } from '../../data/resource';
import type { UploadPolicy, StoredObject } from './rules';

export interface HeadResult {
  etag: string;
  size: number;
  contentType: string | undefined;
  /** `x-amz-meta-track` (S3 lower-cases metadata names). */
  track: string | undefined;
  /** Epoch milliseconds. */
  lastModified: number;
}

export type CopyResult = 'ok' | 'missing' | 'changed';

export interface S3Port {
  /** null when the object does not exist. */
  head(key: string): Promise<HeadResult | null>;
  /** The first `length` bytes, pinned to `ifMatch` (an ETag). null when the object is gone or changed. */
  readStart(key: string, length: number, ifMatch: string): Promise<Uint8Array | null>;
  /** Copy pinned to the source ETag; replaces metadata and sets the canonical content type. */
  copy(source: string, destination: string, options: { ifMatch: string; contentType: string }): Promise<CopyResult>;
  /** Deleting a missing object succeeds. */
  remove(key: string): Promise<void>;
  /** Every object under `prefix` (follows pagination). */
  list(prefix: string): Promise<StoredObject[]>;
  presignPost(args: {
    key: string;
    policy: UploadPolicy;
    expiresSeconds: number;
  }): Promise<{ url: string; fields: Record<string, string> }>;
}

// The Lambda reads these four tables straight from DynamoDB, so it depends on their attribute NAMES. The
// shapes are derived from the schema (a type-only import, erased from the bundle): renaming or retyping a
// field there fails `npm run typecheck:amplify` here, instead of making a check such as the ban list read
// `undefined` and quietly stop working. Arrays and strings may also be absent or null in old rows.
type Row<K extends keyof Schema> = Schema[K]['type'];
type Loosely<T> = { [K in keyof T]?: T[K] | null | undefined };

/** `owner` is server-populated on Band/Song (undeclared in the model, so absent from its type). */
export type BandItem = Pick<Row<'Band'>, 'id'> &
  Loosely<Pick<Row<'Band'>, 'deletedAt' | 'setListIds' | 'archivedSetListIds' | 'bannedSubs' | 'hiddenSongIds'>> & {
    owner?: string;
  };
export type MemberItem = Pick<Row<'Member'>, 'bandId' | 'owner'>;
export type SetListItem = Pick<Row<'SetList'>, 'id' | 'bandId'> & Loosely<Pick<Row<'SetList'>, 'archivedAt'>>;
export type SongItem = Pick<Row<'Song'>, 'id' | 'bandId' | 'setListId'> & { owner?: string };

/** A `BackingTrack` row exactly as the Lambda writes it. */
export interface TrackRow {
  id: string;
  owner: string;
  bandId: string;
  setListId: string;
  songId: string;
  label: string;
  forTags: string[];
  key: string;
  contentType: string;
  bytes: number;
  format: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbPort {
  /** Every read is strongly consistent. */
  getBand(id: string): Promise<BandItem | null>;
  getMember(bandId: string, sub: string): Promise<MemberItem | null>;
  getSetList(id: string): Promise<SetListItem | null>;
  getSong(id: string): Promise<SongItem | null>;
  getTrack(id: string): Promise<TrackRow | null>;
  /** Conditional create (`attribute_not_exists(id)`): false when a row with this id already exists. */
  createTrack(row: TrackRow): Promise<boolean>;
  /** Deletes the row only if `owner` matches. */
  deleteTrack(id: string, owner: string): Promise<void>;
  /** Rows on the songId / bandId index (eventually consistent), counted. */
  countTracks(by: { songId: string } | { bandId: string }): Promise<number>;
  /** Rows on the songId / bandId index (eventually consistent), at most `max`. */
  listTracks(by: { songId: string } | { bandId: string }, max: number): Promise<TrackRow[]>;
  /** Changes label and tags of the owner's own row; null when the row is gone or not theirs. */
  updateTrackMeta(
    id: string,
    owner: string,
    patch: { label: string; forTags: string[]; updatedAt: string },
  ): Promise<TrackRow | null>;
}

export interface Deps {
  s3: S3Port;
  db: DbPort;
  /** Epoch milliseconds. */
  now: () => number;
  random: () => number;
  newId: () => string;
  /** `BACKING_TRACKS_ENABLED`: blocks request and commit only. */
  enabled: boolean;
}
