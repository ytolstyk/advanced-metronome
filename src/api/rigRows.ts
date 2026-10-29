import { withTimeout } from '../lib/withTimeout';
import { RIG_FORMAT, parseRigRow, rigRowBytes, rigRowMaxBytes, serializeDraft } from '../rigData';
import type { RigDraft, RigRead, RigRowRecord } from '../rigData';
import { getCurrentUserSub } from './authUtils';
import {
  bandsClient as client,
  createIdempotent,
  deleteConfirmed,
  deleteQuietly,
  errorText,
  isConflict,
  isUnauthorized,
  requireAuth,
  unwrap,
  withKeyLock,
} from './bandsShared';
import type { GqlError, GqlResult } from './bandsShared';

/**
 * Reading, saving and deleting one member's gear-and-rig row, by exact key. This is a LEAF module
 * (it imports only shared helpers and pure logic) so `bandsApi.dismissBand` can clean up after a
 * leaver without a cycle; page loading lives in `rigApi.ts`. Saves and deletes for a band share one
 * lock key, so a delete can never race a save started from the same tab.
 */

/** Longest a cleanup is allowed to hold up leaving a band. */
export const RIG_CLEANUP_MS = 5_000;

/** The backend predates this feature (frontend deployed ahead of the schema): rigs can't be used yet. */
export class RigUnavailableError extends Error {
  constructor() {
    super('Gear and rigs are not available yet');
    this.name = 'RigUnavailableError';
  }
}

export type RigBlockReason = 'newer' | 'invalid' | 'too-big';

/** Saving is refused because overwriting the stored row would be wrong. */
export class RigBlockedError extends Error {
  readonly reason: RigBlockReason;
  constructor(reason: RigBlockReason) {
    super(`Cannot save gear and rigs: ${reason}`);
    this.name = 'RigBlockedError';
    this.reason = reason;
  }
}

/** The stored row changed since this editor loaded it (another tab or device saved). */
export class RigConflictError extends Error {
  constructor() {
    super('Your gear and rigs changed somewhere else.');
    this.name = 'RigConflictError';
  }
}

type RigModel = typeof client.models.BandRig;

/** The model, or `undefined` when this backend doesn't have it (an older deployment). */
const rigModel = (): RigModel | undefined => (client.models as { BandRig?: RigModel }).BandRig;

function requireModel(): RigModel {
  const model = rigModel();
  if (!model) throw new RigUnavailableError();
  return model;
}

export const isRigAvailable = (): boolean => rigModel() !== undefined;

type RigRowData = NonNullable<Awaited<ReturnType<RigModel['get']>>['data']>;

export function toRigRow(r: RigRowData): RigRowRecord {
  return {
    bandId: r.bandId,
    owner: r.owner,
    format: r.format,
    rev: r.rev,
    gear: r.gear,
    diagrams: r.diagrams,
    updatedAt: r.updatedAt,
  };
}

/**
 * One member's row by key. A failed read is a result, not an exception, so one bad row can't take
 * down the whole page. The caller checks `isRigAvailable` first.
 */
export async function getRigRead(bandId: string, owner: string): Promise<RigRead> {
  await requireAuth(); // exported: never rely on the caller having checked (a refusal is thrown, not a 'failed' read)
  const model = requireModel(); // "unavailable" is thrown too: it is not a failed read of one row
  try {
    const res = await model.get({ bandId, owner });
    if (res.errors?.length) {
      console.warn('Could not read a rig row', res.errors);
      return { status: 'failed' };
    }
    return { status: 'ok', row: res.data ? toRigRow(res.data) : null };
  } catch (e) {
    console.warn('Could not read a rig row', e);
    return { status: 'failed' };
  }
}

// ── Saving ─────────────────────────────────────────────────────────────────

const UPDATE_BAND_RIG = /* GraphQL */ `
  mutation UpdateBandRig($input: UpdateBandRigInput!, $condition: ModelBandRigConditionInput) {
    updateBandRig(input: $input, condition: $condition) {
      bandId owner format rev gear diagrams updatedAt
    }
  }
`;

/**
 * The schema doesn't know this mutation or its types: an older backend (the raw path isn't covered
 * by the model guard). A heuristic on the error text, deliberately limited to "unknown type/field"
 * wording so a genuine input-validation failure isn't reported as "not available yet".
 */
const isSchemaMissing = (errors: readonly GqlError[] | null | undefined): boolean =>
  (errors ?? []).some((e) => /FieldUndefined|UnknownType|Cannot query field|Unknown type|Unknown field|is not defined by type/i.test(`${e.errorType ?? ''} ${e.message ?? ''}`));

/**
 * Writes the row only if its `rev` is still `expectedRev` (a raw mutation: the model helpers can't
 * send a condition). `null` means the condition failed or the row is gone (both come back as
 * conflict/Unauthorized), which the caller treats as "changed elsewhere".
 */
async function conditionalUpdate(
  bandId: string,
  owner: string,
  expectedRev: number,
  strings: { gear: string; diagrams: string },
): Promise<RigRowRecord | null> {
  let res: GqlResult<{ updateBandRig: RigRowData | null }>;
  try {
    res = (await client.graphql({
      query: UPDATE_BAND_RIG,
      variables: {
        input: { bandId, owner, format: RIG_FORMAT, rev: expectedRev + 1, ...strings },
        condition: { rev: { eq: expectedRev } },
      },
    })) as GqlResult<{ updateBandRig: RigRowData | null }>;
  } catch (e) {
    const errors = (e as { errors?: GqlError[] }).errors;
    res = { data: null, errors: errors?.length ? errors : [{ message: String(e) }] };
  }
  if (isConflict(res.errors) || isUnauthorized(res.errors)) return null;
  if (isSchemaMissing(res.errors)) {
    console.warn('UpdateBandRig is not available', errorText(res.errors));
    throw new RigUnavailableError();
  }
  const data = unwrap(res, 'updateBandRig');
  if (!data.updateBandRig) throw new Error('updateBandRig: no data returned');
  return toRigRow(data.updateBandRig);
}

export interface SaveRigOptions {
  /** `rev` of the stored row this edit started from, or `null` when there was no row. */
  baselineRev: number | null;
  /** Save over whatever is stored now (the person chose "Overwrite" after a conflict). */
  overwrite?: boolean;
}

/**
 * Saves the caller's whole draft. The draft must fit the size budget and read back clean through
 * the same validator everyone else uses. Without `overwrite`, a row that changed since the editor
 * loaded (`rev` moved, appeared or vanished) throws `RigConflictError` instead of being replaced.
 */
export function saveMyRig(bandId: string, draft: RigDraft, options: SaveRigOptions): Promise<RigRowRecord> {
  return withKeyLock(`rig:${bandId}`, async () => {
    await requireAuth();
    const model = requireModel();
    const owner = await getCurrentUserSub();
    const strings = serializeDraft(draft);
    if (rigRowBytes(strings.gear, strings.diagrams) > rigRowMaxBytes()) throw new RigBlockedError('too-big');
    const candidate: RigRowRecord = { bandId, owner, format: RIG_FORMAT, rev: 1, ...strings };
    const readBack = parseRigRow(candidate);
    if (readBack.kind !== 'ok' || readBack.hiddenGear + readBack.unreadableDiagrams + readBack.brokenLinks > 0) {
      throw new RigBlockedError('invalid');
    }

    let baseline = options.baselineRev;
    if (options.overwrite) {
      const current = await getRigRead(bandId, owner);
      if (current.status === 'failed') throw new Error('Could not check your saved rigs. Please try again.');
      if (current.row && current.row.format > RIG_FORMAT) throw new RigBlockedError('newer');
      baseline = current.row ? current.row.rev : null;
    }

    if (baseline === null) {
      const created = await createIdempotent(
        () => model.create({ bandId, owner, format: RIG_FORMAT, rev: 1, ...strings }),
        'createBandRig',
      );
      if (created === 'created') return { ...candidate, rev: 1 };
      // The row exists: fine if it is exactly what we meant to write (a lost create response, retried).
      const now = await getRigRead(bandId, owner);
      if (now.status === 'ok' && now.row && now.row.rev === 1 && now.row.gear === strings.gear && now.row.diagrams === strings.diagrams) {
        return now.row;
      }
      throw new RigConflictError();
    }

    const saved = await conditionalUpdate(bandId, owner, baseline, strings);
    if (saved) return saved;
    // The condition failed (or the row vanished, which also comes back as Unauthorized). If the stored
    // row is exactly what we meant to write one revision on, our own write landed and only its reply
    // was lost: that is success, not "changed elsewhere".
    const now = await getRigRead(bandId, owner);
    if (now.status === 'ok' && now.row && now.row.rev === baseline + 1 && now.row.gear === strings.gear && now.row.diagrams === strings.diagrams) {
      return now.row;
    }
    throw new RigConflictError();
  });
}

// ── Deleting ───────────────────────────────────────────────────────────────

/**
 * Removes the caller's own row, if there is one (most leavers never used rigs, so a missing row is
 * not an error). A no-op against a backend without the model. Serialised with saves.
 * `confirmed`: an Unauthorized reply only counts as success if a re-read shows the row is gone, so
 * a refused delete is never reported as done. `quiet` (best-effort cleanup) accepts it.
 */
async function removeMyRow(bandId: string, mode: 'confirmed' | 'quiet'): Promise<void> {
  await requireAuth();
  const model = rigModel();
  if (!model) return;
  const owner = await getCurrentUserSub();
  const isGone = async (): Promise<boolean> => {
    const res = await model.get({ bandId, owner });
    return !res.errors?.length && !res.data;
  };
  await withKeyLock(`rig:${bandId}`, async () => {
    if (await isGone()) return;
    const run = () => model.delete({ bandId, owner });
    if (mode === 'quiet') await deleteQuietly(run, 'deleteBandRig');
    else await deleteConfirmed(run, isGone, 'deleteBandRig');
  });
}

/** The user-initiated delete (leave dialog): throws unless the row is really gone. */
export const deleteMyRig = (bandId: string): Promise<void> => removeMyRow(bandId, 'confirmed');

/** `deleteMyRig` that gives up after `ms`, so a stalled save can't hold a dialog on "Working…". */
export function deleteMyRigWithin(bandId: string, ms: number = RIG_CLEANUP_MS): Promise<void> {
  return withTimeout(deleteMyRig(bandId), ms, 'deleteBandRig');
}

/**
 * Best-effort cleanup for paths with no UI to report to (dismissing a removed or deleted band): one
 * retry, bounded overall, and it never rejects or blocks leaving. A row that survives stays hidden
 * once the member is gone.
 */
export async function cleanupMyRig(bandId: string): Promise<void> {
  const attempt = async () => {
    try {
      await removeMyRow(bandId, 'quiet');
    } catch {
      await removeMyRow(bandId, 'quiet');
    }
  };
  try {
    await withTimeout(attempt(), RIG_CLEANUP_MS, 'cleanupBandRig');
  } catch (e) {
    console.warn('Could not remove your gear and rigs', e);
  }
}
