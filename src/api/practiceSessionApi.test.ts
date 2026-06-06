import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActiveSession, CompletedSession } from '../practiceSessionTypes';

// Mock aws-amplify/data and authUtils before importing the module under test
vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    models: {
      PracticeSession: {
        create: vi.fn().mockResolvedValue({}),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn().mockResolvedValue(false),
}));

import {
  saveActiveSession,
  loadActiveSession,
  clearActiveSession,
  savePracticeSession,
  loadPracticeSessions,
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
    const { isAuthenticated } = await import('./authUtils');
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    localStorageMock.store['practice-session.history'] = 'bad-json{{{';
    const result = await loadPracticeSessions();
    expect(result).toEqual([]);
  });
});
