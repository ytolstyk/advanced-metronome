import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AvailabilityPageResult } from '../api/availabilityApi';
import { buildCalendarDays, buildHorizonDays, localDateKey } from '../availabilityCalendar';
import { ME, NOW, OWNER, BOB, band, everyone, ok, row, at } from '../availabilityTestHelpers';
import { useAvailabilityModel, useWeekFocus, useHorizonDays } from './useAvailabilityView';

type OkResult = Extract<AvailabilityPageResult, { status: 'ok' }>;
const evening = [at(19), at(19, 30), at(20), at(20, 30)];

function data(): OkResult {
  return {
    status: 'ok',
    view: { band: band(), sub: ME } as OkResult['view'],
    participants: everyone(OWNER, ME, BOB),
    reads: new Map([
      [OWNER, ok(row(OWNER, evening))],
      [ME, ok(null)],
      [BOB, ok(row(BOB, evening))],
    ]),
    fetchedAt: NOW,
  };
}

describe('useHorizonDays', () => {
  // The hook builds from the real clock (it is keyed on the date, not on `nowMs`), so pin it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('builds the days once and keeps them while the date is unchanged', () => {
    const { result, rerender } = renderHook(({ now }) => useHorizonDays(now, 'UTC'), { initialProps: { now: NOW } });
    const first = result.current;
    expect(first).toHaveLength(62); // 60 days from Tuesday, plus Sunday and Monday before it
    expect(first[0].key).toBe('2026-11-01');
    expect(first[2].key).toBe(localDateKey(NOW, 'UTC'));
    rerender({ now: NOW + 5 * 60_000 }); // a few minutes later, same day
    expect(result.current).toBe(first);
  });

  it('rebuilds when the local date changes', () => {
    const { result, rerender } = renderHook(({ now }) => useHorizonDays(now, 'UTC'), { initialProps: { now: NOW } });
    const first = result.current;
    rerender({ now: NOW + 24 * 60 * 60_000 });
    expect(result.current).not.toBe(first);
  });
});

describe('useWeekFocus: todayIndex', () => {
  const days = buildCalendarDays(NOW, 'UTC'); // Tuesday: today is index 2, the Sunday is index 0
  const todayIndex = 2;

  it('opens a full week on the Sunday-to-Saturday page holding today', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, todayIndex));
    expect(result.current.firstStart).toBe(0);
    expect(result.current.start).toBe(0);
    expect(result.current.visibleDays).toHaveLength(7);
    expect(result.current.visibleDays[todayIndex].key).toBe(localDateKey(NOW, 'UTC'));
    expect(result.current.selectedSlot).toBeNull();
  });

  it('keeps full-week pages aligned to the Sunday, so Earlier stops at it', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, todayIndex));
    act(() => result.current.shiftPage(1));
    expect(result.current.start).toBe(7);
    act(() => result.current.shiftPage(-1));
    expect(result.current.start).toBe(0);
    act(() => result.current.shiftPage(-1));
    expect(result.current.start).toBe(0);
  });

  it('opens on a phone (3 per page) at today, not on the dead days before it', () => {
    const { result } = renderHook(() => useWeekFocus(days, 3, todayIndex));
    expect(result.current.firstStart).toBe(todayIndex);
    expect(result.current.start).toBe(todayIndex);
    expect(result.current.visibleDays.map((d) => d.key)).toEqual(days.slice(2, 5).map((d) => d.key));
  });

  it('pages a phone from today and never earlier than it', () => {
    const { result } = renderHook(() => useWeekFocus(days, 3, todayIndex));
    act(() => result.current.shiftPage(1));
    expect(result.current.start).toBe(5);
    act(() => result.current.shiftPage(-1));
    expect(result.current.start).toBe(2);
    act(() => result.current.shiftPage(-1));
    expect(result.current.start).toBe(2);
    act(() => result.current.goToDay(0));
    expect(result.current.start).toBe(2);
    act(() => result.current.goToDay(8));
    expect(result.current.start).toBe(8);
  });

  it('puts today on the first phone page for every weekday', () => {
    for (let d = 0; d < 7; d++) {
      const list = buildCalendarDays(Date.UTC(2026, 10, 1 + d, 12), 'UTC');
      const { result } = renderHook(() => useWeekFocus(list, 3, d));
      expect(result.current.visibleDays[0].key).toBe(list[d].key);
    }
  });

  it('with a phone and a Sunday today there is no offset', () => {
    const list = buildCalendarDays(Date.UTC(2026, 10, 1, 12), 'UTC');
    const { result } = renderHook(() => useWeekFocus(list, 3, 0));
    expect(result.current.start).toBe(0);
    expect(result.current.firstStart).toBe(0);
  });

  it('opens on the page holding today when today is on a later page', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 9));
    expect(result.current.start).toBe(7);
  });

  it('clamps a today index beyond the end to the last page', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 9999));
    expect(result.current.start).toBe(Math.floor((days.length - 1) / 7) * 7);
  });

  it('showSlot on a past day of this week lands on the first page, not before it', () => {
    const { result } = renderHook(() => useWeekFocus(days, 3, todayIndex));
    act(() => result.current.showSlot(days[0].slots[20]));
    expect(result.current.start).toBe(2);
  });
});

describe('useWeekFocus', () => {
  const days = buildHorizonDays(NOW, 'UTC');

  it('starts on the first page, from today, with no slot', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    expect(result.current.start).toBe(0);
    expect(result.current.visibleDays.map((d) => d.key)).toEqual(days.slice(0, 7).map((d) => d.key));
    expect(result.current.selectedSlot).toBeNull();
  });

  it('shows fewer days per page when asked to', () => {
    const { result } = renderHook(() => useWeekFocus(days, 3, 0));
    expect(result.current.visibleDays).toHaveLength(3);
    act(() => result.current.shiftPage(1));
    expect(result.current.start).toBe(3);
  });

  it('moves a page at a time and stops at both ends', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.shiftPage(-1));
    expect(result.current.start).toBe(0);
    act(() => result.current.shiftPage(1));
    expect(result.current.start).toBe(7);
    for (let i = 0; i < 20; i++) act(() => result.current.shiftPage(1));
    expect(result.current.start).toBe(Math.floor((days.length - 1) / 7) * 7);
    expect(result.current.visibleDays.length).toBeGreaterThan(0);
  });

  it('goes to the page holding a day', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.goToDay(10));
    expect(result.current.start).toBe(7);
    act(() => result.current.goToDay(-5));
    expect(result.current.start).toBe(0);
    act(() => result.current.goToDay(9999));
    expect(result.current.start).toBe(Math.floor((days.length - 1) / 7) * 7);
  });

  it('clears the slot whenever the page changes', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.selectSlot(at(19)));
    expect(result.current.selectedSlot).toBe(at(19));
    act(() => result.current.shiftPage(1));
    expect(result.current.selectedSlot).toBeNull();
  });

  it('hides a selected slot that is not on the page shown', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.selectSlot(days[10].slots[20]));
    expect(result.current.selectedSlot).toBeNull();
  });

  it('jumps to the page and slot of any upcoming time', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.showSlot(days[9].slots[24]));
    expect(result.current.start).toBe(7);
    expect(result.current.selectedSlot).toBe(days[9].slots[24]);
  });

  it('ignores a slot outside the horizon', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.showSlot(1));
    expect(result.current.start).toBe(0);
    expect(result.current.selectedSlot).toBeNull();
  });

  it('falls back to the last page when the list shrinks under it', () => {
    const { result, rerender } = renderHook(({ list }) => useWeekFocus(list, 7, 0), { initialProps: { list: days } });
    act(() => result.current.goToDay(30));
    expect(result.current.start).toBe(28);
    rerender({ list: days.slice(0, 10) });
    expect(result.current.start).toBe(7);
    expect(result.current.visibleDays).toHaveLength(3);
  });
});

describe('useWeekFocus: gaps', () => {
  const days = buildHorizonDays(NOW, 'UTC');

  it('realigns to the page holding the same days when the page size changes', () => {
    const { result, rerender } = renderHook(({ perPage }) => useWeekFocus(days, perPage, 0), { initialProps: { perPage: 7 } });
    act(() => result.current.shiftPage(1));
    expect(result.current.start).toBe(7);
    rerender({ perPage: 3 }); // a phone-width window: pages start at multiples of 3
    expect(result.current.start).toBe(6);
    expect(result.current.visibleDays.map((d) => d.key)).toEqual(days.slice(6, 9).map((d) => d.key));
    rerender({ perPage: 7 }); // back to the original size: the remembered start is still 7
    expect(result.current.start).toBe(7);
  });

  it('keeps a picked slot when the page size changes and its day is still shown', () => {
    const { result, rerender } = renderHook(({ perPage }) => useWeekFocus(days, perPage, 0), { initialProps: { perPage: 7 } });
    const slot = days[1].slots[20];
    act(() => result.current.selectSlot(slot));
    rerender({ perPage: 3 });
    expect(result.current.selectedSlot).toBe(slot);
    rerender({ perPage: 1 });
    expect(result.current.selectedSlot).toBeNull(); // day 0 only is shown
  });

  it('pages by the page size on a phone, and aligns day jumps to it', () => {
    const { result } = renderHook(() => useWeekFocus(days, 3, 0));
    act(() => result.current.goToDay(10));
    expect(result.current.start).toBe(9);
    act(() => result.current.shiftPage(-1));
    expect(result.current.start).toBe(6);
    expect(result.current.visibleDays).toHaveLength(3);
  });

  it('ends on a short final page of the right length', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.goToDay(days.length - 1));
    expect(result.current.start).toBe(56);
    expect(result.current.visibleDays).toHaveLength(days.length - 56);
  });

  it('unpicks a slot with selectSlot(null) without changing the page', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.showSlot(days[9].slots[24]));
    act(() => result.current.selectSlot(null));
    expect(result.current.selectedSlot).toBeNull();
    expect(result.current.start).toBe(7);
  });

  it('keeps the page and picks the slot when showing a time on the page already open', () => {
    const { result } = renderHook(() => useWeekFocus(days, 7, 0));
    act(() => result.current.showSlot(days[2].slots[30]));
    expect(result.current.start).toBe(0);
    expect(result.current.selectedSlot).toBe(days[2].slots[30]);
  });

  it('drops a picked slot when the days are rebuilt without it', () => {
    const { result, rerender } = renderHook(({ list }) => useWeekFocus(list, 7, 0), { initialProps: { list: days } });
    const slot = days[0].slots[30];
    act(() => result.current.selectSlot(slot));
    expect(result.current.selectedSlot).toBe(slot);
    rerender({ list: days.slice(1) }); // midnight rolled over: yesterday's column is gone
    expect(result.current.selectedSlot).toBeNull();
  });
});

describe('useAvailabilityModel', () => {
  const mineFree = new Set(evening);
  const options = {
    data: data(),
    nowMs: NOW,
    mine: { sub: ME, free: mineFree, lastSaved: '2026-11-03T00:00:00Z' },
    minSlots: 4,
    days: buildHorizonDays(NOW, 'UTC'),
    timeZone: 'UTC',
  };

  it('builds no overlap or windows outside the group view', () => {
    const { result } = renderHook(() => useAvailabilityModel({ ...options, wantGroup: false }));
    expect(result.current.overlap).toBeNull();
    expect(result.current.windows).toBeNull();
    expect(result.current.resolution.statuses.get(ME)?.kind).toBe('available');
  });

  it('builds the overlap and the best windows for the group view, including the caller’s own marks', () => {
    const { result } = renderHook(() => useAvailabilityModel({ ...options, wantGroup: true }));
    expect(result.current.overlap?.countAt(at(19))).toBe(3);
    expect(result.current.windows?.best[0]).toMatchObject({ startSlot: at(19), endSlot: at(21), subs: [OWNER, ME, BOB] });
  });

  it('shows the caller’s own last-saved time, not the stale loaded row’s', () => {
    const { result } = renderHook(() => useAvailabilityModel({ ...options, wantGroup: true }));
    const status = result.current.resolution.statuses.get(ME);
    expect(status).toMatchObject({ kind: 'available', lastSaved: '2026-11-03T00:00:00Z' });
  });

  it('treats the caller as not responded while their row cannot be edited (no marks passed in)', () => {
    const { result } = renderHook(() => useAvailabilityModel({ ...options, mine: undefined, wantGroup: true }));
    expect(result.current.resolution.statuses.get(ME)?.kind).toBe('not-responded');
  });

  it('keeps the same resolution between renders with the same inputs', () => {
    const { result, rerender } = renderHook(() => useAvailabilityModel({ ...options, wantGroup: true }));
    const first = result.current.resolution;
    rerender();
    expect(result.current.resolution).toBe(first);
  });

  it('recomputes only the suggested windows when just the shortest length changes', () => {
    const { result, rerender } = renderHook(({ minSlots }) => useAvailabilityModel({ ...options, minSlots, wantGroup: true }), {
      initialProps: { minSlots: 4 },
    });
    const { resolution, overlap, windows } = result.current;
    rerender({ minSlots: 6 });
    expect(result.current.resolution).toBe(resolution);
    expect(result.current.overlap).toBe(overlap);
    expect(result.current.windows).not.toBe(windows);
    expect(result.current.windows?.best).toEqual([]); // the shared stretch is only 2 hours
  });
});

describe('useAvailabilityModel: practice hours', () => {
  const stretch = (from: number) => Array.from({ length: 4 }, (_, i) => from + i); // two hours of half-hour slots
  const dataFor = (free: number[]): OkResult => ({
    ...data(),
    participants: everyone(OWNER, BOB),
    reads: new Map([
      [OWNER, ok(row(OWNER, free))],
      [BOB, ok(row(BOB, free))],
    ]),
  });
  const model = (free: number[], timeZone: string) =>
    renderHook(() =>
      useAvailabilityModel({
        data: dataFor(free),
        nowMs: NOW,
        mine: undefined,
        wantGroup: true,
        minSlots: 4,
        days: buildHorizonDays(NOW, timeZone),
        timeZone,
      }),
    ).result.current;

  it('counts marks outside 8 AM to 10 PM in the heatmap but never suggests them', () => {
    const lateNight = stretch(at(23)); // 11 PM to 1 AM UTC
    const { overlap, windows } = model(lateNight, 'UTC');
    expect(overlap?.countAt(at(23))).toBe(2);
    expect(windows?.best).toEqual([]);
    expect(windows?.alsoClose).toEqual([]);
  });

  it('suggests marks inside the practice hours', () => {
    const { windows } = model(stretch(at(9)), 'UTC');
    expect(windows?.best[0]).toMatchObject({ startSlot: at(9), endSlot: at(11), subs: [OWNER, BOB] });
  });

  it('judges practice hours in the viewer’s zone, not UTC', () => {
    const evening = stretch(at(19)); // 7 PM UTC is half past midnight in Kolkata
    expect(model(evening, 'UTC').windows?.best).toHaveLength(1);
    expect(model(evening, 'Asia/Kolkata').windows?.best).toEqual([]);
    const morningUtc = stretch(at(6)); // 6 AM UTC is 11:30 AM in Kolkata
    expect(model(morningUtc, 'Asia/Kolkata').windows?.best).toHaveLength(1);
  });

  it('cuts a stretch that runs past 10 PM at the end of the practice hours', () => {
    const { windows } = model(stretch(at(20, 30)), 'UTC'); // 8:30 PM to 10:30 PM
    expect(windows?.best).toEqual([]); // only 1.5 hours remain inside practice hours, under the 2 hour minimum
  });
});
