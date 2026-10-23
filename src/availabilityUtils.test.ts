import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LIMITS, type AvailabilityRead, type AvailabilityRecord } from './bandTypes';
import {
  MAX_MASK_MEMBERS,
  NO_ROW_READ,
  blockReasonOf,
  hasCurrentRow,
  availableStatus,
  buildOverlap,
  classifyOwnRow,
  describeAge,
  describeSlot,
  intersect,
  parseAvailabilityRow,
  parseGroup,
  pickParticipants,
  planSave,
  popcount,
  resolveAt,
  resolveAvailability,
  subsOfKind,
} from './availabilityUtils';
import { decodeMask, encodeSlots, horizonEndSlot, slotOf, utcDayOf, writerWindow } from './availabilitySlots';
import { filterValidMembers } from './bandUtils';
import {
  BOB,
  CAT,
  DAN,
  DAY,
  MALLORY,
  MIDNIGHT,
  NOW,
  NOW_DAY,
  NOW_SLOT,
  OWNER,
  band,
  everyone,
  member,
  ok,
  resolveMarks,
  row,
} from './availabilityTestHelpers';

const { writerMaxDays, parserMaxDays, hexPerDay, maxParticipants } = AVAILABILITY_LIMITS;
const S = NOW_SLOT;
const byNumber = (a: number, b: number): number => a - b;

describe('parseAvailabilityRow', () => {
  const good = (): AvailabilityRecord => row(BOB, [S + 1]);

  it('reads a row this client wrote', () => {
    const result = parseAvailabilityRow(good(), band(), BOB);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.parsed.free]).toEqual([S + 1]);
    expect(result.parsed.endSlot - result.parsed.startSlot).toBe(writerMaxDays * 48);
  });

  it.each([
    ['another band', { bandId: 'band-2' }, 'wrong-row'],
    ['another owner', { owner: MALLORY }, 'wrong-row'],
    ['an empty owner', { owner: '' }, 'wrong-row'],
    ['a newer format', { format: 2 }, 'newer-format'],
    ['format 0', { format: 0 }, 'invalid'],
    ['a fractional format', { format: 1.5 }, 'invalid'],
    ['a fractional startDay', { startDay: 1.5 }, 'invalid'],
    ['a negative startDay', { startDay: -1 }, 'invalid'],
    ['a huge startDay', { startDay: 2 ** 31 }, 'invalid'],
    ['an unsafe startDay', { startDay: Number.MAX_SAFE_INTEGER + 2 }, 'invalid'],
    ['an empty mask', { mask: '' }, 'invalid'],
    ['a mask that is not whole days', { mask: 'f'.repeat(13) }, 'invalid'],
    ['uppercase hex', { mask: 'A'.repeat(12) }, 'invalid'],
    ['non-hex characters', { mask: 'g'.repeat(12) }, 'invalid'],
    ['a mask over the parser limit', { mask: '0'.repeat((parserMaxDays + 1) * hexPerDay) }, 'invalid'],
    ['a huge mask', { mask: '0'.repeat(400_000) }, 'invalid'],
    ['a mask that is not a string', { mask: 12 as unknown as string }, 'invalid'],
  ])('rejects a row with %s', (_label, over, reason) => {
    expect(parseAvailabilityRow({ ...good(), ...over }, band(), BOB)).toEqual({ ok: false, reason });
  });

  it('accepts up to the parser limit (headroom over what the writer emits)', () => {
    const r = { ...good(), mask: '0'.repeat(parserMaxDays * hexPerDay) };
    expect(parseAvailabilityRow(r, band(), BOB).ok).toBe(true);
  });

  it('rejects everything for a deleted band', () => {
    expect(parseAvailabilityRow(good(), band({ deletedAt: '2026-11-01T00:00:00Z' }), BOB)).toEqual({
      ok: false,
      reason: 'dead-band',
    });
  });
});

describe('parseAvailabilityRow edge cases', () => {
  const good = (): AvailabilityRecord => row(BOB, [S + 1]);
  const parse = (over: object) => parseAvailabilityRow({ ...good(), ...over }, band(), BOB);

  it.each([
    ['a NaN format', { format: NaN }],
    ['an undefined format', { format: undefined }],
    ['a string format', { format: '1' }],
    ['an infinite format', { format: Infinity }],
    ['a string startDay', { startDay: '20000' }],
    ['a NaN startDay', { startDay: NaN }],
    ['a null mask', { mask: null }],
    ['an undefined mask', { mask: undefined }],
    ['a mask with a trailing newline', { mask: `${'0'.repeat(11)}\n` }],
    ['a mask with a 0x prefix', { mask: `0x${'0'.repeat(10)}` }],
    ['a mixed-case mask', { mask: `a${'B'.repeat(11)}` }],
    ['a mask padded with spaces', { mask: ` ${'0'.repeat(11)}` }],
  ])('rejects a row with %s as invalid', (_label, over) => {
    expect(parse(over)).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['an undefined owner', { owner: undefined }],
    ['a numeric owner', { owner: 123 }],
    ['an undefined bandId', { bandId: undefined }],
  ])('rejects a row with %s as not ours', (_label, over) => {
    expect(parse(over)).toEqual({ ok: false, reason: 'wrong-row' });
  });

  it('reports a newer format before looking at anything else about the row', () => {
    expect(parse({ format: 2, startDay: -1, mask: 'zz' })).toEqual({ ok: false, reason: 'newer-format' });
    expect(parse({ format: 1e9 })).toEqual({ ok: false, reason: 'newer-format' });
  });

  it('checks the band is alive before whose row it is', () => {
    const dead = band({ deletedAt: '2026-11-01T00:00:00Z' });
    expect(parseAvailabilityRow({ ...good(), owner: MALLORY }, dead, BOB)).toEqual({ ok: false, reason: 'dead-band' });
  });

  it('checks whose row it is before the format', () => {
    expect(parse({ owner: MALLORY, format: 2 })).toEqual({ ok: false, reason: 'wrong-row' });
  });

  it('accepts the smallest and largest startDay and a single-day mask, reporting the window it speaks for', () => {
    const first = parse({ startDay: 0, mask: '8'.padEnd(12, '0') });
    expect(first).toMatchObject({ ok: true, parsed: { startSlot: 0, endSlot: 48 } });
    if (first.ok) expect([...first.parsed.free]).toEqual([0]);
    const last = parse({ startDay: 2 ** 31 - 1, mask: '0'.repeat(12) });
    expect(last).toMatchObject({ ok: true, parsed: { startSlot: (2 ** 31 - 1) * 48, endSlot: (2 ** 31 - 1) * 48 + 48 } });
  });

  it('decodes every free slot of a full row', () => {
    const result = parse({ startDay: 10, mask: 'f'.repeat(24) });
    expect(result.ok && result.parsed.free.size).toBe(96);
    expect(result.ok && result.parsed.endSlot - result.parsed.startSlot).toBe(96);
  });
});

describe('classifyOwnRow', () => {
  const classify = (read: AvailabilityRead) => classifyOwnRow(read, band(), BOB).kind;

  it('tells apart each way the stored row can be', () => {
    expect(classify(ok(null))).toBe('none');
    expect(classify(ok(row(BOB, [S + 1])))).toBe('ok');
    expect(classify({ status: 'failed' })).toBe('failed');
    expect(classify(ok(row(BOB, [], { format: 2 })))).toBe('newer-format');
    expect(classify(ok(row(BOB, [], { mask: 'zz' })))).toBe('invalid');
    expect(classify(ok(row(BOB, [], { format: 0 })))).toBe('invalid');
  });

  it('hands back what it parsed for a readable row', () => {
    const state = classifyOwnRow(ok(row(BOB, [S + 1, S + 2])), band(), BOB);
    expect(state.kind === 'ok' && [...state.parsed.free]).toEqual([S + 1, S + 2]);
  });

  it('never treats a row that is not ours, or a dead band, as something to overwrite', () => {
    expect(classify(ok(row(BOB, [], { owner: MALLORY })))).toBe('unavailable');
    expect(classify(ok(row(BOB, [], { bandId: 'band-2' })))).toBe('unavailable');
    expect(classifyOwnRow(ok(row(BOB, [])), band({ deletedAt: 'x' }), BOB).kind).toBe('unavailable');
  });
});

describe('planSave', () => {
  const edits = new Map([[S + 3, true]]);
  const freeOf = (plan: ReturnType<typeof planSave>) => {
    if (plan.kind !== 'write') throw new Error('expected a write');
    return [...decodeMask(plan.row.startDay, plan.row.mask)].sort((a, b) => a - b);
  };
  const stateOf = (read: AvailabilityRead) => classifyOwnRow(read, band(), BOB);

  it('writes the first row for a member with none', () => {
    const plan = planSave(stateOf(ok(null)), edits, NOW);
    expect(freeOf(plan)).toEqual([S + 3]);
    expect(plan).toMatchObject({ kind: 'write', reset: false });
  });

  it('merges edits into the stored marks', () => {
    const plan = planSave(stateOf(ok(row(BOB, [S + 1, S + 2]))), new Map([[S + 2, false], [S + 3, true]]), NOW);
    expect(freeOf(plan)).toEqual([S + 1, S + 3]);
  });

  it('drops edits to slots that have started', () => {
    expect(freeOf(planSave(stateOf(ok(null)), new Map([[S, true], [S + 4, true]]), NOW))).toEqual([S + 4]);
  });

  it('replaces an unreadable row, and says so', () => {
    const plan = planSave(stateOf(ok(row(BOB, [], { mask: 'zz' }))), edits, NOW);
    expect(plan).toMatchObject({ kind: 'write', reset: true });
    expect(freeOf(plan)).toEqual([S + 3]);
  });

  it('writes an empty row when there are no edits and nothing stored', () => {
    const plan = planSave({ kind: 'none' }, new Map(), NOW);
    expect(plan).toMatchObject({ kind: 'write', reset: false });
    expect(freeOf(plan)).toEqual([]);
    expect(plan.kind === 'write' && plan.row.mask).toBe('0'.repeat(writerMaxDays * hexPerDay));
  });

  it('keeps the stored marks untouched when there are no edits', () => {
    expect(freeOf(planSave(stateOf(ok(row(BOB, [S + 1, S + 7]))), new Map(), NOW))).toEqual([S + 1, S + 7]);
  });

  it('prunes stored marks that have started since the last save', () => {
    const startDay = utcDayOf(NOW);
    const stale = row(BOB, [], { startDay, mask: encodeSlots([S - 3, S, S + 1], startDay, writerMaxDays) });
    expect(freeOf(planSave(stateOf(ok(stale)), new Map(), NOW))).toEqual([S + 1]);
  });

  it('carries marks from an older row into the current window', () => {
    const startDay = utcDayOf(NOW) - 1;
    const older = row(BOB, [], { startDay, mask: encodeSlots([S + 5], startDay, writerMaxDays) });
    const plan = planSave(stateOf(ok(older)), new Map(), NOW);
    expect(freeOf(plan)).toEqual([S + 5]);
    expect(plan.kind === 'write' && plan.row.startDay).toBe(utcDayOf(NOW));
  });

  it('drops edits that fall outside the window a save writes', () => {
    const beyond = writerWindow(NOW).endSlot;
    expect(freeOf(planSave({ kind: 'none' }, new Map([[beyond, true], [beyond - 1, true]]), NOW))).toEqual([beyond - 1]);
  });

  it('does not mutate the stored marks it plans from', () => {
    const state = stateOf(ok(row(BOB, [S + 1])));
    planSave(state, new Map([[S + 1, false], [S + 2, true]]), NOW);
    expect(state.kind === 'ok' && [...state.parsed.free]).toEqual([S + 1]);
  });

  it.each([
    ['a newer client wrote it', ok(row(BOB, [], { format: 2 })), 'newer-format'],
    ['it is not our row', ok(row(BOB, [], { owner: MALLORY })), 'unavailable'],
    ['the read failed', { status: 'failed' } as AvailabilityRead, 'failed'],
  ])('refuses to write when %s', (_label, read, reason) => {
    expect(planSave(stateOf(read), edits, NOW)).toEqual({ kind: 'blocked', reason });
  });
});

describe('pickParticipants', () => {
  const members = (...subs: string[]) => filterValidMembers(subs.map((s) => member(s)), band());

  it('puts the owner and the calling member first, then join order', () => {
    const valid = filterValidMembers(
      [
        member(CAT, { createdAt: '2026-01-03T00:00:00Z' }),
        member(BOB, { createdAt: '2026-01-02T00:00:00Z' }),
        member(DAN, { createdAt: '2026-01-04T00:00:00Z' }),
      ],
      band(),
    );
    expect(pickParticipants(valid, band(), DAN, true).subs).toEqual([OWNER, DAN, BOB, CAT]);
  });

  it('keeps the owner even without a Member row', () => {
    expect(pickParticipants(members(BOB), band(), BOB, true).subs).toEqual([OWNER, BOB]);
  });

  it('does not add a caller who is not a member', () => {
    expect(pickParticipants(members(BOB), band(), MALLORY, false).subs).toEqual([OWNER, BOB]);
  });

  it('does not duplicate the owner when they are also the caller', () => {
    expect(pickParticipants(members(OWNER, BOB), band(), OWNER, true).subs).toEqual([OWNER, BOB]);
  });

  it('caps at the read bound and reports how many were left out, keeping owner and caller', () => {
    const { maxParticipants } = AVAILABILITY_LIMITS;
    const subs = Array.from({ length: maxParticipants + 1 }, (_, i) => `sub-m${String(i).padStart(2, '0')}`);
    const stamp = (i: number) => `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`;
    const valid = filterValidMembers(subs.map((s, i) => member(s, { createdAt: stamp(i) })), band());
    const caller = subs[maxParticipants];
    const picked = pickParticipants(valid, band(), caller, true);
    expect(picked.subs).toHaveLength(maxParticipants);
    expect(picked.subs.slice(0, 2)).toEqual([OWNER, caller]);
    expect(picked.excluded).toBe(2);
  });

  it('is empty for a deleted band', () => {
    expect(pickParticipants([], band({ deletedAt: 'x' }), BOB, true)).toEqual({ subs: [], excluded: 0 });
  });

  it('excludes nobody at exactly the read bound', () => {
    const subs = Array.from({ length: maxParticipants - 1 }, (_, i) => `sub-m${String(i).padStart(2, '0')}`);
    const picked = pickParticipants(filterValidMembers(subs.map((s) => member(s)), band()), band(), subs[0], true);
    expect(picked.subs).toHaveLength(maxParticipants);
    expect(picked.excluded).toBe(0);
  });

  it('is just the owner for a band with no other members', () => {
    expect(pickParticipants([], band(), MALLORY, false)).toEqual({ subs: [OWNER], excluded: 0 });
  });

  it('breaks join-time ties by account so the order is stable', () => {
    const tied = filterValidMembers([member(CAT), member(BOB), member(DAN)], band());
    expect(pickParticipants(tied, band(), MALLORY, false).subs).toEqual([OWNER, BOB, CAT, DAN]);
  });

  it('ignores a blank caller even if told they are a member', () => {
    expect(pickParticipants(members(BOB), band(), '', true).subs).toEqual([OWNER, BOB]);
  });

  it('lists the owner once when they are the caller without being told they are a member', () => {
    expect(pickParticipants(members(BOB), band(), OWNER, false).subs).toEqual([OWNER, BOB]);
  });

  it('leaves the members it was given in their original order', () => {
    const valid = filterValidMembers(
      [member(CAT, { createdAt: '2026-01-03T00:00:00Z' }), member(BOB, { createdAt: '2026-01-02T00:00:00Z' })],
      band(),
    );
    const before = valid.map((m) => m.owner);
    pickParticipants(valid, band(), MALLORY, false);
    expect(valid.map((m) => m.owner)).toEqual(before);
  });

  it('keeps every participant addressable by a bit in the overlap masks', () => {
    expect(AVAILABILITY_LIMITS.maxParticipants).toBeLessThanOrEqual(MAX_MASK_MEMBERS);
  });
});

describe('resolveAvailability', () => {
  const participants = everyone(OWNER, BOB, CAT, DAN);
  const kinds = (reads: Map<string, AvailabilityRead>, who = participants) => {
    const r = resolveAvailability(reads, who, band(), NOW);
    return Object.fromEntries(r.participants.map((sub) => [sub, r.statuses.get(sub)?.kind]));
  };

  it('sorts members into available, not-responded and unreadable', () => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, [S + 1]))],
      [BOB, ok(null)],
      [CAT, { status: 'failed' }],
      [DAN, ok(row(DAN, [], { mask: 'zz' }))],
    ]);
    expect(kinds(reads)).toEqual({ [OWNER]: 'available', [BOB]: 'not-responded', [CAT]: 'unreadable', [DAN]: 'unreadable' });
    const r = resolveAvailability(reads, participants, band(), NOW);
    expect(r.statuses.get(CAT)).toEqual({ kind: 'unreadable', reason: 'read-failed' });
    expect(r.statuses.get(DAN)).toEqual({ kind: 'unreadable', reason: 'invalid' });
    expect(subsOfKind(r, 'unreadable')).toEqual([CAT, DAN]);
  });

  it('distinguishes a row from a newer client (so the UI can say "update the app")', () => {
    const r = resolveAvailability(new Map([[BOB, ok(row(BOB, [], { format: 2 }))]]), everyone(BOB), band(), NOW);
    expect(r.statuses.get(BOB)).toEqual({ kind: 'unreadable', reason: 'newer-format' });
  });

  it('treats a participant that was never fetched as unreadable, not as not-responded', () => {
    expect(kinds(new Map(), everyone(BOB))).toEqual({ [BOB]: 'unreadable' });
  });

  it('treats a row whose window ended before now as expired, not responded', () => {
    const old = { ...row(BOB, []), ...{ startDay: utcDayOf(NOW - 100 * DAY) } };
    const r = resolveAvailability(new Map([[BOB, ok(old)]]), everyone(BOB), band(), NOW);
    expect(r.statuses.get(BOB)).toEqual({ kind: 'not-responded', lastSaved: '2026-11-02T00:00:00Z', expired: true });
  });

  it('keeps an all-zero row as available with nothing free', () => {
    const r = resolveAvailability(new Map([[BOB, ok(row(BOB, []))]]), everyone(BOB), band(), NOW);
    expect(availableStatus(r, BOB)?.free.size).toBe(0);
  });

  it('only counts marks that have not started and are before the horizon', () => {
    const startDay = utcDayOf(NOW) - 5;
    const horizon = S + 61 * 48;
    const marks = [S - 100, S, S + 1, horizon - 1, horizon, S + 90 * 48];
    const odd = row(BOB, [], { startDay, mask: encodeSlots(marks, startDay, 90) });
    const r = resolveAvailability(new Map([[BOB, ok(odd)]]), everyone(BOB), band(), NOW);
    expect([...availableStatus(r, BOB)!.free].sort((a, b) => a - b)).toEqual([S + 1, horizon - 1]);
  });

  it('hides a row that starts beyond anything the UI can show', () => {
    const far = row(BOB, [], { startDay: utcDayOf(NOW) + 400 });
    const r = resolveAvailability(new Map([[BOB, ok(far)]]), everyone(BOB), band(), NOW);
    expect(r.statuses.get(BOB)).toEqual({ kind: 'unreadable', reason: 'invalid' });
  });

  it('flags a row saved more than 14 days ago as out of date', () => {
    const stale = row(BOB, [S + 1], { updatedAt: new Date(NOW - 15 * DAY).toISOString() });
    const fresh = row(CAT, [S + 1], { updatedAt: new Date(NOW - 13 * DAY).toISOString() });
    const r = resolveAvailability(new Map([[BOB, ok(stale)], [CAT, ok(fresh)]]), everyone(BOB, CAT), band(), NOW);
    expect(availableStatus(r, BOB)).toMatchObject({ outOfDate: true, lastSaved: stale.updatedAt });
    expect(availableStatus(r, CAT)?.outOfDate).toBe(false);
  });

  it('falls back to createdAt for "last saved" and tolerates no timestamp at all', () => {
    const noUpdate = row(BOB, [S + 1], { updatedAt: undefined });
    const none = row(CAT, [S + 1], { updatedAt: undefined, createdAt: undefined });
    const r = resolveAvailability(new Map([[BOB, ok(noUpdate)], [CAT, ok(none)]]), everyone(BOB, CAT), band(), NOW);
    expect(availableStatus(r, BOB)?.lastSaved).toBe('2026-11-01T00:00:00Z');
    expect(availableStatus(r, CAT)).toMatchObject({ lastSaved: null, outOfDate: false });
  });

  it("lets the caller's optimistic marks stand in for their saved row", () => {
    const reads = new Map([[BOB, ok(row(BOB, [S + 1]))]]);
    const r = resolveAvailability(reads, everyone(BOB), band(), NOW, { sub: BOB, free: new Set([S, S + 5]) });
    expect([...availableStatus(r, BOB)!.free]).toEqual([S + 5]);
    expect(availableStatus(r, BOB)).toMatchObject(writerWindow(NOW));
  });

  it('counts the caller as available even before their first save', () => {
    const r = resolveAvailability(new Map(), everyone(BOB), band(), NOW, { sub: BOB, free: new Set([S + 2]) });
    expect(r.statuses.get(BOB)?.kind).toBe('available');
  });

  it('ignores a row written by someone else under a participant key', () => {
    const r = resolveAvailability(new Map([[BOB, ok(row(MALLORY, [S + 1]))]]), everyone(BOB), band(), NOW);
    expect(r.statuses.get(BOB)).toEqual({ kind: 'unreadable', reason: 'wrong-row' });
  });

  it('never reads more than the participant bound, and counts what it dropped', () => {
    const many = Array.from({ length: 40 }, (_, i) => `sub-${i}`);
    const r = resolveAvailability(new Map(), { subs: many, excluded: 3 }, band(), NOW);
    expect(r.participants).toHaveLength(AVAILABILITY_LIMITS.maxParticipants);
    expect(r.excluded).toBe(3 + 40 - AVAILABILITY_LIMITS.maxParticipants);
  });

  it('re-resolves a parsed group at a later time without re-parsing', () => {
    const group = parseGroup(new Map([[BOB, ok(row(BOB, [S + 1, S + 5]))]]), everyone(BOB), band());
    const later = resolveAt(group, NOW + 2 * 60 * 60 * 1000);
    expect([...availableStatus(later, BOB)!.free]).toEqual([S + 5]);
    expect([...availableStatus(resolveAt(group, NOW), BOB)!.free]).toEqual([S + 1, S + 5]);
  });
});

describe('parseGroup', () => {
  const subsNamed = (n: number) => Array.from({ length: n }, (_, i) => `sub-m${String(i).padStart(2, '0')}`);

  it('keeps every participant and the excluded count when within the read bound', () => {
    const group = parseGroup(new Map(), { subs: [BOB, CAT], excluded: 4 }, band());
    expect(group.participants).toEqual({ subs: [BOB, CAT], excluded: 4 });
    expect([...group.members.keys()]).toEqual([BOB, CAT]);
  });

  it('truncates to the read bound and adds the dropped participants to the excluded count', () => {
    const subs = subsNamed(maxParticipants + 5);
    const group = parseGroup(new Map(), { subs, excluded: 2 }, band());
    expect(group.participants.subs).toEqual(subs.slice(0, maxParticipants));
    expect(group.participants.excluded).toBe(2 + 5);
    expect(group.members.size).toBe(maxParticipants);
    expect(group.members.has(subs[maxParticipants])).toBe(false);
  });

  it('does not touch the participants it was handed', () => {
    const participants = { subs: subsNamed(maxParticipants + 1), excluded: 0 };
    parseGroup(new Map(), participants, band());
    expect(participants.subs).toHaveLength(maxParticipants + 1);
    expect(participants.excluded).toBe(0);
  });

  it('records each way a read can come out', () => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, [S + 1]))],
      [BOB, ok(null)],
      [CAT, { status: 'failed' }],
      [DAN, ok(row(DAN, [], { format: 2 }))],
      [MALLORY, ok(row(BOB, []))],
    ]);
    const { members } = parseGroup(reads, everyone(OWNER, BOB, CAT, DAN, MALLORY, 'sub-unfetched'), band());
    expect(members.get(OWNER)).toMatchObject({ kind: 'row', lastSaved: '2026-11-02T00:00:00Z' });
    expect(members.get(BOB)).toEqual({ kind: 'none' });
    expect(members.get(CAT)).toEqual({ kind: 'unreadable', reason: 'read-failed' });
    expect(members.get(DAN)).toEqual({ kind: 'unreadable', reason: 'newer-format' });
    expect(members.get(MALLORY)).toEqual({ kind: 'unreadable', reason: 'wrong-row' });
    expect(members.get('sub-unfetched')).toEqual({ kind: 'unreadable', reason: 'read-failed' });
  });

  it('reports a dead band as unreadable for every row', () => {
    const dead = band({ deletedAt: '2026-11-01T00:00:00Z' });
    const group = parseGroup(new Map([[BOB, ok(row(BOB, []))]]), everyone(BOB), dead);
    expect(group.members.get(BOB)).toEqual({ kind: 'unreadable', reason: 'dead-band' });
  });

  it('uses the newest stamp as "last saved", or null when the row has none', () => {
    const reads = new Map([
      [BOB, ok(row(BOB, [], { updatedAt: undefined }))],
      [CAT, ok(row(CAT, [], { updatedAt: undefined, createdAt: undefined }))],
    ]);
    const { members } = parseGroup(reads, everyone(BOB, CAT), band());
    expect(members.get(BOB)).toMatchObject({ lastSaved: '2026-11-01T00:00:00Z' });
    expect(members.get(CAT)).toMatchObject({ lastSaved: null });
  });

  it('does not depend on the clock: the same group resolves differently at different times', () => {
    const group = parseGroup(new Map([[BOB, ok(row(BOB, [S + 1]))]]), everyone(BOB), band());
    expect(availableStatus(resolveAt(group, NOW), BOB)?.free.size).toBe(1);
    expect(availableStatus(resolveAt(group, NOW + DAY), BOB)?.free.size).toBe(0);
    expect(availableStatus(resolveAt(group, NOW), BOB)?.free.size).toBe(1);
  });
});

describe('resolveAt boundaries', () => {
  const resolve = (r: AvailabilityRecord, now = NOW, mine?: { sub: string; free: ReadonlySet<number> }) =>
    resolveAvailability(new Map([[BOB, ok(r)]]), everyone(BOB), band(), now, mine);
  const midnightDay = utcDayOf(MIDNIGHT);

  it('describes the clock it resolved at', () => {
    const r = resolveAvailability(new Map(), { subs: [BOB], excluded: 3 }, band(), NOW);
    expect(r.nowSlot).toBe(S);
    expect(r.horizonEndSlot).toBe(horizonEndSlot(NOW));
    expect(r.participants).toEqual([BOB]);
    expect(r.excluded).toBe(3);
  });

  it('treats a row that starts exactly at the horizon as not ours, and one a day earlier as fine', () => {
    // At midnight the horizon lands on a UTC day boundary, so the edge can be hit exactly.
    const day = midnightDay;
    expect(horizonEndSlot(MIDNIGHT)).toBe((day + 61) * 48);
    const atHorizon = { ...row(BOB, []), startDay: day + 61 };
    const before = { ...row(BOB, []), startDay: day + 60 };
    expect(resolve(atHorizon, MIDNIGHT).statuses.get(BOB)).toEqual({ kind: 'unreadable', reason: 'invalid' });
    expect(resolve(before, MIDNIGHT).statuses.get(BOB)?.kind).toBe('available');
  });

  it('treats a row whose window ends exactly now as expired, and one slot longer as available', () => {
    const oneDay = { ...row(BOB, []), startDay: midnightDay - 1, mask: '0'.repeat(hexPerDay) };
    const twoDays = { ...row(BOB, []), startDay: midnightDay - 1, mask: '0'.repeat(2 * hexPerDay) };
    expect(slotOf(MIDNIGHT)).toBe(midnightDay * 48);
    expect(resolve(oneDay, MIDNIGHT).statuses.get(BOB)).toMatchObject({ kind: 'not-responded', expired: true });
    expect(resolve(twoDays, MIDNIGHT).statuses.get(BOB)?.kind).toBe('available');
  });

  it('keeps the row window on an available status', () => {
    const status = availableStatus(resolve(row(BOB, [S + 1])), BOB);
    expect(status).toMatchObject(writerWindow(NOW));
  });

  it('flags out-of-date only after more than the stale period', () => {
    const at = (ms: number) => availableStatus(resolve(row(BOB, [], { updatedAt: new Date(ms).toISOString() })), BOB);
    const { staleDays } = AVAILABILITY_LIMITS;
    expect(at(NOW - staleDays * DAY)?.outOfDate).toBe(false);
    expect(at(NOW - staleDays * DAY - 1)?.outOfDate).toBe(true);
    expect(at(NOW + DAY)?.outOfDate).toBe(false);
  });

  it('keeps an unparseable "last saved" and never calls the row out of date', () => {
    const status = availableStatus(resolve(row(BOB, [], { updatedAt: 'not a date' })), BOB);
    expect(status).toMatchObject({ lastSaved: 'not a date', outOfDate: false });
  });

  it('reports a participant with no row as never having saved', () => {
    const r = resolveAvailability(new Map([[BOB, ok(null)]]), everyone(BOB), band(), NOW);
    expect(r.statuses.get(BOB)).toEqual({ kind: 'not-responded', lastSaved: null, expired: false });
  });

  describe('with the caller\'s unsaved marks', () => {
    it('clips them to what has not started and is before the horizon', () => {
      const horizon = horizonEndSlot(NOW);
      const mine = { sub: BOB, free: new Set([S - 1, S, S + 1, horizon - 1, horizon, horizon + 5]) };
      const status = availableStatus(resolve(row(BOB, []), NOW, mine), BOB);
      expect([...status!.free].sort(byNumber)).toEqual([S + 1, horizon - 1]);
    });

    it('counts the caller as available with nothing marked', () => {
      const status = availableStatus(resolve(row(BOB, [S + 1]), NOW, { sub: BOB, free: new Set() }), BOB);
      expect(status?.free.size).toBe(0);
    });

    it('keeps the saved "last saved" but is never out of date', () => {
      const old = row(BOB, [S + 1], { updatedAt: new Date(NOW - 30 * DAY).toISOString() });
      const status = availableStatus(resolve(old, NOW, { sub: BOB, free: new Set([S + 1]) }), BOB);
      expect(status).toMatchObject({ lastSaved: old.updatedAt, outOfDate: false });
    });

    it('has no "last saved" before the first save', () => {
      const r = resolveAvailability(new Map(), everyone(BOB), band(), NOW, { sub: BOB, free: new Set([S + 1]) });
      expect(availableStatus(r, BOB)?.lastSaved).toBeNull();
    });

    it('replaces an unreadable or expired row with the live marks', () => {
      const unreadable = row(BOB, [], { mask: 'zz' });
      const mine = { sub: BOB, free: new Set([S + 2]) };
      expect(availableStatus(resolve(unreadable, NOW, mine), BOB)?.free.has(S + 2)).toBe(true);
      const failed = resolveAvailability(new Map([[BOB, { status: 'failed' }]]), everyone(BOB), band(), NOW, mine);
      expect(failed.statuses.get(BOB)?.kind).toBe('available');
    });

    it('does not add a caller who is not among the participants', () => {
      const r = resolveAvailability(new Map(), everyone(CAT), band(), NOW, { sub: BOB, free: new Set([S + 2]) });
      expect(r.participants).toEqual([CAT]);
      expect(r.statuses.has(BOB)).toBe(false);
    });

    it('leaves other members as they were saved', () => {
      const reads = new Map([[BOB, ok(row(BOB, [S + 1]))], [CAT, ok(row(CAT, [S + 9]))]]);
      const r = resolveAvailability(reads, everyone(BOB, CAT), band(), NOW, { sub: BOB, free: new Set([S + 2]) });
      expect([...availableStatus(r, CAT)!.free]).toEqual([S + 9]);
    });

    it('does not change the set it was given', () => {
      const free = new Set([S - 1, S + 2]);
      resolve(row(BOB, []), NOW, { sub: BOB, free });
      expect([...free]).toEqual([S - 1, S + 2]);
    });
  });
});

describe('status helpers', () => {
  it('lists participants of a kind in participant order, and none when there are none', () => {
    const r = resolveMarks({ [OWNER]: [S + 1], [CAT]: [S + 1], [BOB]: [S + 1] }, [DAN]);
    expect(subsOfKind(r, 'available')).toEqual([OWNER, CAT, BOB]);
    expect(subsOfKind(r, 'not-responded')).toEqual([DAN]);
    expect(subsOfKind(r, 'unreadable')).toEqual([]);
  });

  it('only returns the status of an available member', () => {
    const r = resolveMarks({ [OWNER]: [S + 1] }, [BOB]);
    expect(availableStatus(r, OWNER)?.kind).toBe('available');
    expect(availableStatus(r, BOB)).toBeUndefined();
    expect(availableStatus(r, 'sub-nobody')).toBeUndefined();
  });
});

describe('overlap', () => {
  it('counts who is free at each slot', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1, S + 2], [BOB]: [S + 2, S + 3] }));
    expect(overlap.countAt(S + 1)).toBe(1);
    expect(overlap.countAt(S + 2)).toBe(2);
    expect(overlap.freeAt(S + 2)).toEqual([OWNER, BOB]);
    expect(overlap.freeAt(S + 9)).toEqual([]);
    expect(overlap.maxCount).toBe(2);
  });

  it('works with the maximum number of participants', () => {
    const marks: Record<string, number[]> = {};
    for (let i = 0; i < AVAILABILITY_LIMITS.maxParticipants; i++) marks[`sub-m${i}`] = [S + 1];
    const overlap = buildOverlap(resolveMarks(marks));
    expect(overlap.countAt(S + 1)).toBe(AVAILABILITY_LIMITS.maxParticipants);
    expect(overlap.freeAt(S + 1)).toHaveLength(AVAILABILITY_LIMITS.maxParticipants);
  });

  it('counts only members who have a row', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1] }, [BOB]));
    expect(overlap.subs).toEqual([OWNER]);
  });
});

describe('overlap bit sets', () => {
  it('counts the members in a set', () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0b1011)).toBe(3);
    expect(popcount(2 ** 30)).toBe(1);
    expect(popcount(2 ** 31 - 1)).toBe(31);
  });

  it('intersects two sets', () => {
    expect(intersect(0b1100, 0b0110)).toBe(0b0100);
    expect(intersect(0b1010, 0b0101)).toBe(0);
    expect(intersect(0b1010, 0)).toBe(0);
  });

  it('has nothing to report when no one has a row', () => {
    const overlap = buildOverlap(resolveMarks({}, [BOB]));
    expect(overlap.subs).toEqual([]);
    expect(overlap.maxCount).toBe(0);
    expect(overlap.maskAt(S + 1)).toBe(0);
    expect(overlap.countAt(S + 1)).toBe(0);
    expect(overlap.freeAt(S + 1)).toEqual([]);
  });

  it('numbers members only among those who have a row, in participant order', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1], [CAT]: [S + 1, S + 2] }, [BOB]));
    expect(overlap.subs).toEqual([OWNER, CAT]);
    expect(overlap.maskAt(S + 1)).toBe(0b11);
    expect(overlap.maskAt(S + 2)).toBe(0b10);
    expect(overlap.membersIn(0b10)).toEqual([CAT]);
    expect(overlap.membersIn(0b11)).toEqual([OWNER, CAT]);
    expect(overlap.membersIn(0)).toEqual([]);
  });

  it('lets callers intersect slots to find who is free for both', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1, S + 2], [BOB]: [S + 1], [CAT]: [S + 1, S + 2] }));
    const both = intersect(overlap.maskAt(S + 1), overlap.maskAt(S + 2));
    expect(overlap.membersIn(both)).toEqual([OWNER, CAT]);
    expect(popcount(both)).toBe(2);
  });

  it('takes the most members free at any one slot as the maximum', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1, S + 5], [BOB]: [S + 5], [CAT]: [S + 5, S + 9] }));
    expect(overlap.maxCount).toBe(3);
    expect(buildOverlap(resolveMarks({ [OWNER]: [S + 1], [BOB]: [S + 2] })).maxCount).toBe(1);
  });

  it('keeps the resolution it was built from', () => {
    const resolution = resolveMarks({ [OWNER]: [S + 1] });
    expect(buildOverlap(resolution).resolution).toBe(resolution);
  });

  it('includes the caller\'s unsaved marks when they were resolved in', () => {
    const resolution = resolveAvailability(new Map(), everyone(BOB), band(), NOW, { sub: BOB, free: new Set([S + 3]) });
    expect(buildOverlap(resolution).freeAt(S + 3)).toEqual([BOB]);
  });
});

describe('describeSlot', () => {
  it('describes a slot as free, not marked or without data — never busy', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1], [BOB]: [S + 9] }, [CAT]));
    expect(describeSlot(overlap, S + 1)).toEqual({ free: [OWNER], notMarked: [BOB], noData: [CAT], unreadable: [] });
    // Past a member's window there is nothing to go on.
    const far = describeSlot(overlap, S + 70 * 48);
    expect(far.notMarked).toEqual([]);
    expect(far.noData).toEqual([OWNER, BOB, CAT]);
  });

  it('lists unreadable members separately', () => {
    const resolution = resolveAvailability(new Map([[BOB, { status: 'failed' }]]), everyone(BOB), band(), NOW);
    expect(describeSlot(buildOverlap(resolution), S + 1).unreadable).toEqual([BOB]);
  });

  it('puts a member whose row starts later in "no data", not "not marked"', () => {
    const later = row(BOB, [], { startDay: NOW_DAY + 3 });
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(row(OWNER, [S + 1]))], [BOB, ok(later)]]);
    const overlap = buildOverlap(resolveAvailability(reads, everyone(OWNER, BOB), band(), NOW));
    expect(describeSlot(overlap, S + 1)).toEqual({ free: [OWNER], notMarked: [], noData: [BOB], unreadable: [] });
  });

  it('switches from "not marked" to "no data" exactly at the end of a member\'s window', () => {
    const { endSlot, startSlot } = writerWindow(NOW);
    const overlap = buildOverlap(resolveMarks({ [BOB]: [S + 1] }));
    expect(describeSlot(overlap, endSlot - 1).notMarked).toEqual([BOB]);
    expect(describeSlot(overlap, endSlot).noData).toEqual([BOB]);
    expect(describeSlot(overlap, startSlot).notMarked).toEqual([BOB]);
    expect(describeSlot(overlap, startSlot - 1).noData).toEqual([BOB]);
  });

  it('treats a member whose row expired as having no data', () => {
    const old = row(BOB, [], { startDay: NOW_DAY - 100 });
    const overlap = buildOverlap(resolveAvailability(new Map([[BOB, ok(old)]]), everyone(BOB), band(), NOW));
    expect(describeSlot(overlap, S + 1)).toEqual({ free: [], notMarked: [], noData: [BOB], unreadable: [] });
  });

  it('reports nothing missing when everyone is free', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 1], [BOB]: [S + 1] }));
    expect(describeSlot(overlap, S + 1)).toEqual({ free: [OWNER, BOB], notMarked: [], noData: [], unreadable: [] });
  });

  it('sorts a mixed group into each bucket in participant order', () => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, [S + 1]))],
      [BOB, ok(row(BOB, [S + 2]))],
      [CAT, ok(null)],
      [DAN, { status: 'failed' }],
      [MALLORY, ok(row(MALLORY, [S + 2]))],
    ]);
    const overlap = buildOverlap(resolveAvailability(reads, everyone(OWNER, BOB, CAT, DAN, MALLORY), band(), NOW));
    expect(describeSlot(overlap, S + 1)).toEqual({
      free: [OWNER],
      notMarked: [BOB, MALLORY],
      noData: [CAT],
      unreadable: [DAN],
    });
  });

  it('agrees with the overlap about who is free', () => {
    const overlap = buildOverlap(resolveMarks({ [OWNER]: [S + 4], [BOB]: [S + 4], [CAT]: [S + 5] }));
    expect(describeSlot(overlap, S + 4).free).toEqual(overlap.freeAt(S + 4));
  });
});

describe('describeAge', () => {
  const at = (ms: number) => new Date(ms).toISOString();

  it('words how long ago a row was saved', () => {
    expect(describeAge(at(NOW - 2 * 60 * 60 * 1000), NOW)).toBe('today');
    expect(describeAge(at(NOW - 25 * 60 * 60 * 1000), NOW)).toBe('yesterday');
    expect(describeAge(at(NOW - 3 * DAY), NOW)).toBe('3 days ago');
    expect(describeAge(at(NOW - 40 * DAY), NOW)).toBe('40 days ago');
  });

  it('treats a timestamp in the future as today (a skewed clock must not read "-1 days ago")', () => {
    expect(describeAge(at(NOW + 5 * DAY), NOW)).toBe('today');
  });

  it('has nothing to say without a usable timestamp', () => {
    expect(describeAge(null, NOW)).toBeNull();
    expect(describeAge('not a date', NOW)).toBeNull();
    expect(describeAge('', NOW)).toBeNull();
  });
});

describe('blockReasonOf', () => {
  it('names why editing is off for each state, and nothing when it can proceed', () => {
    const state = (read: AvailabilityRead) => classifyOwnRow(read, band(), BOB);
    expect(blockReasonOf(state({ status: 'failed' }))).toBe('failed');
    expect(blockReasonOf(state(ok(row(BOB, [], { format: 2 }))))).toBe('newer-format');
    expect(blockReasonOf(state(ok(row(BOB, [], { owner: MALLORY }))))).toBe('unavailable');
    expect(blockReasonOf(state(NO_ROW_READ))).toBeNull();
    expect(blockReasonOf(state(ok(row(BOB, [S + 1]))))).toBeNull();
    expect(blockReasonOf(state(ok(row(BOB, [], { mask: 'zz' }))))).toBeNull(); // replaceable, not blocked
  });

  it('NO_ROW_READ is a stable "no row yet" read', () => {
    expect(NO_ROW_READ).toEqual({ status: 'ok', row: null });
  });
});

describe('hasCurrentRow', () => {
  const group = (read: AvailabilityRead) => parseGroup(new Map([[BOB, read]]), everyone(BOB), band());

  it('is true for a row that still speaks for upcoming time', () => {
    expect(hasCurrentRow(group(ok(row(BOB, [S + 1]))), BOB, NOW)).toBe(true);
    expect(hasCurrentRow(group(ok(row(BOB, []))), BOB, NOW)).toBe(true); // saved with nothing free
  });

  it('is false for no row, a failed read, an unreadable row, an expired one or someone else', () => {
    expect(hasCurrentRow(group(ok(null)), BOB, NOW)).toBe(false);
    expect(hasCurrentRow(group({ status: 'failed' }), BOB, NOW)).toBe(false);
    expect(hasCurrentRow(group(ok(row(BOB, [], { mask: 'zz' }))), BOB, NOW)).toBe(false);
    expect(hasCurrentRow(group(ok(row(BOB, [], { startDay: utcDayOf(NOW) - 100 }))), BOB, NOW)).toBe(false);
    expect(hasCurrentRow(group(ok(row(BOB, [S + 1]))), CAT, NOW)).toBe(false);
  });
});

describe('resolveAt with the caller’s own last-saved time', () => {
  it('reports the caller’s timestamp, not the one on a stale loaded row', () => {
    const group = parseGroup(new Map([[BOB, ok(row(BOB, [S + 1], { updatedAt: '2026-11-01T00:00:00Z' }))]]), everyone(BOB), band());
    const status = (lastSaved?: string | null) =>
      availableStatus(resolveAt(group, NOW, { sub: BOB, free: new Set([S + 1]), lastSaved }), BOB)?.lastSaved;
    expect(status('2026-11-03T00:00:00Z')).toBe('2026-11-03T00:00:00Z');
    expect(status(null)).toBeNull();
    expect(status(undefined)).toBe('2026-11-01T00:00:00Z'); // not given: falls back to the loaded row
  });
});
