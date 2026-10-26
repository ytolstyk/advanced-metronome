import { Fragment, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatDayLabel, labelDaySlots, practiceSlots, type LocalDay } from '../../availabilityCalendar';

/** Width of the column of time labels. */
const GUTTER = '3.5rem';

export interface WeekCell {
  slot: number;
  /** Zero-based column (day) and row (half hour) of the cell. */
  col: number;
  row: number;
  timeLabel: string;
  dayLabel: string;
}

/** What each cell button must spread on so the whole grid is ONE tab stop moved with the arrow keys. */
export interface CellFocus {
  tabIndex: 0 | -1;
  'data-col': number;
  'data-row': number;
}

interface Props {
  /** The days shown, one column each. */
  days: LocalDay[];
  timeZone: string;
  locale?: string;
  /** Key of today's column (highlighted). */
  todayKey: string;
  /** Accessible name of the grid. */
  label: string;
  /** Short text under a day's name. */
  dayNote?: (day: LocalDay) => string | null;
  /** Slots whose cell is disabled (e.g. already started): keyboard movement skips them. */
  isDisabled?: (slot: number) => boolean;
  renderCell: (cell: WeekCell, focus: CellFocus) => ReactNode;
}

type Position = { col: number; row: number };

function DayNote({ text }: { text: string | null | undefined }) {
  return text ? <div className="font-normal text-muted-foreground">{text}</div> : null;
}

/**
 * A week the way a calendar draws it: one column per day, half-hour rows from 8 AM to 10 PM, the
 * hour labels in a gutter on the left. Rows are matched across days by position (the n-th practice
 * slot of each day), so a daylight-saving day or a :15/:45 zone lines up, and every cell says its
 * own day and time. Arrow keys move between cells; Tab enters and leaves the grid in one stop.
 */
export function AvailabilityWeekGrid({ days, timeZone, locale, todayKey, label, dayNote, isDisabled, renderCell }: Props) {
  const columns = useMemo(
    () =>
      days.map((day) => {
        const labels = new Map<number, string>();
        labelDaySlots(day, timeZone, locale).forEach((text, i) => labels.set(day.slots[i], text));
        return { day, slots: practiceSlots(day, timeZone), labels, dayLabel: formatDayLabel(day.slots[0], timeZone, locale) };
      }),
    [days, timeZone, locale],
  );
  const rowCount = Math.max(0, ...columns.map((c) => c.slots.length));

  // ── Keyboard: one tab stop, arrow keys move between cells ──
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Position>({ col: 0, row: 0 });
  const usable = (col: number, row: number): boolean => {
    const slot = columns[col]?.slots[row];
    return slot !== undefined && !isDisabled?.(slot);
  };
  // The tab stop is the active cell, or the first usable one when that is gone or disabled.
  let stop: Position | null = usable(active.col, active.row) ? active : null;
  for (let col = 0; !stop && col < columns.length; col++) {
    for (let row = 0; !stop && row < rowCount; row++) if (usable(col, row)) stop = { col, row };
  }
  // One handler for the whole grid (focus bubbles in React), so cells get no per-render closure and can be memoized.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const { col, row } = (e.target as HTMLElement).dataset;
    if (col === undefined || row === undefined) return;
    const next = { col: Number(col), row: Number(row) };
    setActive((p) => (p.col === next.col && p.row === next.row ? p : next));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = e.target as HTMLElement;
    if (from.dataset.col === undefined || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return; // leave browser shortcuts alone
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    let col = Number(from.dataset.col) + step[0];
    let row = Number(from.dataset.row) + step[1];
    // Past slots are disabled cells: keep going in the same direction to the next usable one.
    while (col >= 0 && col < columns.length && row >= 0 && row < rowCount) {
      const next = root.current?.querySelector<HTMLButtonElement>(`button[data-col="${col}"][data-row="${row}"]`);
      if (next && !next.disabled) return next.focus();
      col += step[0];
      row += step[1];
    }
  };

  return (
    <div ref={root} role="group" aria-label={label} onKeyDown={onKeyDown} onFocus={onFocus}>
      <div className="grid" style={{ gridTemplateColumns: `${GUTTER} repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div />
        {columns.map(({ day, dayLabel }) => (
          <div
            key={day.key}
            className={cn('px-1 pb-1 text-center text-xs leading-tight', day.key === todayKey ? 'font-semibold text-primary' : 'text-foreground')}
          >
            <div>{dayLabel}</div>
            <DayNote text={dayNote?.(day)} />
          </div>
        ))}
        {Array.from({ length: rowCount }, (_, row) => {
          const hourStart = row % 2 === 0;
          // The hour label comes from the first day that has this row.
          const owner = columns.find((c) => c.slots[row] !== undefined);
          const gutterLabel = owner?.labels.get(owner.slots[row]);
          return (
            <Fragment key={row}>
              <div className="whitespace-nowrap pr-2 pt-1 text-right text-xs leading-none text-muted-foreground">{hourStart ? gutterLabel : ''}</div>
              {columns.map((column, col) => {
                const slot = column.slots[row];
                // One solid hairline on every cell, empty ones included, so the grid has no gaps; the line under
                // each hour is a touch stronger than the one under its half hour.
                const lines = cn(
                  'border-b border-r',
                  hourStart ? 'border-b-border/40' : 'border-b-border',
                  'border-r-border/60',
                  col === 0 && 'border-l border-l-border/60',
                  row === 0 && 'border-t border-t-border',
                );
                if (slot === undefined) return <div key={column.day.key} aria-hidden="true" className={lines} />;
                const focus: CellFocus = {
                  tabIndex: stop?.col === col && stop.row === row ? 0 : -1,
                  'data-col': col,
                  'data-row': row,
                };
                return (
                  <div key={column.day.key} className={cn('p-0.5', lines)}>
                    {renderCell({ slot, col, row, timeLabel: column.labels.get(slot) ?? '', dayLabel: column.dayLabel }, focus)}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
