import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDayLabel, type LocalDay } from '../../availabilityCalendar';

interface Props {
  /** Every day that can be shown. */
  days: LocalDay[];
  /** Index of the first day on screen, and how many are shown. */
  start: number;
  /** Index of today, which is not the first day when the week starts on a Sunday before it. */
  todayIndex: number;
  /** Index of the first page's first day; "Earlier" stops there. */
  firstStart?: number;
  perPage: number;
  timeZone: string;
  locale?: string;
  onEarlier: () => void;
  onLater: () => void;
  /** Show the page that holds the day at this index. */
  onGoToDay: (index: number) => void;
}

/** Earlier / Today / Later, the dates on screen, and a date box for jumping further. */
export function AvailabilityWeekNav({ days, start, todayIndex, firstStart = 0, perPage, timeZone, locale, onEarlier, onLater, onGoToDay }: Props) {
  const last = Math.min(start + perPage, days.length) - 1;
  // The box's `min` is today, so a page that starts earlier shows today in it instead.
  const shownIndex = Math.max(start, todayIndex);
  return (
    <nav aria-label="Choose dates" className="mb-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" className="min-h-11" onClick={onEarlier} disabled={start <= firstStart}>
        ← Earlier
      </Button>
      <Button variant="outline" className="min-h-11" onClick={() => onGoToDay(todayIndex)} disabled={todayIndex >= start && todayIndex < start + perPage}>
        Today
      </Button>
      <Button variant="outline" className="min-h-11" onClick={onLater} disabled={start + perPage >= days.length}>
        Later →
      </Button>
      <span className="text-sm font-medium text-foreground" aria-live="polite">
        {formatDayLabel(days[start].slots[0], timeZone, locale)} – {formatDayLabel(days[last].slots[0], timeZone, locale)}
      </span>
      <Input
        type="date"
        aria-label="Jump to a date"
        className="h-11 w-auto"
        min={days[todayIndex].key}
        max={days[days.length - 1].key}
        // Uncontrolled, re-keyed when the page changes: a controlled date box would undo every partial keystroke.
        key={days[shownIndex].key}
        defaultValue={days[shownIndex].key}
        onChange={(e) => {
          const index = days.findIndex((d) => d.key === e.target.value);
          if (index >= 0) onGoToDay(index);
        }}
      />
    </nav>
  );
}
