import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m, loadBandView } = vi.hoisted(() => ({
  m: { BandRig: { get: vi.fn() } } as Record<string, unknown>,
  loadBandView: vi.fn(),
}));

vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: m, graphql: vi.fn() })) }));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));
vi.mock('./bandsApi', () => ({ loadBandView }));

import { BOB, ME, OWNER, makeView } from '../availabilityTestHelpers';
import { RIG_FORMAT, serializeDraft } from '../rigData';
import type { RigRead } from '../rigData';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../rigPresets';
import { fetchRigReads, loadRigPage } from './rigApi';
import { isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';

const get = (m.BandRig as { get: ReturnType<typeof vi.fn> }).get;
const BOOM = [{ errorType: 'InternalFailure', message: 'boom' }];

const rowFor = (owner: string) => ({
  bandId: 'band-1', owner, format: RIG_FORMAT, rev: 2, ...serializeDraft({ gear: JAM_STATION_GEAR, diagrams: [JAM_STATION_DIAGRAM] }),
});

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: null });
  loadBandView.mockReset();
  loadBandView.mockResolvedValue({ status: 'ok', view: makeView() });
  m.BandRig = { get };
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fetchRigReads', () => {
  it('reads every participant by their own key', async () => {
    get.mockImplementation(async ({ owner }: { owner: string }) => ({ data: owner === BOB ? rowFor(BOB) : null }));
    const reads = await fetchRigReads('band-1', [OWNER, BOB]);
    expect(get).toHaveBeenCalledWith({ bandId: 'band-1', owner: OWNER });
    expect(get).toHaveBeenCalledWith({ bandId: 'band-1', owner: BOB });
    expect(reads.get(OWNER)).toEqual({ status: 'ok', row: null });
    expect(reads.get(BOB)).toMatchObject({ status: 'ok', row: { owner: BOB } });
  });

  it('keeps one member’s failure to that member', async () => {
    get.mockImplementation(async ({ owner }: { owner: string }) =>
      owner === BOB ? { data: null, errors: BOOM } : { data: rowFor(owner) },
    );
    const reads = await fetchRigReads('band-1', [OWNER, BOB, ME]);
    expect(reads.get(BOB)).toEqual({ status: 'failed' });
    expect(reads.get(OWNER)?.status).toBe('ok');
  });

  it('falls back to a member’s previous good row when a refresh fails for them', async () => {
    const previous = new Map<string, RigRead>([[BOB, { status: 'ok', row: rowFor(BOB) }]]);
    get.mockResolvedValue({ data: null, errors: BOOM });
    get.mockImplementation(async ({ owner }: { owner: string }) => (owner === BOB ? { data: null, errors: BOOM } : { data: null }));
    const reads = await fetchRigReads('band-1', [OWNER, BOB], previous);
    expect(reads.get(BOB)).toBe(previous.get(BOB));
  });

  it('throws when every read fails, but not when there is nobody to read', async () => {
    get.mockResolvedValue({ data: null, errors: BOOM });
    await expect(fetchRigReads('band-1', [OWNER, BOB])).rejects.toThrow(/Could not load gear and rigs/);
    await expect(fetchRigReads('band-1', [])).resolves.toEqual(new Map());
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(fetchRigReads('band-1', [OWNER])).rejects.toBeInstanceOf(NotSignedInError);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('loadRigPage', () => {
  it('returns every participant’s validated rig, caller and owner first', async () => {
    get.mockImplementation(async ({ owner }: { owner: string }) => ({ data: owner === ME ? rowFor(ME) : null }));
    const result = await loadRigPage('band-1');
    expect(loadBandView).toHaveBeenCalledWith('band-1', { skipSetLists: true });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.members.map((x) => [x.owner, x.state])).toEqual([[OWNER, 'none'], [ME, 'ok'], [BOB, 'none']]);
    expect(result.members[1].draft.diagrams[0].name).toBe('Jam Station');
    expect(result.members[1].rev).toBe(2);
  });

  it('passes a non-ok band result straight through', async () => {
    loadBandView.mockResolvedValue({ status: 'not-found' });
    expect(await loadRigPage('band-1')).toEqual({ status: 'not-found' });
    expect(get).not.toHaveBeenCalled();
  });

  it('reads no rows for someone who is not a member', async () => {
    loadBandView.mockResolvedValue({ status: 'ok', view: makeView({ isMember: false }) });
    const result = await loadRigPage('band-1');
    expect(result).toMatchObject({ status: 'ok', members: [] });
    expect(get).not.toHaveBeenCalled();
  });

  it('is "unavailable" against a backend without the model, without loading the band', async () => {
    delete m.BandRig;
    expect(await loadRigPage('band-1')).toEqual({ status: 'unavailable' });
    expect(loadBandView).not.toHaveBeenCalled();
  });

  it('never takes the caller’s own row from the previous load', async () => {
    const previous = new Map<string, RigRead>([[ME, { status: 'ok', row: rowFor(ME) }]]);
    get.mockResolvedValue({ data: null, errors: BOOM });
    get.mockImplementation(async ({ owner }: { owner: string }) => (owner === ME ? { data: null, errors: BOOM } : { data: null }));
    const result = await loadRigPage('band-1', previous);
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.members.find((x) => x.owner === ME)?.state).toBe('failed');
  });
});
