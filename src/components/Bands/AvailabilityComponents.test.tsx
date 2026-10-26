import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { buildHorizonDays } from '../../availabilityCalendar';
import { slotOf } from '../../availabilitySlots';
import { buildOverlap, resolveAvailability } from '../../availabilityUtils';
import { findBestWindows } from '../../availabilityWindows';
import type { AvailabilityRead } from '../../bandTypes';
import { BOB, CAT, DAN, NOW, OWNER, at, band, everyone, nameOf, ok, resolveMarks, row } from '../../availabilityTestHelpers';
import { AvailabilityEditor } from './AvailabilityEditor';
import { AvailabilityOverlap } from './AvailabilityOverlap';
import { AvailabilityWeekGrid } from './AvailabilityWeekGrid';
import { AvailabilityWeekNav } from './AvailabilityWeekNav';

const TZ = 'UTC';
const LOCALE = 'en-US';
const all = buildHorizonDays(NOW, TZ);
// 2026-11-03 (today, 12:10 UTC), 04 (Wed), 05 (Thu), 06 (Fri)...
const [today, wed, thu, fri] = all;
const TODAY_KEY = today.key;
/** A cell by its day and time, e.g. cell('Wed, Nov 4', '7:00 PM'); whatever space the platform uses before AM/PM. */
const cellName = (day: string, t: string, rest = ''): RegExp => new RegExp(`^${day}, ${t.replace(' ', '\\s')}${rest}`);
const cell = (day: string, t: string) => screen.getByRole('button', { name: cellName(day, t) });

describe('AvailabilityWeekGrid', () => {
  const plain = (days = [wed, thu, fri], extra: Partial<Parameters<typeof AvailabilityWeekGrid>[0]> = {}) =>
    render(
      <AvailabilityWeekGrid
        days={days}
        timeZone={TZ}
        locale={LOCALE}
        todayKey={TODAY_KEY}
        label="Week"
        renderCell={({ dayLabel, timeLabel }, focus) => (
          <button type="button" aria-label={`${dayLabel}, ${timeLabel}`} {...focus} />
        )}
        {...extra}
      />,
    );

  it('draws one column per day with a header each', () => {
    plain();
    const grid = screen.getByRole('group', { name: 'Week' });
    expect(within(grid).getByText('Wed, Nov 4')).toBeInTheDocument();
    expect(within(grid).getByText('Thu, Nov 5')).toBeInTheDocument();
    expect(within(grid).getByText('Fri, Nov 6')).toBeInTheDocument();
  });

  it('shows only 8 AM to 10 PM: 28 half-hour rows per day', () => {
    plain();
    expect(screen.getAllByRole('button')).toHaveLength(3 * 28);
    expect(cell('Wed, Nov 4', '8:00 AM')).toBeInTheDocument();
    expect(cell('Wed, Nov 4', '9:30 PM')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: cellName('Wed, Nov 4', '7:30 AM') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: cellName('Wed, Nov 4', '10:00 PM') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: cellName('Wed, Nov 4', '12:00 AM') })).not.toBeInTheDocument();
  });

  it('labels each hour in the gutter, once, down the side', () => {
    plain([wed]);
    const grid = screen.getByRole('group', { name: 'Week' });
    for (const hour of ['8:00 AM', '12:00 PM', '9:00 PM']) expect(within(grid).getByText(time(hour))).toBeInTheDocument();
    expect(within(grid).queryByText(time('8:30 AM'))).not.toBeInTheDocument(); // half hours are unlabeled
    function time(t: string) {
      return new RegExp(`^${t.replace(' ', '\\s')}$`);
    }
  });

  it('highlights today and prints a short note under a day', () => {
    plain([today, wed], { dayNote: (d) => (d.key === wed.key ? 'peak 3/4' : null) });
    expect(screen.getByText('Tue, Nov 3').parentElement).toHaveClass('text-primary');
    expect(screen.getByText('Wed, Nov 4').parentElement).not.toHaveClass('text-primary');
    expect(screen.getByText('peak 3/4')).toBeInTheDocument();
  });

  it('keeps rows lined up in a zone whose half hours fall on :15 and :45', () => {
    const nepal = buildHorizonDays(NOW, 'Asia/Kathmandu');
    render(
      <AvailabilityWeekGrid
        days={nepal.slice(0, 2)}
        timeZone="Asia/Kathmandu"
        locale={LOCALE}
        todayKey={nepal[0].key}
        label="Week"
        renderCell={({ timeLabel }) => <span>{timeLabel}</span>}
      />,
    );
    // Two cells plus the gutter label on the hour row.
    expect(screen.getAllByText(/^8:15\sAM$/)).toHaveLength(3);
    expect(screen.getAllByText(/^9:45\sPM$/)).toHaveLength(2);
    expect(screen.queryByText(/^8:00\sAM$/)).not.toBeInTheDocument();
  });

  it('keeps 28 rows on a daylight-saving change day (the change is overnight)', () => {
    const ny = buildHorizonDays(Date.UTC(2026, 9, 30, 16), 'America/New_York');
    const fall = ny.find((d) => d.key === '2026-11-01')!;
    render(
      <AvailabilityWeekGrid days={[fall]} timeZone="America/New_York" locale={LOCALE} todayKey={ny[0].key} label="Week" renderCell={({ timeLabel }) => <span>{timeLabel}</span>} />,
    );
    expect(screen.getAllByText(/AM|PM/).length).toBeGreaterThanOrEqual(28);
    expect(screen.queryByText(/\(2nd\)/)).not.toBeInTheDocument();
  });

  it('leaves an empty, hidden space where a day has fewer rows than the others', () => {
    const short = { ...thu, slots: thu.slots.slice(0, 20) }; // ends before 10 PM
    const { container } = plain([wed, short]);
    expect(screen.getAllByRole('button').length).toBeLessThan(2 * 28);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  describe('keyboard', () => {
    const tabStops = () => screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0');

    it('is a single tab stop, on the first cell', () => {
      plain();
      expect(tabStops()).toHaveLength(1);
      expect(tabStops()[0]).toBe(cell('Wed, Nov 4', '8:00 AM'));
    });

    it('moves between cells with the arrow keys', () => {
      plain();
      const start = cell('Wed, Nov 4', '8:00 AM');
      start.focus();
      fireEvent.keyDown(start, { key: 'ArrowDown' });
      expect(cell('Wed, Nov 4', '8:30 AM')).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(cell('Thu, Nov 5', '8:30 AM')).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
      expect(cell('Thu, Nov 5', '8:00 AM')).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
      expect(cell('Wed, Nov 4', '8:00 AM')).toHaveFocus();
    });

    it('moves the tab stop to the cell that has focus', () => {
      plain();
      act(() => cell('Fri, Nov 6', '3:00 PM').focus());
      expect(tabStops()).toEqual([cell('Fri, Nov 6', '3:00 PM')]);
    });

    it('stops at the edges and ignores other keys', () => {
      plain();
      const first = cell('Wed, Nov 4', '8:00 AM');
      first.focus();
      fireEvent.keyDown(first, { key: 'ArrowUp' });
      fireEvent.keyDown(first, { key: 'ArrowLeft' });
      fireEvent.keyDown(first, { key: 'a' });
      expect(first).toHaveFocus();
    });

    it('skips disabled cells and starts at the first usable one', () => {
      const started = (slot: number) => slot < at(8, 30); // everything up to 8:00 AM Wed is "past"
      render(
        <AvailabilityWeekGrid
          days={[wed]}
          timeZone={TZ}
          locale={LOCALE}
          todayKey={TODAY_KEY}
          label="Week"
          isDisabled={started}
          renderCell={({ slot, dayLabel, timeLabel }, focus) => (
            <button type="button" aria-label={`${dayLabel}, ${timeLabel}`} disabled={started(slot)} {...focus} />
          )}
        />,
      );
      expect(cell('Wed, Nov 4', '8:30 AM')).toHaveAttribute('tabindex', '0');
      expect(cell('Wed, Nov 4', '8:00 AM')).toBeDisabled();
    });
  });
});

describe('AvailabilityWeekNav', () => {
  const setup = (start = 0, perPage = 7) => {
    const handlers = { onEarlier: vi.fn(), onLater: vi.fn(), onGoToDay: vi.fn() };
    render(<AvailabilityWeekNav days={all} start={start} perPage={perPage} timeZone={TZ} locale={LOCALE} {...handlers} />);
    return handlers;
  };

  it('shows the dates on screen', () => {
    setup();
    expect(screen.getByText('Tue, Nov 3 – Mon, Nov 9')).toBeInTheDocument();
  });

  it('shows the dates of a later page, and a short last page', () => {
    setup(7);
    expect(screen.getByText('Tue, Nov 10 – Mon, Nov 16')).toBeInTheDocument();
  });

  it('shows three dates on a phone', () => {
    setup(3, 3);
    expect(screen.getByText('Fri, Nov 6 – Sun, Nov 8')).toBeInTheDocument();
  });

  it('moves a page earlier or later, and home with Today', () => {
    const h = setup(7);
    fireEvent.click(screen.getByRole('button', { name: /Earlier/ }));
    fireEvent.click(screen.getByRole('button', { name: /Later/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(h.onEarlier).toHaveBeenCalledTimes(1);
    expect(h.onLater).toHaveBeenCalledTimes(1);
    expect(h.onGoToDay).toHaveBeenCalledWith(0);
  });

  it('cannot go earlier than today', () => {
    setup(0);
    expect(screen.getByRole('button', { name: /Earlier/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });

  it('cannot go later than the horizon', () => {
    setup(Math.floor((all.length - 1) / 7) * 7);
    expect(screen.getByRole('button', { name: /Later/ })).toBeDisabled();
  });

  it('jumps to a typed date inside the horizon and ignores one outside it', () => {
    const h = setup();
    const input = screen.getByLabelText('Jump to a date');
    expect(input).toHaveAttribute('min', all[0].key);
    expect(input).toHaveAttribute('max', all[all.length - 1].key);
    fireEvent.change(input, { target: { value: all[20].key } });
    expect(h.onGoToDay).toHaveBeenCalledWith(20);
    h.onGoToDay.mockClear();
    fireEvent.change(input, { target: { value: '2030-01-01' } });
    expect(h.onGoToDay).not.toHaveBeenCalled();
  });
});

describe('AvailabilityEditor', () => {
  interface Over {
    free?: number[];
    disabled?: boolean;
    days?: typeof all;
    dayNote?: (d: (typeof all)[number]) => string | null;
  }
  const setup = ({ free = [], disabled = false, days = [wed, thu, fri], dayNote }: Over = {}) => {
    const onSetSlots = vi.fn();
    render(
      <AvailabilityEditor
        days={days}
        todayKey={TODAY_KEY}
        dayNote={dayNote}
        lastVisibleSlot={all[all.length - 1].slots[47]}
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

  it('shows marked times as pressed', () => {
    setup({ free: [at(19)] });
    expect(cell('Wed, Nov 4', '7:00 PM')).toHaveAttribute('aria-pressed', 'true');
    expect(cell('Wed, Nov 4', '7:30 PM')).toHaveAttribute('aria-pressed', 'false');
    expect(cell('Thu, Nov 5', '7:00 PM')).toHaveAttribute('aria-pressed', 'false'); // same time, another day
  });

  it('marks a time when tapped and unmarks it when tapped again', () => {
    const onSetSlots = setup({ free: [at(20)] });
    fireEvent.click(cell('Wed, Nov 4', '7:00 PM'));
    expect(onSetSlots).toHaveBeenLastCalledWith([at(19)], true);
    fireEvent.click(cell('Wed, Nov 4', '8:00 PM'));
    expect(onSetSlots).toHaveBeenLastCalledWith([at(20)], false);
  });

  it('does not let times that have already started be changed', () => {
    setup({ days: [today, wed] });
    expect(cell('Tue, Nov 3', '8:00 AM')).toBeDisabled();
    expect(cell('Tue, Nov 3', '12:00 PM')).toBeDisabled(); // the slot "now" is in
    expect(cell('Tue, Nov 3', '12:30 PM')).toBeEnabled();
    expect(cell('Wed, Nov 4', '8:00 AM')).toBeEnabled();
  });

  it('paints across cells with the mouse, including into the next day’s column', () => {
    const onSetSlots = setup({ free: [] });
    fireEvent.pointerDown(cell('Wed, Nov 4', '7:00 PM'), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerEnter(cell('Wed, Nov 4', '7:30 PM'), { buttons: 1 });
    fireEvent.pointerEnter(cell('Thu, Nov 5', '7:30 PM'), { buttons: 1 });
    const nextDay = slotOf(Date.UTC(2026, 10, 5, 19, 30));
    expect(onSetSlots.mock.calls).toEqual([[[at(19)], true], [[at(19, 30)], true], [[nextDay], true]]);
    // The click that follows the press does not toggle the first cell a second time.
    fireEvent.click(cell('Wed, Nov 4', '7:00 PM'));
    expect(onSetSlots).toHaveBeenCalledTimes(3);
  });

  it('paints "clear" when the drag starts on a marked cell, and stops when the button is released', () => {
    const onSetSlots = setup({ free: [at(19), at(19, 30)] });
    fireEvent.pointerDown(cell('Wed, Nov 4', '7:00 PM'), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerEnter(cell('Wed, Nov 4', '7:30 PM'), { buttons: 1 });
    expect(onSetSlots.mock.calls).toEqual([[[at(19)], false], [[at(19, 30)], false]]);
    fireEvent.pointerUp(window);
    fireEvent.pointerEnter(cell('Wed, Nov 4', '8:00 PM'), { buttons: 1 });
    expect(onSetSlots).toHaveBeenCalledTimes(2);
  });

  it('does not swallow the next keyboard or touch activation after a drag that ended elsewhere', async () => {
    const onSetSlots = setup();
    fireEvent.pointerDown(cell('Wed, Nov 4', '7:00 PM'), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerEnter(cell('Wed, Nov 4', '7:30 PM'), { buttons: 1 });
    fireEvent.pointerUp(window); // released over a non-button, so no click reaches a cell
    await new Promise((r) => setTimeout(r, 5));
    onSetSlots.mockClear();
    fireEvent.click(cell('Wed, Nov 4', '9:00 PM')); // e.g. Space on a focused cell
    expect(onSetSlots).toHaveBeenCalledWith([at(21)], true);
  });

  it('does nothing when the drag re-enters cells that already match', () => {
    const onSetSlots = setup({ free: [at(19), at(19, 30)] });
    fireEvent.pointerDown(cell('Wed, Nov 4', '7:00 PM'), { pointerType: 'mouse', button: 0, buttons: 1 }); // clears 7:00
    fireEvent.pointerEnter(cell('Wed, Nov 4', '7:30 PM'), { buttons: 1 }); // clears 7:30
    fireEvent.pointerEnter(cell('Wed, Nov 4', '8:00 PM'), { buttons: 1 }); // already clear: nothing to apply
    expect(onSetSlots).toHaveBeenCalledTimes(2);
  });

  it('does not drag-paint with touch or without the button held', () => {
    const onSetSlots = setup();
    fireEvent.pointerDown(cell('Wed, Nov 4', '7:00 PM'), { pointerType: 'touch', button: 0, buttons: 1 });
    fireEvent.pointerEnter(cell('Wed, Nov 4', '7:30 PM'), { buttons: 1 });
    expect(onSetSlots).not.toHaveBeenCalled();
    fireEvent.pointerDown(cell('Wed, Nov 4', '9:00 PM'), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerEnter(cell('Wed, Nov 4', '9:30 PM'), { buttons: 0 });
    expect(onSetSlots).toHaveBeenCalledTimes(1);
  });

  it('prints a note under a day', () => {
    setup({ dayNote: (d) => (d.key === thu.key ? '2 h' : null) });
    expect(screen.getByText('2 h')).toBeInTheDocument();
  });

  describe('the tools', () => {
    it('work on the first day with time left to mark, and starts the range at 8 AM', () => {
      setup({ days: [today, wed] });
      expect(screen.getByLabelText('Day')).toHaveValue(today.key);
      expect(screen.getByLabelText('From')).toHaveValue(String(slotOf(Date.UTC(2026, 10, 3, 12, 30))));
      setup({ days: [wed, thu] });
    });

    it('offer only practice hours: from 8 AM, until 10 PM at the latest', () => {
      setup();
      const from = screen.getByLabelText('From');
      expect(within(from).getAllByRole('option')).toHaveLength(28);
      expect(within(from).getAllByRole('option')[0]).toHaveTextContent(/^8:00\sAM/);
      expect(within(from).queryByRole('option', { name: /7:30\sAM/ })).not.toBeInTheDocument();
      expect(from).toHaveValue(String(at(8)));
      fireEvent.change(from, { target: { value: String(at(21, 30)) } });
      const until = screen.getByLabelText('Until');
      expect(within(until).getAllByRole('option')).toHaveLength(1);
      expect(within(until).getAllByRole('option')[0]).toHaveTextContent(/^10:00\sPM/);
    });

    it('mark a chosen range', () => {
      const onSetSlots = setup();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: String(at(19)) } });
      fireEvent.change(screen.getByLabelText('Until'), { target: { value: '4' } }); // two hours: 7 PM to 9 PM
      fireEvent.click(screen.getByRole('button', { name: 'Mark free' }));
      expect(onSetSlots).toHaveBeenLastCalledWith([at(19), at(19, 30), at(20), at(20, 30)], true);
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(onSetSlots).toHaveBeenLastCalledWith([at(19), at(19, 30), at(20), at(20, 30)], false);
    });

    it('work on whichever day is picked', () => {
      const onSetSlots = setup();
      fireEvent.change(screen.getByLabelText('Day'), { target: { value: thu.key } });
      expect(screen.getByLabelText('From')).toHaveValue(String(slotOf(Date.UTC(2026, 10, 5, 8))));
      fireEvent.click(screen.getByRole('button', { name: 'Mark free' }));
      const thuAt = (h: number, m = 0) => slotOf(Date.UTC(2026, 10, 5, h, m));
      expect(onSetSlots).toHaveBeenLastCalledWith([thuAt(8), thuAt(8, 30), thuAt(9), thuAt(9, 30)], true);
    });

    it('keep a range inside the day and list the end time of each choice', () => {
      setup();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: String(at(21)) } });
      const until = screen.getByLabelText('Until');
      expect(within(until).getAllByRole('option')).toHaveLength(2); // 9:30 PM and 10:00 PM
      expect(until).toHaveValue('2');
    });

    it('clear the marked times of the chosen day', () => {
      const onSetSlots = setup({ free: [at(19), at(20)] });
      fireEvent.click(screen.getByRole('button', { name: 'Clear this day' }));
      expect(onSetSlots).toHaveBeenCalledWith([at(19), at(20)], false);
    });

    it('have nothing to clear or repeat on an empty day', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Clear this day' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Repeat' })).toBeDisabled();
    });

    it('repeat the day’s times on the same weekday for the chosen weeks', () => {
      const onSetSlots = setup({ free: [at(19)] });
      fireEvent.change(screen.getByLabelText(/Repeat this day’s times weekly for/), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
      const week = (n: number) => slotOf(Date.UTC(2026, 10, 4 + 7 * n, 19));
      expect(onSetSlots).toHaveBeenCalledTimes(1);
      expect([...onSetSlots.mock.calls[0][0]].sort((a, b) => a - b)).toEqual([week(1), week(2)]);
      expect(onSetSlots.mock.calls[0][1]).toBe(true);
      expect(screen.getByText(/Same weekday and clock time in UTC/)).toBeInTheDocument();
    });

    it('say what hours the calendar covers', () => {
      setup();
      expect(screen.getByText(/Practice is 8 AM to 10 PM/)).toBeInTheDocument();
    });
  });

  it('turns every control off while editing is disabled', () => {
    setup({ disabled: true, free: [at(19)] });
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByLabelText('From')).toBeDisabled();
    expect(screen.getByLabelText('Day')).toBeDisabled();
  });
});

describe('AvailabilityOverlap', () => {
  const four = [at(19), at(19, 30), at(20), at(20, 30)];
  const marks = { [OWNER]: four, [BOB]: four, [CAT]: [at(19)] };

  interface Over {
    marks?: Record<string, number[]>;
    notResponded?: string[];
    minSlots?: number;
    selectedSlot?: number | null;
    withWindows?: boolean;
    reads?: Map<string, AvailabilityRead>;
  }
  const setup = ({ marks: m = marks, notResponded = [], minSlots = 4, selectedSlot = null, withWindows = true, reads }: Over = {}) => {
    const resolution = reads ? resolveAvailability(reads, everyone(...reads.keys()), band(), NOW) : resolveMarks(m, notResponded);
    const overlap = buildOverlap(resolution);
    const windows = withWindows ? findBestWindows(overlap, { minSlots }) : null;
    const handlers = { onMinSlots: vi.fn(), onSelectSlot: vi.fn(), onShowWindow: vi.fn() };
    render(
      <AvailabilityOverlap
        days={[wed, thu, fri]}
        todayKey={TODAY_KEY}
        resolution={resolution}
        overlap={overlap}
        windows={windows}
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
  const heat = (t: string, rest = '') => screen.getByRole('button', { name: cellName('Wed, Nov 4', t, rest) });

  it('prints how many members are free in each cell, with who in its label', () => {
    setup();
    expect(heat('7:00 PM', ', 3 of 3 free: owner, bob, cat')).toHaveTextContent('3');
    expect(heat('8:00 PM', ', 2 of 3 free: owner, bob')).toHaveTextContent('2');
    expect(heat('9:00 PM', ', 0 of 3 free$')).toHaveTextContent('');
  });

  it('says what the numbers mean and never calls unmarked time busy', () => {
    setup();
    expect(screen.getByText(/not marked”, not busy/)).toBeInTheDocument();
    expect(screen.queryByText(/\bbusy\b/i, { selector: 'dd, dt, li' })).not.toBeInTheDocument();
  });

  it('asks to select a cell when it is pressed', () => {
    const { onSelectSlot } = setup();
    fireEvent.click(heat('8:00 PM'));
    expect(onSelectSlot).toHaveBeenCalledWith(at(20));
  });

  it('shows the detail for the selected slot in a polite live region', () => {
    setup({ selectedSlot: at(20) });
    const detail = screen.getByRole('heading', { name: /Nov 4, 8:00\sPM/ }).closest('div')!;
    expect(detail).toHaveTextContent(/Free:.*owner.*bob/);
    expect(detail).toHaveTextContent(/Not marked:.*cat/);
    expect(detail.parentElement).toHaveAttribute('aria-live', 'polite');
  });

  it('shows who has no data at a slot', () => {
    setup({ marks: { [OWNER]: [at(19)], [BOB]: [at(19)] }, notResponded: [CAT], selectedSlot: at(19) });
    expect(screen.getByRole('heading', { name: /7:00\sPM/ }).closest('div')).toHaveTextContent(/No data for this time:.*cat/);
  });

  it('unselects when the selected cell is pressed again', () => {
    const { onSelectSlot } = setup({ selectedSlot: at(20) });
    fireEvent.click(heat('8:00 PM'));
    expect(onSelectSlot).toHaveBeenCalledWith(null);
  });

  it('lists the best times with who is free and who is missing', () => {
    setup();
    const card = screen.getByRole('region', { name: 'Best times' });
    expect(within(card).getByText(/Wed, Nov 4, 7:00\sPM – 9:00\sPM/)).toBeInTheDocument();
    expect(within(card).getByText(/2 of 3 free: owner, bob/)).toBeInTheDocument();
    expect(within(card).getByText(/Not free: cat \(not marked\)/)).toBeInTheDocument();
  });

  it('shows a window with its day when "Show" is pressed', () => {
    const { onShowWindow } = setup();
    fireEvent.click(within(screen.getByRole('region', { name: 'Best times' })).getAllByRole('button', { name: 'Show' })[0]);
    expect(onShowWindow).toHaveBeenCalledWith(at(19));
  });

  it('offers "also close" windows with one person fewer', () => {
    const six = [...four, at(21), at(21, 30)];
    setup({ marks: { [OWNER]: six, [BOB]: six, [CAT]: four } });
    expect(screen.getByText('Also close (one person fewer)')).toBeInTheDocument();
  });

  it('says there is no overlap yet, and does not suggest a window, when nobody shares time', () => {
    setup({ marks: { [OWNER]: four, [BOB]: [at(10), at(10, 30), at(11), at(11, 30)] } });
    expect(screen.getByText(/No overlap yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show' })).not.toBeInTheDocument();
  });

  it('changes the shortest time suggested', () => {
    const { onMinSlots } = setup();
    fireEvent.click(screen.getByRole('radio', { name: '3 hours' }));
    expect(onMinSlots).toHaveBeenCalledWith(6);
    expect(screen.getByRole('radio', { name: '2 hours' })).toBeChecked();
  });

  it('leaves out the Best times card when none is wanted', () => {
    setup({ withWindows: false });
    expect(screen.queryByRole('region', { name: 'Best times' })).not.toBeInTheDocument();
  });

  it('names members who have not responded, including a row that expired', () => {
    const expired = row(DAN, [], {
      startDay: Math.floor(NOW / 86_400_000) - 100,
      updatedAt: new Date(NOW - 100 * 86_400_000).toISOString(),
    });
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(row(OWNER, [at(19)]))], [BOB, ok(null)], [DAN, ok(expired)]]);
    setup({ reads });
    expect(screen.getByText(/Not responded yet: bob, dan \(last saved 100 days ago, expired\)/)).toBeInTheDocument();
  });

  it('does not repeat the “couldn’t read” warning (the page shows it once, above both views)', () => {
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(row(OWNER, [at(19)]))], [BOB, { status: 'failed' }]]);
    setup({ reads });
    expect(screen.queryByText(/Couldn’t read the times of/)).not.toBeInTheDocument();
  });

  it('uses dark text on bright cells and light text on faint ones so the number stays readable', () => {
    setup();
    expect(heat('7:00 PM')).toHaveClass('text-free-foreground');
    expect(heat('9:00 PM')).toHaveClass('text-foreground');
  });

  it('flags times that may be out of date', () => {
    const old = (sub: string) => row(sub, four, { updatedAt: new Date(NOW - 20 * 86_400_000).toISOString() });
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(old(OWNER))], [BOB, ok(row(BOB, four))]]);
    setup({ reads, selectedSlot: at(19) });
    expect(screen.getByText(/owner \(may be out of date\)/, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /7:00\sPM/ }).closest('div')).toHaveTextContent(
      /owner \(last saved 20 days ago, may be out of date\)/,
    );
  });
});
