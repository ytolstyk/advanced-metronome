import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { buildHorizonDays } from '../../availabilityCalendar';
import { NOW } from '../../availabilityTestHelpers';
import type { useAvailabilityEditor } from '../../hooks/useAvailabilityEditor';
import { AvailabilityAlerts } from './AvailabilityAlerts';
import { AvailabilityMine } from './AvailabilityMine';
import { AvailabilityNotice } from './AvailabilityNotice';

describe('AvailabilityAlerts', () => {
  const none = {
    rosterIncomplete: false,
    excluded: 0,
    unreadableNames: [] as string[],
    blocked: null,
    willReplaceUnreadable: false,
    replacedUnreadable: false,
    onReload: () => {},
  } as const;

  it('shows nothing when everything is fine', () => {
    const { container } = render(<AvailabilityAlerts {...none} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns that the member list was too long to load completely', () => {
    render(<AvailabilityAlerts {...none} rosterIncomplete />);
    expect(screen.getByText(/Some members may be missing from this list/)).toBeInTheDocument();
  });

  it('counts members left out by the read limit, singular and plural', () => {
    const { rerender } = render(<AvailabilityAlerts {...none} excluded={1} />);
    expect(screen.getByText(/1 more member isn’t shown/)).toBeInTheDocument();
    rerender(<AvailabilityAlerts {...none} excluded={4} />);
    expect(screen.getByText(/4 more members aren’t shown \(up to 30 are read\)/)).toBeInTheDocument();
  });

  it('names members whose times could not be read, and retries on request', () => {
    const onReload = vi.fn();
    render(<AvailabilityAlerts {...none} unreadableNames={['Bob', 'Cat']} onReload={onReload} />);
    expect(screen.getByText(/Couldn’t read the times of Bob, Cat/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['newer-format', /newer version of the app/],
    ['unavailable', /can’t be edited right now/],
    ['failed', /couldn’t read your saved times, so editing is off/],
  ] as const)('explains why editing is off: %s', (blocked, text) => {
    render(<AvailabilityAlerts {...none} blocked={blocked} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('warns before, and tells after, an unreadable stored row is replaced', () => {
    const { rerender } = render(<AvailabilityAlerts {...none} willReplaceUnreadable />);
    expect(screen.getByText(/Saving will replace them/)).toBeInTheDocument();
    rerender(<AvailabilityAlerts {...none} replacedUnreadable />);
    expect(screen.getByText('We reset your saved times.')).toBeInTheDocument();
  });
});

describe('AvailabilityNotice', () => {
  it('explains what saving shares and accepts', () => {
    const onAccept = vi.fn();
    render(<AvailabilityNotice hasUnsavedEdits={false} onAccept={onAccept} />);
    expect(screen.getByRole('heading', { name: 'Before you save' })).toBeInTheDocument();
    expect(screen.getByText(/anyone with an account who has this band’s link/)).toBeInTheDocument();
    expect(screen.queryByText(/kept on this page/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('says unsaved changes are kept for now but lost if the page is left first', () => {
    render(<AvailabilityNotice hasUnsavedEdits onAccept={() => {}} />);
    expect(screen.getByText(/kept on this page and will save once you accept; leaving the page first discards them/)).toBeInTheDocument();
  });
});

describe('AvailabilityMine', () => {
  const days = buildHorizonDays(NOW, 'UTC');
  type Editor = ReturnType<typeof useAvailabilityEditor>;
  const fakeEditor = (over: Partial<Editor> = {}): Editor => ({
    free: new Set<number>(),
    setSlots: vi.fn(),
    status: 'idle',
    error: null,
    retry: vi.fn(),
    removeAll: vi.fn().mockResolvedValue(undefined),
    deleting: false,
    blocked: null,
    willReplaceUnreadable: false,
    replacedUnreadable: false,
    hasUnsavedEdits: false,
    lastSaved: null,
    hasRow: false,
    ...over,
  });
  const renderMine = (editor: Editor, noticeAccepted = true) =>
    render(
      <AvailabilityMine
        days={days.slice(0, 3)}
        todayKey={days[0].key}
        lastVisibleSlot={days[days.length - 1].slots[47]}
        timeZone="UTC"
        nowMs={NOW}
        editor={editor}
        noticeAccepted={noticeAccepted}
      />,
    );

  it.each([
    [{ status: 'saving' as const }, true, 'Saving…'],
    [{ status: 'saved' as const }, true, 'Saved.'],
    [{ status: 'dirty' as const }, true, 'Unsaved changes…'],
    [{ status: 'dirty' as const }, false, 'Waiting for you to accept the notice above.'],
    [{ status: 'idle' as const, hasRow: true, lastSaved: new Date(NOW - 3 * 86_400_000).toISOString() }, true, 'Last saved 3 days ago.'],
  ])('tells where edits stand: %o', (over, accepted, text) => {
    renderMine(fakeEditor(over), accepted);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('says nothing for an untouched calendar or an error (the alert covers that)', () => {
    renderMine(fakeEditor({ status: 'error', error: 'x' }));
    expect(screen.queryByText(/Saving|Saved|Unsaved|Last saved/)).not.toBeInTheDocument();
  });

  it('shows a failed save with a retry only while there is something to retry', () => {
    const editor = fakeEditor({ status: 'error', error: 'Could not save your availability. Please try again.', hasUnsavedEdits: true });
    renderMine(editor);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your availability');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(editor.retry).toHaveBeenCalledTimes(1);
  });

  it('shows an error without a retry when nothing is waiting to be saved', () => {
    renderMine(fakeEditor({ status: 'error', error: 'Please sign in again.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in again.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('asks before deleting, then deletes', async () => {
    const editor = fakeEditor({ hasRow: true });
    renderMine(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my availability' }));
    const dialog = await screen.findByRole('dialog');
    expect(editor.removeAll).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(editor.removeAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the dialog open and shows why when the delete fails', async () => {
    const editor = fakeEditor({ removeAll: vi.fn().mockRejectedValue(new Error('Could not delete your availability. Please try again.')) });
    renderMine(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my availability' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete your availability');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('turns editing off but not deleting when the stored row is blocked', () => {
    renderMine(fakeEditor({ blocked: 'newer-format' }));
    expect(screen.getByLabelText('From')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete my availability' })).toBeEnabled();
  });

  it('shows the delete as in progress and disabled', () => {
    renderMine(fakeEditor({ deleting: true }));
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByLabelText('From')).toBeDisabled();
  });
});
