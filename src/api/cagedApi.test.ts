import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CAGEDPrefs } from './cagedApi';

// vi.hoisted() runs before vi.mock() hoisting, so these refs are available
// in the mock factory.
const { mockCAGEDModel } = vi.hoisted(() => {
  const mockCAGEDModel = {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  };
  return { mockCAGEDModel };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: { UserCAGEDPrefs: mockCAGEDModel },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

import { loadCAGEDPrefs, saveCAGEDPrefs } from './cagedApi';
import { isAuthenticated } from './authUtils';

// ── Helpers ────────────────────────────────────────────────────────────────

const LS_KEY = 'caged-prefs-v1';

function makePrefs(overrides: Partial<CAGEDPrefs> = {}): CAGEDPrefs {
  return {
    rootNote: 'C',
    activeShape: 'C',
    showScale: false,
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
  mockCAGEDModel.list.mockResolvedValue({ data: [] });
  mockCAGEDModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
  mockCAGEDModel.update.mockResolvedValue({});
});

// ── Unauthenticated: loadCAGEDPrefs ────────────────────────────────────────

describe('loadCAGEDPrefs (unauthenticated)', () => {
  it('returns null when localStorage is empty', async () => {
    const result = await loadCAGEDPrefs();
    expect(result).toBeNull();
  });

  it('returns parsed value from localStorage', async () => {
    const prefs = makePrefs({ rootNote: 'G', showScale: true });
    localStorageMock.store[LS_KEY] = JSON.stringify(prefs);

    const result = await loadCAGEDPrefs();
    expect(result).toEqual(prefs);
  });

  it('returns null when localStorage value is corrupt JSON', async () => {
    localStorageMock.store[LS_KEY] = 'not-valid-json{{{';
    const result = await loadCAGEDPrefs();
    expect(result).toBeNull();
  });
});

// ── Unauthenticated: saveCAGEDPrefs ────────────────────────────────────────

describe('saveCAGEDPrefs (unauthenticated)', () => {
  it('writes serialized prefs to localStorage', async () => {
    const prefs = makePrefs();
    await saveCAGEDPrefs(prefs);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(prefs));
  });

  it('does not call cloud when unauthenticated', async () => {
    await saveCAGEDPrefs(makePrefs());
    expect(mockCAGEDModel.create).not.toHaveBeenCalled();
    expect(mockCAGEDModel.update).not.toHaveBeenCalled();
  });
});

// ── Authenticated: loadCAGEDPrefs ──────────────────────────────────────────

describe('loadCAGEDPrefs (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
  });

  it('returns null when no cloud records exist', async () => {
    const result = await loadCAGEDPrefs();
    expect(result).toBeNull();
  });

  it('returns parsed value from cloud records', async () => {
    const prefs = makePrefs({ rootNote: 'D', activeShape: 'G' });
    mockCAGEDModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-load', prefsJson: JSON.stringify(prefs) }],
    });

    const result = await loadCAGEDPrefs();
    expect(result).toEqual(prefs);
  });

  it('returns null when cloud call throws', async () => {
    mockCAGEDModel.list.mockRejectedValue(new Error('network'));

    const result = await loadCAGEDPrefs();
    expect(result).toBeNull();
  });
});

// ── Authenticated: saveCAGEDPrefs — create path ────────────────────────────
//
// cachedId is module-level state. Tests needing cachedId=null use
// vi.resetModules() + vi.doMock() + dynamic import to get a fresh module.

describe('saveCAGEDPrefs (authenticated, create path)', () => {
  it('calls create when cachedId is null (cold start)', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'fresh-id' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserCAGEDPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveCAGEDPrefs: freshSave } = await import('./cagedApi');
    await freshSave(makePrefs());

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
      generateClient: vi.fn(() => ({ models: { UserCAGEDPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveCAGEDPrefs: freshSave } = await import('./cagedApi');
    const prefs = makePrefs({ rootNote: 'A' });
    await freshSave(prefs);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(prefs));
  });
});

// ── Authenticated: saveCAGEDPrefs — update path ────────────────────────────

describe('saveCAGEDPrefs (authenticated, update path)', () => {
  it('calls update after cachedId is set by a prior load', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-1', prefsJson: JSON.stringify(makePrefs()) }],
    });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserCAGEDPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { loadCAGEDPrefs: freshLoad, saveCAGEDPrefs: freshSave } = await import('./cagedApi');
    await freshLoad(); // populates cachedId

    const updated = makePrefs({ showScale: true });
    await freshSave(updated);

    expect(freshModel.update).toHaveBeenCalledWith({
      id: 'cloud-id-1',
      prefsJson: JSON.stringify(updated),
    });
    expect(freshModel.create).not.toHaveBeenCalled();
  });

  it('mirrors to localStorage after successful update', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockResolvedValue({ data: { id: 'cloud-id-1' } });
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({
      data: [{ id: 'cloud-id-1', prefsJson: JSON.stringify(makePrefs()) }],
    });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserCAGEDPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { loadCAGEDPrefs: freshLoad, saveCAGEDPrefs: freshSave } = await import('./cagedApi');
    await freshLoad();

    const updated = makePrefs({ rootNote: 'E' });
    await freshSave(updated);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(updated));
  });
});

// ── Authenticated: saveCAGEDPrefs — cloud error fallback ──────────────────

describe('saveCAGEDPrefs (authenticated, cloud error fallback)', () => {
  it('falls back to localStorage when cloud create throws', async () => {
    vi.resetModules();

    const freshModel = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
    freshModel.create.mockRejectedValue(new Error('network error'));
    freshModel.update.mockResolvedValue({});
    freshModel.list.mockResolvedValue({ data: [] });

    vi.doMock('aws-amplify/data', () => ({
      generateClient: vi.fn(() => ({ models: { UserCAGEDPrefs: freshModel } })),
    }));
    vi.doMock('./authUtils', () => ({
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }));

    const { saveCAGEDPrefs: freshSave } = await import('./cagedApi');
    const prefs = makePrefs({ rootNote: 'F' });
    await freshSave(prefs);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LS_KEY, JSON.stringify(prefs));
  });
});
