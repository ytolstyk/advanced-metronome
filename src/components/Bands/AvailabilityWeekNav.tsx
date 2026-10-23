import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDayLabel, type LocalDay } from '../../availabilityCalendar';

interface Props {
  /** Every day that can be shown. */
  days: LocalDay[];
  /** Index of the first day on screen, and how many are shown. */
  start: number;
  perPage: number;
  timeZone: string;
  locale?: string;
  onEarlier: () => void;
  onLater: () => void;
  /** Show the page that holds the day at this index (0 is today). */
  onGoToDay: (index: number) => void;
}

/** Earlier / Today / Later, the dates on screen, and a date box for jumping further. */
export function AvailabilityWeekNav({ days, start, perPage, timeZone, locale, onEarlier, onLater, onGoToDay }: Props) {
  const last = Math.min(start + perPage, days.length) - 1;
  return (
    <nav aria-label="Choose dates" className="mb-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" className="min-h-11" onClick={onEarlier} disabled={start === 0}>
        ← Earlier
      </Button>
      <Button variant="outline" className="min-h-11" onClick={() => onGoToDay(0)} disabled={start === 0}>
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
        min={days[0].key}
        max={days[days.length - 1].key}
        // Uncontrolled, re-keyed when the page changes: a controlled date box would undo every partial keystroke.
        key={days[start].key}
        defaultValue={days[start].key}
        onChange={(e) => {
          const index = days.findIndex((d) => d.key === e.target.value);
          if (index >= 0) onGoToDay(index);
        }}
      />
    </nav>
  );
}
