import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m, loadBandView } = vi.hoisted(() => ({
  m: { Availability: { get: vi.fn() } } as Record<string, unknown>,
  loadBandView: vi.fn(),
}));

vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: m, graphql: vi.fn() })) }));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));
vi.mock('./bandsApi', () => ({ loadBandView }));

import { AVAILABILITY_LIMITS, type AvailabilityRead, type BandView } from '../bandTypes';
import { filterValidMembers } from '../bandUtils';
import { BOB, CAT, ME, OWNER, band, member, row } from '../availabilityTestHelpers';
import { fetchAvailabilityReads, loadAvailabilityPage } from './availabilityApi';
import { isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';

const get = (m.Availability as { get: ReturnType<typeof vi.fn> }).get;
const BOOM = [{ errorType: 'InternalFailure', message: 'boom' }];

const viewOf = (over: Partial<BandView> & { memberSubs?: string[] } = {}): BandView => {
  const b = band();
  const members = filterValidMembers([member(ME), member(BOB), member(CAT)], b);
  return {
    band: b,
    sub: ME,
    isOwner: false,
    isMember: true,
    members,
    memberSubs: new Set([OWNER, ...members.map((x) => x.owner)]),
    displayNames: new Map(),
    setLists: [],
    removedMembers: [],
    incomplete: false,
    ...over,
  };
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: null });
  loadBandView.mockReset();
  loadBandView.mockResolvedValue({ status: 'ok', view: viewOf() });
  m.Availability = { get };
  vi.mocked(isAuthenticated).mockResolvedValue(true);
});

describe('fetchAvailabilityReads', () => {
  it('reads every participant by their own key', async () => {
    get.mockImplementation(async ({ owner }: { owner: string }) => ({ data: owner === BOB ? row(BOB, []) : null }));
    const reads = await fetchAvailabilityReads('band-1', [OWNER, BOB]);
    expect(get).toHaveBeenCalledWith({ bandId: 'band-1', owner: OWNER });
    expect(get).toHaveBeenCalledWith({ bandId: 'band-1', owner: BOB });
    expect(reads.get(OWNER)).toEqual({ status: 'ok', row: null });
    expect(reads.get(BOB)).toMatchObject({ status: 'ok', row: { owner: BOB } });
  });

  it('keeps one member’s failure to that member', async () => {
    get.mockImplementation(async ({ owner }: { owner: string }) =>
      owner === BOB ? { data: null, errors: BOOM } : { data: row(owner, []) },
    );
    const reads = await fetchAvailabilityReads('band-1', [OWNER, BOB, CAT]);
    expect(reads.get(BOB)).toEqual({ status: 'failed' });
    expect(reads.get(OWNER)?.status).toBe('ok');
    expect(reads.get(CAT)?.status).toBe('ok');
  });

  it('falls back to a member’s previous good row when a refresh fails for them', async () => {
    const previous = new Map<string, AvailabilityRead>([[BOB, { status: 'ok', row: row(BOB, []) }]]);
    get.mockImplementation(async ({ owner }: { owner: string }) =>
      owner === BOB ? { data: null, errors: BOOM } : { data: null },
    );
    const reads = await fetchAvailabilityReads('band-1', [OWNER, BOB], previous);
    expect(reads.get(BOB)).toBe(previous.get(BOB));
  });

  it('does not invent a previous row for someone who never had a good one', async () => {
    const previous = new Map<string, AvailabilityRead>([[BOB, { status: 'failed' }]]);
    get.mockImplementation(async ({ owner }: { owner: string }) =>
      owner === BOB ? { data: null, errors: BOOM } : { data: null },
    );
    expect((await fetchAvailabilityReads('band-1', [OWNER, BOB], previous)).get(BOB)).toEqual({ status: 'failed' });
  });

  it('throws only when every read fails', async () => {
    get.mockResolvedValue({ data: null, errors: BOOM });
    await expect(fetchAvailabilityReads('band-1', [OWNER, BOB])).rejects.toThrow('Could not load availability');
  });

  it('is fine with nobody to read', async () => {
    expect((await fetchAvailabilityReads('band-1', [])).size).toBe(0);
    expect(get).not.toHaveBeenCalled();
  });

  it('reads everyone at once, up to the participant limit and no more', async () => {
    let inFlight = 0;
    let peak = 0;
    get.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { data: null };
    });
    const limit = AVAILABILITY_LIMITS.maxParticipants;
    await fetchAvailabilityReads('band-1', Array.from({ length: limit + 10 }, (_, i) => `sub-${i}`));
    expect(get).toHaveBeenCalledTimes(limit + 10);
    expect(peak).toBeGreaterThan(6);
    expect(peak).toBeLessThanOrEqual(limit);
  });

  it('requires sign-in on its own, not only through the page loader', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(fetchAvailabilityReads('band-1', [OWNER])).rejects.toBeInstanceOf(NotSignedInError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('loadAvailabilityPage', () => {
  it('loads the band without its set lists, then every participant’s row', async () => {
    const result = await loadAvailabilityPage('band-1');
    expect(loadBandView).toHaveBeenCalledWith('band-1', { skipSetLists: true });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.participants.subs).toEqual([OWNER, ME, BOB, CAT]);
    expect([...result.reads.keys()].sort()).toEqual([OWNER, BOB, CAT, ME].sort());
    expect(result.fetchedAt).toBeLessThanOrEqual(Date.now());
  });

  it.each([{ status: 'not-found' }, { status: 'deleted' }, { status: 'removed', band: band() }])(
    'passes a %o band result straight through without reading rows',
    async (gone) => {
      loadBandView.mockResolvedValue(gone);
      expect(await loadAvailabilityPage('band-1')).toEqual(gone);
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('reads nobody’s rows for someone who is not a member', async () => {
    loadBandView.mockResolvedValue({ status: 'ok', view: viewOf({ isMember: false }) });
    const result = await loadAvailabilityPage('band-1');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.reads.size).toBe(0);
    expect(get).not.toHaveBeenCalled();
  });

  it('says it is unavailable, without loading anything, on a backend without the model', async () => {
    delete m.Availability;
    expect(await loadAvailabilityPage('band-1')).toEqual({ status: 'unavailable' });
    expect(loadBandView).not.toHaveBeenCalled();
  });

  it('lets a member whose refresh fails keep their previous good row', async () => {
    const previous = new Map<string, AvailabilityRead>([[BOB, { status: 'ok', row: row(BOB, []) }]]);
    get.mockImplementation(async ({ owner }: { owner: string }) =>
      owner === BOB ? { data: null, errors: BOOM } : { data: null },
    );
    const result = await loadAvailabilityPage('band-1', previous);
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.reads.get(BOB)).toBe(previous.get(BOB));
  });

  it('never falls back to a previous row for the caller (it may predate their own save)', async () => {
    const previous = new Map<string, AvailabilityRead>([[ME, { status: 'ok', row: row(ME, []) }]]);
    get.mockImplementation(async ({ owner }: { owner: string }) =>
      owner === ME ? { data: null, errors: BOOM } : { data: null },
    );
    const result = await loadAvailabilityPage('band-1', previous);
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.reads.get(ME)).toEqual({ status: 'failed' });
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(loadAvailabilityPage('band-1')).rejects.toBeInstanceOf(NotSignedInError);
  });
});
