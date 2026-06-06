import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MetronomePersistedState } from './metronomeApi';

// vi.hoisted() runs before vi.mock() hoisting, so these refs are available
// in the mock factory.
const { mockMetronomeModel } = vi.hoisted(() => {
  const mockMetronomeModel = {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  };
  return { mockMetronomeModel };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: { UserMetronomePrefs: mockMetronomeModel },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

import { loadMetronomePrefs, saveMetronomePrefs } from './metronomeApi';
import { isAuthenticated } from './authUtils';

// ── Helpers ────────────────────────────────────────────────────────────────

const LS_KEY = 'metronome-prefs-v1';

function makeState(overrides: Partial<MetronomePersistedState> = {}): MetronomePersistedState {
  return {
    mode: 'simple',
    bpm: 120,
    numerator: 4,
    denominator: 4,
    subdivision: 'quarter',
    measures: [],
    ...overrides,
  };
}

// ── localStorage mock ──────────────────────────────────────────────────────

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => { delete store[k]; }); }),
    store,
  };
}

let localStorageMock: ReturnType<typeof makeLocalStorageMock>;

beforeEach(() => {
  localStorageMock = makeLocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  vi.clearAllMocks();
  // Restore default implementations so tests start from a known state
  vi.mocked(isAuthenticated).mockResolvedValue(false);
  mockMetronomeModel.list.mockResolvedValue({ data: [] });
  mockMetronomeModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
  mockMetronomeModel.update.mockResolvedValue({});
});

// ── Unauthenticated: loadMetronomePrefs ───────────────────────────────────

describe('loadMetronomePrefs (unauthenticated)', () => {
  it('returns null when localStorage is empty', async () => {
    const result = await loadMetronomePrefs();
    expect(result).toBeNull();
  });

  it('returns parsed value from localStorage', async () => {
    const state = makeState({ bpm: 90, numerator: 3 });
    localStorageMock.store[LS_KEY] = JSON.stringify(state);

    const result = await loadMetronomePrefs();
    expect(result).toEqual(state);
  });

  it('returns null when localStorage value is corrupt JSON', async () => {
    localStorageMock.store[LS_KEY] = 'bad-json{{{';
    const result = await loadMetronomePrefs();
    expect(result).toBeNull();
  });
});

// ── Unauthenticated: saveMetronomePrefs ───────────────────────────────────

describe('saveMetronomePrefs (unauthenticated)', () => {
  it('writes serialized state to localStorage', async () => {
    const state = makeState();
    await saveMetronomePrefs(state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(state));
  });

  it('does not call cloud when unauthenticated', async () => {
    await saveMetronomePrefs(makeState());
    expect(mockMetronomeModel.create).not.toHaveBeenCalled();
    expect(mockMetronomeModel.update).not.toHaveBeenCalled();
  });
});

// ── Authenticated: loadMetronomePrefs ─────────────────────────────────────

describe('loadMetronomePrefs (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
  });

  it('returns null when no cloud records exist', async () => {
    const result = await loadMetronomePrefs();
    expect(result).toBeNull();
  });

  it('returns parsed value from cloud records', async () => {
    const state = makeState({ bpm: 200, mode: 'complex', denominator: 8 });
    mockMetronomeModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-load', stateJson: JSON.stringify(state) }],
    });

    const result = await loadMetronomePrefs();
    expect(result).toEqual(state);
  });

  it('returns null when cloud call throws', async () => {
    mockMetronomeModel.list.mockRejectedValue(new Error('network'));

    const result = await loadMetronomePrefs();
    expect(result).toBeNull();
  });
});

// ── Authenticated: saveMetronomePrefs — create path ───────────────────────
//
// cachedId is module-level state. Tests needing cachedId=null use
// vi.resetModules() + vi.doMock() + dynamic import to get a fresh module.

describe('saveMetronomePrefs (authenticated, create path)', () => {
  it('calls create when cachedId is null (cold start)', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'fresh-id' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserMetronomePrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveMetronomePrefs: freshSave } = await import('./metronomeApi');
    await freshSave(makeState());

    expect(freshModel.create).toHaveBeenCalledOnce();
    expect(freshModel.update).not.toHaveBeenCalled();
  });

  it('mirrors to localStorage after successful create', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'fresh-id' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserMetronomePrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveMetronomePrefs: freshSave } = await import('./metronomeApi');
    const state = makeState({ bpm: 180, subdivision: 'eighth' });
    await freshSave(state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(state));
  });
});

// ── Authenticated: saveMetronomePrefs — update path ───────────────────────

describe('saveMetronomePrefs (authenticated, update path)', () => {
  it('calls update after cachedId is set by a prior load', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-1', stateJson: JSON.stringify(makeState()) }],
    });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserMetronomePrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { loadMetronomePrefs: freshLoad, saveMetronomePrefs: freshSave } = await import('./metronomeApi');
    await freshLoad(); // populates cachedId

    const updated = makeState({ bpm: 240, numerator: 6 });
    await freshSave(updated);

    expect(freshModel.update).toHaveBeenCalledWith({
      id: 'cloud-id-1',
      stateJson: JSON.stringify(updated),
    });
    expect(freshModel.create).not.toHaveBeenCalled();
  });

  it('mirrors to localStorage after successful update', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-1', stateJson: JSON.stringify(makeState()) }],
    });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserMetronomePrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { loadMetronomePrefs: freshLoad, saveMetronomePrefs: freshSave } = await import('./metronomeApi');
    await freshLoad();

    const updated = makeState({ mode: 'polyrhythm' });
    await freshSave(updated);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(updated));
  });
});

// ── Authenticated: saveMetronomePrefs — cloud error fallback ──────────────

describe('saveMetronomePrefs (authenticated, cloud error fallback)', () => {
  it('falls back to localStorage when cloud create throws', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockRejectedValue(new Error('network error'));
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserMetronomePrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveMetronomePrefs: freshSave } = await import('./metronomeApi');
    const state = makeState({ bpm: 60 });
    await freshSave(state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(state));
  });
});
