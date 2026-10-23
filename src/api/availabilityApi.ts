import { AVAILABILITY_LIMITS, type AvailabilityRead, type BandLoadResult, type BandView } from '../bandTypes';
import { pickParticipants, type Participants } from '../availabilityUtils';
import { loadBandView } from './bandsApi';
import { runPool } from './paginate';
import { getAvailabilityRead, isAvailabilityAvailable } from './availabilityRows';
import { requireAuth } from './bandsShared';

export {
  AvailabilityBlockedError,
  AvailabilityUnavailableError,
  deleteMyAvailability,
  deleteMyAvailabilityWithin,
  saveMyAvailability,
} from './availabilityRows';

/**
 * Everything the availability page needs. Availability is the point of the page, so unlike the
 * cosmetic color labels a total read failure throws; but one member's failed row is only that
 * member's problem (named in the UI) and never takes the others down.
 */
export type AvailabilityPageResult =
  | Exclude<BandLoadResult, { status: 'ok' }>
  /** The backend doesn't have the Availability model yet. */
  | { status: 'unavailable' }
  | {
      status: 'ok';
      view: BandView;
      participants: Participants;
      reads: Map<string, AvailabilityRead>;
      /** When the load started, so the editor can tell if a result predates its own last save. */
      fetchedAt: number;
    };

/** The loaded page for a member of a live band. */
export type AvailabilityPageOk = Extract<AvailabilityPageResult, { status: 'ok' }>;

/**
 * Reads in flight at once. A band is at most `maxParticipants` rows, so there is no burst to
 * protect against, and a wider pool turns the page load from several waves into about one.
 */
const AVAILABILITY_READS_AT_ONCE = AVAILABILITY_LIMITS.maxParticipants;

/**
 * One keyed `get` per participant, all at once (never one aliased request: a single huge row
 * would then fail everyone's). A member whose read fails keeps their `previous` good row when there
 * is one, so a flaky refresh doesn't make them vanish. Throws only if every read fails.
 */
export async function fetchAvailabilityReads(
  bandId: string,
  subs: readonly string[],
  previous?: ReadonlyMap<string, AvailabilityRead>,
): Promise<Map<string, AvailabilityRead>> {
  await requireAuth();
  const reads = new Map<string, AvailabilityRead>();
  await runPool(AVAILABILITY_READS_AT_ONCE, subs, async (sub) => {
    const read = await getAvailabilityRead(bandId, sub);
    const before = previous?.get(sub);
    reads.set(sub, read.status === 'failed' && before?.status === 'ok' ? before : read);
  });
  if (subs.length > 0 && [...reads.values()].every((r) => r.status === 'failed')) {
    throw new Error('Could not load availability. Please try again.');
  }
  return reads;
}

/** The band (roster only, no set lists) plus every participant's availability row. */
export async function loadAvailabilityPage(
  bandId: string,
  previous?: ReadonlyMap<string, AvailabilityRead>,
): Promise<AvailabilityPageResult> {
  await requireAuth();
  if (!isAvailabilityAvailable()) return { status: 'unavailable' };
  const fetchedAt = Date.now();
  const result = await loadBandView(bandId, { skipSetLists: true });
  if (result.status !== 'ok') return result;
  const { view } = result;
  const participants = pickParticipants(view.members, view.band, view.sub, view.isMember);
  // A non-member only gets the page's "join the band" notice: no rows are read for them.
  // The caller's own row is never taken from `previous`: it may predate a save they have made since.
  const fallback = previous && new Map([...previous].filter(([sub]) => sub !== view.sub));
  const reads = view.isMember ? await fetchAvailabilityReads(bandId, participants.subs, fallback) : new Map();
  return { status: 'ok', view, participants, reads, fetchedAt };
}
