import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AVAILABILITY_LIMITS } from '../bandTypes';
import { MIN_LENGTH_CHOICES } from '../availabilityWindows';
import { parsePrefs, useAvailabilityPrefs, useDisclosureNotice } from './useAvailabilityPrefs';

beforeEach(() => localStorage.clear());

describe('parsePrefs', () => {
  const DEFAULTS = { minSlots: AVAILABILITY_LIMITS.defaultMinSlots };

  it('uses the defaults for nothing, null or a non-object', () => {
    for (const stored of [undefined, null, 'x', 4, true]) expect(parsePrefs(stored)).toEqual(DEFAULTS);
  });

  it('keeps valid values', () => {
    expect(parsePrefs({ minSlots: 6 })).toEqual({ minSlots: 6 });
  });

  it('repairs each field on its own', () => {
    expect(parsePrefs({ minSlots: 99 })).toEqual(DEFAULTS);
    expect(parsePrefs({ minSlots: 3 })).toEqual(DEFAULTS);
  });

  it('ignores a leftover "show all hours" flag from an older version', () => {
    expect(parsePrefs({ showAllHours: true, minSlots: 6 })).toEqual({ minSlots: 6 });
  });

  it('the default shortest window is one of the offered lengths', () => {
    expect(MIN_LENGTH_CHOICES.map((c) => c.slots)).toContain(AVAILABILITY_LIMITS.defaultMinSlots);
  });
});

describe('useAvailabilityPrefs', () => {
  it('saves a change and restores it next time', () => {
    const first = renderHook(() => useAvailabilityPrefs());
    act(() => first.result.current[1]({ minSlots: 2 }));
    expect(JSON.parse(localStorage.getItem('availability-prefs')!)).toEqual({ minSlots: 2 });
    expect(renderHook(() => useAvailabilityPrefs()).result.current[0]).toEqual({ minSlots: 2 });
  });

  it('survives a stored null', () => {
    localStorage.setItem('availability-prefs', 'null');
    expect(renderHook(() => useAvailabilityPrefs()).result.current[0].minSlots).toBe(AVAILABILITY_LIMITS.defaultMinSlots);
  });
});

describe('useDisclosureNotice', () => {
  it('starts unaccepted and remembers acceptance for this band and person only', () => {
    const first = renderHook(() => useDisclosureNotice('band-1', 'sub-me'));
    expect(first.result.current.accepted).toBe(false);
    act(() => first.result.current.accept());
    expect(first.result.current.accepted).toBe(true);
    expect(renderHook(() => useDisclosureNotice('band-1', 'sub-me')).result.current.accepted).toBe(true);
    expect(renderHook(() => useDisclosureNotice('band-2', 'sub-me')).result.current.accepted).toBe(false);
    expect(renderHook(() => useDisclosureNotice('band-1', 'sub-bob')).result.current.accepted).toBe(false);
  });
});
