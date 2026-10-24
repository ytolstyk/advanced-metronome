import {
  BAND_GONE_TITLES,
  BAND_LIMITS,
  BAND_TEXT,
  type BandLoadResult,
  type BandRecord,
  type InviteFailure,
  type InvitePreview,
  type SetListRecord,
  type MyBandEntry,
} from '../bandTypes';
import { normalizeInstruments } from '../bandInstruments';
import {
  filterValidMembers,
  generateInviteCode,
  isBandAlive,
  isBandOwner,
  isBanned,
  isCleanText,
  isInviteExpired,
  isValidInviteTtlDays,
  normalizeInviteCode,
  requireDisplayName,
  requireName,
} from '../bandUtils';
import { assembleBandView } from '../bandViews';
import { getCurrentUserSub } from './authUtils';
import { cleanupMyAvailability } from './availabilityRows';
import {
  bandsClient as client,
  createIdempotent,
  deleteQuietly,
  getBand,
  getSetListRow,
  isConflict,
  listRoster,
  requireAuth,
  throwOnError,
  throwUnlessConflict,
  tombstoneSetList,
  toBand,
  toMember,
  unwrap,
  updateBand,
} from './bandsShared';
import { READS_AT_ONCE, listAll, pageOpts, runPool } from './paginate';

export class InviteError extends Error {
  readonly reason: InviteFailure;
  constructor(reason: InviteFailure) {
    super(`Cannot join band: ${reason}`);
    this.name = 'InviteError';
    this.reason = reason;
  }
}

/** Invite-code allocation retries on a key collision (50-bit codes: this is paranoia, not load). */
const INVITE_ATTEMPTS = 5;
/** Parallel writes per band operation (bounded so a hostile band can't trigger a burst). */
const WRITES_AT_ONCE = 4;
/** Creates a BandInvite with a fresh code, retrying on key collision. Returns the code. */
async function createInvite(bandId: string): Promise<string> {
  for (let i = 0; i < INVITE_ATTEMPTS; i++) {
    const code = generateInviteCode();
    const res = await client.models.BandInvite.create({ code, bandId });
    if (!res.errors?.length) return code;
    if (!isConflict(res.errors)) throwOnError(res, 'createInvite');
  }
  throw new Error('Could not allocate an invite code');
}

async function revokeInvite(code: string): Promise<void> {
  const res = await client.models.BandInvite.update({ code, revokedAt: new Date().toISOString() });
  throwUnlessConflict(res, 'revokeInvite');
}

/** Own Member row + private MyBand row (both idempotent; each is keyed by the caller's sub). */
async function ensureMembership(
  bandId: string,
  sub: string,
  displayName: string,
  instruments: readonly string[],
): Promise<void> {
  await Promise.all([
    createIdempotent(
      () => client.models.Member.create({ bandId, owner: sub, displayName, instruments: normalizeInstruments(instruments) }),
      'createMember',
    ),
    createIdempotent(() => client.models.MyBand.create({ owner: sub, bandId }), 'createMyBand'),
  ]);
}

// ── Reading ────────────────────────────────────────────────────────────────

export interface MyBandsResult {
  entries: MyBandEntry[];
  /** Bands whose read failed: the list is incomplete, never silently "empty". */
  failedCount: number;
  /** Tombstoned bands the caller can drop from their list (see `pruneDeadBands`). */
  deadBandIds: string[];
}

/** "My bands": private MyBand rows → Band. A pure read; pruning is a separate, explicit step. */
export async function loadMyBands(): Promise<MyBandsResult> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  const { items: rows } = await listAll(async (token) => {
    const res = await client.models.MyBand.list({ owner: sub, ...pageOpts(token) });
    return { items: unwrap(res, 'listMyBands'), nextToken: res.nextToken };
  });

  const entries: MyBandEntry[] = [];
  const deadBandIds: string[] = [];
  let failedCount = 0;
  await runPool(READS_AT_ONCE, rows, async (row) => {
    try {
      const band = await getBand(row.bandId);
      // A missing band may just be a half-finished create: neither shown nor pruned.
      if (!band) return;
      if (!isBandAlive(band)) {
        deadBandIds.push(band.id);
        return;
      }
      const removed = isBanned(band, sub);
      entries.push({ band, status: removed ? 'removed' : 'active', isOwner: isBandOwner(band, sub) });
    } catch {
      failedCount += 1;
    }
  });
  entries.sort((a, b) => a.band.name.localeCompare(b.band.name));
  return { entries, failedCount, deadBandIds };
}

/** Drops the caller's own rows for tombstoned bands. Best-effort: a failure just retries next load. */
export async function pruneDeadBands(bandIds: readonly string[]): Promise<void> {
  await runPool(WRITES_AT_ONCE, bandIds, (id) => dismissBand(id)).catch(() => undefined);
}

/**
 * Everything a band page needs, already validated. Throws on read errors (fail closed).
 * `onlySetListId` loads just that set list (the set-list page needs one, not all ten);
 * `skipSetLists` loads none (pages that only need the roster).
 */
export async function loadBandView(
  bandId: string,
  options: { onlySetListId?: string; skipSetLists?: boolean } = {},
): Promise<BandLoadResult> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  // None of these need each other, so they start together; the roster/own row are simply ignored
  // when the band turns out to be gone or the caller was removed.
  const [band, roster, ownRes] = await Promise.all([
    getBand(bandId),
    listRoster(bandId),
    client.models.Member.get({ bandId, owner: sub }),
  ]);
  if (!band) return { status: 'not-found' };
  if (!isBandAlive(band)) return { status: 'deleted' };
  if (isBanned(band, sub)) return { status: 'removed', band };
  throwOnError(ownRes, 'getMember');

  // Only the first `maxSetLists` ids count (a hostile owner could write thousands), fetched with
  // bounded parallelism.
  const ids = options.skipSetLists
    ? []
    : band.setListIds
        .slice(0, BAND_LIMITS.maxSetLists)
        .filter((id) => options.onlySetListId === undefined || id === options.onlySetListId);
  const setListRows = new Array<SetListRecord | null>(ids.length).fill(null);
  await runPool(
    READS_AT_ONCE,
    ids.map((id, index) => ({ id, index })),
    async ({ id, index }) => {
      setListRows[index] = await getSetListRow(id);
    },
  );

  return {
    status: 'ok',
    view: assembleBandView({
      band,
      sub,
      rosterRows: roster.rows,
      rosterIncomplete: roster.incomplete,
      ownRow: ownRes.data ? toMember(ownRes.data) : null,
      setListRows,
    }),
  };
}

// ── Creating / joining / leaving ───────────────────────────────────────────

/**
 * Write order matters: everything except the Band is written first (in parallel), the Band last.
 * Every earlier row is inert until the Band exists, so a crash never leaves a band that looks
 * valid but is half-built.
 */
export async function createBand(
  nameInput: string,
  displayNameInput: string,
  instruments: readonly string[] = [],
): Promise<BandRecord> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  const name = requireName(nameInput);
  const displayName = requireDisplayName(displayNameInput);

  // The cap is advisory (client-side), but never "pass" it because a read failed.
  const mine = await loadMyBands();
  if (mine.failedCount > 0) throw new Error('Couldn’t check your bands. Please try again.');
  if (mine.entries.filter((e) => e.isOwner).length >= BAND_LIMITS.maxOwnedBands) {
    throw new Error(`You can own at most ${BAND_LIMITS.maxOwnedBands} bands`);
  }

  const bandId = crypto.randomUUID();
  const setListId = crypto.randomUUID();
  const [inviteCode] = await Promise.all([
    createInvite(bandId),
    client.models.SetList.create({ id: setListId, bandId, name: BAND_TEXT.defaultSetListName }).then((res) =>
      unwrap(res, 'createSetList'),
    ),
    ensureMembership(bandId, sub, displayName, instruments),
  ]);
  try {
    const created = unwrap(
      await client.models.Band.create({
        id: bandId,
        name,
        inviteCode,
        version: 1,
        setListIds: [setListId],
        archivedSetListIds: [],
        bannedSubs: [],
        hiddenSongIds: [],
        sharedSetListIds: [], // nothing is public until the owner shares it
        inviteTtlDays: BAND_LIMITS.inviteTtlDaysDefault,
      }),
      'createBand',
    );
    return toBand(created);
  } catch (e) {
    // The caller's own membership rows would otherwise sit around inert forever.
    await dismissBand(bandId).catch(() => undefined);
    throw e;
  }
}

/**
 * Validates a typed/linked invite code and returns what the join dialog should show. The code is
 * only trusted if the Band itself carries it (forged or rotated invites are rejected), and only
 * while it is younger than the band's invite lifetime (`Band.inviteTtlDays` after the invite row's
 * server-set `createdAt`). This stops stale links, not people who already hold the band id.
 */
export async function lookupInvite(codeInput: string): Promise<InvitePreview> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  const code = normalizeInviteCode(codeInput);
  if (!code) throw new InviteError('invalid-code');

  const invite = await client.models.BandInvite.get({ code });
  throwOnError(invite, 'getInvite');
  if (!invite.data) throw new InviteError('not-found');
  if (invite.data.revokedAt) throw new InviteError('revoked');

  const band = await getBand(invite.data.bandId);
  if (!band) throw new InviteError('not-found');
  if (!isBandAlive(band)) throw new InviteError('deleted');
  if (band.inviteCode !== code) throw new InviteError('revoked');
  if (isInviteExpired(invite.data.createdAt, band.inviteTtlDays, Date.now())) throw new InviteError('expired');
  return previewFor(band, sub);
}

async function previewFor(band: BandRecord, sub: string): Promise<InvitePreview> {
  // Same rule as every other place a band name is shown: a name that sanitising would change is hidden.
  if (!isCleanText(band.name, BAND_LIMITS.nameMax, true)) throw new InviteError('not-found');
  if (isBanned(band, sub)) throw new InviteError('banned');
  const roster = await listRoster(band.id);
  const members = filterValidMembers(roster.rows, band);
  const alreadyMember = isBandOwner(band, sub) || members.some((m) => m.owner === sub);
  if (!alreadyMember && members.length >= BAND_LIMITS.maxMembers) throw new InviteError('full');
  return { bandId: band.id, bandName: band.name, memberCount: members.length, alreadyMember };
}

/** Preview for a shared `/bands/:bandId` link (the id itself is the capability). */
export async function previewBand(bandId: string): Promise<InvitePreview> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  const band = await getBand(bandId);
  if (!band) throw new InviteError('not-found');
  if (!isBandAlive(band)) throw new InviteError('deleted');
  return previewFor(band, sub);
}

/** Joins instantly (idempotent): own Member row + private MyBand row. Someone already in keeps their profile. */
export async function joinBand(
  bandId: string,
  displayNameInput: string,
  instruments: readonly string[] = [],
): Promise<void> {
  const displayName = requireDisplayName(displayNameInput);
  await previewBand(bandId); // also enforces ban / deleted / full
  await ensureMembership(bandId, await getCurrentUserSub(), displayName, instruments);
}

/**
 * Changes the caller's own name and instruments in a band (the one write members make to their own
 * Member row). Never joins anyone: only a member, or the owner whose row is missing, can use it.
 */
export async function updateMyProfile(
  bandId: string,
  displayNameInput: string,
  instrumentsInput: readonly string[],
): Promise<void> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  const displayName = requireDisplayName(displayNameInput);
  const instruments = normalizeInstruments(instrumentsInput);
  const [band, own] = await Promise.all([getBand(bandId), client.models.Member.get({ bandId, owner: sub })]);
  if (!band) throw new Error(BAND_GONE_TITLES['not-found']);
  if (!isBandAlive(band)) throw new Error(BAND_GONE_TITLES.deleted);
  if (isBanned(band, sub)) throw new Error(BAND_GONE_TITLES.removed);
  throwOnError(own, 'getMember');
  if (own.data) {
    unwrap(await client.models.Member.update({ bandId, owner: sub, displayName, instruments }), 'updateMember');
  } else if (isBandOwner(band, sub)) {
    await createIdempotent(() => client.models.Member.create({ bandId, owner: sub, displayName, instruments }), 'createMember');
  } else {
    throw new Error('Join the band first');
  }
}

/** Repairs a missing private "my bands" row for a band the caller is already a member of. */
export async function ensureMyBandRow(bandId: string): Promise<void> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  await createIdempotent(() => client.models.MyBand.create({ owner: sub, bandId }), 'createMyBand');
}

/**
 * Removes the caller's own Member + MyBand rows (leave, or dismiss a removed/deleted band). Their
 * availability row is cleaned up best-effort alongside (bounded, never rejects, not awaited): it is
 * cosmetic next to losing membership, and a leaving member's dialog already deletes it first.
 */
export async function dismissBand(bandId: string): Promise<void> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  void cleanupMyAvailability(bandId);
  await Promise.all([
    deleteQuietly(() => client.models.Member.delete({ bandId, owner: sub }), 'deleteMember'),
    deleteQuietly(() => client.models.MyBand.delete({ owner: sub, bandId }), 'deleteMyBand'),
  ]);
}

// ── Owner moderation (all go through updateBand: auth, fresh read, version lock) ─

const addUnique = (list: string[], value: string): string[] | null =>
  list.includes(value) ? null : [...list, value];
const removeValue = (list: string[], value: string): string[] | null =>
  list.includes(value) ? list.filter((x) => x !== value) : null;

export function banMember(bandId: string, memberSub: string): Promise<BandRecord> {
  return updateBand(bandId, (band) => {
    if (isBandOwner(band, memberSub)) throw new Error('The owner cannot be removed');
    const next = addUnique(band.bannedSubs, memberSub);
    if (next && next.length > BAND_LIMITS.maxBannedSubs) {
      throw new Error('Removed-member limit reached');
    }
    return next ? { bannedSubs: next } : null;
  });
}

export function unbanMember(bandId: string, memberSub: string): Promise<BandRecord> {
  return updateBand(bandId, (band) => {
    const next = removeValue(band.bannedSubs, memberSub);
    return next ? { bannedSubs: next } : null;
  });
}

export function hideSong(bandId: string, songId: string): Promise<BandRecord> {
  return updateBand(bandId, (band) => {
    const next = addUnique(band.hiddenSongIds, songId);
    if (next && next.length > BAND_LIMITS.maxHiddenSongs) throw new Error('Hidden-song limit reached');
    return next ? { hiddenSongIds: next } : null;
  });
}

export function unhideSong(bandId: string, songId: string): Promise<BandRecord> {
  return updateBand(bandId, (band) => {
    const next = removeValue(band.hiddenSongIds, songId);
    return next ? { hiddenSongIds: next } : null;
  });
}

export function renameBand(bandId: string, nameInput: string): Promise<BandRecord> {
  const name = requireName(nameInput);
  return updateBand(bandId, (band) => (band.name === name ? null : { name }));
}

/**
 * New code first, then the Band switches to it (join checks `Band.inviteCode`, so the old code is
 * dead from that moment), then the old invite row is retired best-effort (never deleted). Stops
 * NEW joiners only. With `onlyIfCode`, it renews only while that is still the band's code: if
 * another session already rotated, the new row is retired unused and the band as it now stands is
 * returned, so two sessions never revoke each other's fresh link.
 */
export async function resetInviteCode(bandId: string, onlyIfCode?: string): Promise<BandRecord> {
  await requireAuth();
  const newCode = await createInvite(bandId);
  let replaced = '';
  const updated = await updateBand(bandId, (band) => {
    if (onlyIfCode !== undefined && band.inviteCode !== onlyIfCode) return null;
    replaced = band.inviteCode; // read inside the lock: the code actually being replaced
    return band.inviteCode === newCode ? null : { inviteCode: newCode };
  });
  if (updated.inviteCode !== newCode) await revokeInvite(newCode).catch(() => undefined);
  else if (replaced && replaced !== newCode) await revokeInvite(replaced).catch(() => undefined);
  return updated;
}

/**
 * When the invite `code` was issued (ISO), or null if it has no row or the row is retired. Any
 * signed-in user may read an invite by code; members use this to show when the link expires.
 */
export async function getInviteIssuedAt(code: string): Promise<string | null> {
  await requireAuth();
  const res = await client.models.BandInvite.get({ code });
  throwOnError(res, 'getInvite');
  return res.data && !res.data.revokedAt ? (res.data.createdAt ?? null) : null;
}

/**
 * The band with an invite that still works. Rotates (via `resetInviteCode`) only when the current
 * invite has expired, is retired, has no row or no readable issue time, so a good link is never
 * rotated. A failed read throws instead of rotating. Owner only. The expiry check uses this
 * device's clock against the invite's server-set time.
 */
export async function ensureFreshInvite(bandId: string): Promise<BandRecord> {
  await requireAuth();
  const sub = await getCurrentUserSub();
  const band = await getBand(bandId);
  if (!band) throw new Error('Band not found');
  if (!isBandAlive(band)) throw new Error('This band was deleted');
  if (!isBandOwner(band, sub)) throw new Error('Only the band owner can renew the invite');
  const issuedAt = await getInviteIssuedAt(band.inviteCode);
  return isInviteExpired(issuedAt, band.inviteTtlDays, Date.now()) ? resetInviteCode(bandId, band.inviteCode) : band;
}

/**
 * Sets how many days an invite link works. It applies to the current link too (its age is
 * unchanged), except that a link which had already expired is renewed when the lifetime grows, so
 * a longer setting never brings a dead link back to life.
 */
export async function setInviteTtlDays(bandId: string, days: number): Promise<BandRecord> {
  if (!isValidInviteTtlDays(days)) {
    throw new Error(`Invite links can last ${BAND_LIMITS.inviteTtlDaysMin} to ${BAND_LIMITS.inviteTtlDaysMax} days`);
  }
  await requireAuth();
  const before = await getBand(bandId);
  if (!before) throw new Error('Band not found');
  const revives =
    days > before.inviteTtlDays &&
    isInviteExpired(await getInviteIssuedAt(before.inviteCode), before.inviteTtlDays, Date.now());
  const updated = await updateBand(bandId, (band) => (band.inviteTtlDays === days ? null : { inviteTtlDays: days }));
  return revives ? resetInviteCode(bandId, before.inviteCode) : updated;
}

export type DeleteStep = 'set-lists' | 'tombstone' | 'invite' | 'done';

/**
 * Tombstones the band (rows are never deleted, so the id can't be re-created). Order matters:
 * (1) tombstone the set list rows while the band is still alive, so a failure here leaves a normal
 * band that the ordinary Delete button can retry; (2) ONE atomic Band write that tombstones and
 * scrubs (name, code, bans, hidden + shared ids) — after this nothing sensitive is left; (3) retire the old
 * invite row best-effort (join already rejects dead bands, so this is only tidiness). Re-runnable.
 */
export async function deleteBand(bandId: string, onProgress?: (step: DeleteStep) => void): Promise<void> {
  await requireAuth();
  const current = await getBand(bandId);
  if (!current) throw new Error('Band not found');

  onProgress?.('set-lists');
  // Only the capped prefixes count (hostile arrays); archived ids are included in case an earlier
  // archive crashed between its band write and its row tombstone. Re-tombstoning is idempotent.
  const setListIds = [
    ...new Set([
      ...current.setListIds.slice(0, BAND_LIMITS.maxSetLists),
      ...current.archivedSetListIds.slice(0, BAND_LIMITS.maxArchivedSetLists),
    ]),
  ];
  await runPool(WRITES_AT_ONCE, setListIds, (id) => tombstoneSetList(id, BAND_TEXT.deletedName));

  onProgress?.('tombstone');
  await updateBand(
    bandId,
    (b) => {
      const scrubbed =
        b.name === BAND_TEXT.deletedName &&
        !b.inviteCode &&
        b.bannedSubs.length === 0 &&
        b.hiddenSongIds.length === 0 &&
        b.sharedSetListIds.length === 0;
      if (b.deletedAt && scrubbed) return null;
      return {
        ...(b.deletedAt ? {} : { deletedAt: new Date().toISOString() }),
        name: BAND_TEXT.deletedName,
        inviteCode: '',
        bannedSubs: [],
        hiddenSongIds: [],
        sharedSetListIds: [],
      };
    },
    { allowDeleted: true },
  );

  onProgress?.('invite');
  if (current.inviteCode) await revokeInvite(current.inviteCode).catch(() => undefined);
  onProgress?.('done');
}
