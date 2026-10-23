import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRACTICE_END_HOUR, PRACTICE_START_HOUR, formatWindow, type LocalDay } from '../../availabilityCalendar';
import {
  availableStatus,
  describeAge,
  describeSlot,
  subsOfKind,
  type AvailabilityResolution,
  type Overlap,
} from '../../availabilityUtils';
import type { BestWindow, MissingReason } from '../../bandTypes';
import { MIN_LENGTH_CHOICES, type BestWindows } from '../../availabilityWindows';
import { AvailabilityWeekGrid } from './AvailabilityWeekGrid';

/** From this share of members free the cell is dark enough to need light text. */
const HEAT_LIGHT_TEXT_FROM = 55;

const MISSING_TEXT: Record<MissingReason, string> = {
  'not-marked': 'not marked',
  'no-data': 'no data for these times',
  'not-responded': 'hasn’t responded',
  unreadable: 'couldn’t be read',
};

interface Props {
  /** The days on screen, one column each. */
  days: LocalDay[];
  todayKey: string;
  dayNote?: (day: LocalDay) => string | null;
  resolution: AvailabilityResolution;
  overlap: Overlap;
  /** Null while the Best times card is not needed (the heatmap alone is cheap). */
  windows: BestWindows | null;
  minSlots: number;
  onMinSlots: (slots: number) => void;
  selectedSlot: number | null;
  onSelectSlot: (slot: number | null) => void;
  /** Jump to a suggested window: pick its day and its first slot. */
  onShowWindow: (startSlot: number) => void;
  timeZone: string;
  locale?: string;
  nowMs: number;
  nameOf: (sub: string) => string;
}

/**
 * Everyone's free time together. A cell shows how many members marked it free (the number is
 * printed, so colour is never the only signal). Unmarked time is "not marked", never "busy".
 */
export function AvailabilityOverlap({
  days,
  todayKey,
  dayNote,
  resolution,
  overlap,
  windows,
  minSlots,
  onMinSlots,
  selectedSlot,
  onSelectSlot,
  onShowWindow,
  timeZone,
  locale,
  nowMs,
  nameOf,
}: Props) {
  const total = resolution.participants.length;
  const names = (subs: string[]) => subs.map(nameOf).join(', ');
  /** "Name" plus a note when their saved times may be stale. */
  const withStale = (sub: string) => (availableStatus(resolution, sub)?.outOfDate ? `${nameOf(sub)} (may be out of date)` : nameOf(sub));

  const notResponded = subsOfKind(resolution, 'not-responded');

  return (
    <div>
      {windows && (
        <section aria-labelledby="best-times-heading" className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="best-times-heading" className="text-base font-semibold text-foreground">Best times</h3>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Shortest time to suggest"
              value={String(minSlots)}
              onValueChange={(v) => v && onMinSlots(Number(v))}
            >
              {MIN_LENGTH_CHOICES.map((choice) => (
                <ToggleGroupItem key={choice.slots} value={String(choice.slots)} className="min-h-11">
                  {choice.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Suggestions stay within {PRACTICE_START_HOUR % 12 || 12} {PRACTICE_START_HOUR < 12 ? 'AM' : 'PM'} to{' '}
            {PRACTICE_END_HOUR % 12 || 12} {PRACTICE_END_HOUR < 12 ? 'AM' : 'PM'} in your time zone.
          </p>
          {windows.best.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No overlap yet. It shows up once at least two members mark the same stretch free.
            </p>
          ) : (
            <WindowList
              windows={windows.best}
              total={total}
              timeZone={timeZone}
              locale={locale}
              nameOf={nameOf}
              withStale={withStale}
              onShow={onShowWindow}
            />
          )}
          {windows.alsoClose.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">Also close (one person fewer)</h4>
              <WindowList
                windows={windows.alsoClose}
                total={total}
                timeZone={timeZone}
                locale={locale}
                nameOf={nameOf}
                withStale={withStale}
                onShow={onShowWindow}
              />
            </div>
          )}
        </section>
      )}

      <AvailabilityWeekGrid
        days={days}
        timeZone={timeZone}
        locale={locale}
        todayKey={todayKey}
        label="How many members are free"
        dayNote={dayNote}
        renderCell={({ slot, timeLabel, dayLabel }, focus) => {
          const free = overlap.freeAt(slot);
          const share = total > 0 ? Math.round((100 * free.length) / total) : 0;
          const past = slot <= resolution.nowSlot;
          const selected = slot === selectedSlot;
          return (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${dayLabel}, ${timeLabel}, ${free.length} of ${total} free${free.length ? `: ${names(free)}` : ''}`}
              {...focus}
              onClick={() => onSelectSlot(selected ? null : slot)}
              style={
                free.length > 0 ? { backgroundColor: `color-mix(in srgb, var(--color-primary) ${share}%, var(--color-card))` } : undefined
              }
              className={cn(
                'flex h-full min-h-8 w-full [@media(pointer:coarse)]:min-h-11 items-center justify-center rounded-sm border text-xs font-semibold transition-colors',
                share >= HEAT_LIGHT_TEXT_FROM ? 'text-primary-foreground' : 'text-foreground',
                selected ? 'border-foreground ring-1 ring-foreground' : 'border-transparent bg-card',
                past && 'opacity-40',
              )}
            >
              {free.length > 0 ? free.length : ''}
            </button>
          );
        }}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        The number is how many of {total} {total === 1 ? 'member is' : 'members are'} free. Time nobody marked shows as
        “not marked”, not busy.
      </p>

      <div aria-live="polite" className="sticky bottom-2 z-10 mt-3">
        {selectedSlot !== null && (
          <SlotDetail
            slot={selectedSlot}
            overlap={overlap}
            resolution={resolution}
            timeZone={timeZone}
            locale={locale}
            nowMs={nowMs}
            nameOf={nameOf}
          />
        )}
      </div>

      {notResponded.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Not responded yet:{' '}
          {notResponded
            .map((sub) => {
              const status = resolution.statuses.get(sub);
              const age = status?.kind === 'not-responded' && status.expired ? describeAge(status.lastSaved, nowMs) : null;
              return age ? `${nameOf(sub)} (last saved ${age}, expired)` : nameOf(sub);
            })
            .join(', ')}
        </p>
      )}
    </div>
  );
}

function WindowList({
  windows,
  total,
  timeZone,
  locale,
  nameOf,
  withStale,
  onShow,
}: {
  windows: BestWindow[];
  total: number;
  timeZone: string;
  locale?: string;
  nameOf: (sub: string) => string;
  withStale: (sub: string) => string;
  onShow: (startSlot: number) => void;
}) {
  return (
    <ul className="grid gap-2">
      {windows.map((w) => (
        <li key={`${w.startSlot}-${w.endSlot}`} className="rounded-md bg-muted/40 p-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-foreground">{formatWindow(w.startSlot, w.endSlot, timeZone, locale)}</strong>
            <Button variant="ghost" className="min-h-11" onClick={() => onShow(w.startSlot)}>
              Show
            </Button>
          </div>
          <p className="text-foreground/80">
            {w.subs.length} of {total} free: {w.subs.map(withStale).join(', ')}
          </p>
          {w.missing.length > 0 && (
            <p className="text-muted-foreground">
              Not free: {w.missing.map((m) => `${nameOf(m.sub)} (${MISSING_TEXT[m.reason]})`).join(', ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function SlotDetail({
  slot,
  overlap,
  resolution,
  timeZone,
  locale,
  nowMs,
  nameOf,
}: {
  slot: number;
  overlap: Overlap;
  resolution: AvailabilityResolution;
  timeZone: string;
  locale?: string;
  nowMs: number;
  nameOf: (sub: string) => string;
}) {
  const detail = describeSlot(overlap, slot);
  /** "Name — last saved 3 days ago" for members who have saved times. */
  const saved = (sub: string) => {
    const status = availableStatus(resolution, sub);
    const age = describeAge(status?.lastSaved ?? null, nowMs);
    const bits = [age ? `last saved ${age}` : null, status?.outOfDate ? 'may be out of date' : null].filter(Boolean);
    return bits.length ? `${nameOf(sub)} (${bits.join(', ')})` : nameOf(sub);
  };
  const lines: Array<[string, string[]]> = [
    ['Free', detail.free.map(saved)],
    ['Not marked', detail.notMarked.map(saved)],
    ['No data for this time', detail.noData.map(nameOf)],
    ['Couldn’t be read', detail.unreadable.map(nameOf)],
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <h3 className="mb-1 font-semibold text-foreground">{formatWindow(slot, slot + 1, timeZone, locale)}</h3>
      <dl className="grid gap-1">
        {lines
          .filter(([, who]) => who.length > 0)
          .map(([label, who]) => (
            <div key={label} className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-foreground">{label}:</dt>
              <dd className="text-foreground/80">{who.join(', ')}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
