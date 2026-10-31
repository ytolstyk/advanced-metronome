import { useMemo, useState } from 'react';
import type { AvailabilityPageOk } from '../api/availabilityApi';
import { WIDE_DAYS_PER_PAGE } from './useDaysPerPage';
import { buildCalendarDays, localDateKey, practiceSlots, type LocalDay } from '../availabilityCalendar';
import {
  buildOverlap,
  parseGroup,
  overlayMine,
  resolveAt,
  type AvailabilityResolution,
  type Overlap,
} from '../availabilityUtils';
import { findBestWindows, type BestWindows } from '../availabilityWindows';

/**
 * The days the calendar pages through: from the Sunday of this week, through today and the days
 * ahead. About 3,500 Intl calls, so it is rebuilt when the local date changes,
 * not on every clock tick.
 */
export function useHorizonDays(nowMs: number, timeZone: string): LocalDay[] {
  const todayKey = localDateKey(nowMs, timeZone);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the date, deliberately not on `nowMs`
  return useMemo(() => buildCalendarDays(Date.now(), timeZone), [todayKey, timeZone]);
}

/**
 * Which days are on screen (a page of `perPage` columns) and the slot picked among them. Moving to
 * another page, or any day jump, clears the picked slot; if the days are rebuilt without the page
 * being shown (the horizon rolled over), it is clamped to the last page.
 *
 * At a full week (7 columns) pages are aligned to the first day, a Sunday, so they read Sunday to
 * Saturday and the days before `todayIndex` stay reachable. On fewer columns (a phone) pages start
 * at `todayIndex`, so the first screen opens on today and never on dead past columns.
 */
export function useWeekFocus(days: LocalDay[], perPage: number, todayIndex: number) {
  const firstStart = perPage >= WIDE_DAYS_PER_PAGE ? 0 : Math.min(todayIndex, days.length - 1);
  const lastIndex = days.length - 1;
  const pageOf = (index: number) =>
    firstStart + Math.floor((Math.min(Math.max(index, firstStart), lastIndex) - firstStart) / perPage) * perPage;
  const [focus, setFocus] = useState<{ start: number; slot: number | null }>({ start: todayIndex, slot: null });
  const start = pageOf(focus.start);
  const visibleDays = useMemo(() => days.slice(start, start + perPage), [days, start, perPage]);
  const slotShown = focus.slot !== null && visibleDays.some((d) => d.slots.includes(focus.slot!));
  return {
    start,
    /** Index of the first day of the first page; "Earlier" stops here. */
    firstStart,
    visibleDays,
    selectedSlot: slotShown ? focus.slot : null,
    /** Show the page that holds the day at `index`. */
    goToDay: (index: number) => setFocus({ start: pageOf(index), slot: null }),
    /** Move by whole pages (-1 earlier, +1 later). */
    shiftPage: (direction: -1 | 1) => setFocus({ start: pageOf(start + direction * perPage), slot: null }),
    selectSlot: (slot: number | null) => setFocus((f) => ({ ...f, slot })),
    /** Jump to the page holding a slot and pick it. */
    showSlot: (slot: number) => {
      const index = days.findIndex((d) => d.slots.includes(slot));
      if (index >= 0) setFocus({ start: pageOf(index), slot });
    },
  };
}

interface ModelOptions {
  data: AvailabilityPageOk;
  nowMs: number;
  /** The caller's own marks (unsaved edits included); `undefined` while their row can't be edited. */
  mine: { sub: string; free: ReadonlySet<number>; lastSaved: string | null } | undefined;
  /** The group heatmap and Best times are only built when the group view is showing. */
  wantGroup: boolean;
  minSlots: number;
  /** The horizon days and zone: suggested windows stay inside the practice hours the grid shows. */
  days: LocalDay[];
  timeZone: string;
}

export interface AvailabilityModel {
  resolution: AvailabilityResolution;
  /** `null` outside the group view. */
  overlap: Overlap | null;
  windows: BestWindows | null;
}

/**
 * Everyone's times, from the loaded rows to the best windows: parse once per fetch, then apply
 * "now" and the caller's edits, then (group view only) the overlap and the suggested windows.
 */
export function useAvailabilityModel({ data, nowMs, mine, wantGroup, minSlots, days, timeZone }: ModelOptions): AvailabilityModel {
  const { reads, participants, view } = data;
  const group = useMemo(() => parseGroup(reads, participants, view.band), [reads, participants, view.band]);
  // Everyone else's marks are filtered once per fetch/clock tick; each painted cell only rebuilds the caller's entry.
  const others = useMemo(() => resolveAt(group, nowMs), [group, nowMs]);
  const resolution = useMemo(() => (mine ? overlayMine(others, group, nowMs, mine) : others), [others, group, nowMs, mine]);
  const overlap = useMemo(() => (wantGroup ? buildOverlap(resolution) : null), [wantGroup, resolution]);
  // Marks outside the practice hours (left by an older version) still count as saved, but are never suggested.
  const allowed = useMemo(
    () => (wantGroup ? new Set(days.flatMap((day) => practiceSlots(day, timeZone))) : undefined),
    [wantGroup, days, timeZone],
  );
  const windows = useMemo(() => (overlap ? findBestWindows(overlap, { minSlots, allowed }) : null), [overlap, minSlots, allowed]);
  return { resolution, overlap, windows };
}

