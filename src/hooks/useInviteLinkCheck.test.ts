import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { InvitePreview } from '../bandTypes';

vi.mock('../api/bandsApi', () => ({ lookupInvite: vi.fn() }));

import { lookupInvite } from '../api/bandsApi';
import { useInviteLinkCheck } from './useInviteLinkCheck';

const preview: InvitePreview = { bandId: 'band-9', bandName: 'Cream', memberCount: 2, alreadyMember: false };
const fail = (reason: string) => Object.assign(new Error(reason), { reason });

beforeEach(() => {
  vi.mocked(lookupInvite).mockReset();
});

describe('useInviteLinkCheck', () => {
  it('with no code it is "none" and calls nothing', () => {
    const { result } = renderHook(() => useInviteLinkCheck(''));
    expect(result.current).toEqual({ status: 'none' });
    expect(lookupInvite).not.toHaveBeenCalled();
  });

  it('is "checking" until the lookup answers, then "good" with the preview', async () => {
    vi.mocked(lookupInvite).mockResolvedValue(preview);
    const { result } = renderHook(() => useInviteLinkCheck('ABCDEFGHJK'));
    expect(result.current).toEqual({ status: 'checking' });
    await waitFor(() => expect(result.current).toEqual({ status: 'good', preview }));
    expect(lookupInvite).toHaveBeenCalledTimes(1);
  });

  it.each(['expired', 'revoked'])('treats %s as a dead link', async (reason) => {
    vi.mocked(lookupInvite).mockRejectedValue(fail(reason));
    const { result } = renderHook(() => useInviteLinkCheck('ABCDEFGHJK'));
    await waitFor(() => expect(result.current).toEqual({ status: 'dead', reason }));
  });

  it.each([
    ['banned', 'You were removed from this band.'],
    ['full', 'This band is full (15 members).'],
    ['deleted', 'That band has been deleted.'],
    ['not-found', 'No band found for that code.'],
  ])('keeps %s as "other" with its friendly message', async (reason, message) => {
    vi.mocked(lookupInvite).mockRejectedValue(fail(reason));
    const { result } = renderHook(() => useInviteLinkCheck('ABCDEFGHJK'));
    await waitFor(() => expect(result.current).toEqual({ status: 'other', message }));
  });

  it('a non-invite failure (offline) is "other" with its own message', async () => {
    vi.mocked(lookupInvite).mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useInviteLinkCheck('ABCDEFGHJK'));
    await waitFor(() => expect(result.current).toEqual({ status: 'other', message: 'Network down' }));
  });

  it('ignores a late answer for an earlier code', async () => {
    let answerFirst: (p: InvitePreview) => void = () => {};
    vi.mocked(lookupInvite)
      .mockReturnValueOnce(new Promise((r) => { answerFirst = r; }))
      .mockResolvedValueOnce({ ...preview, bandName: 'Second' });
    const { result, rerender } = renderHook(({ code }) => useInviteLinkCheck(code), { initialProps: { code: 'AAAAAAAAAA' } });
    rerender({ code: 'BBBBBBBBBB' });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'good', preview: { bandName: 'Second' } }));
    answerFirst({ ...preview, bandName: 'First' });
    await Promise.resolve();
    expect(result.current).toMatchObject({ status: 'good', preview: { bandName: 'Second' } });
  });

  it('does not update after unmount', async () => {
    let answer: (p: InvitePreview) => void = () => {};
    vi.mocked(lookupInvite).mockReturnValue(new Promise((r) => { answer = r; }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useInviteLinkCheck('ABCDEFGHJK'));
    unmount();
    answer(preview);
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
