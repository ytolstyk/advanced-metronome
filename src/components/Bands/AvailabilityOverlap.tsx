import { Fragment, type ReactNode } from 'react';
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
import { instrumentOptionsFor, type InstrumentKey } from '../../bandInstruments';
import { INSTRUMENT_ICONS } from './instrumentIcons';
import { instrumentCoverage } from '../../instrumentCoverage';
import { AvailabilityWeekGrid } from './AvailabilityWeekGrid';
import { InstrumentIcons, InstrumentLabels } from './InstrumentBadges';

/** The faintest tint a cell with anyone free gets, so a single person is still easy to see. */
const HEAT_FLOOR_PERCENT = 40;

/** From this share of members free the cell is bright enough to need dark text. */
const HEAT_DARK_TEXT_FROM = 35;

/** Instrument icons a grid cell shows before collapsing the rest into "+n"; the full list is in the detail card. */
const CELL_ICON_LIMIT = 3;

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
  /** What each member plays; omitted (or empty) shows names alone. */
  instrumentsOf?: (sub: string) => readonly InstrumentKey[];
}

/** A person as a name (or a longer note about them) with what they play beside it. */
type PersonNode = (sub: string, text?: string) => ReactNode;

/** People separated by commas. */
function listPeople(people: ReactNode[]): ReactNode {
  return people.map((person, i) => (
    <Fragment key={i}>
      {i > 0 && ', '}
      {person}
    </Fragment>
  ));
}

/** Which instruments can jam, from the people who are free. Nothing when no one has listed an instrument. */
function InstrumentLine({
  freeSubs,
  allSubs,
  instrumentsOf,
}: {
  freeSubs: readonly string[];
  allSubs: readonly string[];
  instrumentsOf?: (sub: string) => readonly InstrumentKey[];
}) {
  if (!instrumentsOf || freeSubs.length === 0) return null;
  const { covered, missing, unknown } = instrumentCoverage(freeSubs, allSubs, instrumentsOf);
  if (unknown) return null;
  return (
    <p className="text-foreground/80">
      Instruments free: {covered.length > 0 ? <InstrumentLabels instruments={covered} /> : 'none'}
      {missing.length > 0 && (
        <span className="text-muted-foreground">
          {' · '}No one free plays: <InstrumentLabels instruments={missing} />
        </span>
      )}
    </p>
  );
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
  instrumentsOf,
}: Props) {
  const total = resolution.participants.length;
  const names = (subs: string[]) => subs.map(nameOf).join(', ');
  const person: PersonNode = (sub, text = nameOf(sub)) => {
    const instruments = instrumentsOf?.(sub) ?? [];
    // No nowrap: `text` can carry a long note ("last saved 3 days ago, may be out of date") that must wrap on a phone.
    return instruments.length > 0 ? (
      <span>
        {text} <InstrumentIcons instruments={instruments} />
      </span>
    ) : (
      text
    );
  };
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
              person={person}
              participants={resolution.participants}
              instrumentsOf={instrumentsOf}
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
                person={person}
                participants={resolution.participants}
                instrumentsOf={instrumentsOf}
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
          const playing = instrumentsOf ? instrumentOptionsFor(free.flatMap((sub) => [...instrumentsOf(sub)])) : [];          return (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${dayLabel}, ${timeLabel}, ${free.length} of ${total} free${free.length ? `: ${names(free)}` : ''}`}
              {...focus}
              onClick={() => onSelectSlot(selected ? null : slot)}
              style={
                free.length > 0 ? { backgroundColor: `color-mix(in srgb, var(--color-free) ${HEAT_FLOOR_PERCENT + ((100 - HEAT_FLOOR_PERCENT) * share) / 100}%, var(--color-card))` } : undefined
              }
              className={cn(
                'flex h-full min-h-8 w-full [@media(pointer:coarse)]:min-h-11 items-center justify-center rounded-sm border text-xs font-semibold transition-colors',
                share >= HEAT_DARK_TEXT_FROM ? 'text-free-foreground' : 'text-foreground',
                selected ? 'border-foreground ring-2 ring-foreground' : 'border-transparent bg-card',
                past && 'opacity-40',
              )}
            >
              {free.length > 0 ? free.length : ''}
              {playing.length > 0 && (
                <span aria-hidden className="ml-1 flex items-center gap-px overflow-hidden">
                  {playing.slice(0, CELL_ICON_LIMIT).map(({ key }) => {
                    const Icon = INSTRUMENT_ICONS[key];
                    return <Icon key={key} size={12} />;
                  })}
                  {playing.length > CELL_ICON_LIMIT && <span className="text-[10px]">+{playing.length - CELL_ICON_LIMIT}</span>}
                </span>
              )}
            </button>
          );
        }}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        The number is how many of {total} {total === 1 ? 'member is' : 'members are'} free. Time nobody marked shows as
        “not marked”, not busy.{instrumentsOf && ' The icons show which instruments those members play.'}
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
            person={person}
            instrumentsOf={instrumentsOf}
          />
        )}
      </div>

      {notResponded.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Not responded yet:{' '}
          {listPeople(
            notResponded.map((sub) => {
              const status = resolution.statuses.get(sub);
              const age = status?.kind === 'not-responded' && status.expired ? describeAge(status.lastSaved, nowMs) : null;
              return person(sub, age ? `${nameOf(sub)} (last saved ${age}, expired)` : nameOf(sub));
            }),
          )}
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
  person,
  participants,
  instrumentsOf,
  onShow,
}: {
  windows: BestWindow[];
  total: number;
  timeZone: string;
  locale?: string;
  nameOf: (sub: string) => string;
  withStale: (sub: string) => string;
  person: PersonNode;
  participants: readonly string[];
  instrumentsOf?: (sub: string) => readonly InstrumentKey[];
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
            {w.subs.length} of {total} free: {listPeople(w.subs.map((sub) => person(sub, withStale(sub))))}
          </p>
          <InstrumentLine freeSubs={w.subs} allSubs={participants} instrumentsOf={instrumentsOf} />
          {w.missing.length > 0 && (
            <p className="text-muted-foreground">
              Not free: {listPeople(w.missing.map((m) => person(m.sub, `${nameOf(m.sub)} (${MISSING_TEXT[m.reason]})`)))}
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
  person,
  instrumentsOf,
}: {
  slot: number;
  overlap: Overlap;
  resolution: AvailabilityResolution;
  timeZone: string;
  locale?: string;
  nowMs: number;
  nameOf: (sub: string) => string;
  person: PersonNode;
  instrumentsOf?: (sub: string) => readonly InstrumentKey[];
}) {
  const detail = describeSlot(overlap, slot);
  /** "Name — last saved 3 days ago" for members who have saved times. */
  const saved = (sub: string) => {
    const status = availableStatus(resolution, sub);
    const age = describeAge(status?.lastSaved ?? null, nowMs);
    const bits = [age ? `last saved ${age}` : null, status?.outOfDate ? 'may be out of date' : null].filter(Boolean);
    return person(sub, bits.length ? `${nameOf(sub)} (${bits.join(', ')})` : nameOf(sub));
  };
  const lines: Array<[string, ReactNode[]]> = [
    ['Free', detail.free.map(saved)],
    ['Not marked', detail.notMarked.map(saved)],
    ['No data for this time', detail.noData.map((sub) => person(sub))],
    ['Couldn’t be read', detail.unreadable.map((sub) => person(sub))],
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
              <dd className="text-foreground/80">{listPeople(who)}</dd>
            </div>
          ))}
      </dl>
      <InstrumentLine freeSubs={detail.free} allSubs={resolution.participants} instrumentsOf={instrumentsOf} />
    </div>
  );
}
