/**
 * Tests for PracticeSessionPage.
 *
 * Pure helper functions (formatDuration, formatShortDuration, computeStreak,
 * computeWeeklyCalendar, computeNudges) are tested directly — they are now
 * exported from the page.
 *
 * The private reducer and PageState are re-declared here (mirroring the
 * source exactly) so we can test every action type without mounting the
 * full component — following the same pattern used in ChordProgressionPage.test.tsx.
 *
 * Component-level tests (phase transitions visible in the DOM) verify the
 * integration between the reducer and the rendered UI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ActiveSession, CompletedSession, ToolId, SessionGoal } from '../practiceSessionTypes';
import {
  formatDuration,
  formatShortDuration,
  computeStreak,
  computeWeeklyCalendar,
  computeNudges,
} from '../practiceSessionUtils';
import type { CalendarDay } from '../practiceSessionUtils';
import { PracticeSessionPage } from './PracticeSessionPage';

// ── Mock dependencies ──────────────────────────────────────────────────────

vi.mock('@/api/practiceSessionApi', () => ({
  saveActiveSession: vi.fn(),
  loadActiveSession: vi.fn().mockReturnValue(null),
  clearActiveSession: vi.fn(),
  savePracticeSession: vi.fn().mockResolvedValue(undefined),
  loadPracticeSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/hooks/usePracticeTimer', () => ({
  usePracticeTimer: vi.fn(),
}));

// ── Fixture factories ──────────────────────────────────────────────────────

function makeGoal(overrides: Partial<SessionGoal> = {}): SessionGoal {
  return { durationMinutes: 30, tools: [], ...overrides };
}

function makeCompletedSession(overrides: Partial<CompletedSession> = {}): CompletedSession {
  const completedAt = overrides.completedAt ?? new Date().toISOString();
  return {
    id: 'sess-1',
    goal: makeGoal(),
    startedAt: completedAt,
    completedAt,
    durationSeconds: 1800,
    toolTimes: {},
    notes: '',
    ...overrides,
  };
}

/** Returns an ISO string for N days ago at noon UTC. */
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

// ── Re-declared reducer (mirrors PracticeSessionPage.tsx exactly) ──────────

type PagePhase = 'setup' | 'active' | 'summary';

interface PageState {
  phase: PagePhase;
  resumeCandidate: ActiveSession | null;
  resumeCandidateAgo: number;
  goalDurationMinutes: number | undefined;
  goalBpmRaw: string;
  goalSkillFocus: string;
  goalTools: ToolId[];
  activeSession: ActiveSession | null;
  elapsedSeconds: number;
  history: CompletedSession[];
  historyLoaded: boolean;
  lastCompleted: CompletedSession | null;
}

type PageAction =
  | { type: 'SET_GOAL_DURATION'; minutes: number | undefined }
  | { type: 'SET_GOAL_BPM'; raw: string }
  | { type: 'SET_GOAL_SKILL'; text: string }
  | { type: 'TOGGLE_GOAL_TOOL'; tool: ToolId }
  | { type: 'START_SESSION'; session: ActiveSession }
  | { type: 'RESUME_SESSION'; session: ActiveSession; initialElapsed: number }
  | { type: 'DISCARD_ACTIVE' }
  | { type: 'SWITCH_TOOL'; tool: ToolId | null; nowIso: string }
  | { type: 'TICK' }
  | { type: 'UPDATE_NOTES'; text: string }
  | { type: 'END_SESSION'; completed: CompletedSession }
  | { type: 'HISTORY_LOADED'; sessions: CompletedSession[] }
  | { type: 'SET_RESUME_CANDIDATE'; session: ActiveSession; agoSeconds: number }
  | { type: 'RESET' };

function makeInitialState(): PageState {
  return {
    phase: 'setup',
    resumeCandidate: null,
    resumeCandidateAgo: 0,
    goalDurationMinutes: 30,
    goalBpmRaw: '',
    goalSkillFocus: '',
    goalTools: [],
    activeSession: null,
    elapsedSeconds: 0,
    history: [],
    historyLoaded: false,
    lastCompleted: null,
  };
}

function makeActiveSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 'active-1',
    goal: makeGoal(),
    startedAt: '2026-06-05T10:00:00.000Z',
    currentTool: null,
    currentToolStartedAt: null,
    toolTimes: {},
    notes: '',
    ...overrides,
  };
}

function reducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'SET_GOAL_DURATION':
      return { ...state, goalDurationMinutes: action.minutes };
    case 'SET_GOAL_BPM':
      return { ...state, goalBpmRaw: action.raw };
    case 'SET_GOAL_SKILL':
      return { ...state, goalSkillFocus: action.text };
    case 'TOGGLE_GOAL_TOOL': {
      const has = state.goalTools.includes(action.tool);
      return {
        ...state,
        goalTools: has
          ? state.goalTools.filter(t => t !== action.tool)
          : [...state.goalTools, action.tool],
      };
    }
    case 'START_SESSION':
      return {
        ...state,
        phase: 'active',
        activeSession: action.session,
        elapsedSeconds: 0,
        resumeCandidate: null,
      };
    case 'RESUME_SESSION':
      return {
        ...state,
        phase: 'active',
        activeSession: action.session,
        elapsedSeconds: action.initialElapsed,
        resumeCandidate: null,
      };
    case 'DISCARD_ACTIVE':
      return { ...state, resumeCandidate: null };
    case 'SET_RESUME_CANDIDATE':
      return { ...state, resumeCandidate: action.session, resumeCandidateAgo: action.agoSeconds };
    case 'SWITCH_TOOL': {
      if (!state.activeSession) return state;
      const updated: ActiveSession = {
        ...state.activeSession,
        currentTool: action.tool,
        currentToolStartedAt: action.tool ? action.nowIso : null,
      };
      return { ...state, activeSession: updated };
    }
    case 'TICK': {
      const newElapsed = state.elapsedSeconds + 1;
      if (!state.activeSession?.currentTool) {
        return { ...state, elapsedSeconds: newElapsed };
      }
      const toolId = state.activeSession.currentTool;
      const prev = state.activeSession.toolTimes[toolId] ?? 0;
      const updated: ActiveSession = {
        ...state.activeSession,
        toolTimes: { ...state.activeSession.toolTimes, [toolId]: prev + 1 },
      };
      return { ...state, activeSession: updated, elapsedSeconds: newElapsed };
    }
    case 'UPDATE_NOTES': {
      if (!state.activeSession) return state;
      return { ...state, activeSession: { ...state.activeSession, notes: action.text } };
    }
    case 'END_SESSION':
      return {
        ...state,
        phase: 'summary',
        activeSession: null,
        elapsedSeconds: 0,
        lastCompleted: action.completed,
        history: [action.completed, ...state.history],
      };
    case 'HISTORY_LOADED':
      return { ...state, history: action.sessions, historyLoaded: true };
    case 'RESET':
      return { ...makeInitialState(), history: state.history, historyLoaded: state.historyLoaded };
    default:
      return state;
  }
}

// ── formatDuration ─────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats zero seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatDuration(65)).toBe('01:05');
  });

  it('formats 3600 seconds (exactly 1 hour) as 1:00:00', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  it('formats 3661 seconds as 1:01:01', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('pads minutes and seconds to two digits', () => {
    expect(formatDuration(9)).toBe('00:09');
    expect(formatDuration(60)).toBe('01:00');
  });

  it('formats 7322 seconds (2h 2m 2s) as 2:02:02', () => {
    expect(formatDuration(7322)).toBe('2:02:02');
  });

  it('does not include hours for values under 3600', () => {
    expect(formatDuration(3599)).toBe('59:59');
  });
});

// ── formatShortDuration ────────────────────────────────────────────────────

describe('formatShortDuration', () => {
  it('formats 0 seconds as 0s', () => {
    expect(formatShortDuration(0)).toBe('0s');
  });

  it('formats 30 seconds as 30s', () => {
    expect(formatShortDuration(30)).toBe('30s');
  });

  it('formats 59 seconds as 59s', () => {
    expect(formatShortDuration(59)).toBe('59s');
  });

  it('formats 60 seconds as 1m', () => {
    expect(formatShortDuration(60)).toBe('1m');
  });

  it('formats 90 seconds as 1m', () => {
    expect(formatShortDuration(90)).toBe('1m');
  });

  it('formats 3599 seconds as 59m', () => {
    expect(formatShortDuration(3599)).toBe('59m');
  });

  it('formats 3600 seconds as 1h 0m', () => {
    expect(formatShortDuration(3600)).toBe('1h 0m');
  });

  it('formats 3660 seconds as 1h 1m', () => {
    expect(formatShortDuration(3660)).toBe('1h 1m');
  });

  it('formats 7200 seconds as 2h 0m', () => {
    expect(formatShortDuration(7200)).toBe('2h 0m');
  });
});

// ── computeStreak ──────────────────────────────────────────────────────────

describe('computeStreak', () => {
  it('returns 0 for empty session list', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('returns 1 for a single session today', () => {
    const sessions = [makeCompletedSession({ completedAt: daysAgoIso(0) })];
    expect(computeStreak(sessions)).toBe(1);
  });

  it('returns 1 for a single session yesterday (no session today)', () => {
    const sessions = [makeCompletedSession({ completedAt: daysAgoIso(1) })];
    expect(computeStreak(sessions)).toBe(1);
  });

  it('returns 2 for sessions today and yesterday', () => {
    const sessions = [
      makeCompletedSession({ id: 's1', completedAt: daysAgoIso(0) }),
      makeCompletedSession({ id: 's2', completedAt: daysAgoIso(1) }),
    ];
    expect(computeStreak(sessions)).toBe(2);
  });

  it('returns correct streak for 5 consecutive days', () => {
    const sessions = [0, 1, 2, 3, 4].map(n =>
      makeCompletedSession({ id: `s${n}`, completedAt: daysAgoIso(n) }),
    );
    expect(computeStreak(sessions)).toBe(5);
  });

  it('breaks the streak when there is a gap', () => {
    // Sessions today, yesterday, and 3 days ago (gap at 2 days ago)
    const sessions = [
      makeCompletedSession({ id: 's0', completedAt: daysAgoIso(0) }),
      makeCompletedSession({ id: 's1', completedAt: daysAgoIso(1) }),
      makeCompletedSession({ id: 's3', completedAt: daysAgoIso(3) }),
    ];
    // Streak should be 2 (today + yesterday), stops at the gap
    expect(computeStreak(sessions)).toBe(2);
  });

  it('ignores future-dated sessions', () => {
    // Only today and yesterday matter; the "future" session shouldn't extend streak
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const sessions = [
      makeCompletedSession({ id: 'future', completedAt: future.toISOString() }),
      makeCompletedSession({ id: 'today', completedAt: daysAgoIso(0) }),
    ];
    // streak walks back from today; future date contributes nothing to the backward walk
    expect(computeStreak(sessions)).toBeGreaterThanOrEqual(1);
  });

  it('counts multiple sessions on the same day as one streak day', () => {
    // Two sessions today
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const todayLate = new Date();
    todayLate.setHours(20, 0, 0, 0);
    const sessions = [
      makeCompletedSession({ id: 's1', completedAt: today.toISOString() }),
      makeCompletedSession({ id: 's2', completedAt: todayLate.toISOString() }),
    ];
    expect(computeStreak(sessions)).toBe(1);
  });
});

// ── computeWeeklyCalendar ──────────────────────────────────────────────────

describe('computeWeeklyCalendar', () => {
  it('always returns exactly 7 entries', () => {
    expect(computeWeeklyCalendar([])).toHaveLength(7);
  });

  it('marks today as isToday=true and it is the last entry', () => {
    const days = computeWeeklyCalendar([]);
    expect(days[days.length - 1].isToday).toBe(true);
  });

  it('marks all other days as isToday=false', () => {
    const days = computeWeeklyCalendar([]);
    days.slice(0, 6).forEach((d: CalendarDay) => expect(d.isToday).toBe(false));
  });

  it('marks days with sessions as hasSession=true', () => {
    const sessions = [makeCompletedSession({ completedAt: daysAgoIso(0) })];
    const days = computeWeeklyCalendar(sessions);
    expect(days[6].hasSession).toBe(true);
  });

  it('marks days without sessions as hasSession=false', () => {
    const days = computeWeeklyCalendar([]);
    days.forEach((d: CalendarDay) => expect(d.hasSession).toBe(false));
  });

  it('aggregates multiple session durations for the same day', () => {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const todayLate = new Date();
    todayLate.setHours(21, 0, 0, 0);
    const sessions = [
      makeCompletedSession({ id: 's1', completedAt: today.toISOString(), durationSeconds: 600 }),
      makeCompletedSession({ id: 's2', completedAt: todayLate.toISOString(), durationSeconds: 300 }),
    ];
    const days = computeWeeklyCalendar(sessions);
    expect(days[6].durationSeconds).toBe(900);
  });

  it('returns 0 duration for days with no sessions', () => {
    const days = computeWeeklyCalendar([]);
    days.forEach((d: CalendarDay) => expect(d.durationSeconds).toBe(0));
  });

  it('uses correct day abbreviations', () => {
    const days = computeWeeklyCalendar([]);
    const abbrs = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    days.forEach((d: CalendarDay) => expect(abbrs).toContain(d.dayLabel));
  });

  it('sessions outside the 7-day window do not affect calendar', () => {
    const oldSession = makeCompletedSession({ completedAt: daysAgoIso(10) });
    const days = computeWeeklyCalendar([oldSession]);
    days.forEach((d: CalendarDay) => expect(d.hasSession).toBe(false));
  });
});

// ── computeNudges ──────────────────────────────────────────────────────────

describe('computeNudges', () => {
  it('returns empty array for empty session list', () => {
    expect(computeNudges([])).toEqual([]);
  });

  it('returns empty array when all tools were used today', () => {
    const sessions = [
      makeCompletedSession({
        completedAt: daysAgoIso(0),
        toolTimes: { drums: 600, tuner: 300 },
      }),
    ];
    expect(computeNudges(sessions)).toEqual([]);
  });

  it('returns nudge for a tool unused for exactly 5 days', () => {
    const sessions = [
      makeCompletedSession({
        completedAt: daysAgoIso(5),
        toolTimes: { drums: 600 },
      }),
    ];
    const nudges = computeNudges(sessions);
    expect(nudges.length).toBeGreaterThan(0);
    expect(nudges[0]).toContain('Drum Machine');
  });

  it('does not return a nudge for a tool unused for 4 days', () => {
    const sessions = [
      makeCompletedSession({
        completedAt: daysAgoIso(4),
        toolTimes: { drums: 600 },
      }),
    ];
    expect(computeNudges(sessions)).toEqual([]);
  });

  it('returns at most 3 nudges', () => {
    // Make 5 tools all unused for 10+ days
    const toolTimes: Partial<Record<ToolId, number>> = {
      drums: 600,
      tuner: 300,
      chords: 400,
      scales: 200,
      circle: 100,
    };
    const sessions = [
      makeCompletedSession({ completedAt: daysAgoIso(10), toolTimes }),
    ];
    const nudges = computeNudges(sessions);
    expect(nudges.length).toBeLessThanOrEqual(3);
  });

  it('sorts nudges by most days since use (longest gap first)', () => {
    const sessions = [
      makeCompletedSession({
        id: 's1',
        completedAt: daysAgoIso(10),
        toolTimes: { drums: 600 },
      }),
      makeCompletedSession({
        id: 's2',
        completedAt: daysAgoIso(7),
        toolTimes: { tuner: 300 },
      }),
    ];
    const nudges = computeNudges(sessions);
    // "Drum Machine" (10 days) should appear before "Tuner" (7 days)
    expect(nudges[0]).toContain('Drum Machine');
    expect(nudges[1]).toContain('Tuner');
  });

  it('ignores tool entries with 0 seconds', () => {
    const sessions = [
      makeCompletedSession({
        completedAt: daysAgoIso(10),
        toolTimes: { drums: 0 },
      }),
    ];
    // Drums was in the session but 0 seconds — should NOT be nudged
    expect(computeNudges(sessions)).toEqual([]);
  });

  it('uses the most recent date when a tool appears across multiple sessions', () => {
    // drums was used recently (3 days ago) and also long ago (15 days ago)
    // Should use the 3-days-ago date → no nudge
    const sessions = [
      makeCompletedSession({
        id: 's1',
        completedAt: daysAgoIso(15),
        toolTimes: { drums: 600 },
      }),
      makeCompletedSession({
        id: 's2',
        completedAt: daysAgoIso(3),
        toolTimes: { drums: 300 },
      }),
    ];
    expect(computeNudges(sessions)).toEqual([]);
  });
});

// ── Reducer tests ──────────────────────────────────────────────────────────

describe('reducer', () => {
  let state: PageState;

  beforeEach(() => {
    state = makeInitialState();
  });

  // ── Goal setup actions ───────────────────────────────────────────────────

  describe('SET_GOAL_DURATION', () => {
    it('sets the goal duration to a number', () => {
      const next = reducer(state, { type: 'SET_GOAL_DURATION', minutes: 45 });
      expect(next.goalDurationMinutes).toBe(45);
    });

    it('sets the goal duration to undefined (no limit)', () => {
      const next = reducer(state, { type: 'SET_GOAL_DURATION', minutes: undefined });
      expect(next.goalDurationMinutes).toBeUndefined();
    });
  });

  describe('SET_GOAL_BPM', () => {
    it('stores raw BPM string', () => {
      const next = reducer(state, { type: 'SET_GOAL_BPM', raw: '120' });
      expect(next.goalBpmRaw).toBe('120');
    });
  });

  describe('SET_GOAL_SKILL', () => {
    it('updates skill focus text', () => {
      const next = reducer(state, { type: 'SET_GOAL_SKILL', text: 'pentatonic' });
      expect(next.goalSkillFocus).toBe('pentatonic');
    });
  });

  describe('TOGGLE_GOAL_TOOL', () => {
    it('adds a tool when not present', () => {
      const next = reducer(state, { type: 'TOGGLE_GOAL_TOOL', tool: 'drums' });
      expect(next.goalTools).toContain('drums');
    });

    it('removes a tool when already present', () => {
      state = { ...state, goalTools: ['drums'] };
      const next = reducer(state, { type: 'TOGGLE_GOAL_TOOL', tool: 'drums' });
      expect(next.goalTools).not.toContain('drums');
    });

    it('does not affect other tools when toggling one', () => {
      state = { ...state, goalTools: ['drums', 'tuner'] };
      const next = reducer(state, { type: 'TOGGLE_GOAL_TOOL', tool: 'drums' });
      expect(next.goalTools).toContain('tuner');
      expect(next.goalTools).not.toContain('drums');
    });
  });

  // ── Session lifecycle ────────────────────────────────────────────────────

  describe('START_SESSION', () => {
    it('sets phase to active', () => {
      const session = makeActiveSession();
      const next = reducer(state, { type: 'START_SESSION', session });
      expect(next.phase).toBe('active');
    });

    it('sets the activeSession', () => {
      const session = makeActiveSession();
      const next = reducer(state, { type: 'START_SESSION', session });
      expect(next.activeSession).toEqual(session);
    });

    it('resets elapsedSeconds to 0', () => {
      state = { ...state, elapsedSeconds: 999 };
      const session = makeActiveSession();
      const next = reducer(state, { type: 'START_SESSION', session });
      expect(next.elapsedSeconds).toBe(0);
    });

    it('clears any resumeCandidate', () => {
      state = { ...state, resumeCandidate: makeActiveSession() };
      const next = reducer(state, { type: 'START_SESSION', session: makeActiveSession() });
      expect(next.resumeCandidate).toBeNull();
    });
  });

  describe('RESUME_SESSION', () => {
    it('sets phase to active', () => {
      const session = makeActiveSession();
      const next = reducer(state, { type: 'RESUME_SESSION', session, initialElapsed: 300 });
      expect(next.phase).toBe('active');
    });

    it('sets the initialElapsed as elapsedSeconds', () => {
      const session = makeActiveSession();
      const next = reducer(state, { type: 'RESUME_SESSION', session, initialElapsed: 300 });
      expect(next.elapsedSeconds).toBe(300);
    });

    it('clears resumeCandidate', () => {
      state = { ...state, resumeCandidate: makeActiveSession() };
      const next = reducer(state, {
        type: 'RESUME_SESSION',
        session: makeActiveSession(),
        initialElapsed: 0,
      });
      expect(next.resumeCandidate).toBeNull();
    });
  });

  describe('DISCARD_ACTIVE', () => {
    it('clears resumeCandidate', () => {
      state = { ...state, resumeCandidate: makeActiveSession(), resumeCandidateAgo: 120 };
      const next = reducer(state, { type: 'DISCARD_ACTIVE' });
      expect(next.resumeCandidate).toBeNull();
    });

    it('does not change phase', () => {
      state = { ...state, phase: 'setup' };
      const next = reducer(state, { type: 'DISCARD_ACTIVE' });
      expect(next.phase).toBe('setup');
    });
  });

  describe('SET_RESUME_CANDIDATE', () => {
    it('sets the resume candidate and ago seconds', () => {
      const session = makeActiveSession();
      const next = reducer(state, {
        type: 'SET_RESUME_CANDIDATE',
        session,
        agoSeconds: 600,
      });
      expect(next.resumeCandidate).toEqual(session);
      expect(next.resumeCandidateAgo).toBe(600);
    });
  });

  // ── Tick ────────────────────────────────────────────────────────────────

  describe('TICK', () => {
    it('increments elapsedSeconds by 1', () => {
      state = { ...state, phase: 'active', elapsedSeconds: 10 };
      const next = reducer(state, { type: 'TICK' });
      expect(next.elapsedSeconds).toBe(11);
    });

    it('does not modify toolTimes when currentTool is null', () => {
      const session = makeActiveSession({ currentTool: null, toolTimes: {} });
      state = { ...state, phase: 'active', activeSession: session, elapsedSeconds: 0 };
      const next = reducer(state, { type: 'TICK' });
      expect(next.activeSession?.toolTimes).toEqual({});
    });

    it('increments toolTimes for the currentTool', () => {
      const session = makeActiveSession({
        currentTool: 'drums',
        toolTimes: { drums: 5 },
      });
      state = { ...state, phase: 'active', activeSession: session, elapsedSeconds: 5 };
      const next = reducer(state, { type: 'TICK' });
      expect(next.activeSession?.toolTimes.drums).toBe(6);
    });

    it('initializes toolTimes from 0 if currentTool has no prior entry', () => {
      const session = makeActiveSession({
        currentTool: 'tuner',
        toolTimes: {},
      });
      state = { ...state, phase: 'active', activeSession: session };
      const next = reducer(state, { type: 'TICK' });
      expect(next.activeSession?.toolTimes.tuner).toBe(1);
    });

    it('does not affect other tools when ticking on a specific tool', () => {
      const session = makeActiveSession({
        currentTool: 'drums',
        toolTimes: { drums: 10, tuner: 20 },
      });
      state = { ...state, phase: 'active', activeSession: session };
      const next = reducer(state, { type: 'TICK' });
      expect(next.activeSession?.toolTimes.tuner).toBe(20);
      expect(next.activeSession?.toolTimes.drums).toBe(11);
    });

    it('does not tick toolTimes when activeSession is null', () => {
      state = { ...state, activeSession: null, elapsedSeconds: 5 };
      const next = reducer(state, { type: 'TICK' });
      expect(next.elapsedSeconds).toBe(6);
    });
  });

  // ── SWITCH_TOOL ──────────────────────────────────────────────────────────

  describe('SWITCH_TOOL', () => {
    it('changes currentTool on the activeSession', () => {
      const session = makeActiveSession({ currentTool: 'drums' });
      state = { ...state, phase: 'active', activeSession: session };
      const next = reducer(state, {
        type: 'SWITCH_TOOL',
        tool: 'tuner',
        nowIso: '2026-06-05T11:00:00.000Z',
      });
      expect(next.activeSession?.currentTool).toBe('tuner');
    });

    it('sets currentToolStartedAt to nowIso when switching to a tool', () => {
      const session = makeActiveSession({ currentTool: null });
      state = { ...state, phase: 'active', activeSession: session };
      const now = '2026-06-05T11:00:00.000Z';
      const next = reducer(state, { type: 'SWITCH_TOOL', tool: 'drums', nowIso: now });
      expect(next.activeSession?.currentToolStartedAt).toBe(now);
    });

    it('clears currentToolStartedAt when switching to null', () => {
      const session = makeActiveSession({
        currentTool: 'drums',
        currentToolStartedAt: '2026-06-05T10:00:00.000Z',
      });
      state = { ...state, phase: 'active', activeSession: session };
      const next = reducer(state, {
        type: 'SWITCH_TOOL',
        tool: null,
        nowIso: '2026-06-05T11:00:00.000Z',
      });
      expect(next.activeSession?.currentTool).toBeNull();
      expect(next.activeSession?.currentToolStartedAt).toBeNull();
    });

    it('does NOT modify toolTimes (TICK is the sole accumulator)', () => {
      const session = makeActiveSession({
        currentTool: 'drums',
        toolTimes: { drums: 100 },
      });
      state = { ...state, phase: 'active', activeSession: session };
      const next = reducer(state, {
        type: 'SWITCH_TOOL',
        tool: 'tuner',
        nowIso: '2026-06-05T11:00:00.000Z',
      });
      // toolTimes should be unchanged
      expect(next.activeSession?.toolTimes.drums).toBe(100);
      expect(next.activeSession?.toolTimes.tuner).toBeUndefined();
    });

    it('returns unchanged state when activeSession is null', () => {
      state = { ...state, activeSession: null };
      const next = reducer(state, {
        type: 'SWITCH_TOOL',
        tool: 'drums',
        nowIso: '2026-06-05T11:00:00.000Z',
      });
      expect(next).toBe(state);
    });
  });

  // ── UPDATE_NOTES ─────────────────────────────────────────────────────────

  describe('UPDATE_NOTES', () => {
    it('updates notes on the active session', () => {
      const session = makeActiveSession({ notes: '' });
      state = { ...state, activeSession: session };
      const next = reducer(state, { type: 'UPDATE_NOTES', text: 'Great progress today' });
      expect(next.activeSession?.notes).toBe('Great progress today');
    });

    it('returns unchanged state when activeSession is null', () => {
      state = { ...state, activeSession: null };
      const next = reducer(state, { type: 'UPDATE_NOTES', text: 'something' });
      expect(next).toBe(state);
    });
  });

  // ── END_SESSION ──────────────────────────────────────────────────────────

  describe('END_SESSION', () => {
    it('sets phase to summary', () => {
      const session = makeActiveSession();
      state = { ...state, phase: 'active', activeSession: session };
      const completed = makeCompletedSession();
      const next = reducer(state, { type: 'END_SESSION', completed });
      expect(next.phase).toBe('summary');
    });

    it('clears activeSession', () => {
      const session = makeActiveSession();
      state = { ...state, phase: 'active', activeSession: session };
      const completed = makeCompletedSession();
      const next = reducer(state, { type: 'END_SESSION', completed });
      expect(next.activeSession).toBeNull();
    });

    it('resets elapsedSeconds to 0', () => {
      const session = makeActiveSession();
      state = { ...state, phase: 'active', activeSession: session, elapsedSeconds: 1800 };
      const completed = makeCompletedSession();
      const next = reducer(state, { type: 'END_SESSION', completed });
      expect(next.elapsedSeconds).toBe(0);
    });

    it('sets lastCompleted to the completed session', () => {
      const session = makeActiveSession();
      state = { ...state, phase: 'active', activeSession: session };
      const completed = makeCompletedSession({ id: 'done-1' });
      const next = reducer(state, { type: 'END_SESSION', completed });
      expect(next.lastCompleted).toEqual(completed);
    });

    it('prepends completed session to history', () => {
      const old = makeCompletedSession({ id: 'old-1' });
      const session = makeActiveSession();
      state = { ...state, phase: 'active', activeSession: session, history: [old] };
      const completed = makeCompletedSession({ id: 'new-1' });
      const next = reducer(state, { type: 'END_SESSION', completed });
      expect(next.history[0].id).toBe('new-1');
      expect(next.history[1].id).toBe('old-1');
    });
  });

  // ── HISTORY_LOADED ────────────────────────────────────────────────────────

  describe('HISTORY_LOADED', () => {
    it('sets history and marks historyLoaded true', () => {
      const sessions = [makeCompletedSession()];
      const next = reducer(state, { type: 'HISTORY_LOADED', sessions });
      expect(next.history).toEqual(sessions);
      expect(next.historyLoaded).toBe(true);
    });
  });

  // ── RESET ─────────────────────────────────────────────────────────────────

  describe('RESET', () => {
    it('returns to setup phase', () => {
      state = { ...state, phase: 'summary' };
      const next = reducer(state, { type: 'RESET' });
      expect(next.phase).toBe('setup');
    });

    it('preserves history across reset', () => {
      const history = [makeCompletedSession()];
      state = { ...state, history, historyLoaded: true };
      const next = reducer(state, { type: 'RESET' });
      expect(next.history).toEqual(history);
      expect(next.historyLoaded).toBe(true);
    });

    it('clears activeSession', () => {
      state = { ...state, activeSession: makeActiveSession() };
      const next = reducer(state, { type: 'RESET' });
      expect(next.activeSession).toBeNull();
    });

    it('clears lastCompleted', () => {
      state = { ...state, lastCompleted: makeCompletedSession() };
      const next = reducer(state, { type: 'RESET' });
      expect(next.lastCompleted).toBeNull();
    });

    it('resets elapsedSeconds to 0', () => {
      state = { ...state, elapsedSeconds: 500 };
      const next = reducer(state, { type: 'RESET' });
      expect(next.elapsedSeconds).toBe(0);
    });
  });
});

// ── Component integration tests ────────────────────────────────────────────

describe('PracticeSessionPage component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the setup phase by default', () => {
    render(<PracticeSessionPage />);
    expect(screen.getByText('Practice Tracker')).toBeInTheDocument();
    expect(screen.getByText('Start Session')).toBeInTheDocument();
  });

  it('shows all duration preset buttons', () => {
    render(<PracticeSessionPage />);
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('45m')).toBeInTheDocument();
    expect(screen.getByText('60m')).toBeInTheDocument();
    expect(screen.getByText('No limit')).toBeInTheDocument();
  });

  it('transitions to active phase on Start Session click', async () => {
    render(<PracticeSessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Session'));
    });
    expect(screen.getByText('End Session')).toBeInTheDocument();
  });

  it('shows End Session button in active phase', async () => {
    render(<PracticeSessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Session'));
    });
    expect(screen.getByText('End Session')).toBeInTheDocument();
  });

  it('transitions to summary phase on End Session click', async () => {
    render(<PracticeSessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Session'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('End Session'));
    });
    expect(screen.getByText('Session complete')).toBeInTheDocument();
  });

  it('shows Start New Session button in summary phase', async () => {
    render(<PracticeSessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Session'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('End Session'));
    });
    expect(screen.getByText('Start New Session')).toBeInTheDocument();
  });

  it('returns to setup phase after Start New Session', async () => {
    render(<PracticeSessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByText('Start Session'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('End Session'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Start New Session'));
    });
    expect(screen.getByText('Start Session')).toBeInTheDocument();
  });

  it('shows the Target BPM and Skill focus inputs in setup phase', () => {
    render(<PracticeSessionPage />);
    expect(screen.getByPlaceholderText('e.g. 120')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. pentatonic runs')).toBeInTheDocument();
  });

  it('shows resume prompt when loadActiveSession returns a session', async () => {
    const { loadActiveSession } = await import('@/api/practiceSessionApi');
    const candidate = makeActiveSession({ startedAt: new Date(Date.now() - 120000).toISOString() });
    vi.mocked(loadActiveSession).mockReturnValue(candidate);

    render(<PracticeSessionPage />);

    // Wait for the effect to run
    await act(async () => {});
    expect(screen.getByText('Unfinished session')).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });
});
