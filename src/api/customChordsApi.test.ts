import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomChordRecord, CreateCustomChordParams } from './customChordsApi';

// ── Hoist stable mock references ───────────────────────────────────────────
// vi.hoisted() runs before vi.mock() hoisting, so the refs are usable
// inside the mock factory closures below.
const { mockCustomChordModel, mockGetCurrentUser } = vi.hoisted(() => {
  const mockCustomChordModel = {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  const mockGetCurrentUser = vi.fn();
  return { mockCustomChordModel, mockGetCurrentUser };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: { UserCustomChord: mockCustomChordModel },
  })),
}));

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

// imports must come AFTER vi.mock() calls
import { loadMyCustomChords, loadCommunityChords, createCustomChord, deleteCustomChord } from './customChordsApi';
import { isAuthenticated } from './authUtils';

// ── localStorage mock ──────────────────────────────────────────────────────

const LS_KEY = 'custom-chords-v1';

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

let ls: ReturnType<typeof makeLocalStorageMock>;

// ── Default chord params helper ────────────────────────────────────────────

function makeParams(overrides: Partial<CreateCustomChordParams> = {}): CreateCustomChordParams {
  return {
    root: 'G',
    type: 'major',
    voicing: { frets: [3, 2, 0, 0, 0, 3] },
    isPublic: false,
    stringCount: 6,
    tuningId: 'standard',
    ...overrides,
  };
}

function makeAmplifyRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cloud-id-1',
    root: 'G',
    type: 'major',
    name: null,
    fretsJson: JSON.stringify([3, 2, 0, 0, 0, 3]),
    barreJson: null,
    startFret: null,
    isPublic: false,
    authorName: 'alice',
    stringCount: 6,
    tuningId: 'standard',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  ls = makeLocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls,
    writable: true,
    configurable: true,
  });
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(false);
  mockGetCurrentUser.mockRejectedValue(new Error('no user'));
  mockCustomChordModel.list.mockResolvedValue({ data: [] });
  mockCustomChordModel.create.mockResolvedValue({ data: makeAmplifyRecord() });
  mockCustomChordModel.delete.mockResolvedValue({});
});

// ── loadMyCustomChords (unauthenticated) ───────────────────────────────────

describe('loadMyCustomChords (unauthenticated)', () => {
  it('returns empty array when localStorage is empty', async () => {
    const result = await loadMyCustomChords();
    expect(result).toEqual([]);
  });

  it('returns parsed chords from localStorage', async () => {
    const chord: CustomChordRecord = {
      id: 'local-1',
      root: 'A',
      type: 'minor',
      voicing: { frets: [0, 0, 2, 2, 1, 0] },
      isPublic: false,
      stringCount: 6,
      tuningId: 'standard',
      createdAt: '2024-01-01T00:00:00.000Z',
      isOwn: true,
    };
    ls.store[LS_KEY] = JSON.stringify([chord]);

    const result = await loadMyCustomChords();
    expect(result).toEqual([chord]);
  });

  it('does not call cloud when unauthenticated', async () => {
    await loadMyCustomChords();
    expect(mockCustomChordModel.list).not.toHaveBeenCalled();
  });
});

// ── loadMyCustomChords (authenticated) ────────────────────────────────────

describe('loadMyCustomChords (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue({ username: 'alice' });
  });

  it('returns chords mapped from cloud records', async () => {
    mockCustomChordModel.list.mockResolvedValue({
      data: [makeAmplifyRecord()],
    });

    const result = await loadMyCustomChords();
    expect(result).toHaveLength(1);
    expect(result[0].root).toBe('G');
    expect(result[0].isOwn).toBe(true);
    expect(result[0].voicing.frets).toEqual([3, 2, 0, 0, 0, 3]);
  });

  it('mirrors cloud result to localStorage', async () => {
    mockCustomChordModel.list.mockResolvedValue({
      data: [makeAmplifyRecord()],
    });

    await loadMyCustomChords();
    expect(ls.setItem).toHaveBeenCalledWith(LS_KEY, expect.any(String));
  });

  it('falls back to localStorage when cloud throws', async () => {
    const chord: CustomChordRecord = {
      id: 'cached',
      root: 'E',
      type: 'major',
      voicing: { frets: [0, 2, 2, 1, 0, 0] },
      isPublic: false,
      stringCount: 6,
      tuningId: 'standard',
      createdAt: '2024-01-01T00:00:00.000Z',
      isOwn: true,
    };
    ls.store[LS_KEY] = JSON.stringify([chord]);
    mockCustomChordModel.list.mockRejectedValue(new Error('network'));

    const result = await loadMyCustomChords();
    expect(result).toEqual([chord]);
  });

  it('filters cloud records by authorName when username is available', async () => {
    await loadMyCustomChords();
    expect(mockCustomChordModel.list).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ authorName: { eq: 'alice' } }),
      }),
    );
  });

  it('falls back to localStorage when getCurrentUser fails', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('no user'));
    const chord: CustomChordRecord = {
      id: 'cached-fallback', root: 'D', type: 'major',
      voicing: { frets: [0, 0, 0, 2, 3, 2] },
      isPublic: false, stringCount: 6, tuningId: 'standard',
      createdAt: '2024-01-01T00:00:00.000Z', isOwn: true,
    };
    ls.store[LS_KEY] = JSON.stringify([chord]);
    const result = await loadMyCustomChords();
    expect(mockCustomChordModel.list).not.toHaveBeenCalled();
    expect(result).toEqual([chord]);
  });
});

// ── loadCommunityChords ────────────────────────────────────────────────────

describe('loadCommunityChords', () => {
  it('returns empty array when unauthenticated', async () => {
    const result = await loadCommunityChords(6, 'standard');
    expect(result).toEqual([]);
    expect(mockCustomChordModel.list).not.toHaveBeenCalled();
  });

  it('returns community records filtered by stringCount and tuningId', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue({ username: 'bob' });
    mockCustomChordModel.list.mockResolvedValue({
      data: [makeAmplifyRecord({ isPublic: true, authorName: 'alice' })],
    });

    const result = await loadCommunityChords(6, 'standard');
    expect(result).toHaveLength(1);
    expect(result[0].isOwn).toBe(false); // different username
  });

  it('marks record as isOwn when authorName matches current user', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue({ username: 'alice' });
    mockCustomChordModel.list.mockResolvedValue({
      data: [makeAmplifyRecord({ isPublic: true, authorName: 'alice' })],
    });

    const result = await loadCommunityChords(6, 'standard');
    expect(result[0].isOwn).toBe(true);
  });

  it('returns empty array when cloud throws', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue({ username: 'bob' });
    mockCustomChordModel.list.mockRejectedValue(new Error('network'));

    const result = await loadCommunityChords(6, 'standard');
    expect(result).toEqual([]);
  });

  it('passes stringCount and tuningId filter to cloud call', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue({ username: 'bob' });
    mockCustomChordModel.list.mockResolvedValue({ data: [] });

    await loadCommunityChords(7, 'drop-d');
    expect(mockCustomChordModel.list).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          stringCount: { eq: 7 },
          tuningId: { eq: 'drop-d' },
          isPublic: { eq: true },
        }),
      }),
    );
  });
});

// ── createCustomChord (unauthenticated) ────────────────────────────────────

describe('createCustomChord (unauthenticated)', () => {
  it('saves to localStorage and returns record with isOwn: true', async () => {
    const params = makeParams();
    const record = await createCustomChord(params);

    expect(record.isOwn).toBe(true);
    expect(record.root).toBe('G');
    expect(record.type).toBe('major');
    expect(record.voicing.frets).toEqual([3, 2, 0, 0, 0, 3]);
  });

  it('forces isPublic: false when unauthenticated even if params say true', async () => {
    const params = makeParams({ isPublic: true });
    const record = await createCustomChord(params);
    expect(record.isPublic).toBe(false);
  });

  it('saves the record to localStorage', async () => {
    const params = makeParams();
    await createCustomChord(params);
    expect(ls.setItem).toHaveBeenCalledWith(LS_KEY, expect.any(String));
    const stored = JSON.parse(ls.store[LS_KEY]) as CustomChordRecord[];
    expect(stored).toHaveLength(1);
    expect(stored[0].root).toBe('G');
  });

  it('does not call cloud create when unauthenticated', async () => {
    await createCustomChord(makeParams());
    expect(mockCustomChordModel.create).not.toHaveBeenCalled();
  });

  it('assigns a unique id to the record', async () => {
    const r1 = await createCustomChord(makeParams());
    const r2 = await createCustomChord(makeParams());
    expect(r1.id).not.toBe(r2.id);
  });

  it('preserves optional name when provided', async () => {
    const record = await createCustomChord(makeParams({ name: 'blues voicing' }));
    expect(record.name).toBe('blues voicing');
  });

  it('accumulates chords: two creates store two records', async () => {
    await createCustomChord(makeParams({ root: 'A' }));
    await createCustomChord(makeParams({ root: 'D' }));

    const stored = JSON.parse(ls.store[LS_KEY]) as CustomChordRecord[];
    expect(stored).toHaveLength(2);
    expect(stored[0].root).toBe('A');
    expect(stored[1].root).toBe('D');
  });

  it('preserves barre in voicing when present', async () => {
    const params = makeParams({
      voicing: {
        frets: [1, 1, 1, 1, 1, 1],
        barre: { fret: 1, fromString: 1, toString: 6 },
      },
    });
    const record = await createCustomChord(params);
    expect(record.voicing.barre).toEqual({ fret: 1, fromString: 1, toString: 6 });
  });
});

// ── createCustomChord (authenticated) ─────────────────────────────────────

describe('createCustomChord (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockGetCurrentUser.mockResolvedValue({ username: 'alice' });
  });

  it('calls cloud create and returns record with cloud id', async () => {
    mockCustomChordModel.create.mockResolvedValue({
      data: makeAmplifyRecord({ id: 'cloud-new' }),
    });

    const record = await createCustomChord(makeParams());
    expect(record.id).toBe('cloud-new');
    expect(mockCustomChordModel.create).toHaveBeenCalledOnce();
  });

  it('mirrors to localStorage after successful cloud create', async () => {
    mockCustomChordModel.create.mockResolvedValue({
      data: makeAmplifyRecord({ id: 'cloud-new' }),
    });

    await createCustomChord(makeParams());
    expect(ls.setItem).toHaveBeenCalledWith(LS_KEY, expect.any(String));
  });

  it('passes isPublic: true to cloud when param is true', async () => {
    mockCustomChordModel.create.mockResolvedValue({
      data: makeAmplifyRecord({ id: 'pub-id', isPublic: true }),
    });

    await createCustomChord(makeParams({ isPublic: true }));
    expect(mockCustomChordModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true }),
    );
  });

  it('falls back to localStorage when cloud create throws, returns local record', async () => {
    mockCustomChordModel.create.mockRejectedValue(new Error('network'));

    const record = await createCustomChord(makeParams());
    expect(record.isOwn).toBe(true);
    expect(record.isPublic).toBe(false); // forced false on error
    expect(ls.setItem).toHaveBeenCalledWith(LS_KEY, expect.any(String));
  });

  it('falls back gracefully when create returns null', async () => {
    mockCustomChordModel.create.mockResolvedValue({ data: null });

    const record = await createCustomChord(makeParams());
    // null data triggers throw -> fallback path
    expect(record.isOwn).toBe(true);
  });

  it('serialises frets as JSON in cloud call', async () => {
    mockCustomChordModel.create.mockResolvedValue({
      data: makeAmplifyRecord({ id: 'x' }),
    });

    const params = makeParams({ voicing: { frets: [3, 2, 0, 0, 3, 3] } });
    await createCustomChord(params);

    expect(mockCustomChordModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ fretsJson: JSON.stringify([3, 2, 0, 0, 3, 3]) }),
    );
  });
});

// ── deleteCustomChord ──────────────────────────────────────────────────────

describe('deleteCustomChord', () => {
  it('removes the record from localStorage immediately', async () => {
    // pre-populate two chords
    const a: CustomChordRecord = {
      id: 'id-a', root: 'A', type: 'minor',
      voicing: { frets: [0, 0, 2, 2, 1, 0] },
      isPublic: false, stringCount: 6, tuningId: 'standard',
      createdAt: '2024-01-01T00:00:00.000Z', isOwn: true,
    };
    const b: CustomChordRecord = {
      id: 'id-b', root: 'E', type: 'major',
      voicing: { frets: [0, 2, 2, 1, 0, 0] },
      isPublic: false, stringCount: 6, tuningId: 'standard',
      createdAt: '2024-01-01T00:00:00.000Z', isOwn: true,
    };
    ls.store[LS_KEY] = JSON.stringify([a, b]);

    await deleteCustomChord('id-a');

    const stored = JSON.parse(ls.store[LS_KEY]) as CustomChordRecord[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('id-b');
  });

  it('two creates then one delete leaves one record', async () => {
    const r1 = await createCustomChord(makeParams({ root: 'C' }));
    await createCustomChord(makeParams({ root: 'D' }));

    await deleteCustomChord(r1.id);

    const stored = JSON.parse(ls.store[LS_KEY]) as CustomChordRecord[];
    expect(stored).toHaveLength(1);
    expect(stored[0].root).toBe('D');
  });

  it('does not call cloud delete when unauthenticated', async () => {
    ls.store[LS_KEY] = JSON.stringify([]);
    await deleteCustomChord('some-id');
    expect(mockCustomChordModel.delete).not.toHaveBeenCalled();
  });

  it('calls cloud delete when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'alice' });
    ls.store[LS_KEY] = JSON.stringify([]);

    await deleteCustomChord('cloud-id-1');

    expect(mockCustomChordModel.delete).toHaveBeenCalledWith({ id: 'cloud-id-1' });
  });

  it('is a no-op when id does not exist in localStorage', async () => {
    ls.store[LS_KEY] = JSON.stringify([]);
    // should not throw
    await expect(deleteCustomChord('nonexistent')).resolves.toBeUndefined();
  });

  it('silently ignores cloud delete errors', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'alice' });
    mockCustomChordModel.delete.mockRejectedValue(new Error('network'));
    ls.store[LS_KEY] = JSON.stringify([]);

    await expect(deleteCustomChord('some-id')).resolves.toBeUndefined();
  });
});
