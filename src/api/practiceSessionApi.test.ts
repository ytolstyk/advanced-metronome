import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActiveSession, CompletedSession } from '../practiceSessionTypes';

// vi.hoisted() ensures mock refs are stable before vi.mock() hoisting runs.
const { mockCreate, mockList } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({});
  const mockList = vi.fn().mockResolvedValue({ data: [] });
  return { mockCreate, mockList };
});

// Mock aws-amplify/data and authUtils before importing the module under test
vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: {
      PracticeSession: {
        create: mockCreate,
        list: mockList,
      },
    },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn().mockResolvedValue(false),
}));

import { isAuthenticated } from './authUtils';

import {
  saveActiveSession,
  loadActiveSession,
  clearActiveSession,
  savePracticeSession,
  loadPracticeSessions,
  loadCachedPracticeSessions,
} from './practiceSessionApi';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeActiveSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 'session-1',
    goal: { durationMinutes: 30, tools: ['drums'] },
    startedAt: '2026-06-05T10:00:00.000Z',
    currentTool: 'drums',
    currentToolStartedAt: '2026-06-05T10:00:00.000Z',
    toolTimes: { drums: 0 },
    notes: '',
    ...overrides,
  };
}

function makeCompletedSession(overrides: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id: 'session-1',
    goal: { durationMinutes: 30, tools: ['drums'] },
    startedAt: '2026-06-05T10:00:00.000Z',
    completedAt: '2026-06-05T10:30:00.000Z',
    durationSeconds: 1800,
    toolTimes: { drums: 900, tuner: 900 },
    notes: 'Great session',
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
  // Reset mock implementations to safe defaults after clearAllMocks
  mockCreate.mockResolvedValue({});
  mockList.mockResolvedValue({ data: [] });
  vi.mocked(isAuthenticated).mockResolvedValue(false);
});

// ── saveActiveSession ──────────────────────────────────────────────────────

describe('saveActiveSession', () => {
  it('serializes and stores the active session to localStorage', () => {
    const session = makeActiveSession();
    saveActiveSession(session);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'practice-session.active',
      JSON.stringify(session),
    );
  });

  it('stores session with notes', () => {
    const session = makeActiveSession({ notes: 'Working on scales' });
    saveActiveSession(session);
    const stored = JSON.parse(localStorageMock.store['practice-session.active']) as ActiveSession;
    expect(stored.notes).toBe('Working on scales');
  });
});

// ── loadActiveSession ──────────────────────────────────────────────────────

describe('loadActiveSession', () => {
  it('returns null when nothing is stored', () => {
    expect(loadActiveSession()).toBeNull();
  });

  it('returns the stored active session', () => {
    const session = makeActiveSession();
    localStorageMock.store['practice-session.active'] = JSON.stringify(session);
    const result = loadActiveSession();
    expect(result).toEqual(session);
  });

  it('returns null when stored value is corrupt JSON', () => {
    localStorageMock.store['practice-session.active'] = 'not-valid-json{{{';
    expect(loadActiveSession()).toBeNull();
  });

  it('returns null for an empty string stored value', () => {
    // localStorage.getItem returns empty string in some browsers
    vi.spyOn(globalThis.localStorage, 'getItem').mockReturnValue('');
    expect(loadActiveSession()).toBeNull();
  });

  it('correctly restores currentTool', () => {
    const session = makeActiveSession({ currentTool: 'tuner' });
    localStorageMock.store['practice-session.active'] = JSON.stringify(session);
    expect(loadActiveSession()?.currentTool).toBe('tuner');
  });
});

// ── clearActiveSession ─────────────────────────────────────────────────────

describe('clearActiveSession', () => {
  it('removes the active session key from localStorage', () => {
    const session = makeActiveSession();
    localStorageMock.store['practice-session.active'] = JSON.stringify(session);

    clearActiveSession();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('practice-session.active');
    // After clearing, loadActiveSession should return null
    vi.spyOn(globalThis.localStorage, 'getItem').mockReturnValue(null);
    expect(loadActiveSession()).toBeNull();
  });
});

// ── savePracticeSession ────────────────────────────────────────────────────

describe('savePracticeSession', () => {
  it('prepends the session to the history in localStorage', async () => {
    const existingSession = makeCompletedSession({ id: 'old-session' });
    localStorageMock.store['practice-session.history'] = JSON.stringify([existingSession]);

    const newSession = makeCompletedSession({ id: 'new-session' });
    await savePracticeSession(newSession);

    const stored = JSON.parse(
      localStorageMock.store['practice-session.history'],
    ) as CompletedSession[];
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe('new-session');
    expect(stored[1].id).toBe('old-session');
  });

  it('creates a new history array when none exists', async () => {
    const session = makeCompletedSession();
    await savePracticeSession(session);

    const stored = JSON.parse(
      localStorageMock.store['practice-session.history'],
    ) as CompletedSession[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('session-1');
  });

  it('saves to localStorage before checking auth', async () => {
    const { isAuthenticated } = await import('./authUtils');
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    const session = makeCompletedSession();
    await savePracticeSession(session);

    // localStorage write should have happened
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'practice-session.history',
      expect.any(String),
    );
  });

  it('does not throw when not authenticated (skips cloud)', async () => {
    const { isAuthenticated } = await import('./authUtils');
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    const session = makeCompletedSession();
    await expect(savePracticeSession(session)).resolves.toBeUndefined();
  });
});

// ── loadPracticeSessions ───────────────────────────────────────────────────

describe('loadPracticeSessions', () => {
  it('returns empty array when nothing is stored and not authenticated', async () => {
    const { isAuthenticated } = await import('./authUtils');
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    const result = await loadPracticeSessions();
    expect(result).toEqual([]);
  });

  it('returns stored sessions when not authenticated', async () => {
    const { isAuthenticated } = await import('./authUtils');
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    const sessions = [makeCompletedSession({ id: 's1' }), makeCompletedSession({ id: 's2' })];
    localStorageMock.store['practice-session.history'] = JSON.stringify(sessions);

    const result = await loadPracticeSessions();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('s1');
  });

  it('returns empty array when stored value is corrupt and not authenticated', async () => {
    const { isAuthenticated: iAuth } = await import('./authUtils');
    vi.mocked(iAuth).mockResolvedValue(false);

    localStorageMock.store['practice-session.history'] = 'bad-json{{{';
    const result = await loadPracticeSessions();
    expect(result).toEqual([]);
  });
});

// ── savePracticeSession – tag serialization ────────────────────────────────

// Helper: a minimal PracticeSession cloud record for list() responses.
function makePracticeSessionRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'cloud-session-1',
    completedAt: '2024-03-10T12:00:00.000Z',
    startedAt: '2024-03-10T11:00:00.000Z',
    actualDurationSeconds: 3600,
    goalDurationMinutes: null,
    goalBpm: null,
    goalSkill: null,
    goalToolsJson: JSON.stringify([]),
    toolTimesJson: JSON.stringify({}),
    notes: null,
    goalTagsJson: JSON.stringify([]),
    ...overrides,
  };
}

describe('savePracticeSession – goalTagsJson serialization', () => {
  it('serializes tags to goalTagsJson when calling cloud create', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);

    const session = makeCompletedSession({
      goal: { durationMinutes: 30, tools: ['drums'], tags: ['Theory', 'Song'] },
    });
    await savePracticeSession(session);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        goalTagsJson: JSON.stringify(['Theory', 'Song']),
      }),
    );
  });

  it('serializes empty tags array when goal.tags is absent', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);

    const session = makeCompletedSession();
    await savePracticeSession(session);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        goalTagsJson: JSON.stringify([]),
      }),
    );
  });

  it('serializes empty tags array when goal.tags is explicitly []', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);

    const session = makeCompletedSession({
      goal: { durationMinutes: 30, tools: ['drums'], tags: [] },
    });
    await savePracticeSession(session);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        goalTagsJson: '[]',
      }),
    );
  });
});

// ── loadPracticeSessions – tag deserialization ────────────────────────────

describe('loadPracticeSessions – goalTagsJson deserialization', () => {
  it('deserializes a valid tags array from cloud record', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockList.mockResolvedValue({
      data: [
        makePracticeSessionRecord({
          goalTagsJson: JSON.stringify(['Theory', 'Technique']),
        }),
      ],
    });

    const sessions = await loadPracticeSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].goal.tags).toEqual(['Theory', 'Technique']);
  });

  it('falls back to [] when goalTagsJson is null', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockList.mockResolvedValue({
      data: [makePracticeSessionRecord({ goalTagsJson: null })],
    });

    const sessions = await loadPracticeSessions();
    expect(sessions[0].goal.tags).toEqual([]);
  });

  it('falls back to [] when goalTagsJson is invalid JSON', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockList.mockResolvedValue({
      data: [makePracticeSessionRecord({ goalTagsJson: 'not-json{{{' })],
    });

    const sessions = await loadPracticeSessions();
    expect(sessions[0].goal.tags).toEqual([]);
  });

  it('falls back to [] when goalTagsJson parses to a non-array', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockList.mockResolvedValue({
      data: [makePracticeSessionRecord({ goalTagsJson: JSON.stringify({ foo: 'bar' }) })],
    });

    const sessions = await loadPracticeSessions();
    expect(sessions[0].goal.tags).toEqual([]);
  });

  it('filters out non-string elements, keeping valid strings', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockList.mockResolvedValue({
      data: [
        makePracticeSessionRecord({
          goalTagsJson: JSON.stringify(['Theory', 42, null]),
        }),
      ],
    });

    const sessions = await loadPracticeSessions();
    // Non-string elements (42, null) are silently dropped; valid strings are kept.
    expect(sessions[0].goal.tags).toEqual(['Theory']);
  });

  it('returns an empty tags array when goalTagsJson is an empty JSON array', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    mockList.mockResolvedValue({
      data: [makePracticeSessionRecord({ goalTagsJson: '[]' })],
    });

    const sessions = await loadPracticeSessions();
    expect(sessions[0].goal.tags).toEqual([]);
  });
});

// ── loadCachedPracticeSessions ─────────────────────────────────────────────

describe('loadCachedPracticeSessions', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadCachedPracticeSessions()).toEqual([]);
  });

  it('returns the sessions stored in localStorage', () => {
    const sessions = [
      makeCompletedSession({ id: 'cached-1' }),
      makeCompletedSession({ id: 'cached-2' }),
    ];
    localStorageMock.store['practice-session.history'] = JSON.stringify(sessions);
    const result = loadCachedPracticeSessions();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('cached-1');
    expect(result[1].id).toBe('cached-2');
  });

  it('returns an empty array when the stored value is corrupt JSON', () => {
    localStorageMock.store['practice-session.history'] = 'bad-json{{{';
    expect(loadCachedPracticeSessions()).toEqual([]);
  });

  it('is synchronous — does not return a Promise', () => {
    const result = loadCachedPracticeSessions();
    expect(result).not.toBeInstanceOf(Promise);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns the same data that savePracticeSession wrote to localStorage', async () => {
    const session = makeCompletedSession({ id: 'round-trip' });
    await savePracticeSession(session);
    const cached = loadCachedPracticeSessions();
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe('round-trip');
  });
});
