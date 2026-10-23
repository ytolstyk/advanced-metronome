import type { AvailabilityRead, AvailabilityRecord, BandRecord, BandView, MemberRecord, ValidMember } from './bandTypes';
import { encodeRow, slotOf, utcDayOf } from './availabilitySlots';
import { resolveAvailability, type AvailabilityResolution, type Participants } from './availabilityUtils';

/** Shared fixtures for the availability tests (imported by tests only). */

export const ME = 'sub-me';
export const OWNER = 'sub-owner';
export const BOB = 'sub-bob';
export const CAT = 'sub-cat';
export const DAN = 'sub-dan';
export const MALLORY = 'sub-mallory';

/** A Tuesday, 12:10 UTC: the current slot has already started, the next one has not. */
export const NOW = Date.UTC(2026, 10, 3, 12, 10, 0);
export const NOW_SLOT = slotOf(NOW);
/** The UTC day number of `NOW`. */
export const NOW_DAY = utcDayOf(NOW);
/** Exactly 00:00 UTC on the day of `NOW`: the slot boundary cases line up with a UTC day start here. */
export const MIDNIGHT = Date.UTC(2026, 10, 3, 0, 0, 0);
export { DAY_MS as DAY } from './availabilitySlots';

export const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: 'band-1',
  owner: OWNER,
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: [],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  ...over,
});

export const member = (owner: string, over: Partial<MemberRecord> = {}): MemberRecord => ({
  bandId: 'band-1',
  owner,
  displayName: owner.replace('sub-', ''),
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

/** A row as this client would have written it at `NOW` (override fields to make it hostile). */
export const row = (owner: string, free: Iterable<number>, over: Partial<AvailabilityRecord> = {}): AvailabilityRecord => ({
  bandId: 'band-1',
  owner,
  ...encodeRow(free, NOW),
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
  ...over,
});

export const ok = (r: AvailabilityRecord | null): AvailabilityRead => ({ status: 'ok', row: r });

/** Slots `from` (inclusive) to `to` (exclusive). */
export const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, i) => from + i);

export const everyone = (...subs: string[]): Participants => ({ subs, excluded: 0 });

/** Resolve a set of members who each saved the given free slots (plus some who never saved). */
export function resolveMarks(marks: Record<string, number[]>, notResponded: string[] = []): AvailabilityResolution {
  const reads = new Map<string, AvailabilityRead>();
  for (const [sub, free] of Object.entries(marks)) reads.set(sub, ok(row(sub, free)));
  for (const sub of notResponded) reads.set(sub, ok(null));
  return resolveAvailability(reads, everyone(...Object.keys(marks), ...notResponded), band(), NOW);
}

/** A slot of 2026-11-04, the day after `NOW`, at the given UTC hour and minute (every slot of it is still upcoming). */
export const at = (hour: number, minute = 0): number => slotOf(Date.UTC(2026, 10, 4, hour, minute));

/** Matches a time label whatever space character the platform puts before AM/PM. */
export const time = (text: string): RegExp => new RegExp(`^${text.replace(' ', '\\s')}`);

/** "sub-bob" -> "bob". */
export const nameOf = (sub: string): string => sub.replace('sub-', '');

/** API error replies as the data client returns them. */
export const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
export const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];
export const BOOM = [{ errorType: 'InternalFailure', message: 'boom' }];

/** A signed-in member's view of a band with an owner ("Olivia"), themselves ("Me") and "Bob". */
export function makeView(over: Partial<BandView> = {}, b: BandRecord = band()): BandView {
  const members = [
    { bandId: b.id, owner: OWNER, displayName: 'Olivia', createdAt: '2026-01-01T00:00:00Z' },
    { bandId: b.id, owner: ME, displayName: 'Me', createdAt: '2026-01-01T00:00:01Z' },
    { bandId: b.id, owner: BOB, displayName: 'Bob', createdAt: '2026-01-01T00:00:02Z' },
  ] as unknown as ValidMember[];
  return {
    band: b,
    sub: ME,
    isOwner: false,
    isMember: true,
    members,
    memberSubs: new Set([OWNER, ME, BOB]),
    displayNames: new Map([[OWNER, 'Olivia'], [ME, 'Me'], [BOB, 'Bob']]),
    setLists: [],
    removedMembers: [],
    incomplete: false,
    ...over,
  };
}
