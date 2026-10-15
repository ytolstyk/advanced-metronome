import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../api/authUtils', () => ({ getDefaultDisplayName: vi.fn() }));

import { getDefaultDisplayName } from '../api/authUtils';
import { useDefaultDisplayName } from './useDefaultDisplayName';

beforeEach(() => vi.clearAllMocks());

describe('useDefaultDisplayName', () => {
  it('is null while loading, then the suggested name', async () => {
    vi.mocked(getDefaultDisplayName).mockResolvedValue('Alice');
    const { result } = renderHook(() => useDefaultDisplayName());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('Alice'));
  });

  it('is an empty string (not null) when the provider has no name', async () => {
    vi.mocked(getDefaultDisplayName).mockResolvedValue('');
    const { result } = renderHook(() => useDefaultDisplayName());
    await waitFor(() => expect(result.current).toBe(''));
  });

  it('ignores a result that arrives after unmount', async () => {
    let resolve!: (v: string) => void;
    vi.mocked(getDefaultDisplayName).mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useDefaultDisplayName());
    unmount();
    resolve('late');
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});
