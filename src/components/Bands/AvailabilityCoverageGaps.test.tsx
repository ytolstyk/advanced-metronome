import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { buildHorizonDays } from '../../availabilityCalendar';
import { slotOf } from '../../availabilitySlots';
import { buildOverlap, resolveAvailability } from '../../availabilityUtils';
import { findBestWindows, type BestWindows } from '../../availabilityWindows';
import type { AvailabilityRead, BestWindow, MissingReason } from '../../bandTypes';
import type { useAvailabilityEditor } from '../../hooks/useAvailabilityEditor';
import { BOB, CAT, NOW, OWNER, at, band, everyone, nameOf, ok, resolveMarks, row } from '../../availabilityTestHelpers';
import { AvailabilityEditor } from './AvailabilityEditor';
import { AvailabilityMine } from './AvailabilityMine';
import { AvailabilityOverlap } from './AvailabilityOverlap';
import { AvailabilityWeekGrid } from './AvailabilityWeekGrid';
import { AvailabilityWeekNav } from './AvailabilityWeekNav';

/* Gap-filling tests for the week-grid restyle. They add to AvailabilityComponents.test.tsx and
   AvailabilityPanels.test.tsx rather than repeat them. */

const TZ = 'UTC';
const LOCALE = 'en-US';
const all = buildHorizonDays(NOW, TZ);
// 2026-11-03 (today, 12:10 UTC), 04 (Wed), 05 (Thu), 06 (Fri)...
const [today, wed, thu, fri] = all;
const cellName = (day: string, t: string, rest = ''): RegExp => new RegExp(`^${day}, ${t.replace(' ', '\\s')}${rest}`);
const cell = (day: string, t: string) => screen.getByRole('button', { name: cellName(day, t) });
const todaySlot = (h: number, m = 0) => slotOf(Date.UTC(2026, 10, 3, h, m));

describe('AvailabilityWeekGrid keyboard: gaps', () => {
  const started = (slot: number) => slot < at(10); // Wed before 10:00 is "past"
  const cellRender =
    (isOff: (slot: number) => boolean = () => false) =>
    ({ slot, dayLabel, timeLabel }: { slot: number; dayLabel: string; timeLabel: string }, focus: object) => (
      <button type="button" aria-label={`${dayLabel}, ${timeLabel}`} disabled={isOff(slot)} {...focus} />
    );
  const grid = (
    days: typeof all,
    isDisabled?: (slot: number) => boolean,
  ) => (
    <AvailabilityWeekGrid
      days={days}
      timeZone={TZ}
      locale={LOCALE}
      todayKey={today.key}
      label="Week"
      isDisabled={isDisabled}
      renderCell={cellRender(isDisabled)}
    />
  );

  it('steps over a run of disabled cells in the arrow direction', () => {
    const off = (slot: number) => slot >= at(8, 30) && slot <= at(9); // Wed 8:30 and 9:00
    render(grid([wed], off));
    const first = cell('Wed, Nov 4', '8:00 AM');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(cell('Wed, Nov 4', '9:30 AM')).toHaveFocus();
  });

  it('stays put when every cell further in that direction is disabled', () => {
    render(grid([wed], started));
    const firstUsable = cell('Wed, Nov 4', '10:00 AM');
    firstUsable.focus();
    fireEvent.keyDown(firstUsable, { key: 'ArrowUp' });
    expect(firstUsable).toHaveFocus();
  });

  it('keeps going past a column that has no cell on that row', () => {
    const short = { ...thu, slots: thu.slots.slice(0, 20) }; // no cells from 6 PM on
    render(grid([wed, short, fri]));
    const wedEvening = cell('Wed, Nov 4', '7:00 PM');
    wedEvening.focus();
    fireEvent.keyDown(wedEvening, { key: 'ArrowRight' });
    expect(cell('Fri, Nov 6', '7:00 PM')).toHaveFocus();
  });

  it('prevents the page from scrolling on an arrow key but leaves other keys alone', () => {
    render(grid([wed]));
    const first = cell('Wed, Nov 4', '8:00 AM');
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'ArrowDown' })).toBe(false); // default prevented
    expect(fireEvent.keyDown(first, { key: 'Enter' })).toBe(true);
  });

  it('ignores arrow keys that do not come from a cell', () => {
    render(grid([wed]));
    const group = screen.getByRole('group', { name: 'Week' });
    expect(fireEvent.keyDown(group, { key: 'ArrowDown' })).toBe(true);
  });

  it('moves the tab stop to the first usable cell when the active one becomes disabled', () => {
    const { rerender } = render(grid([wed]));
    const target = cell('Wed, Nov 4', '8:00 AM');
    target.focus();
    fireEvent.keyDown(target, { key: 'ArrowDown' }); // active is now 8:30
    expect(cell('Wed, Nov 4', '8:30 AM')).toHaveAttribute('tabindex', '0');
    rerender(grid([wed], (slot) => slot <= at(8, 30)));
    expect(cell('Wed, Nov 4', '9:00 AM')).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('has no tab stop at all when every cell is disabled', () => {
    render(grid([wed], () => true));
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('tabindex', '-1');
  });

  it('draws nothing but the frame for an empty week', () => {
    render(grid([]));
    expect(screen.getByRole('group', { name: 'Week' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('AvailabilityWeekNav: gaps', () => {
  const noop = { onEarlier: vi.fn(), onLater: vi.fn(), onGoToDay: vi.fn() };
  const nav = (days: typeof all, start: number, perPage: number) =>
    render(<AvailabilityWeekNav days={days} start={start} todayIndex={0} perPage={perPage} timeZone={TZ} locale={LOCALE} {...noop} />);

  it('ends the label on the last day of a short final page', () => {
    nav(all, 56, 7); // days 56 to 59 only
    expect(screen.getByText('Tue, Dec 29 – Fri, Jan 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Later/ })).toBeDisabled();
  });

  it('shows every day, with Earlier and Later both off, when the horizon is shorter than a page', () => {
    nav(all.slice(0, 3), 0, 7);
    expect(screen.getByText('Tue, Nov 3 – Thu, Nov 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Earlier/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Later/ })).toBeDisabled();
  });

  it('keeps the date box on the first day of the page shown', () => {
    nav(all, 7, 7);
    expect(screen.getByLabelText('Jump to a date')).toHaveValue(all[7].key);
  });

  it('enables Today and Earlier once past the first page', () => {
    nav(all, 7, 7);
    expect(screen.getByRole('button', { name: 'Today' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Earlier/ })).toBeEnabled();
  });

  it('ignores the date box being cleared', () => {
    const onGoToDay = vi.fn();
    render(<AvailabilityWeekNav days={all} start={7} todayIndex={0} perPage={7} timeZone={TZ} locale={LOCALE} {...noop} onGoToDay={onGoToDay} />);
    fireEvent.change(screen.getByLabelText('Jump to a date'), { target: { value: '' } });
    expect(onGoToDay).not.toHaveBeenCalled();
  });
});

describe('AvailabilityEditor: gaps', () => {
  interface Over {
    free?: number[];
    disabled?: boolean;
    days?: typeof all;
    lastVisibleSlot?: number;
  }
  const mount = ({ free = [], disabled = false, days = [wed, thu, fri], lastVisibleSlot = all[all.length - 1].slots[47] }: Over = {}) => {
    const onSetSlots = vi.fn();
    render(
      <AvailabilityEditor
        days={days}
        todayKey={today.key}
        lastVisibleSlot={lastVisibleSlot}
        timeZone={TZ}
        locale={LOCALE}
        nowMs={NOW}
        free={new Set(free)}
        disabled={disabled}
        onSetSlots={onSetSlots}
      />,
    );
    return onSetSlots;
  };

  it('clears only the times of the day that have not started yet', () => {
    const pastSlot = todaySlot(8);
    const upcoming = [todaySlot(19), todaySlot(19, 30)];
    const onSetSlots = mount({ days: [today, wed], free: [pastSlot, ...upcoming] });
    fireEvent.click(screen.getByRole('button', { name: 'Clear this day' }));
    expect(onSetSlots).toHaveBeenCalledWith(upcoming, false);
  });

  it('has nothing to clear or repeat when the day’s only marks have already started', () => {
    mount({ days: [today, wed], free: [todaySlot(8)] });
    expect(screen.getByRole('button', { name: 'Clear this day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Repeat' })).toBeDisabled();
  });

  it('does not mark anything when a repeat would land past the last visible day', () => {
    const onSetSlots = mount({ free: [at(19)], lastVisibleSlot: at(19) });
    fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    expect(onSetSlots).not.toHaveBeenCalled();
  });

  it('repeats four weeks by default and offers 1 to 8 weeks', () => {
    const onSetSlots = mount({ free: [at(19)] });
    const weeks = screen.getByLabelText(/Repeat this day’s times weekly for/);
    expect(weeks).toHaveValue('4');
    expect(within(weeks).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '1 week',
      '2 weeks',
      '3 weeks',
      '4 weeks',
      '6 weeks',
      '8 weeks',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    expect(onSetSlots.mock.calls[0][0]).toHaveLength(4);
  });

  it('keeps repeated weeks inside the visible horizon', () => {
    const lastWeek = at(19) + 2 * 7 * 48; // two weeks on
    const onSetSlots = mount({ free: [at(19)], lastVisibleSlot: lastWeek });
    fireEvent.click(screen.getByRole('button', { name: 'Repeat' })); // 4 weeks asked
    expect([...onSetSlots.mock.calls[0][0]].sort((a: number, b: number) => a - b)).toEqual([at(19) + 7 * 48, lastWeek]);
  });

  describe('when the chosen day has nothing left to mark', () => {
    const pastDay = buildHorizonDays(NOW - 2 * 86_400_000, TZ)[0]; // 2026-11-01, entirely before now

    it('turns the range tool off and lists no times', () => {
      const onSetSlots = mount({ days: [pastDay] });
      const from = screen.getByLabelText('From');
      expect(from).toBeDisabled();
      expect(within(from).queryAllByRole('option')).toHaveLength(0);
      expect(screen.getByLabelText('Until')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Mark free' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
      expect(onSetSlots).not.toHaveBeenCalled();
    });

    it('disables every cell and leaves no tab stop', () => {
      mount({ days: [pastDay] });
      const cells = screen.getAllByRole('button', { pressed: false });
      expect(cells).toHaveLength(28);
      for (const c of cells) {
        expect(c).toBeDisabled();
        expect(c).toHaveAttribute('tabindex', '-1');
      }
    });
  });

  it('falls back to the new day’s first time when the picked start is not on it', () => {
    mount();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: String(at(19)) } });
    expect(screen.getByLabelText('From')).toHaveValue(String(at(19)));
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: thu.key } });
    expect(screen.getByLabelText('From')).toHaveValue(String(slotOf(Date.UTC(2026, 10, 5, 8))));
  });

  it('stops a drag when the browser cancels the pointer', () => {
    const onSetSlots = mount();
    fireEvent.pointerDown(cell('Wed, Nov 4', '7:00 PM'), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerCancel(window);
    fireEvent.pointerEnter(cell('Wed, Nov 4', '7:30 PM'), { buttons: 1 });
    expect(onSetSlots).toHaveBeenCalledTimes(1);
  });

  it('steps over the started cells of today’s column with the arrow keys', () => {
    mount({ days: [today, wed] });
    const firstUsable = cell('Tue, Nov 3', '12:30 PM');
    expect(firstUsable).toHaveAttribute('tabindex', '0');
    firstUsable.focus();
    fireEvent.keyDown(firstUsable, { key: 'ArrowUp' }); // 12:00 and earlier are started
    expect(firstUsable).toHaveFocus();
    const wedNoon = cell('Wed, Nov 4', '12:00 PM');
    wedNoon.focus();
    fireEvent.keyDown(wedNoon, { key: 'ArrowLeft' }); // today's 12:00 is started, and nothing lies beyond it
    expect(wedNoon).toHaveFocus();
    const wedHalf = cell('Wed, Nov 4', '12:30 PM');
    wedHalf.focus();
    fireEvent.keyDown(wedHalf, { key: 'ArrowLeft' });
    expect(firstUsable).toHaveFocus();
  });
});

describe('AvailabilityOverlap: gaps', () => {
  const four = [at(19), at(19, 30), at(20), at(20, 30)];

  const win = (over: Partial<BestWindow> = {}): BestWindow => ({
    startSlot: at(19),
    endSlot: at(21),
    subs: [OWNER, BOB],
    missing: [],
    ...over,
  });

  interface Over {
    marks?: Record<string, number[]>;
    reads?: Map<string, AvailabilityRead>;
    windows?: BestWindows | null;
    selectedSlot?: number | null;
    days?: typeof all;
    minSlots?: number;
    dayNote?: (d: (typeof all)[number]) => string | null;
  }
  const mount = ({ marks = { [OWNER]: four, [BOB]: four, [CAT]: [at(19)] }, reads, windows, selectedSlot = null, days = [wed, thu], minSlots = 4, dayNote }: Over = {}) => {
    const resolution = reads ? resolveAvailability(reads, everyone(...reads.keys()), band(), NOW) : resolveMarks(marks);
    const overlap = buildOverlap(resolution);
    const handlers = { onMinSlots: vi.fn(), onSelectSlot: vi.fn(), onShowWindow: vi.fn() };
    render(
      <AvailabilityOverlap
        days={days}
        todayKey={today.key}
        dayNote={dayNote}
        resolution={resolution}
        overlap={overlap}
        windows={windows === undefined ? findBestWindows(overlap, { minSlots }) : windows}
        minSlots={minSlots}
        selectedSlot={selectedSlot}
        timeZone={TZ}
        locale={LOCALE}
        nowMs={NOW}
        nameOf={nameOf}
        {...handlers}
      />,
    );
    return handlers;
  };

  it.each<[MissingReason, string]>([
    ['not-marked', 'cat (not marked)'],
    ['no-data', 'cat (no data for these times)'],
    ['not-responded', 'cat (hasn’t responded)'],
    ['unreadable', 'cat (couldn’t be read)'],
  ])('explains a member missing from a window: %s', (reason, text) => {
    mount({ windows: { best: [win({ missing: [{ sub: CAT, reason }] })], alsoClose: [] } });
    expect(screen.getByText(`Not free: ${text}`)).toBeInTheDocument();
  });

  it('lists several missing members in one line and omits the line when nobody is missing', () => {
    mount({
      windows: {
        best: [win({ missing: [{ sub: CAT, reason: 'not-marked' }, { sub: 'sub-dan', reason: 'unreadable' }] }), win({ startSlot: at(20), endSlot: at(22) })],
        alsoClose: [],
      },
    });
    expect(screen.getAllByText(/^Not free:/)).toHaveLength(1);
    expect(screen.getByText('Not free: cat (not marked), dan (couldn’t be read)')).toBeInTheDocument();
  });

  it('shows an “also close” window and jumps to it from its own Show button', () => {
    const { onShowWindow } = mount({ windows: { best: [win()], alsoClose: [win({ startSlot: at(20), endSlot: at(22), subs: [OWNER] })] } });
    const buttons = within(screen.getByRole('region', { name: 'Best times' })).getAllByRole('button', { name: 'Show' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onShowWindow).toHaveBeenCalledWith(at(20));
  });

  it('keeps the “also close” list when there is no best window', () => {
    mount({ windows: { best: [], alsoClose: [win()] } });
    expect(screen.getByText(/No overlap yet/)).toBeInTheDocument();
    expect(screen.getByText('Also close (one person fewer)')).toBeInTheDocument();
  });

  it('does not change the shortest time when the chosen one is pressed again', () => {
    const { onMinSlots } = mount({ minSlots: 4 });
    fireEvent.click(screen.getByRole('radio', { name: '2 hours' }));
    expect(onMinSlots).not.toHaveBeenCalled();
  });

  it('marks the selected cell as pressed and the others as not', () => {
    mount({ selectedSlot: at(20) });
    expect(screen.getByRole('button', { name: cellName('Wed, Nov 4', '8:00 PM') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: cellName('Wed, Nov 4', '7:00 PM') })).toHaveAttribute('aria-pressed', 'false');
  });

  it('dims times that have already started', () => {
    mount({ days: [today, wed] });
    expect(cell('Tue, Nov 3', '8:00 AM')).toHaveClass('opacity-40');
    expect(cell('Tue, Nov 3', '12:00 PM')).toHaveClass('opacity-40');
    expect(cell('Tue, Nov 3', '12:30 PM')).not.toHaveClass('opacity-40');
    expect(cell('Wed, Nov 4', '8:00 AM')).not.toHaveClass('opacity-40');
  });

  it('is one tab stop whose arrow keys move between the heatmap cells', () => {
    mount();
    const first = cell('Wed, Nov 4', '8:00 AM');
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(cell('Thu, Nov 5', '8:00 AM')).toHaveFocus();
  });

  it('says “1 member is free” for a band of one', () => {
    mount({ marks: { [OWNER]: four } });
    expect(screen.getByText(/of 1 member is free/)).toBeInTheDocument();
    expect(cell('Wed, Nov 4', '7:00 PM')).toHaveAccessibleName(/1 of 1 free: owner$/);
  });

  it('copes with a band nobody has joined: nothing free, no NaN', () => {
    mount({ marks: {}, windows: null });
    expect(screen.getByText(/of 0 members are free/)).toBeInTheDocument();
    expect(cell('Wed, Nov 4', '7:00 PM')).toHaveAccessibleName(/0 of 0 free$/);
    expect(cell('Wed, Nov 4', '7:00 PM').getAttribute('style')).toBeNull();
  });

  it('shades only cells where someone is free', () => {
    mount();
    expect(cell('Wed, Nov 4', '7:00 PM').getAttribute('style')).not.toBeNull();
    expect(cell('Wed, Nov 4', '9:00 PM').getAttribute('style')).toBeNull();
  });

  it('lists who could not be read, and who has no data, in the selected slot', () => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, four))],
      [BOB, { status: 'failed' }],
      [CAT, ok(row(CAT, four, { startDay: Math.floor(NOW / 86_400_000) + 40 }))], // row starts weeks from now: no data for this time
    ]);
    mount({ reads, selectedSlot: at(19) });
    const detail = screen.getByRole('heading', { name: /7:00\sPM/ }).closest('div')!;
    expect(detail).toHaveTextContent(/Couldn’t be read:\s*bob/);
    expect(detail).toHaveTextContent(/No data for this time:\s*cat/);
  });

  it('prints a note under a day', () => {
    mount({ dayNote: (d) => (d.key === thu.key ? 'best: 2' : null) });
    expect(screen.getByText('best: 2')).toBeInTheDocument();
  });
});

describe('AvailabilityMine: gaps', () => {
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
  const mount = (editor: Editor, dayNote?: (d: (typeof all)[number]) => string | null) =>
    render(
      <AvailabilityMine
        days={all.slice(0, 3)}
        todayKey={today.key}
        dayNote={dayNote}
        lastVisibleSlot={all[all.length - 1].slots[47]}
        timeZone={TZ}
        nowMs={NOW}
        editor={editor}
        noticeAccepted
      />,
    );

  it('does not delete when the confirmation is cancelled', async () => {
    const editor = fakeEditor({ hasRow: true });
    mount(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my availability' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(editor.removeAll).not.toHaveBeenCalled();
  });

  it('passes the day notes through to the week grid', () => {
    mount(fakeEditor(), (d) => (d.key === wed.key ? '3 h marked' : null));
    expect(screen.getByText('3 h marked')).toBeInTheDocument();
  });

  it('shows no status line for a saved row with no usable save time, or a time without a row', () => {
    const { rerender } = mount(fakeEditor({ hasRow: true, lastSaved: null }));
    expect(screen.queryByText(/Last saved/)).not.toBeInTheDocument();
    rerender(
      <AvailabilityMine
        days={all.slice(0, 3)}
        todayKey={today.key}
        lastVisibleSlot={all[all.length - 1].slots[47]}
        timeZone={TZ}
        nowMs={NOW}
        editor={fakeEditor({ hasRow: false, lastSaved: new Date(NOW - 86_400_000).toISOString() })}
        noticeAccepted
      />,
    );
    expect(screen.queryByText(/Last saved/)).not.toBeInTheDocument();
  });

  it('says “yesterday” and “today” for recent saves', () => {
    const { rerender } = mount(fakeEditor({ hasRow: true, lastSaved: new Date(NOW - 86_400_000).toISOString() }));
    expect(screen.getByText('Last saved yesterday.')).toBeInTheDocument();
    rerender(
      <AvailabilityMine
        days={all.slice(0, 3)}
        todayKey={today.key}
        lastVisibleSlot={all[all.length - 1].slots[47]}
        timeZone={TZ}
        nowMs={NOW}
        editor={fakeEditor({ hasRow: true, lastSaved: new Date(NOW - 3_600_000).toISOString() })}
        noticeAccepted
      />,
    );
    expect(screen.getByText('Last saved today.')).toBeInTheDocument();
  });
});
