import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  PRACTICE_END_HOUR,
  PRACTICE_START_HOUR,
  formatDayLabel,
  formatSlotTime,
  labelDaySlots,
  practiceSlots,
  repeatWeekday,
  type LocalDay,
} from '../../availabilityCalendar';
import { isSlotEditable } from '../../availabilitySlots';

/** Whole weeks the repeat tool offers; the last is `repeatWeekday`'s cap. */
const REPEAT_WEEK_CHOICES = [1, 2, 3, 4, 6, 8];
const DEFAULT_REPEAT_WEEKS = 4;
/** The range tool's starting length: two hours. */
const DEFAULT_RANGE_SLOTS = 4;

const selectClass =
  'min-h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';
const fieldLabelClass = 'grid gap-1 text-xs text-muted-foreground';

/** "8 AM", "10 PM" for a whole local hour. */
const hourText = (hour: number): string => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

interface Props {
  /** The days on screen; the tools work on one of them. */
  days: LocalDay[];
  /** The last slot the calendar can show: repeats stop here so nothing is stored that can't be seen. */
  lastVisibleSlot: number;
  timeZone: string;
  locale?: string;
  nowMs: number;
  /** Slots currently marked free (stored marks with unsaved edits). */
  free: ReadonlySet<number>;
  disabled: boolean;
  onSetSlots: (slots: number[], mark: boolean) => void;
}

/**
 * Bulk tools for one day, for keyboard and touch where tapping 28 cells is slow: mark or clear a
 * range, clear the day, repeat it on the same weekday for some weeks. The day is the picked one,
 * else the first day on screen with time left to mark.
 */
export function AvailabilityDayTools({ days, lastVisibleSlot, timeZone, locale, nowMs, free, disabled, onSetSlots }: Props) {
  const [dayChoice, setDayChoice] = useState<string | null>(null);
  const editableIn = (day: LocalDay) => practiceSlots(day, timeZone).filter((slot) => isSlotEditable(slot, nowMs));
  const toolDay = days.find((d) => d.key === dayChoice) ?? days.find((d) => editableIn(d).length > 0) ?? days[0];
  const editableSlots = editableIn(toolDay);
  const labels = new Map<number, string>();
  labelDaySlots(toolDay, timeZone, locale).forEach((label, i) => labels.set(toolDay.slots[i], label));

  // Clearing removes every mark on the day (even one outside practice hours that an older version
  // saved and the grid can't show); repeating copies only what the grid shows.
  const clearable = toolDay.slots.filter((slot) => free.has(slot) && isSlotEditable(slot, nowMs));
  const repeatable = editableSlots.filter((slot) => free.has(slot));

  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        Practice is {hourText(PRACTICE_START_HOUR)} to {hourText(PRACTICE_END_HOUR)}. The tools below work on one day:
      </p>
      <label className={fieldLabelClass}>
        Day
        <select className={selectClass} disabled={disabled} value={toolDay.key} onChange={(e) => setDayChoice(e.target.value)}>
          {days.map((day) => (
            <option key={day.key} value={day.key}>
              {formatDayLabel(day.slots[0], timeZone, locale)}
            </option>
          ))}
        </select>
      </label>
      <RangeTool editableSlots={editableSlots} labels={labels} timeZone={timeZone} locale={locale} disabled={disabled} onSetSlots={onSetSlots} />
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" className="min-h-11" disabled={disabled || clearable.length === 0} onClick={() => onSetSlots(clearable, false)}>
          Clear this day
        </Button>
      </div>
      <RepeatTool
        repeatable={repeatable}
        lastVisibleSlot={lastVisibleSlot}
        timeZone={timeZone}
        nowMs={nowMs}
        disabled={disabled}
        onSetSlots={onSetSlots}
      />
    </div>
  );
}

/** Mark or clear from a start time until an end time: a start, then a length in half hours. */
function RangeTool({
  editableSlots,
  labels,
  timeZone,
  locale,
  disabled,
  onSetSlots,
}: {
  editableSlots: number[];
  labels: ReadonlyMap<number, string>;
  timeZone: string;
  locale?: string;
  disabled: boolean;
  onSetSlots: (slots: number[], mark: boolean) => void;
}) {
  const [startChoice, setStartChoice] = useState<number | null>(null);
  const [lengthChoice, setLengthChoice] = useState<number | null>(null);
  const start = startChoice !== null && editableSlots.includes(startChoice) ? startChoice : (editableSlots[0] ?? null);
  // The practice slots still to come are an unbroken run to the end of practice, so a range is a slice of it.
  const startIndex = start === null ? -1 : editableSlots.indexOf(start);
  const maxLength = startIndex < 0 ? 0 : editableSlots.length - startIndex;
  const lengthInSlots = Math.min(lengthChoice ?? DEFAULT_RANGE_SLOTS, maxLength);
  const rangeSlots = startIndex < 0 ? [] : editableSlots.slice(startIndex, startIndex + lengthInSlots);
  /** Each end time on offer, with the range length it means; a range ends where the slot after its last one starts. */
  const untilOptions = editableSlots.slice(startIndex < 0 ? 0 : startIndex).map((slot, i) => ({
    lengthInSlots: i + 1,
    label: labels.get(slot + 1) ?? formatSlotTime(slot + 1, timeZone, locale),
  }));

  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Mark a range of times">
      <label className={fieldLabelClass}>
        From
        <select
          className={selectClass}
          disabled={disabled || start === null}
          value={start ?? ''}
          onChange={(e) => setStartChoice(Number(e.target.value))}
        >
          {editableSlots.map((slot) => (
            <option key={slot} value={slot}>
              {labels.get(slot)}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabelClass}>
        Until
        <select
          className={selectClass}
          disabled={disabled || start === null}
          value={lengthInSlots}
          onChange={(e) => setLengthChoice(Number(e.target.value))}
        >
          {(start === null ? [] : untilOptions).map((option) => (
            <option key={option.lengthInSlots} value={option.lengthInSlots}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Button className="min-h-11" disabled={disabled || rangeSlots.length === 0} onClick={() => onSetSlots(rangeSlots, true)}>
        Mark free
      </Button>
      <Button variant="outline" className="min-h-11" disabled={disabled || rangeSlots.length === 0} onClick={() => onSetSlots(rangeSlots, false)}>
        Clear
      </Button>
    </div>
  );
}

/** Copy the day's marked times onto the same weekday for the next few weeks. */
function RepeatTool({
  repeatable,
  lastVisibleSlot,
  timeZone,
  nowMs,
  disabled,
  onSetSlots,
}: {
  repeatable: number[];
  lastVisibleSlot: number;
  timeZone: string;
  nowMs: number;
  disabled: boolean;
  onSetSlots: (slots: number[], mark: boolean) => void;
}) {
  const [weeks, setWeeks] = useState(DEFAULT_REPEAT_WEEKS);
  const repeat = () => {
    const added = [...repeatWeekday(repeatable, weeks, timeZone, lastVisibleSlot)].filter((slot) => isSlotEditable(slot, nowMs));
    if (added.length > 0) onSetSlots(added, true);
  };
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Repeat this day">
      <label className={fieldLabelClass}>
        Repeat this day’s times weekly for
        <select className={selectClass} disabled={disabled} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          {REPEAT_WEEK_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1 week' : `${n} weeks`}
            </option>
          ))}
        </select>
      </label>
      <Button variant="outline" className="min-h-11" disabled={disabled || repeatable.length === 0} onClick={repeat}>
        Repeat
      </Button>
      <span className="text-xs text-muted-foreground">Same weekday and clock time in {timeZone}.</span>
    </div>
  );
}
