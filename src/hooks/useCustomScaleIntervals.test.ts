import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCustomScaleIntervals } from './useCustomScaleIntervals';
import { CUSTOM_INTERVALS_KEY } from '../utils/customScale';

describe('useCustomScaleIntervals', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to root only', () => {
    const { result } = renderHook(() => useCustomScaleIntervals());
    expect(result.current.intervals).toEqual([0]);
  });

  it('sanitizes corrupt stored data', () => {
    localStorage.setItem(CUSTOM_INTERVALS_KEY, '{not json');
    expect(renderHook(() => useCustomScaleIntervals()).result.current.intervals).toEqual([0]);
    localStorage.setItem(CUSTOM_INTERVALS_KEY, '[9,2,2,40]');
    expect(renderHook(() => useCustomScaleIntervals()).result.current.intervals).toEqual([0, 2, 9]);
  });

  it('persists toggles to localStorage and restores them', () => {
    const { result, unmount } = renderHook(() => useCustomScaleIntervals());
    act(() => result.current.toggle(4));
    act(() => result.current.toggle(7));
    expect(JSON.parse(localStorage.getItem(CUSTOM_INTERVALS_KEY)!)).toEqual([0, 4, 7]);
    unmount();
    expect(renderHook(() => useCustomScaleIntervals()).result.current.intervals).toEqual([0, 4, 7]);
  });
});
