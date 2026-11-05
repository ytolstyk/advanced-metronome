/**
 * Request and commit for backing tracks (edit, remove, leave and purge live in `manage.ts`).
 *
 * `commitTrack` is a pipeline: validate -> replay? -> verify the pending upload -> authorize -> caps ->
 * copy and create the row -> revalidate. See CLAUDE.md "Backing tracks / Flow" for why each step is where
 * it is. Error rule: only a DEFINITE answer deletes anything; a read that merely failed is `retry`.
 */
import {
  BACKING_TRACK_FORMAT,
  BACKING_TRACK_LIMITS,
  type AudioExt,
  type BackingTrackErrorCode,
  areValidTags,
  committedKey,
  contentTypeForExt,
  extForContentType,
  isSlot,
  isUuid,
  pendingKey,
  sanitizeLabel,
  userPrefix,
} from '../../../src/backingTrackFormat';
import type { Deps, HeadResult, TrackRow } from './ports';
import { reconcileUser } from './reconcile';
import {
  BackingTrackError,
  MAGIC_BYTES,
  buildUploadPolicy,
  matchesAudioMagic,
  parseUploadRequest,
  pickSlot,
  userUsage,
  wouldExceedQuota,
} from './rules';

export interface UploadTicket {
  trackId: string;
  slot: number;
  url: string;
  fields: Record<string, string>;
}

/**
 * Per-user quota from S3 (strongly consistent). When it looks exceeded, the user's own orphans are
 * cleared first and it is counted again, so leftovers of failed commits never lock someone out.
 */
async function hasRoomFor(deps: Deps, sub: string, incomingBytes: number, excludeKey?: string): Promise<boolean> {
  const count = async () => userUsage(await deps.s3.list(userPrefix(sub)), excludeKey);
  if (!wouldExceedQuota(await count(), incomingBytes)) return true;
  if ((await reconcileUser(deps, sub)) === 0) return false;
  return !wouldExceedQuota(await count(), incomingBytes);
}

function assertEnabled(deps: Deps): void {
  if (!deps.enabled) throw new BackingTrackError('uploads-disabled');
}

/** `requestBackingTrackUpload`: a short-lived signed form for one of the caller's 3 pending slots. */
export async function requestUpload(
  deps: Deps,
  sub: string,
  args: { ext?: unknown; bytes?: unknown },
): Promise<UploadTicket> {
  assertEnabled(deps);
  const request = parseUploadRequest(args);
  if (!(await hasRoomFor(deps, sub, request.bytes))) throw new BackingTrackError('over-quota');

  const trackId = deps.newId();
  const slot = pickSlot(deps.random);
  const key = pendingKey(sub, slot);
  const policy = buildUploadPolicy({ key, contentType: request.contentType, trackId, bytes: request.bytes });
  const signed = await deps.s3.presignPost({
    key,
    policy,
    expiresSeconds: BACKING_TRACK_LIMITS.uploadWindowSeconds,
  });
  return { trackId, slot, url: signed.url, fields: signed.fields };
}

export interface CommitArgs {
  trackId?: unknown;
  bandId?: unknown;
  songId?: unknown;
  slot?: unknown;
  label?: unknown;
  tags?: unknown;
}

interface CommitInput {
  trackId: string;
  bandId: string;
  songId: string;
  slot: number;
  label: string;
  tags: string[];
}

function parseCommit(args: CommitArgs): CommitInput {
  const { trackId, bandId, songId, slot, label, tags } = args;
  if (!isUuid(trackId) || !isUuid(bandId) || !isUuid(songId) || !isSlot(slot)) {
    throw new BackingTrackError('bad-input');
  }
  if (typeof label !== 'string') throw new BackingTrackError('bad-input');
  const clean = sanitizeLabel(label);
  if (!clean) throw new BackingTrackError('bad-input');
  const tagList = tags ?? [];
  if (!areValidTags(tagList)) throw new BackingTrackError('bad-input');
  return { trackId, bandId, songId, slot, label: clean, tags: tagList };
}

/** `attach`: a NEW track may only go on a visible song of a live set list. `recheck`: is the finished upload still allowed to exist? */
type AuthorizeMode = 'attach' | 'recheck';

/**
 * The authorization chain. It proves only that the caller knows the ids (Member, Song and SetList
 * rows are self-written), so it is product validation, not abuse control; the structural caps are.
 * Returns the song's set list. Every read is strongly consistent. A song being hidden or its list
 * archived stops NEW attachments but never destroys a finished upload (hence `recheck` skips those).
 */
async function authorize(deps: Deps, sub: string, bandId: string, songId: string, mode: AuthorizeMode): Promise<string> {
  const band = await deps.db.getBand(bandId);
  if (!band || band.deletedAt) throw new BackingTrackError('not-found');
  if (band.bannedSubs?.includes(sub)) throw new BackingTrackError('banned');
  // Independent of each other: fetch together, judge in the same order as before.
  const [member, song] = await Promise.all([deps.db.getMember(bandId, sub), deps.db.getSong(songId)]);
  if (!member) throw new BackingTrackError('not-member');
  if (!song || song.bandId !== bandId) throw new BackingTrackError('not-found');
  if (mode === 'recheck') return song.setListId;

  const { setListId } = song;
  if (band.hiddenSongIds?.includes(songId)) throw new BackingTrackError('not-found');
  if (!band.setListIds?.includes(setListId) || band.archivedSetListIds?.includes(setListId)) {
    throw new BackingTrackError('not-found');
  }
  const setList = await deps.db.getSetList(setListId);
  if (!setList || setList.bandId !== bandId || setList.archivedAt) throw new BackingTrackError('not-found');
  return setListId;
}

/** The only answers of `authorize('recheck')` that mean "this upload may not exist". Anything else (a failed read) is not a verdict. */
const DEFINITE_DENIALS: ReadonlySet<BackingTrackErrorCode> = new Set<BackingTrackErrorCode>(['not-found', 'banned', 'not-member']);

/**
 * Re-runs the chain after a row exists. A DEFINITE answer (banned, left, song or band gone) removes the
 * track. A read that merely failed (throttle, timeout, 5xx) removes nothing and asks the client to retry:
 * deleting a good upload because a read blipped would lose the file with nothing left to retry from, while
 * the row can stay briefly (readers already hide banned and departed owners) and the retry revalidates.
 */
async function revalidate(deps: Deps, row: TrackRow): Promise<void> {
  try {
    await authorize(deps, row.owner, row.bandId, row.songId, 'recheck');
  } catch (error) {
    if (!(error instanceof BackingTrackError) || !DEFINITE_DENIALS.has(error.code)) throw new BackingTrackError('retry');
    await deps.s3.remove(row.key);
    await deps.db.deleteTrack(row.id, row.owner);
    throw new BackingTrackError('gone');
  }
}

function sameTrack(row: TrackRow, sub: string, input: CommitInput): boolean {
  return row.owner === sub && row.bandId === input.bandId && row.songId === input.songId;
}

/** Deletes the pending object, but only if it is the upload this commit is about (a newer upload may share the slot). */
async function removePendingIfMine(deps: Deps, key: string, trackId: string): Promise<void> {
  const head = await deps.s3.head(key);
  if (head?.track === trackId) await deps.s3.remove(key);
}

/** A row already exists for this `trackId`, so this is a replay (retry, double click, lost response). */
async function replay(deps: Deps, sub: string, input: CommitInput, row: TrackRow): Promise<TrackRow> {
  if (!sameTrack(row, sub, input)) throw new BackingTrackError('conflict');
  await revalidate(deps, row);

  const pending = pendingKey(sub, input.slot);
  if (!(await deps.s3.head(row.key))) {
    // The row survived but its object did not: restore it from the pending upload if that is still ours.
    const head = await deps.s3.head(pending);
    const restored =
      head?.track === input.trackId &&
      (await deps.s3.copy(pending, row.key, { ifMatch: head.etag, contentType: row.contentType })) === 'ok';
    if (!restored) {
      await deps.db.deleteTrack(row.id, row.owner);
      throw new BackingTrackError('not-found');
    }
  }
  await removePendingIfMine(deps, pending, input.trackId);
  return row;
}

/**
 * Another request for this trackId may have finished while we were looking (a double click): if its row is
 * there, answer as a replay; otherwise `null` and the caller decides which error fits.
 */
async function replayIfFinished(deps: Deps, sub: string, input: CommitInput): Promise<TrackRow | null> {
  const row = await deps.db.getTrack(input.trackId);
  return row ? replay(deps, sub, input, row) : null;
}

type PendingCheck = { kind: 'verified'; head: HeadResult; ext: AudioExt } | { kind: 'replayed'; row: TrackRow };

/** The pending upload must be the one this request issued, of a known type and size, and start like audio. */
async function verifyPendingUpload(deps: Deps, sub: string, input: CommitInput): Promise<PendingCheck> {
  const pending = pendingKey(sub, input.slot);
  const head = await deps.s3.head(pending);
  if (!head) {
    const row = await replayIfFinished(deps, sub, input);
    if (row) return { kind: 'replayed', row };
    throw new BackingTrackError('not-found');
  }
  // Another upload owns the slot now: never delete it, it is not ours.
  if (head.track !== input.trackId) throw new BackingTrackError('replaced');

  const ext = extForContentType(head.contentType);
  if (!ext || head.size < 1 || head.size > BACKING_TRACK_LIMITS.maxBytes) {
    await deps.s3.remove(pending);
    throw new BackingTrackError('bad-file');
  }
  const start = await deps.s3.readStart(pending, MAGIC_BYTES, head.etag);
  if (!start) {
    // Changed or gone since the Head: not ours to delete, unless the twin request already finished.
    const row = await replayIfFinished(deps, sub, input);
    if (row) return { kind: 'replayed', row };
    throw new BackingTrackError('replaced');
  }
  if (!matchesAudioMagic(ext, start)) {
    await deps.s3.remove(pending);
    throw new BackingTrackError('bad-file');
  }
  return { kind: 'verified', head, ext };
}

/** Per-person storage is counted from S3; the per-song and per-band counts are approximate under concurrency. */
async function assertCapsAllow(deps: Deps, sub: string, input: CommitInput, key: string, bytes: number): Promise<void> {
  const [room, songCount, bandCount] = await Promise.all([
    hasRoomFor(deps, sub, bytes, key),
    deps.db.countTracks({ songId: input.songId }),
    deps.db.countTracks({ bandId: input.bandId }),
  ]);
  if (!room) throw new BackingTrackError('over-quota');
  if (songCount >= BACKING_TRACK_LIMITS.maxPerSong) throw new BackingTrackError('song-full');
  if (bandCount >= BACKING_TRACK_LIMITS.maxPerBand) throw new BackingTrackError('band-full');
}

/**
 * Copy pinned to the verified ETag, then create the row. The copy is never deleted by this function's
 * own failure paths: a retry reuses the same key, and the reconcile / sweep collect true orphans.
 */
async function copyAndCreateRow(
  deps: Deps,
  sub: string,
  input: CommitInput,
  upload: { head: HeadResult; ext: AudioExt; setListId: string; key: string },
): Promise<TrackRow> {
  const { head, ext, setListId, key } = upload;
  const contentType = contentTypeForExt(ext);
  const copied = await deps.s3.copy(pendingKey(sub, input.slot), key, { ifMatch: head.etag, contentType });
  if (copied !== 'ok') {
    const row = await replayIfFinished(deps, sub, input);
    if (row) return row;
    throw new BackingTrackError(copied === 'changed' ? 'replaced' : 'not-found');
  }
  const stamp = new Date(deps.now()).toISOString();
  const row: TrackRow = {
    id: input.trackId,
    owner: sub,
    bandId: input.bandId,
    setListId,
    songId: input.songId,
    label: input.label,
    forTags: input.tags,
    key,
    contentType,
    bytes: head.size,
    format: BACKING_TRACK_FORMAT,
    createdAt: stamp,
    updatedAt: stamp,
  };
  if (!(await deps.db.createTrack(row))) {
    const winner = await deps.db.getTrack(input.trackId);
    if (winner && sameTrack(winner, sub, input) && winner.key === key) return winner;
    throw new BackingTrackError('conflict');
  }
  return row;
}

/**
 * Revalidate after the create, which closes commit-vs-ban / leave / deleteSong races. The pending
 * upload is kept until this passes, so a transient failure can simply be committed again from it; a
 * definite denial (`gone`) clears it too, since nothing will ever commit from it.
 */
async function finalize(deps: Deps, sub: string, input: CommitInput, row: TrackRow): Promise<TrackRow> {
  const pending = pendingKey(sub, input.slot);
  try {
    await revalidate(deps, row);
  } catch (error) {
    if (error instanceof BackingTrackError && error.code === 'gone') await removePendingIfMine(deps, pending, input.trackId);
    throw error;
  }
  await removePendingIfMine(deps, pending, input.trackId);
  return row;
}

/** `commitBackingTrack`: turns a verified pending upload into a committed object plus its row. Idempotent per `trackId`. */
export async function commitTrack(deps: Deps, sub: string, args: CommitArgs): Promise<TrackRow> {
  assertEnabled(deps);
  const input = parseCommit(args);

  // A row for this trackId means the work is done (or must be re-verified).
  const existing = await replayIfFinished(deps, sub, input);
  if (existing) return existing;

  const pending = await verifyPendingUpload(deps, sub, input);
  if (pending.kind === 'replayed') return pending.row;
  const { head, ext } = pending;

  const setListId = await authorize(deps, sub, input.bandId, input.songId, 'attach');
  const key = committedKey({ sub, bandId: input.bandId, songId: input.songId, trackId: input.trackId, ext });
  await assertCapsAllow(deps, sub, input, key, head.size);

  const row = await copyAndCreateRow(deps, sub, input, { head, ext, setListId, key });
  return finalize(deps, sub, input, row);
}
