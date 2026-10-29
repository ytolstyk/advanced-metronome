import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => {
  const model = () => ({ get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  const m: Record<string, unknown> = {
    BandRig: model(),
    Availability: model(),
    Member: model(),
    MyBand: model(),
    graphql: vi.fn(),
  };
  return { m };
});

vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: m, graphql: m.graphql })) }));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));

import { BOOM, CONFLICT, ME, UNAUTH } from '../availabilityTestHelpers';
import { RIG_FORMAT, rigRowMaxBytes, serializeDraft } from '../rigData';
import type { RigDraft } from '../rigData';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../rigPresets';
import { dismissBand } from './bandsApi';
import { isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';
import {
  RigBlockedError,
  RigConflictError,
  RigUnavailableError,
  cleanupMyRig,
  deleteMyRig,
  deleteMyRigWithin,
  getRigRead,
  isRigAvailable,
  saveMyRig,
} from './rigRows';

interface Fns {
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
const R = m.BandRig as Fns;
const A = m.Availability as Fns;
const MEMBER = m.Member as Fns;
const MYBAND = m.MyBand as Fns;
const graphql = m.graphql as ReturnType<typeof vi.fn>;

const DRAFT: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [JAM_STATION_DIAGRAM] };
const strings = serializeDraft(DRAFT);

const stored = (over: Record<string, unknown> = {}) => ({
  bandId: 'band-1', owner: ME, format: RIG_FORMAT, rev: 1, ...strings, updatedAt: 'u', ...over,
});
const echoCreate = async (input: Record<string, unknown>) => ({ data: { ...input, updatedAt: 'u' } });

/** Each test uses its own band id: the per-band lock would otherwise chain a hung test into the next. */
let n = 0;
const freshBand = () => `rig-band-${++n}`;

beforeEach(() => {
  for (const fns of [R, A, MEMBER, MYBAND]) {
    for (const fn of Object.values(fns)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  graphql.mockReset();
  R.get.mockResolvedValue({ data: null });
  R.create.mockImplementation(echoCreate);
  R.delete.mockResolvedValue({ data: {} });
  A.get.mockResolvedValue({ data: null });
  MEMBER.delete.mockResolvedValue({ data: {} });
  MYBAND.delete.mockResolvedValue({ data: {} });
  m.BandRig = R;
  vi.mocked(isAuthenticated).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getRigRead', () => {
  it('returns the row mapped to the record shape', async () => {
    R.get.mockResolvedValue({ data: stored({ rev: 3 }) });
    const read = await getRigRead('band-1', ME);
    expect(R.get).toHaveBeenCalledWith({ bandId: 'band-1', owner: ME });
    expect(read).toMatchObject({ status: 'ok', row: { bandId: 'band-1', owner: ME, format: 1, rev: 3, gear: strings.gear } });
  });

  it('returns an empty result for a member with no row', async () => {
    expect(await getRigRead('band-1', ME)).toEqual({ status: 'ok', row: null });
  });

  it('reports a failed read as a result, not an exception', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    R.get.mockResolvedValueOnce({ data: null, errors: BOOM });
    expect(await getRigRead('band-1', ME)).toEqual({ status: 'failed' });
    R.get.mockRejectedValueOnce(new Error('network'));
    expect(await getRigRead('band-1', ME)).toEqual({ status: 'failed' });
  });

  it('throws "unavailable" against a backend without the model', async () => {
    delete m.BandRig;
    expect(isRigAvailable()).toBe(false);
    await expect(getRigRead('band-1', ME)).rejects.toBeInstanceOf(RigUnavailableError);
  });

  it('refuses a signed-out read instead of reporting it as a failed read', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(getRigRead('band-1', ME)).rejects.toBeInstanceOf(NotSignedInError);
    expect(R.get).not.toHaveBeenCalled();
  });
});

describe('saveMyRig: first save', () => {
  it('creates the row at rev 1', async () => {
    const band = freshBand();
    const saved = await saveMyRig(band, DRAFT, { baselineRev: null });
    expect(R.create).toHaveBeenCalledWith({ bandId: band, owner: ME, format: 1, rev: 1, ...strings });
    expect(saved.rev).toBe(1);
    expect(graphql).not.toHaveBeenCalled();
  });

  it('counts a create that finds the identical row (a lost response, retried) as success', async () => {
    R.create.mockResolvedValue({ data: null, errors: CONFLICT });
    R.get.mockResolvedValue({ data: stored({ rev: 1 }) });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: null })).resolves.toMatchObject({ rev: 1 });
  });

  it('reports a conflict when a different row appeared since the editor loaded', async () => {
    R.create.mockResolvedValue({ data: null, errors: CONFLICT });
    R.get.mockResolvedValue({ data: stored({ rev: 1, gear: '[]' }) });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: null })).rejects.toBeInstanceOf(RigConflictError);
    R.get.mockResolvedValue({ data: stored({ rev: 4 }) });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: null })).rejects.toBeInstanceOf(RigConflictError);
  });
});

describe('saveMyRig: conditional update', () => {
  it('writes rev+1 only if the stored rev is still the one the editor started from', async () => {
    graphql.mockResolvedValue({ data: { updateBandRig: stored({ rev: 6 }) } });
    const band = freshBand();
    const saved = await saveMyRig(band, DRAFT, { baselineRev: 5 });
    expect(graphql).toHaveBeenCalledTimes(1);
    const { query, variables } = graphql.mock.calls[0][0];
    expect(query).toContain('updateBandRig');
    expect(variables).toEqual({
      input: { bandId: band, owner: ME, format: 1, rev: 6, ...strings },
      condition: { rev: { eq: 5 } },
    });
    expect(saved.rev).toBe(6);
    expect(R.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed condition', { errors: CONFLICT }],
    ['a vanished row (reported as Unauthorized)', { errors: UNAUTH }],
  ])('throws a conflict for %s', async (_name, res) => {
    graphql.mockResolvedValue({ data: { updateBandRig: null }, ...res });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 2 })).rejects.toBeInstanceOf(RigConflictError);
  });

  it('understands errors the raw client throws instead of returning', async () => {
    graphql.mockRejectedValue({ errors: CONFLICT });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 2 })).rejects.toBeInstanceOf(RigConflictError);
  });

  it('maps a backend that lacks the mutation to "unavailable", not a generic failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    graphql.mockRejectedValue({ errors: [{ message: 'Validation error of type FieldUndefined: Field updateBandRig' }] });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 2 })).rejects.toBeInstanceOf(RigUnavailableError);
  });

  it('surfaces any other failure', async () => {
    graphql.mockResolvedValue({ data: null, errors: BOOM });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 2 })).rejects.toThrow(/updateBandRig/);
  });
});

describe('saveMyRig: a lost reply to our own update', () => {
  it('counts it as success when the stored row is exactly what we wrote, one revision on', async () => {
    graphql.mockResolvedValue({ data: { updateBandRig: null }, errors: CONFLICT }); // the retry from rev 5 now fails its condition
    R.get.mockResolvedValue({ data: stored({ rev: 6 }) });
    const saved = await saveMyRig(freshBand(), DRAFT, { baselineRev: 5 });
    expect(saved.rev).toBe(6);
  });

  it('is still a conflict when someone else changed the row (different content, or further revisions)', async () => {
    graphql.mockResolvedValue({ data: { updateBandRig: null }, errors: CONFLICT });
    R.get.mockResolvedValue({ data: stored({ rev: 6, gear: '[]' }) });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 5 })).rejects.toBeInstanceOf(RigConflictError);
    R.get.mockResolvedValue({ data: stored({ rev: 7 }) });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 5 })).rejects.toBeInstanceOf(RigConflictError);
  });
});

describe('saveMyRig: overwrite after a conflict', () => {
  it('re-reads the stored rev and conditions on that', async () => {
    R.get.mockResolvedValue({ data: stored({ rev: 9 }) });
    graphql.mockResolvedValue({ data: { updateBandRig: stored({ rev: 10 }) } });
    await saveMyRig(freshBand(), DRAFT, { baselineRev: 2, overwrite: true });
    expect(graphql.mock.calls[0][0].variables.condition).toEqual({ rev: { eq: 9 } });
    expect(graphql.mock.calls[0][0].variables.input.rev).toBe(10);
  });

  it('creates the row when it has been deleted in the meantime', async () => {
    R.get.mockResolvedValue({ data: null });
    await saveMyRig(freshBand(), DRAFT, { baselineRev: 2, overwrite: true });
    expect(R.create).toHaveBeenCalledTimes(1);
    expect(graphql).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a row written by a newer version of the app', async () => {
    R.get.mockResolvedValue({ data: stored({ format: 2 }) });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 2, overwrite: true })).rejects.toMatchObject({ reason: 'newer' });
    expect(graphql).not.toHaveBeenCalled();
  });

  it('does not overwrite blindly when the re-read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    R.get.mockResolvedValue({ data: null, errors: BOOM });
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: 2, overwrite: true })).rejects.toThrow(/check your saved/);
    expect(graphql).not.toHaveBeenCalled();
  });
});

describe('saveMyRig: refusing bad drafts and bad states', () => {
  it('refuses a draft over the size budget', async () => {
    const big: RigDraft = { gear: [{ ...JAM_STATION_GEAR[0], specs: 'x'.repeat(rigRowMaxBytes()) }], diagrams: [] };
    await expect(saveMyRig(freshBand(), big, { baselineRev: null })).rejects.toBeInstanceOf(RigBlockedError);
    expect(R.create).not.toHaveBeenCalled();
  });

  it('refuses a draft the validator would hide (nothing invalid is ever written)', async () => {
    const bad: RigDraft = { gear: [{ ...JAM_STATION_GEAR[0], name: 'Sneaky​name' }], diagrams: [] };
    await expect(saveMyRig(freshBand(), bad, { baselineRev: null })).rejects.toMatchObject({ reason: 'invalid' });
    expect(R.create).not.toHaveBeenCalled();
  });

  it('refuses to save while signed out', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: null })).rejects.toBeInstanceOf(NotSignedInError);
    expect(R.create).not.toHaveBeenCalled();
  });

  it('refuses against a backend without the model', async () => {
    delete m.BandRig;
    await expect(saveMyRig(freshBand(), DRAFT, { baselineRev: null })).rejects.toBeInstanceOf(RigUnavailableError);
  });
});

describe('deleteMyRig', () => {
  it('deletes the caller’s own row by key', async () => {
    R.get.mockResolvedValue({ data: stored() });
    const band = freshBand();
    await deleteMyRig(band);
    expect(R.delete).toHaveBeenCalledWith({ bandId: band, owner: ME });
  });

  it('is a no-op when there is no row, or no model', async () => {
    await deleteMyRig(freshBand());
    expect(R.delete).not.toHaveBeenCalled();
    delete m.BandRig;
    await expect(deleteMyRig(freshBand())).resolves.toBeUndefined();
  });

  it('does not report a refused delete as done when the row is still there', async () => {
    R.get.mockResolvedValue({ data: stored() });
    R.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(deleteMyRig(freshBand())).rejects.toThrow();
  });

  it('accepts a refused delete when a re-read shows the row is gone', async () => {
    R.get.mockResolvedValueOnce({ data: stored() }).mockResolvedValue({ data: null });
    R.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(deleteMyRig(freshBand())).resolves.toBeUndefined();
  });

  it('waits for a save started from the same tab (they share a lock)', async () => {
    const order: string[] = [];
    let releaseCreate!: () => void;
    R.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseCreate = () => {
            order.push('save-write');
            resolve({ data: stored() });
          };
        }),
    );
    R.get.mockResolvedValue({ data: stored() });
    R.delete.mockImplementation(async () => {
      order.push('delete');
      return { data: {} };
    });
    const band = freshBand();
    const save = saveMyRig(band, DRAFT, { baselineRev: null });
    const del = deleteMyRig(band);
    await vi.waitFor(() => expect(R.create).toHaveBeenCalled());
    releaseCreate();
    await Promise.all([save, del]);
    expect(order).toEqual(['save-write', 'delete']);
  });
});

describe('deleteMyRigWithin', () => {
  it('gives up when the delete stalls, so a dialog is never stuck waiting', async () => {
    vi.useFakeTimers();
    R.get.mockReturnValue(new Promise(() => {}));
    const result = deleteMyRigWithin(freshBand(), 5_000).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toEqual(expect.objectContaining({ message: 'deleteBandRig timed out' }));
  });
});

describe('cleanupMyRig', () => {
  it('retries once after a failure', async () => {
    R.get.mockResolvedValue({ data: stored() });
    R.delete.mockResolvedValueOnce({ data: null, errors: BOOM }).mockResolvedValueOnce({ data: {} });
    await cleanupMyRig(freshBand());
    expect(R.delete).toHaveBeenCalledTimes(2);
  });

  it('accepts an Unauthorized reply as done (best-effort)', async () => {
    R.get.mockResolvedValue({ data: stored() });
    R.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await cleanupMyRig(freshBand());
    expect(R.delete).toHaveBeenCalledTimes(1);
  });

  it('never rejects, even when both attempts fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    R.get.mockResolvedValue({ data: stored() });
    R.delete.mockResolvedValue({ data: null, errors: BOOM });
    await expect(cleanupMyRig(freshBand())).resolves.toBeUndefined();
    expect(R.delete).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  it('gives up after five seconds when the work stalls', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    R.get.mockReturnValue(new Promise(() => {}));
    const done = vi.fn();
    void cleanupMyRig(freshBand()).then(done);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('is quiet against a backend without the model', async () => {
    delete m.BandRig;
    await expect(cleanupMyRig(freshBand())).resolves.toBeUndefined();
  });
});

describe('dismissBand', () => {
  it('also cleans up the caller’s gear and rig row, without waiting for it', async () => {
    R.get.mockResolvedValue({ data: stored() });
    const band = freshBand();
    await dismissBand(band);
    await vi.waitFor(() => expect(R.delete).toHaveBeenCalledWith({ bandId: band, owner: ME }));
    expect(MEMBER.delete).toHaveBeenCalled();
    expect(MYBAND.delete).toHaveBeenCalled();
  });

  it('still dismisses when the rig cleanup fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    R.get.mockRejectedValue(new Error('boom'));
    await expect(dismissBand(freshBand())).resolves.toBeUndefined();
    expect(MEMBER.delete).toHaveBeenCalled();
  });
});
