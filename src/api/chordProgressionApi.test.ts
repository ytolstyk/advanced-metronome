import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChordProgressionPersistedState } from './chordProgressionApi';

// vi.hoisted() runs before vi.mock() hoisting, so these refs are available
// in the mock factory.
const { mockChordProgressionModel } = vi.hoisted(() => {
  const mockChordProgressionModel = {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  };
  return { mockChordProgressionModel };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: { UserChordProgressionPrefs: mockChordProgressionModel },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

import { loadChordProgression, saveChordProgression, CHORD_PROGRESSION_LS_KEY } from './chordProgressionApi';
import { isAuthenticated } from './authUtils';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ChordProgressionPersistedState> = {}): ChordProgressionPersistedState {
  return {
    slots: [],
    bpm: 120,
    instrument: 'guitar',
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
  mockChordProgressionModel.list.mockResolvedValue({ data: [] });
  mockChordProgressionModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
  mockChordProgressionModel.update.mockResolvedValue({});
});

// ── Unauthenticated: loadChordProgression ─────────────────────────────────

describe('loadChordProgression (unauthenticated)', () => {
  it('returns null when localStorage is empty', async () => {
    const result = await loadChordProgression();
    expect(result).toBeNull();
  });

  it('returns parsed value from localStorage', async () => {
    const state = makeState({ bpm: 90, instrument: 'piano' });
    localStorageMock.store[CHORD_PROGRESSION_LS_KEY] = JSON.stringify(state);

    const result = await loadChordProgression();
    expect(result).toEqual(state);
  });

  it('returns null when localStorage value is corrupt JSON', async () => {
    localStorageMock.store[CHORD_PROGRESSION_LS_KEY] = 'bad-json{{{';
    const result = await loadChordProgression();
    expect(result).toBeNull();
  });
});

// ── Unauthenticated: saveChordProgression ────────────────────────────────

describe('saveChordProgression (unauthenticated)', () => {
  it('writes serialized state to localStorage', async () => {
    const state = makeState();
    await saveChordProgression(state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      CHORD_PROGRESSION_LS_KEY,
      JSON.stringify(state),
    );
  });

  it('does not call cloud when unauthenticated', async () => {
    await saveChordProgression(makeState());
    expect(mockChordProgressionModel.create).not.toHaveBeenCalled();
    expect(mockChordProgressionModel.update).not.toHaveBeenCalled();
  });
});

// ── Authenticated: loadChordProgression ──────────────────────────────────

describe('loadChordProgression (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
  });

  it('returns null when no cloud records exist and no localStorage fallback', async () => {
    const result = await loadChordProgression();
    expect(result).toBeNull();
  });

  it('migrates from localStorage when no cloud records exist but localStorage has data', async () => {
    const state = makeState({ bpm: 80 });
    localStorageMock.store[CHORD_PROGRESSION_LS_KEY] = JSON.stringify(state);

    const result = await loadChordProgression();
    expect(result).toEqual(state);
  });

  it('returns parsed value from cloud records', async () => {
    const state = makeState({ bpm: 100 });
    mockChordProgressionModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-load', stateJson: JSON.stringify(state) }],
    });

    const result = await loadChordProgression();
    expect(result).toEqual(state);
  });

  it('returns null when cloud call throws', async () => {
    mockChordProgressionModel.list.mockRejectedValue(new Error('network'));

    const result = await loadChordProgression();
    expect(result).toBeNull();
  });
});

// ── Authenticated: saveChordProgression — create path ────────────────────
//
// cachedId is module-level state. Tests needing cachedId=null use
// vi.resetModules() + vi.doMock() + dynamic import to get a fresh module.

describe('saveChordProgression (authenticated, create path)', () => {
  it('calls create when cachedId is null (cold start)', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'fresh-id' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserChordProgressionPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveChordProgression: freshSave } = await import('./chordProgressionApi');
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
      generateClient: vi.fn(() => ({ models: { UserChordProgressionPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveChordProgression: freshSave, CHORD_PROGRESSION_LS_KEY: LS_KEY } = await import('./chordProgressionApi');
    const state = makeState({ bpm: 140 });
    await freshSave(state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(state));
  });
});

// ── Authenticated: saveChordProgression — update path ────────────────────

describe('saveChordProgression (authenticated, update path)', () => {
  it('calls update after cachedId is set by a prior load', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-1', stateJson: JSON.stringify(makeState()) }],
    });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserChordProgressionPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { loadChordProgression: freshLoad, saveChordProgression: freshSave } = await import('./chordProgressionApi');
    await freshLoad(); // populates cachedId

    const updated = makeState({ bpm: 160 });
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
      generateClient: vi.fn(() => ({ models: { UserChordProgressionPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { loadChordProgression: freshLoad, saveChordProgression: freshSave, CHORD_PROGRESSION_LS_KEY: LS_KEY } = await import('./chordProgressionApi');
    await freshLoad();

    const updated = makeState({ instrument: 'pad' });
    await freshSave(updated);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(updated));
  });
});

// ── Authenticated: saveChordProgression — cloud error fallback ───────────

describe('saveChordProgression (authenticated, cloud error fallback)', () => {
  it('falls back to localStorage when cloud create throws', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockRejectedValue(new Error('network error'));
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserChordProgressionPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveChordProgression: freshSave, CHORD_PROGRESSION_LS_KEY: LS_KEY } = await import('./chordProgressionApi');
    const state = makeState({ bpm: 200 });
    await freshSave(state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(state));
  });
});
