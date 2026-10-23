import { memo, useEffect, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type LocalDay } from '../../availabilityCalendar';
import { isSlotEditable } from '../../availabilitySlots';
import { AvailabilityDayTools } from './AvailabilityDayTools';
import { AvailabilityWeekGrid } from './AvailabilityWeekGrid';

interface Props {
  /** The days on screen, one column each. */
  days: LocalDay[];
  todayKey: string;
  dayNote?: (day: LocalDay) => string | null;
  /** The last slot the calendar can show: repeats stop here so nothing is stored that can't be seen. */
  lastVisibleSlot: number;
  timeZone: string;
  locale?: string;
  nowMs: number;
  /** Slots currently marked free (stored marks with unsaved edits). */
  free: ReadonlySet<number>;
  /** Editing is off (a delete is running, or the stored row can't be edited). */
  disabled: boolean;
  onSetSlots: (slots: number[], mark: boolean) => void;
}

/**
 * Mouse drag-painting: pressing a cell decides whether the drag marks or clears, and entering more
 * cells with the button held applies the same. Touch and keyboard use the button's normal click.
 * A mouse press is applied on pointer down, so the click that follows it must be skipped; a drag
 * ends over a different element, so that click may never arrive, and the skip is cleared when the
 * button is released rather than waiting for one.
 */
function useSlotPainting() {
  const paintMark = useRef<boolean | null>(null);
  const skipNextClick = useRef(false);
  useEffect(() => {
    const stop = () => {
      paintMark.current = null;
      // The click for this press (if any) is dispatched right after pointer up.
      setTimeout(() => {
        skipNextClick.current = false;
      }, 0);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);
  return useMemo(
    () => ({
      /** A mouse press on a cell: starts a drag that marks (if the cell was clear) or clears (if marked). */
      press: (isFree: boolean, mark: (mark: boolean) => void) => {
        paintMark.current = !isFree;
        skipNextClick.current = true;
        mark(!isFree);
      },
      /** The pointer entered a cell: with the button held, applies the drag's mark unless it already matches. */
      enter: (isFree: boolean, buttons: number, mark: (mark: boolean) => void) => {
        const dragMark = paintMark.current;
        if (dragMark !== null && buttons === 1 && dragMark !== isFree) mark(dragMark);
      },
      /** A click: toggles, unless it is the click for a mouse press already applied. */
      click: (isFree: boolean, mark: (mark: boolean) => void) => {
        if (skipNextClick.current) {
          skipNextClick.current = false;
          return;
        }
        mark(!isFree);
      },
    }),
    [],
  );
}

type Painting = ReturnType<typeof useSlotPainting>;

const SlotToggleButton = memo(function SlotToggleButton({
  slot,
  ariaLabel,
  isFree,
  editable,
  painting,
  tabIndex,
  col,
  row,
  onSetSlots,
}: {
  slot: number;
  /** Names the cell for screen readers: its day and time. */
  ariaLabel: string;
  isFree: boolean;
  editable: boolean;
  painting: Painting;
  tabIndex: 0 | -1;
  col: number;
  row: number;
  onSetSlots: (slots: number[], mark: boolean) => void;
}) {
  const onMark = (mark: boolean) => onSetSlots([slot], mark);
  return (
    <button
      type="button"
      aria-pressed={isFree}
      aria-label={ariaLabel}
      disabled={!editable}
      tabIndex={tabIndex}
      data-col={col}
      data-row={row}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button === 0) painting.press(isFree, onMark);
      }}
      onPointerEnter={(e) => painting.enter(isFree, e.buttons, onMark)}
      onClick={() => painting.click(isFree, onMark)}
      className={cn(
        'flex h-full min-h-8 w-full [@media(pointer:coarse)]:min-h-11 select-none items-center justify-center rounded-sm border text-primary-foreground transition-colors',
        isFree ? 'border-primary bg-primary' : 'border-transparent bg-card hover:bg-muted',
        !editable && 'cursor-not-allowed opacity-40 hover:bg-card',
      )}
    >
      {isFree && <Check size={14} aria-hidden="true" />}
    </button>
  );
});

/**
 * The person's own times as a week. Tap a half hour to mark it free (or free again); with a mouse
 * you can also drag across cells. The range, clear and repeat tools do the same for one chosen day
 * with a keyboard or a finger. Anything left unmarked is simply "not marked": nobody is ever shown as busy.
 */
export function AvailabilityEditor({
  days,
  todayKey,
  dayNote,
  lastVisibleSlot,
  timeZone,
  locale,
  nowMs,
  free,
  disabled,
  onSetSlots,
}: Props) {
  const painting = useSlotPainting();

  return (
    <div>
      <AvailabilityWeekGrid
        days={days}
        timeZone={timeZone}
        locale={locale}
        todayKey={todayKey}
        label="Times you can practice"
        dayNote={dayNote}
        isDisabled={(slot) => !isSlotEditable(slot, nowMs) || disabled}
        renderCell={(cell, focus) => (
          <SlotToggleButton
            slot={cell.slot}
            ariaLabel={`${cell.dayLabel}, ${cell.timeLabel}`}
            isFree={free.has(cell.slot)}
            editable={isSlotEditable(cell.slot, nowMs) && !disabled}
            painting={painting}
            tabIndex={focus.tabIndex}
            col={focus['data-col']}
            row={focus['data-row']}
            onSetSlots={onSetSlots}
          />
        )}
      />

      <AvailabilityDayTools
        days={days}
        lastVisibleSlot={lastVisibleSlot}
        timeZone={timeZone}
        locale={locale}
        nowMs={nowMs}
        free={free}
        disabled={disabled}
        onSetSlots={onSetSlots}
      />
    </div>
  );
}
