import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BandRecord, BandView } from '../../bandTypes';

vi.mock('../../api/bandsApi', () => ({
  getInviteIssuedAt: vi.fn(),
  ensureFreshInvite: vi.fn(),
  setInviteTtlDays: vi.fn(),
}));

import { ensureFreshInvite, getInviteIssuedAt, setInviteTtlDays } from '../../api/bandsApi';
import { InviteSection } from './InviteSection';

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: 'b1',
  owner: 'sub-owner',
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: [],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  inviteTtlDays: 1,
  ...over,
});
const view = (over: Partial<BandView> = {}): BandView => ({
  band: band(),
  sub: 'sub-me',
  isOwner: false,
  isMember: true,
  members: [],
  memberSubs: new Set(),
  displayNames: new Map(),
  setLists: [],
  removedMembers: [],
  incomplete: false,
  ...over,
});

const writeText = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.mocked(getInviteIssuedAt).mockResolvedValue(ago(HOUR));
});

const renderSection = (v: BandView, extra: { onReset?: () => void; onChanged?: () => void } = {}) =>
  render(<InviteSection view={v} onReset={extra.onReset ?? (() => {})} onChanged={extra.onChanged ?? (() => {})} />);

describe('InviteSection', () => {
  it('shows the code in two groups, when it expires, and copies the full join link', async () => {
    writeText.mockResolvedValue(undefined);
    renderSection(view());
    expect(screen.getByText('ABCDE-FGHJK')).toBeInTheDocument();
    expect(await screen.findByText(/This link works until/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/bands?join=ABCDEFGHJK`);
    expect(ensureFreshInvite).not.toHaveBeenCalled(); // members never trigger a rotation
  });

  it('cannot copy a malformed stored code: shows a dash and disables the button', () => {
    renderSection(view({ band: band({ inviteCode: 'bad' }) }));
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeDisabled();
  });

  it('warns when the browser refuses the copy, and clears the warning after a later success', async () => {
    writeText.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    renderSection(view());
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Couldn’t copy automatically');
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t copy automatically. Select the code and copy it by hand.')).not.toBeInTheDocument();
  });

  it('only the owner can reset the code', () => {
    const onReset = vi.fn();
    const { unmount } = renderSection(view({ isOwner: false }), { onReset });
    expect(screen.queryByRole('button', { name: 'Reset code' })).not.toBeInTheDocument();
    unmount();
    renderSection(view({ isOwner: true }), { onReset });
    fireEvent.click(screen.getByRole('button', { name: 'Reset code' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('flips a good link to expired while the page stays open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      vi.mocked(getInviteIssuedAt).mockResolvedValue(ago(24 * HOUR - 30_000)); // 30 s left
      renderSection(view());
      expect(await screen.findByText(/This link works until/)).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('as a member', () => {
    it('sees an expired link struck out, cannot copy it, and is told to ask the owner', async () => {
      vi.mocked(getInviteIssuedAt).mockResolvedValue(ago(25 * HOUR));
      renderSection(view());
      expect(await screen.findByText(/This link has expired\. Ask the band owner for a new one\./)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeDisabled();
      expect(screen.getByText('ABCDE-FGHJK')).toHaveClass('line-through');
    });

    it('treats a retired or missing invite as expired', async () => {
      vi.mocked(getInviteIssuedAt).mockResolvedValue(null);
      renderSection(view());
      expect(await screen.findByText(/This link has expired/)).toBeInTheDocument();
    });

    it('can still copy when the age could not be read (the join check is the authority)', async () => {
      vi.mocked(getInviteIssuedAt).mockRejectedValue(new Error('offline'));
      renderSection(view());
      await waitFor(() => expect(getInviteIssuedAt).toHaveBeenCalled());
      expect(screen.queryByText(/has expired/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeEnabled();
    });

    it('does not offer the lifetime setting', () => {
      renderSection(view());
      expect(screen.queryByLabelText('Invite links work for')).not.toBeInTheDocument();
    });
  });

  describe('as the owner', () => {
    const owner = (over: Partial<BandRecord> = {}) => view({ isOwner: true, band: band(over) });

    it('copies through the freshness check and does not reload when nothing was rotated', async () => {
      writeText.mockResolvedValue(undefined);
      vi.mocked(ensureFreshInvite).mockResolvedValue(band());
      const onChanged = vi.fn();
      renderSection(owner(), { onChanged });
      fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/bands?join=ABCDEFGHJK`));
      expect(ensureFreshInvite).toHaveBeenCalledWith('b1');
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('offers a new link when the current one has expired, copies the NEW link and reloads', async () => {
      vi.mocked(getInviteIssuedAt).mockResolvedValue(ago(30 * HOUR));
      vi.mocked(ensureFreshInvite).mockResolvedValue(band({ inviteCode: 'ZZZZZ22222' }));
      writeText.mockResolvedValue(undefined);
      const onChanged = vi.fn();
      renderSection(owner(), { onChanged });
      expect(await screen.findByText(/This link has expired; copying makes a new one\./)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'New link & copy' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/bands?join=ZZZZZ22222`));
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('keeps the "Copied!" feedback when the reload brings the new code, and reads the new code\u2019s age', async () => {
      vi.mocked(getInviteIssuedAt).mockResolvedValue(ago(30 * HOUR));
      vi.mocked(ensureFreshInvite).mockResolvedValue(band({ inviteCode: 'ZZZZZ22222' }));
      writeText.mockResolvedValue(undefined);
      let rerenderWith: (v: BandView) => void = () => {};
      const onChanged = vi.fn(() => rerenderWith(owner({ inviteCode: 'ZZZZZ22222' })));
      const { rerender } = renderSection(owner(), { onChanged });
      rerenderWith = (v) => rerender(<InviteSection view={v} onReset={() => {}} onChanged={onChanged} />);
      fireEvent.click(await screen.findByRole('button', { name: 'New link & copy' }));
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('ZZZZZ-22222')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
      await waitFor(() => expect(getInviteIssuedAt).toHaveBeenCalledWith('ZZZZZ22222'));
    });

    it('hands the clipboard the link before the freshness check finishes', async () => {
      let finish: (b: BandRecord) => void = () => {};
      vi.mocked(ensureFreshInvite).mockReturnValue(new Promise<BandRecord>((r) => { finish = r; }));
      const write = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { write, writeText }, configurable: true });
      class FakeItem {
        items: Record<string, Promise<Blob>>;
        constructor(items: Record<string, Promise<Blob>>) {
          this.items = items;
        }
      }
      vi.stubGlobal('ClipboardItem', FakeItem);
      try {
        renderSection(owner());
        fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
        await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
        finish(band());
        const item = write.mock.calls[0][0][0] as FakeItem;
        expect(await (await item.items['text/plain']).text()).toBe(`${window.location.origin}/bands?join=ABCDEFGHJK`);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('still reloads after a rotation when the clipboard refuses before the check finishes', async () => {
      vi.mocked(getInviteIssuedAt).mockResolvedValue(ago(30 * HOUR));
      let finish: (b: BandRecord) => void = () => {};
      vi.mocked(ensureFreshInvite).mockReturnValue(new Promise<BandRecord>((r) => { finish = r; }));
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: vi.fn().mockRejectedValue(new Error('NotAllowedError')), writeText },
        configurable: true,
      });
      vi.stubGlobal('ClipboardItem', class {});
      try {
        const onChanged = vi.fn();
        renderSection(owner(), { onChanged });
        fireEvent.click(await screen.findByRole('button', { name: 'New link & copy' }));
        expect(await screen.findByText(/Couldn’t copy automatically/)).toBeInTheDocument();
        expect(onChanged).not.toHaveBeenCalled();
        finish(band({ inviteCode: 'ZZZZZ22222' }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('shows the error and copies nothing when the freshness check fails', async () => {
      vi.mocked(ensureFreshInvite).mockRejectedValue(new Error('boom'));
      renderSection(owner());
      fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('boom');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('lists 1 to 7 days, shows the current lifetime and saves a change then reloads', async () => {
      vi.mocked(setInviteTtlDays).mockResolvedValue(band({ inviteTtlDays: 5 }));
      const onChanged = vi.fn();
      renderSection(owner({ inviteTtlDays: 3 }), { onChanged });
      const select = screen.getByLabelText('Invite links work for') as HTMLSelectElement;
      expect([...select.options].map((o) => o.text)).toEqual(['1 day', '2 days', '3 days', '4 days', '5 days', '6 days', '7 days']);
      expect(select.value).toBe('3');
      fireEvent.change(select, { target: { value: '5' } });
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(setInviteTtlDays).toHaveBeenCalledWith('b1', 5);
    });

    it('reloads even when saving the lifetime fails, and shows why', async () => {
      vi.mocked(setInviteTtlDays).mockRejectedValue(new Error('nope'));
      const onChanged = vi.fn();
      renderSection(owner(), { onChanged });
      fireEvent.change(screen.getByLabelText('Invite links work for'), { target: { value: '2' } });
      expect(await screen.findByRole('alert')).toHaveTextContent('nope');
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });
});
