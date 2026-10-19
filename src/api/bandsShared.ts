import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type {
  BandRecord,
  MemberRecord,
  ReadAuthMode,
  SetListRecord,
  SongColorRecord,
  SongRecord,
  VoteRecord,
} from '../bandTypes';
import { getSignedInSub, isAuthenticated } from './authUtils';
import { listAll, pageOpts } from './paginate';

/**
 * Shared client + helpers for the Bands API modules (bandsApi, setListsApi, songVotesApi):
 * result handling, row mappers and the one place that writes the Band root of trust.
 */
export const bandsClient = generateClient<Schema>();

export class NotSignedInError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'NotSignedInError';
  }
}

export class BandConflictError extends Error {
  constructor(message = 'The band changed while you were editing. Please retry.') {
    super(message);
    this.name = 'BandConflictError';
  }
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) throw new NotSignedInError();
}

/** A valid roster is at most 15 rows, so a few pages is plenty; a junk flood must not cost 50 round trips. */
const ROSTER_MAX_PAGES = 4;

// ── Who is reading ─────────────────────────────────────────────────────────

/** The caller of a read that also works signed out: `sub` is `null` for an anonymous visitor. */
export interface Reader {
  sub: string | null;
  authMode: ReadAuthMode;
}

export async function resolveReader(): Promise<Reader> {
  const sub = await getSignedInSub();
  return sub ? { sub, authMode: 'userPool' } : { sub: null, authMode: 'identityPool' };
}

/**
 * Trailing args for a `get`: nothing for the normal signed-in path (the client default), an explicit
 * auth mode when the caller is a resolved `Reader`.
 */
export const readArgs = (authMode?: ReadAuthMode): [] | [{ authMode: ReadAuthMode }] =>
  authMode ? [{ authMode }] : [];

// ── Result handling ────────────────────────────────────────────────────────

interface GqlError {
  message?: string;
  errorType?: string;
}
interface GqlResult<T> {
  data: T | null;
  errors?: readonly GqlError[] | null;
}

export const errorText = (errors: readonly GqlError[] | null | undefined): string =>
  (errors ?? []).map((e) => e.message ?? e.errorType ?? 'error').join('; ');

/** `ConditionalCheckFailedException`: the create hit an existing key / an update condition failed. */
export function isConflict(errors: readonly GqlError[] | null | undefined): boolean {
  return (errors ?? []).some((e) => /ConditionalCheckFailed/i.test(`${e.errorType ?? ''} ${e.message ?? ''}`));
}

export function isUnauthorized(errors: readonly GqlError[] | null | undefined): boolean {
  return (errors ?? []).some((e) => /Unauthorized/i.test(`${e.errorType ?? ''} ${e.message ?? ''}`));
}

/** Throws `label: <api error text>` when the result carries errors (writes must never fail silently). */
export function throwOnError(res: { errors?: readonly GqlError[] | null }, label: string): void {
  if (res.errors?.length) throw new Error(`${label}: ${errorText(res.errors)}`);
}

/** Like `throwOnError`, but a failed condition (the row is already in the wanted state) is fine. */
export function throwUnlessConflict(res: { errors?: readonly GqlError[] | null }, label: string): void {
  if (!isConflict(res.errors)) throwOnError(res, label);
}

/** Returns data or throws with the API error text. */
export function unwrap<T>(res: GqlResult<T>, label: string): T {
  throwOnError(res, label);
  if (res.data == null) throw new Error(`${label}: no data returned`);
  return res.data;
}

/** Create where "already exists" is success (idempotent payloads keyed by the caller's sub). */
export async function createIdempotent(
  run: () => Promise<GqlResult<unknown>>,
  label: string,
): Promise<'created' | 'exists'> {
  const res = await run();
  if (res.errors?.length) {
    if (isConflict(res.errors)) return 'exists';
    throwOnError(res, label);
  }
  return 'created';
}

/**
 * Best-effort delete for cleanup: a row that is already gone (or not ours any more) comes back as
 * Unauthorized / ConditionalCheckFailed; both mean "nothing left to delete". Do NOT use this where
 * a real permission failure must reach the user.
 */
export async function deleteQuietly(run: () => Promise<GqlResult<unknown>>, label: string): Promise<void> {
  const res = await run();
  if (!isConflict(res.errors) && !isUnauthorized(res.errors)) throwOnError(res, label);
}

/**
 * Delete for user-initiated actions (delete my song, retract my vote). A row that is already gone
 * can come back as Unauthorized, but so can a real permission failure, so Unauthorized only counts
 * as success when a re-read confirms the row no longer exists.
 */
export async function deleteConfirmed(
  run: () => Promise<GqlResult<unknown>>,
  isGone: () => Promise<boolean>,
  label: string,
): Promise<void> {
  const res = await run();
  if (!res.errors?.length || isConflict(res.errors)) return;
  if (isUnauthorized(res.errors) && (await isGone())) return;
  throwOnError(res, label);
}

/**
 * Upsert for rows keyed by the caller / the song. Each attempt reports whether the row now has the
 * wanted value; it can fail for a benign reason (the row exists / vanished since the UI looked, e.g.
 * another tab), so the other operation is the fallback, and one more try covers a row that changes
 * between the two. `exists` is what the UI believes: it only picks which operation goes first.
 */
export async function upsertRow(
  { create, update }: { create: () => Promise<boolean>; update: () => Promise<boolean> },
  exists: boolean,
  failure: string,
): Promise<void> {
  const attempts = exists ? [update, create, update] : [create, update, create];
  for (const attempt of attempts) if (await attempt()) return;
  throw new Error(failure);
}

// ── Row mappers ────────────────────────────────────────────────────────────

const strings = (xs: ReadonlyArray<string | null> | null | undefined): string[] =>
  (xs ?? []).filter((x): x is string => typeof x === 'string');

type Row<K extends keyof Schema> = Schema[K]['type'];

/** The Band fields the client reads. Both the raw mutation's selection set and `BandRow` derive from it. */
const BAND_FIELDS = [
  'id',
  'owner',
  'name',
  'inviteCode',
  'deletedAt',
  'version',
  'setListIds',
  'archivedSetListIds',
  'bannedSubs',
  'hiddenSongIds',
  'sharedSetListIds',
] as const;

export type { ReadAuthMode };

export type BandRow = Pick<Row<'Band'>, (typeof BAND_FIELDS)[number]>;

export function toBand(r: BandRow): BandRecord {
  return {
    id: r.id,
    owner: r.owner ?? '',
    name: r.name,
    inviteCode: r.inviteCode,
    deletedAt: r.deletedAt ?? null,
    version: r.version,
    setListIds: strings(r.setListIds),
    archivedSetListIds: strings(r.archivedSetListIds),
    bannedSubs: strings(r.bannedSubs),
    hiddenSongIds: strings(r.hiddenSongIds),
    sharedSetListIds: strings(r.sharedSetListIds),
  };
}

export function toMember(r: Row<'Member'>): MemberRecord {
  return { bandId: r.bandId, owner: r.owner, displayName: r.displayName, createdAt: r.createdAt };
}

export function toSetList(r: Row<'SetList'>): SetListRecord {
  return { id: r.id, owner: r.owner ?? '', bandId: r.bandId, name: r.name, archivedAt: r.archivedAt ?? null };
}

export function toSong(r: Row<'Song'>): SongRecord {
  return {
    id: r.id,
    owner: r.owner ?? '',
    bandId: r.bandId,
    setListId: r.setListId,
    title: r.title,
    artist: r.artist ?? null,
    key: r.key ?? null,
    bpm: r.bpm ?? null,
    notes: r.notes ?? null,
    songUrl: r.songUrl ?? null,
    tabUrl: r.tabUrl ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toSongColor(r: Row<'SongColor'>): SongColorRecord {
  return {
    songId: r.songId,
    owner: r.owner,
    bandId: r.bandId,
    setListId: r.setListId,
    color: r.color,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toVote(r: Row<'Vote'>): VoteRecord {
  return {
    songId: r.songId,
    owner: r.owner,
    value: r.value,
    bandId: r.bandId,
    setListId: r.setListId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ── Single-row reads / writes shared by several modules ────────────────────

/** Band by id; `null` when it doesn't exist. Throws on API errors (callers fail closed). */
export async function getBand(bandId: string, authMode?: ReadAuthMode): Promise<BandRecord | null> {
  const { data, errors } = await bandsClient.models.Band.get({ id: bandId }, ...readArgs(authMode));
  throwOnError({ errors }, 'getBand');
  return data ? toBand(data) : null;
}

/** SetList by id; `null` when it doesn't exist. Throws on API errors (callers fail closed). */
export async function getSetListRow(setListId: string, authMode?: ReadAuthMode): Promise<SetListRecord | null> {
  const res = await bandsClient.models.SetList.get({ id: setListId }, ...readArgs(authMode));
  throwOnError(res, 'getSetList');
  return res.data ? toSetList(res.data) : null;
}

/** Member rows of a band via the roster index (unvalidated; capped pages, `incomplete` when hit). */
export async function listRoster(
  bandId: string,
  { authMode, maxPages = ROSTER_MAX_PAGES }: { authMode?: ReadAuthMode; maxPages?: number } = {},
): Promise<{ rows: MemberRecord[]; incomplete: boolean }> {
  const { items, incomplete } = await listAll(async (token) => {
    const res = await bandsClient.models.Member.listMemberByBandId({ bandId }, pageOpts(token, authMode));
    return { items: unwrap(res, 'listMembers').map(toMember), nextToken: res.nextToken };
  }, maxPages);
  return { rows: items, incomplete };
}

/**
 * Tombstones a set list row (rows are never deleted so ids can't be re-created): scrubs the name
 * and sets `archivedAt`. Already-tombstoned rows are fine.
 */
export async function tombstoneSetList(setListId: string, scrubbedName: string): Promise<void> {
  const res = await bandsClient.models.SetList.update({
    id: setListId,
    archivedAt: new Date().toISOString(),
    name: scrubbedName,
  });
  throwUnlessConflict(res, 'archiveSetList');
}

// ── Band writes: per-key mutex + optimistic lock ───────────────────────────

/** Fields the owner may change on a Band (everything else is immutable via the API). */
export type BandPatch = Partial<
  Pick<
    BandRecord,
    | 'name'
    | 'inviteCode'
    | 'deletedAt'
    | 'setListIds'
    | 'archivedSetListIds'
    | 'bannedSubs'
    | 'hiddenSongIds'
    | 'sharedSetListIds'
  >
>;

const UPDATE_BAND = /* GraphQL */ `
  mutation UpdateBand($input: UpdateBandInput!, $condition: ModelBandConditionInput) {
    updateBand(input: $input, condition: $condition) {
      ${BAND_FIELDS.join(' ')}
    }
  }
`;

const locks = new Map<string, Promise<unknown>>();

/** Serialises async work per key inside this tab (double-submit, rapid clicks, two dialogs). */
export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return next;
}

/**
 * One Band update guarded by `version eq expectedVersion` (the Gen 2 model helpers can't send a
 * condition, so this uses the raw mutation). Sends ONLY the patched fields plus the new version, so
 * a stale writer can never overwrite unrelated fields (e.g. un-tombstone a deleted band).
 */
async function conditionalBandUpdate(
  bandId: string,
  expectedVersion: number,
  patch: BandPatch,
): Promise<BandRecord> {
  let res: GqlResult<{ updateBand: BandRow | null }>;
  try {
    res = (await bandsClient.graphql({
      query: UPDATE_BAND,
      variables: {
        input: { id: bandId, version: expectedVersion + 1, ...patch },
        condition: { version: { eq: expectedVersion } },
      },
    })) as GqlResult<{ updateBand: BandRow | null }>;
  } catch (e) {
    const errors = (e as { errors?: GqlError[] }).errors;
    res = { data: null, errors: errors?.length ? errors : [{ message: String(e) }] };
  }
  if (isConflict(res.errors)) throw new BandConflictError();
  const data = unwrap(res, 'updateBand');
  if (!data.updateBand) throw new Error('updateBand: no data returned');
  return toBand(data.updateBand);
}

export interface UpdateBandOptions {
  /** Allow writing to a tombstoned band (only `deleteBand` re-runs need this). */
  allowDeleted?: boolean;
  attempts?: number;
}

/**
 * Read-modify-write on a Band: re-fetch, derive a patch from the FRESH row, write with the version
 * condition, retry on conflict (mutators must be idempotent). Returns the updated band, or the
 * fresh one unchanged when `mutate` returns null. Refuses to write to a deleted band.
 */
export async function updateBand(
  bandId: string,
  mutate: (fresh: BandRecord) => BandPatch | null,
  { allowDeleted = false, attempts = 3 }: UpdateBandOptions = {},
): Promise<BandRecord> {
  await requireAuth();
  return withKeyLock(`band:${bandId}`, async () => {
    for (let i = 0; i < attempts; i++) {
      const fresh = await getBand(bandId);
      if (!fresh) throw new Error('Band not found');
      if (fresh.deletedAt && !allowDeleted) throw new Error('This band was deleted');
      const patch = mutate(fresh);
      if (!patch) return fresh;
      try {
        return await conditionalBandUpdate(bandId, fresh.version, patch);
      } catch (e) {
        if (!(e instanceof BandConflictError) || i === attempts - 1) throw e;
      }
    }
    throw new BandConflictError();
  });
}
