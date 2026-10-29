import type { BandLoadResult, BandView } from '../bandTypes';
import { assembleRigMembers } from '../rigData';
import type { MemberRig, RigRead } from '../rigData';
import { pickParticipants } from '../availabilityUtils';
import { loadBandView } from './bandsApi';
import { READS_AT_ONCE, runPool } from './paginate';
import { getRigRead, isRigAvailable } from './rigRows';
import { requireAuth } from './bandsShared';

export {
  RigBlockedError,
  RigConflictError,
  RigUnavailableError,
  deleteMyRig,
  deleteMyRigWithin,
  saveMyRig,
} from './rigRows';

/** Everything the gear & rig page needs. */
export type RigPageResult =
  | Exclude<BandLoadResult, { status: 'ok' }>
  /** The backend doesn't have the BandRig model yet. */
  | { status: 'unavailable' }
  | {
      status: 'ok';
      view: BandView;
      /** Every participant's validated row, owner and caller first. */
      members: MemberRig[];
      /** The raw reads, kept so a failed refresh can fall back to the last good row. */
      reads: Map<string, RigRead>;
    };

export type RigPageOk = Extract<RigPageResult, { status: 'ok' }>;

/**
 * One keyed `get` per participant, all at once (never one aliased request: a single huge row would
 * then fail everyone's). A member whose read fails keeps their `previous` good row when there is one.
 * Throws only if every read fails.
 */
export async function fetchRigReads(
  bandId: string,
  subs: readonly string[],
  previous?: ReadonlyMap<string, RigRead>,
): Promise<Map<string, RigRead>> {
  await requireAuth();
  const reads = new Map<string, RigRead>();
  await runPool(READS_AT_ONCE, subs, async (sub) => {
    const read = await getRigRead(bandId, sub);
    const before = previous?.get(sub);
    reads.set(sub, read.status === 'failed' && before?.status === 'ok' ? before : read);
  });
  if (subs.length > 0 && [...reads.values()].every((r) => r.status === 'failed')) {
    throw new Error('Could not load gear and rigs. Please try again.');
  }
  return reads;
}

/** The band (roster only, no set lists) plus every participant's validated gear and rigs. */
export async function loadRigPage(bandId: string, previous?: ReadonlyMap<string, RigRead>): Promise<RigPageResult> {
  await requireAuth();
  if (!isRigAvailable()) return { status: 'unavailable' };
  const result = await loadBandView(bandId, { skipSetLists: true });
  if (result.status !== 'ok') return result;
  const { view } = result;
  // A non-member only gets the page's "join the band" notice: no rows are read for them.
  const participants = pickParticipants(view.members, view.band, view.sub, view.isMember);
  // The caller's own row is never taken from `previous`: it may predate a save they have made since.
  const fallback = previous && new Map([...previous].filter(([sub]) => sub !== view.sub));
  const reads = view.isMember ? await fetchRigReads(bandId, participants.subs, fallback) : new Map<string, RigRead>();
  const members = view.isMember
    ? assembleRigMembers({
        band: view.band,
        members: view.members,
        sub: view.sub,
        isMember: view.isMember,
        displayNames: view.displayNames,
        reads,
      })
    : [];
  return { status: 'ok', view, members, reads };
}
