import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MetronomePreset } from './metronomePresetsApi';
import type { MetronomePersistedState } from './metronomeApi';

// ── Hoist stable mock references ───────────────────────────────────────────
const { mockPresetModel } = vi.hoisted(() => {
  const mockPresetModel = {
    create: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
  return { mockPresetModel };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: { MetronomePreset: mockPresetModel },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

import { loadMetronomePresets, saveMetronomePreset, deleteMetronomePreset } from './metronomePresetsApi';
import { isAuthenticated } from './authUtils';

// ── localStorage mock ──────────────────────────────────────────────────────

const LS_KEY = 'metronome-presets-v1';

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
  vi.mocked(isAuthenticated).mockResolvedValue(false);
  mockPresetModel.list.mockResolvedValue({ data: [] });
  mockPresetModel.create.mockResolvedValue({ data: null });
  mockPresetModel.delete.mockResolvedValue({});
});

// ── Helpers ────────────────────────────────────────────────────────────────

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

function storePresets(presets: MetronomePreset[]): void {
  localStorageMock.store[LS_KEY] = JSON.stringify(presets);
}

// ── loadMetronomePresets (unauthenticated) ─────────────────────────────────

describe('loadMetronomePresets (unauthenticated)', () => {
  it('returns empty array when localStorage is empty', async () => {
    const result = await loadMetronomePresets();
    expect(result).toEqual([]);
  });

  it('returns saved presets from localStorage', async () => {
    const preset: MetronomePreset = {
      id: 'local-id-1',
      name: 'My Preset',
      savedAt: 1000,
      state: makeState({ bpm: 90 }),
    };
    storePresets([preset]);

    const result = await loadMetronomePresets();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(preset);
  });

  it('returns multiple presets from localStorage', async () => {
    const presets: MetronomePreset[] = [
      { id: 'a', name: 'A', savedAt: 2000, state: makeState({ bpm: 80 }) },
      { id: 'b', name: 'B', savedAt: 1000, state: makeState({ bpm: 100 }) },
    ];
    storePresets(presets);

    const result = await loadMetronomePresets();
    expect(result).toHaveLength(2);
  });

  it('returns empty array when localStorage value is corrupt JSON', async () => {
    localStorageMock.store[LS_KEY] = '{{corrupt{{';
    const result = await loadMetronomePresets();
    expect(result).toEqual([]);
  });

  it('does not call cloud API when unauthenticated', async () => {
    await loadMetronomePresets();
    expect(mockPresetModel.list).not.toHaveBeenCalled();
  });
});

// ── saveMetronomePreset (unauthenticated) ──────────────────────────────────

describe('saveMetronomePreset (unauthenticated)', () => {
  it('returns a preset with an id', async () => {
    const state = makeState();
    const result = await saveMetronomePreset('Rock Beat', state);
    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
  });

  it('returns the preset with the correct name and state', async () => {
    const state = makeState({ bpm: 140, numerator: 3 });
    const result = await saveMetronomePreset('Waltz', state);
    expect(result!.name).toBe('Waltz');
    expect(result!.state).toEqual(state);
  });

  it('persists the preset to localStorage', async () => {
    const state = makeState({ bpm: 160 });
    await saveMetronomePreset('Fast', state);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      LS_KEY,
      expect.any(String),
    );

    const stored = JSON.parse(localStorageMock.store[LS_KEY] ?? '[]') as MetronomePreset[];
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Fast');
    expect(stored[0].state.bpm).toBe(160);
  });

  it('prepends new preset to existing presets (newest first)', async () => {
    const existing: MetronomePreset = { id: 'old-id', name: 'Old', savedAt: 500, state: makeState() };
    storePresets([existing]);

    await saveMetronomePreset('New', makeState({ bpm: 200 }));

    const stored = JSON.parse(localStorageMock.store[LS_KEY] ?? '[]') as MetronomePreset[];
    expect(stored).toHaveLength(2);
    expect(stored[0].name).toBe('New'); // newest first
    expect(stored[1].name).toBe('Old');
  });

  it('savedAt is a recent timestamp', async () => {
    const before = Date.now();
    const result = await saveMetronomePreset('Test', makeState());
    const after = Date.now();
    expect(result!.savedAt).toBeGreaterThanOrEqual(before);
    expect(result!.savedAt).toBeLessThanOrEqual(after);
  });

  it('does not call cloud API when unauthenticated', async () => {
    await saveMetronomePreset('Local Only', makeState());
    expect(mockPresetModel.create).not.toHaveBeenCalled();
  });

  it('each saved preset gets a unique id', async () => {
    const r1 = await saveMetronomePreset('P1', makeState());
    const r2 = await saveMetronomePreset('P2', makeState());
    expect(r1!.id).not.toBe(r2!.id);
  });
});

// ── deleteMetronomePreset (unauthenticated) ────────────────────────────────

describe('deleteMetronomePreset (unauthenticated)', () => {
  it('removes the preset from localStorage by id', async () => {
    const presets: MetronomePreset[] = [
      { id: 'keep-me', name: 'Keep', savedAt: 1000, state: makeState() },
      { id: 'delete-me', name: 'Delete', savedAt: 2000, state: makeState({ bpm: 60 }) },
    ];
    storePresets(presets);

    await deleteMetronomePreset('delete-me');

    const stored = JSON.parse(localStorageMock.store[LS_KEY] ?? '[]') as MetronomePreset[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('keep-me');
  });

  it('is a no-op when the id does not exist', async () => {
    const presets: MetronomePreset[] = [
      { id: 'real-id', name: 'Real', savedAt: 1000, state: makeState() },
    ];
    storePresets(presets);

    await deleteMetronomePreset('ghost-id');

    const stored = JSON.parse(localStorageMock.store[LS_KEY] ?? '[]') as MetronomePreset[];
    expect(stored).toHaveLength(1);
  });

  it('results in empty localStorage when last preset is deleted', async () => {
    const presets: MetronomePreset[] = [
      { id: 'only-one', name: 'Only', savedAt: 1000, state: makeState() },
    ];
    storePresets(presets);

    await deleteMetronomePreset('only-one');

    const stored = JSON.parse(localStorageMock.store[LS_KEY] ?? '[]') as MetronomePreset[];
    expect(stored).toHaveLength(0);
  });

  it('does not call cloud API when unauthenticated', async () => {
    storePresets([{ id: 'x', name: 'X', savedAt: 0, state: makeState() }]);
    await deleteMetronomePreset('x');
    expect(mockPresetModel.delete).not.toHaveBeenCalled();
  });
});

// ── loadMetronomePresets (authenticated) ───────────────────────────────────

describe('loadMetronomePresets (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
  });

  it('returns empty array when no cloud records exist', async () => {
    mockPresetModel.list.mockResolvedValue({ data: [] });
    const result = await loadMetronomePresets();
    expect(result).toEqual([]);
  });

  it('returns presets parsed from cloud records, sorted newest-first', async () => {
    const state = makeState({ bpm: 90 });
    mockPresetModel.list.mockResolvedValue({
      data: [
        { id: 'c1', name: 'Old', savedAt: 1000, stateJson: JSON.stringify(state) },
        { id: 'c2', name: 'New', savedAt: 5000, stateJson: JSON.stringify(state) },
      ],
    });

    const result = await loadMetronomePresets();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('New'); // savedAt=5000 comes first
    expect(result[1].name).toBe('Old');
  });

  it('skips records with unparseable stateJson', async () => {
    const goodState = makeState();
    mockPresetModel.list.mockResolvedValue({
      data: [
        { id: 'good', name: 'Good', savedAt: 1000, stateJson: JSON.stringify(goodState) },
        { id: 'bad', name: 'Bad', savedAt: 2000, stateJson: '{{corrupt' },
      ],
    });

    const result = await loadMetronomePresets();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
  });

  it('falls back to localStorage when cloud call throws', async () => {
    mockPresetModel.list.mockRejectedValue(new Error('network'));
    const preset: MetronomePreset = { id: 'loc', name: 'Local', savedAt: 1000, state: makeState() };
    storePresets([preset]);

    const result = await loadMetronomePresets();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('loc');
  });

  it('falls back to localStorage when cloud returns no data', async () => {
    mockPresetModel.list.mockResolvedValue({ data: null });
    const preset: MetronomePreset = { id: 'loc2', name: 'Local2', savedAt: 1000, state: makeState() };
    storePresets([preset]);

    const result = await loadMetronomePresets();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('loc2');
  });
});

// ── saveMetronomePreset (authenticated) ───────────────────────────────────

describe('saveMetronomePreset (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
  });

  it('calls cloud create and returns preset with cloud id', async () => {
    mockPresetModel.create.mockResolvedValue({
      data: { id: 'cloud-id-xyz', name: 'Prog Rock', savedAt: 9999 },
    });

    const state = makeState({ bpm: 180 });
    const result = await saveMetronomePreset('Prog Rock', state);

    expect(mockPresetModel.create).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.id).toBe('cloud-id-xyz');
  });

  it('returns null when cloud create returns no data', async () => {
    mockPresetModel.create.mockResolvedValue({ data: null });
    const result = await saveMetronomePreset('Bad', makeState());
    expect(result).toBeNull();
  });

  it('returns null when cloud create throws', async () => {
    mockPresetModel.create.mockRejectedValue(new Error('error'));
    const result = await saveMetronomePreset('Error', makeState());
    expect(result).toBeNull();
  });
});

// ── deleteMetronomePreset (authenticated) ──────────────────────────────────

describe('deleteMetronomePreset (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
  });

  it('calls cloud delete with the given id', async () => {
    await deleteMetronomePreset('cloud-id-to-delete');
    expect(mockPresetModel.delete).toHaveBeenCalledWith({ id: 'cloud-id-to-delete' });
  });

  it('does not throw when cloud delete throws', async () => {
    mockPresetModel.delete.mockRejectedValue(new Error('failed'));
    await expect(deleteMetronomePreset('some-id')).resolves.toBeUndefined();
  });
});
