import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => {
  const m = {
    ColorLabel: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), listColorLabelByBand: vi.fn() },
    graphql: vi.fn(),
  };
  return { m };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: m, graphql: m.graphql })),
}));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));

import { deleteMyLabelRows, fetchColorLabelRows, setColorLabel } from './colorLabelsApi';
import { getCurrentUserSub, isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];
const OK = { data: {} };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  vi.mocked(getCurrentUserSub).mockResolvedValue('sub-me');
  for (const fn of Object.values(m.ColorLabel)) fn.mockReset();
});

describe('setColorLabel', () => {
  it('first label: creates the row keyed by band, color and the caller', async () => {
    m.ColorLabel.create.mockResolvedValue(OK);
    await setColorLabel('band-1', 'red', 'Ballad', false);
    expect(m.ColorLabel.create).toHaveBeenCalledWith({ bandId: 'band-1', color: 'red', owner: 'sub-me', label: 'Ballad' });
    expect(m.ColorLabel.update).not.toHaveBeenCalled();
  });

  it('renaming a label I already wrote: updates my row, never creating a second one', async () => {
    m.ColorLabel.update.mockResolvedValue(OK);
    await setColorLabel('band-1', 'blue', 'Thrash', true);
    expect(m.ColorLabel.update).toHaveBeenCalledWith({ bandId: 'band-1', color: 'blue', owner: 'sub-me', label: 'Thrash' });
    expect(m.ColorLabel.create).not.toHaveBeenCalled();
  });

  it('keys the row by the current user sub, so each member has their own row for a color', async () => {
    m.ColorLabel.create.mockResolvedValue(OK);
    vi.mocked(getCurrentUserSub).mockResolvedValue('sub-other');
    await setColorLabel('band-1', 'red', 'Ballad', false);
    expect(m.ColorLabel.create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'sub-other' }));
  });

  it('writes the same owner on the update path and on the create fallback', async () => {
    m.ColorLabel.update.mockResolvedValue({ data: null, errors: CONFLICT });
    m.ColorLabel.create.mockResolvedValue(OK);
    await setColorLabel('band-1', 'red', 'Ballad', true);
    expect(m.ColorLabel.update).toHaveBeenCalledWith(expect.objectContaining({ owner: 'sub-me' }));
    expect(m.ColorLabel.create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'sub-me' }));
  });

  describe('sanitising', () => {
    it('trims and collapses whitespace before writing', async () => {
      m.ColorLabel.create.mockResolvedValue(OK);
      await setColorLabel('band-1', 'red', '  Fast \t  thrash  ', false);
      expect(m.ColorLabel.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'Fast thrash' }));
    });

    it('strips zero-width and bidi characters', async () => {
      m.ColorLabel.create.mockResolvedValue(OK);
      await setColorLabel('band-1', 'red', 'Bal​lad‮', false);
      expect(m.ColorLabel.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'Ballad' }));
    });

    it('clamps to 20 characters', async () => {
      m.ColorLabel.create.mockResolvedValue(OK);
      await setColorLabel('band-1', 'red', 'x'.repeat(40), false);
      expect(m.ColorLabel.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'x'.repeat(20) }));
    });

    it('an empty or whitespace-only label is written as "" (clears the label; rows are never deleted)', async () => {
      m.ColorLabel.update.mockResolvedValue(OK);
      await setColorLabel('band-1', 'red', '   ​ ', true);
      expect(m.ColorLabel.update).toHaveBeenCalledWith(expect.objectContaining({ label: '' }));
    });

    it('clearing with no known row still goes through create with ""', async () => {
      m.ColorLabel.create.mockResolvedValue(OK);
      await setColorLabel('band-1', 'red', '', false);
      expect(m.ColorLabel.create).toHaveBeenCalledWith(expect.objectContaining({ label: '' }));
    });
  });

  describe('create/update fallback', () => {
    it('create conflict (a stale view or another tab wrote it): falls back to updating to the wanted label', async () => {
      m.ColorLabel.create.mockResolvedValue({ data: null, errors: CONFLICT });
      m.ColorLabel.update.mockResolvedValue(OK);
      await setColorLabel('band-1', 'green', 'Slow', false);
      expect(m.ColorLabel.update).toHaveBeenCalledWith(expect.objectContaining({ color: 'green', label: 'Slow' }));
    });

    it('update conflict: falls back to creating', async () => {
      m.ColorLabel.update.mockResolvedValue({ data: null, errors: CONFLICT });
      m.ColorLabel.create.mockResolvedValue(OK);
      await setColorLabel('band-1', 'green', 'Slow', true);
      expect(m.ColorLabel.create).toHaveBeenCalledTimes(1);
    });

    it('update of a vanished row (Unauthorized on the missing item): falls back to creating', async () => {
      m.ColorLabel.update.mockResolvedValue({ data: null, errors: UNAUTH });
      m.ColorLabel.create.mockResolvedValue(OK);
      await setColorLabel('band-1', 'pink', 'Funk', true);
      expect(m.ColorLabel.create).toHaveBeenCalledTimes(1);
    });

    it('gives up after bounded attempts instead of looping', async () => {
      m.ColorLabel.create.mockResolvedValue({ data: null, errors: CONFLICT });
      m.ColorLabel.update.mockResolvedValue({ data: null, errors: CONFLICT });
      await expect(setColorLabel('band-1', 'red', 'x', false)).rejects.toThrow('Could not save the color label. Please try again.');
      expect(m.ColorLabel.create.mock.calls.length + m.ColorLabel.update.mock.calls.length).toBe(3);
    });

    it('surfaces real errors from create and update', async () => {
      m.ColorLabel.create.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
      await expect(setColorLabel('band-1', 'red', 'x', false)).rejects.toThrow('createColorLabel: throttled');
      m.ColorLabel.update.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
      await expect(setColorLabel('band-1', 'red', 'x', true)).rejects.toThrow('updateColorLabel: throttled');
    });
  });

  describe('serialisation', () => {
    it('serialises rapid writes on the same band color (second waits for the first)', async () => {
      const events: string[] = [];
      m.ColorLabel.create.mockImplementation(async () => {
        events.push('create:start');
        await new Promise((r) => setTimeout(r, 10));
        events.push('create:end');
        return OK;
      });
      m.ColorLabel.update.mockImplementation(async () => {
        events.push('update');
        return OK;
      });
      await Promise.all([setColorLabel('band-1', 'red', 'a', false), setColorLabel('band-1', 'red', 'b', true)]);
      expect(events).toEqual(['create:start', 'create:end', 'update']);
    });

    it('different colors of the same band are not serialised against each other', async () => {
      const events: string[] = [];
      m.ColorLabel.create.mockImplementation(async (i: { color: string }) => {
        events.push(`start:${i.color}`);
        await new Promise((r) => setTimeout(r, 10));
        events.push(`end:${i.color}`);
        return OK;
      });
      await Promise.all([setColorLabel('band-1', 'red', 'a', false), setColorLabel('band-1', 'blue', 'b', false)]);
      expect(events.slice(0, 2)).toEqual(['start:red', 'start:blue']);
    });

    it('the same color in different bands is not serialised either', async () => {
      const events: string[] = [];
      m.ColorLabel.create.mockImplementation(async (i: { bandId: string }) => {
        events.push(`start:${i.bandId}`);
        await new Promise((r) => setTimeout(r, 10));
        events.push(`end:${i.bandId}`);
        return OK;
      });
      await Promise.all([setColorLabel('band-1', 'red', 'a', false), setColorLabel('band-2', 'red', 'b', false)]);
      expect(events.slice(0, 2)).toEqual(['start:band-1', 'start:band-2']);
    });

    it('a failed call does not block the next write on that color', async () => {
      m.ColorLabel.create.mockResolvedValueOnce({ data: null, errors: [{ message: 'boom' }] }).mockResolvedValue(OK);
      const first = setColorLabel('band-1', 'red', 'a', false);
      const second = setColorLabel('band-1', 'red', 'b', false);
      await expect(first).rejects.toThrow('boom');
      await expect(second).resolves.toBeUndefined();
    });
  });

  it('a failing sub lookup rejects the write without touching the API', async () => {
    vi.mocked(getCurrentUserSub).mockRejectedValue(new Error('no session'));
    await expect(setColorLabel('band-1', 'red', 'x', false)).rejects.toThrow('no session');
    expect(m.ColorLabel.create).not.toHaveBeenCalled();
    expect(m.ColorLabel.update).not.toHaveBeenCalled();
  });

  it('signed out: rejects with NotSignedInError and never touches the API', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(setColorLabel('band-1', 'red', 'x', false)).rejects.toBeInstanceOf(NotSignedInError);
    await expect(setColorLabel('band-1', 'red', 'x', true)).rejects.toThrow('Not authenticated');
    expect(m.ColorLabel.create).not.toHaveBeenCalled();
    expect(m.ColorLabel.update).not.toHaveBeenCalled();
    expect(getCurrentUserSub).not.toHaveBeenCalled();
  });
});

describe('fetchColorLabelRows', () => {
  const row = (color: string, owner = 'sub-bob', label = 'Ballad') => ({
    bandId: 'band-1',
    color,
    owner,
    label,
    createdAt: 'c',
    updatedAt: 'u',
  });

  it('returns the band\'s raw label rows, complete', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [row('red'), row('blue', 'sub-cat', '')], nextToken: null });
    const res = await fetchColorLabelRows('band-1');
    expect(res.incomplete).toBe(false);
    expect(res.items).toEqual([row('red'), row('blue', 'sub-cat', '')]);
    expect(m.ColorLabel.listColorLabelByBand).toHaveBeenCalledWith({ bandId: 'band-1' }, expect.anything());
  });

  it('flags incomplete when the page cap was hit', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await fetchColorLabelRows('band-1');
    expect(res.incomplete).toBe(true);
  });

  it('degrades a failed read (GraphQL errors) to an empty, incomplete result instead of failing the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: null, errors: [{ message: 'labels gsi down' }] });
    await expect(fetchColorLabelRows('band-1')).resolves.toEqual({ items: [], incomplete: true });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('degrades a thrown (network) failure the same way', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.ColorLabel.listColorLabelByBand.mockRejectedValue(new Error('network down'));
    await expect(fetchColorLabelRows('band-1')).resolves.toEqual({ items: [], incomplete: true });
    warn.mockRestore();
  });

  it('signed out: rejects with NotSignedInError before any read (sign-in is NOT swallowed by the degrade)', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(fetchColorLabelRows('band-1')).rejects.toBeInstanceOf(NotSignedInError);
    expect(m.ColorLabel.listColorLabelByBand).not.toHaveBeenCalled();
  });
});

describe('deleteMyLabelRows', () => {
  it('queries only the caller\'s rows (owner sort key) and deletes each by (bandId, color, owner)', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({
      data: [
        { bandId: 'band-1', color: 'red', owner: 'sub-me', label: 'a' },
        { bandId: 'band-1', color: 'blue', owner: 'sub-me', label: '' },
      ],
      nextToken: null,
    });
    m.ColorLabel.delete.mockResolvedValue(OK);
    await deleteMyLabelRows('band-1', 'sub-me');
    expect(m.ColorLabel.listColorLabelByBand).toHaveBeenCalledWith(
      { bandId: 'band-1', owner: { eq: 'sub-me' } },
      expect.anything(),
    );
    expect(m.ColorLabel.delete).toHaveBeenCalledTimes(2);
    expect(m.ColorLabel.delete).toHaveBeenCalledWith({ bandId: 'band-1', color: 'red', owner: 'sub-me' });
    expect(m.ColorLabel.delete).toHaveBeenCalledWith({ bandId: 'band-1', color: 'blue', owner: 'sub-me' });
  });

  it('deletes with the owner argument, not a sub read from the row', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({
      data: [{ bandId: 'band-1', color: 'red', owner: 'sub-someone-else', label: 'a' }],
      nextToken: null,
    });
    m.ColorLabel.delete.mockResolvedValue(OK);
    await deleteMyLabelRows('band-1', 'sub-me');
    expect(m.ColorLabel.delete).toHaveBeenCalledWith({ bandId: 'band-1', color: 'red', owner: 'sub-me' });
  });

  it('follows nextToken across pages', async () => {
    m.ColorLabel.listColorLabelByBand
      .mockResolvedValueOnce({ data: [{ color: 'red' }], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [{ color: 'blue' }], nextToken: null });
    m.ColorLabel.delete.mockResolvedValue(OK);
    await deleteMyLabelRows('band-1', 'sub-me');
    expect(m.ColorLabel.delete).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the caller has no rows', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [], nextToken: null });
    await deleteMyLabelRows('band-1', 'sub-me');
    expect(m.ColorLabel.delete).not.toHaveBeenCalled();
  });

  it('treats an already-gone row (conflict / Unauthorized) as success but surfaces real errors', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [{ color: 'red' }], nextToken: null });
    m.ColorLabel.delete.mockResolvedValueOnce({ errors: UNAUTH });
    await expect(deleteMyLabelRows('band-1', 'sub-me')).resolves.toBeUndefined();
    m.ColorLabel.delete.mockResolvedValueOnce({ errors: [{ message: 'boom' }] });
    await expect(deleteMyLabelRows('band-1', 'sub-me')).rejects.toThrow('boom');
  });

  it('attempts every row, then reports a failure', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({
      data: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }],
      nextToken: null,
    });
    m.ColorLabel.delete.mockImplementation(async ({ color }: { color: string }) =>
      color === 'blue' ? { errors: [{ message: 'throttled' }] } : OK,
    );
    await expect(deleteMyLabelRows('band-1', 'sub-me')).rejects.toThrow('throttled');
    expect(m.ColorLabel.delete).toHaveBeenCalledTimes(3);
  });

  it('never has more than a bounded number of deletes in flight', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({
      data: Array.from({ length: 40 }, (_, i) => ({ color: `c${i}` })),
      nextToken: null,
    });
    let active = 0;
    let peak = 0;
    m.ColorLabel.delete.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return OK;
    });
    await deleteMyLabelRows('band-1', 'sub-me');
    expect(m.ColorLabel.delete).toHaveBeenCalledTimes(40);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('a failed read rejects without deleting anything', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(deleteMyLabelRows('band-1', 'sub-me')).rejects.toThrow('listMyLabels: gsi down');
    expect(m.ColorLabel.delete).not.toHaveBeenCalled();
  });

  it('is signed-in only: a signed-out call rejects before any read', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(deleteMyLabelRows('band-1', 'sub-me')).rejects.toBeInstanceOf(NotSignedInError);
    expect(m.ColorLabel.listColorLabelByBand).not.toHaveBeenCalled();
  });
});
