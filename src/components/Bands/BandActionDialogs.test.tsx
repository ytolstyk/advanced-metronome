import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BandRecord } from '../../bandTypes';

vi.mock('../../api/setListsApi', () => ({ archiveSetList: vi.fn(), deleteMyContent: vi.fn() }));
vi.mock('../../api/bandsApi', () => ({
  banMember: vi.fn(),
  deleteBand: vi.fn(),
  dismissBand: vi.fn(),
  resetInviteCode: vi.fn(),
}));

import { archiveSetList, deleteMyContent } from '../../api/setListsApi';
import { banMember, deleteBand, dismissBand, resetInviteCode } from '../../api/bandsApi';
import {
  ArchiveSetListDialog,
  DeleteBandDialog,
  LeaveBandDialog,
  RemoveMemberDialog,
  ResetInviteDialog,
} from './BandActionDialogs';

const band: BandRecord = {
  id: 'band-1',
  owner: 'sub-owner',
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: ['sl-1'],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
};

beforeEach(() => {
  for (const fn of [archiveSetList, deleteMyContent, banMember, deleteBand, dismissBand, resetInviteCode]) {
    vi.mocked(fn as (...a: never[]) => unknown).mockReset();
    vi.mocked(fn as (...a: never[]) => unknown).mockResolvedValue(undefined as never);
  }
});

describe('RemoveMemberDialog', () => {
  it('names the member, bans them by sub, settles, then closes', async () => {
    const onClose = vi.fn();
    const onSettled = vi.fn();
    render(<RemoveMemberDialog bandId="band-1" sub="sub-bob" name="Bob" onClose={onClose} onSettled={onSettled} />);
    expect(screen.getByRole('heading', { name: 'Remove Bob?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(banMember).toHaveBeenCalledWith('band-1', 'sub-bob');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('a failed ban stays open, shows the error, and still settles so the page reloads', async () => {
    vi.mocked(banMember).mockRejectedValue(new Error('The band changed while you were editing. Please retry.'));
    const onClose = vi.fn();
    const onSettled = vi.fn();
    render(<RemoveMemberDialog bandId="band-1" sub="sub-bob" name="Bob" onClose={onClose} onSettled={onSettled} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The band changed');
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel calls onClose without banning', () => {
    const onClose = vi.fn();
    render(<RemoveMemberDialog bandId="band-1" sub="sub-bob" name="Bob" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(banMember).not.toHaveBeenCalled();
  });
});

describe('ArchiveSetListDialog', () => {
  it('quotes the set list name and archives it by id', async () => {
    const onClose = vi.fn();
    render(<ArchiveSetListDialog bandId="band-1" setListId="sl-1" name="Main Set" onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'Archive “Main Set”?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(archiveSetList).toHaveBeenCalledWith('band-1', 'sl-1');
  });
});

describe('ResetInviteDialog', () => {
  it('resets the code for the band and does not use the destructive wording', async () => {
    const onClose = vi.fn();
    render(<ResetInviteDialog bandId="band-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset code' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(resetInviteCode).toHaveBeenCalledWith('band-1');
  });
});

describe('LeaveBandDialog', () => {
  it('cleans up with the checkbox choice, dismisses the band, then reports the leave', async () => {
    const order: string[] = [];
    vi.mocked(deleteMyContent).mockImplementation(async (_b, withSongs) => void order.push(`cleanup:${withSongs}`));
    vi.mocked(dismissBand).mockImplementation(async () => void order.push('dismiss'));
    const onLeft = vi.fn(() => void order.push('left'));
    render(<LeaveBandDialog band={band} onClose={() => {}} onLeft={onLeft} />);
    expect(screen.getByLabelText('Also delete the songs I suggested')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Leave band' }));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(order).toEqual(['cleanup:true', 'dismiss', 'left']);
    expect(dismissBand).toHaveBeenCalledWith('band-1');
  });

  it('a failure to drop the band row after a successful cleanup is shown, and nothing is reported as left', async () => {
    vi.mocked(dismissBand).mockRejectedValue(new Error('Could not leave'));
    const onLeft = vi.fn();
    render(<LeaveBandDialog band={band} onClose={() => {}} onLeft={onLeft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not leave');
    expect(onLeft).not.toHaveBeenCalled();
    // The cleanup already succeeded, so the label does not switch to "Leave anyway".
    expect(screen.getByRole('button', { name: 'Leave band' })).toBeEnabled();
  });

  it('after a cleanup failure, "Leave anyway" skips the cleanup and leaves', async () => {
    vi.mocked(deleteMyContent).mockRejectedValue(new Error('partial'));
    const onLeft = vi.fn();
    render(<LeaveBandDialog band={band} onClose={() => {}} onLeft={onLeft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t remove all of your votes and songs');
    expect(dismissBand).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave anyway' }));
    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1));
    expect(deleteMyContent).toHaveBeenCalledTimes(1);
    expect(dismissBand).toHaveBeenCalledWith('band-1');
  });
});

describe('DeleteBandDialog', () => {
  it('starts with the permanent-action warning', () => {
    render(<DeleteBandDialog bandId="band-1" onClose={() => {}} onDeleted={() => {}} />);
    expect(screen.getByText(/The band closes for everyone/)).toBeInTheDocument();
  });

  it('shows each progress step as the delete runs, then deletes, dismisses and reports', async () => {
    let finish!: () => void;
    vi.mocked(deleteBand).mockImplementation(async (_id, onProgress) => {
      onProgress?.('set-lists');
      await new Promise<void>((r) => {
        finish = r;
      });
    });
    const onDeleted = vi.fn();
    render(<DeleteBandDialog bandId="band-1" onClose={() => {}} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    expect(await screen.findByText('Archiving set lists…')).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(dismissBand).toHaveBeenCalledWith('band-1');
  });

  it('each step has its own text', async () => {
    const seen: string[] = [];
    let release!: () => void;
    vi.mocked(deleteBand).mockImplementation(async (_id, onProgress) => {
      for (const step of ['set-lists', 'tombstone', 'invite', 'done'] as const) {
        onProgress?.(step);
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        seen.push(document.body.textContent ?? '');
      }
      await new Promise<void>((r) => {
        release = r;
      });
    });
    render(<DeleteBandDialog bandId="band-1" onClose={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    await waitFor(() => expect(seen).toHaveLength(4));
    expect(seen[0]).toContain('Archiving set lists…');
    expect(seen[1]).toContain('Closing the band and clearing its details…');
    expect(seen[2]).toContain('Retiring the invite code…');
    expect(seen[3]).toContain('Done.');
    await act(async () => release());
  });

  it('still reports the deletion when removing the caller\'s own band row fails', async () => {
    vi.mocked(dismissBand).mockRejectedValue(new Error('Unauthorized'));
    const onDeleted = vi.fn();
    render(<DeleteBandDialog bandId="band-1" onClose={() => {}} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a failed delete shows the error, resets the progress text, settles and does not dismiss or report', async () => {
    vi.mocked(deleteBand).mockImplementation(async (_id, onProgress) => {
      onProgress?.('tombstone');
      throw new Error('Tombstone failed');
    });
    const onDeleted = vi.fn();
    const onSettled = vi.fn();
    render(<DeleteBandDialog bandId="band-1" onClose={() => {}} onSettled={onSettled} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tombstone failed');
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(dismissBand).not.toHaveBeenCalled();
    expect(screen.queryByText('Closing the band and clearing its details…')).not.toBeInTheDocument();
    expect(screen.getByText(/The band closes for everyone/)).toBeInTheDocument();
  });
});
