import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistedState } from './usePersistedState';

const parse = (stored: unknown): number => (typeof stored === 'number' ? stored : 0);

beforeEach(() => localStorage.clear());

describe('usePersistedState', () => {
  it('starts from whatever is stored, run through the parser', () => {
    localStorage.setItem('k', '7');
    expect(renderHook(() => usePersistedState('k', parse)).result.current[0]).toBe(7);
  });

  it('falls back through the parser for nothing, garbage or null', () => {
    expect(renderHook(() => usePersistedState('missing', parse)).result.current[0]).toBe(0);
    localStorage.setItem('bad', '{not json');
    expect(renderHook(() => usePersistedState('bad', parse)).result.current[0]).toBe(0);
    localStorage.setItem('null', 'null');
    expect(renderHook(() => usePersistedState('null', parse)).result.current[0]).toBe(0);
  });

  it('updates the value and writes it to storage', () => {
    const { result } = renderHook(() => usePersistedState('k', parse));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(localStorage.getItem('k')).toBe('5');
  });

  it('keeps working for this visit when storage refuses the write', () => {
    const { result } = renderHook(() => usePersistedState('k', parse));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    act(() => result.current[1](9));
    expect(result.current[0]).toBe(9);
    vi.restoreAllMocks();
  });
});
