import { useReducer, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePracticeTimer } from '@/hooks/usePracticeTimer';
import {
  saveActiveSession,
  loadActiveSession,
  clearActiveSession,
  savePracticeSession,
  loadPracticeSessions,
} from '@/api/practiceSessionApi';
import type {
  ToolId,
  SessionGoal,
  ActiveSession,
  CompletedSession,
} from '../practiceSessionTypes';
import {
  TOOL_META,
  formatDuration,
  formatShortDuration,
  computeStreak,
  computeWeeklyCalendar,
  computeNudges,
} from '../practiceSessionUtils';
import type { CalendarDay } from '../practiceSessionUtils';
import './PracticeSessionPage.css';

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_TOOLS = Object.keys(TOOL_META) as ToolId[];
const DURATION_PRESETS = [15, 30, 45, 60] as const;

// ── Reducer ────────────────────────────────────────────────────────────────

type PagePhase = 'setup' | 'active' | 'summary';

interface PageState {
  phase: PagePhase;
  resumeCandidate: ActiveSession | null;
  resumeCandidateAgo: number; // seconds since the candidate session started
  goalDurationMinutes: number | undefined;
  goalBpmRaw: string;
  goalSkillFocus: string;
  goalTools: ToolId[];
  activeSession: ActiveSession | null;
  elapsedSeconds: number; // wall-clock elapsed, updated each tick
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

function initialState(): PageState {
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
    case 'RESUME_SESSION': {
      const session = action.session;
      const tickedTotal = Object.values(session.toolTimes).reduce((a, b) => a + (b ?? 0), 0);
      const gap = Math.max(0, action.initialElapsed - tickedTotal);
      const toolTimes =
        session.currentTool && gap > 0
          ? { ...session.toolTimes, [session.currentTool]: (session.toolTimes[session.currentTool] ?? 0) + gap }
          : session.toolTimes;
      return {
        ...state,
        phase: 'active',
        activeSession: { ...session, toolTimes },
        elapsedSeconds: action.initialElapsed,
        resumeCandidate: null,
      };
    }
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
      return { ...initialState(), history: state.history, historyLoaded: state.historyLoaded };
    default:
      return state;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TimerDisplay({
  elapsedSeconds,
  goalSeconds,
}: {
  elapsedSeconds: number;
  goalSeconds: number | undefined;
}) {
  if (goalSeconds !== undefined) {
    const remaining = Math.max(0, goalSeconds - elapsedSeconds);
    const cls = remaining < 60 ? 'ps-timer-warn' : remaining < 300 ? 'ps-timer-countdown' : '';
    return <div className={cn('ps-timer', cls)}>{formatDuration(remaining)}</div>;
  }
  return <div className="ps-timer">{formatDuration(elapsedSeconds)}</div>;
}

function PerToolBreakdown({ toolTimes }: { toolTimes: Partial<Record<ToolId, number>> }) {
  const entries = (Object.entries(toolTimes) as [ToolId, number][]).filter(
    ([, s]) => s > 0,
  );
  if (entries.length === 0) return null;
  const maxSecs = Math.max(1, ...entries.map(([, s]) => s));
  return (
    <div>
      {entries
        .sort(([, a], [, b]) => b - a)
        .map(([id, secs]) => (
          <div key={id} className="ps-tool-bar-row">
            <span className="ps-tool-bar-label">{TOOL_META[id].label}</span>
            <div className="ps-tool-bar-track">
              <div
                className="ps-tool-bar-fill"
                style={{ width: `${(secs / maxSecs) * 100}%` }}
              />
            </div>
            <span className="ps-tool-bar-time">{formatShortDuration(secs)}</span>
          </div>
        ))}
    </div>
  );
}

function WeeklyCalendar({ calendar }: { calendar: CalendarDay[] }) {
  return (
    <div className="ps-calendar">
      {calendar.map(day => (
        <div key={day.dateKey} className="ps-calendar-day">
          <div
            className={cn(
              'ps-calendar-dot',
              day.hasSession ? 'ps-calendar-dot-practiced' : 'ps-calendar-dot-empty',
              day.isToday && 'ps-calendar-dot-today',
            )}
          >
            {day.hasSession ? formatShortDuration(day.durationSeconds) : ''}
          </div>
          <span className="ps-calendar-day-label">{day.dayLabel}</span>
        </div>
      ))}
    </div>
  );
}

function SessionHistoryList({ sessions }: { sessions: CompletedSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-[#555] italic">No sessions yet. Start your first one!</p>
    );
  }
  return (
    <div>
      {sessions.slice(0, 10).map(s => {
        const toolNames = (Object.entries(s.toolTimes) as [ToolId, number][])
          .filter(([, sec]) => sec > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([id]) => TOOL_META[id].short)
          .join(' · ');
        return (
          <div key={s.id} className="ps-history-item">
            <div className="ps-history-date">
              {new Date(s.completedAt).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="ps-history-duration">{formatShortDuration(s.durationSeconds)}</div>
            {toolNames && <div className="ps-history-tools">{toolNames}</div>}
            {s.notes && <div className="ps-history-notes">{s.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function PracticeSessionPage() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // On mount: restore any in-progress session + load history
  useEffect(() => {
    const active = loadActiveSession();
    if (active) {
      const agoSeconds = Math.floor(
        (Date.now() - new Date(active.startedAt).getTime()) / 1000,
      );
      dispatch({ type: 'SET_RESUME_CANDIDATE', session: active, agoSeconds });
    }
    loadPracticeSessions()
      .then(sessions => dispatch({ type: 'HISTORY_LOADED', sessions }))
      .catch(() => dispatch({ type: 'HISTORY_LOADED', sessions: [] }));
  }, []);

  // Persist active session to localStorage after every tick/change
  useEffect(() => {
    if (state.activeSession) saveActiveSession(state.activeSession);
  }, [state.activeSession]);

  // Ticker: increment elapsed + current tool time
  const onTick = useCallback(() => {
    dispatch({ type: 'TICK' });
  }, []);

  usePracticeTimer(state.phase === 'active', onTick);

  const activeGoalSeconds =
    state.activeSession?.goal.durationMinutes !== undefined
      ? state.activeSession.goal.durationMinutes * 60
      : undefined;

  const endSession = useCallback(() => {
    const session = state.activeSession;
    if (!session) return;
    const nowIso = new Date().toISOString();
    const completed: CompletedSession = {
      id: session.id,
      goal: session.goal,
      startedAt: session.startedAt,
      completedAt: nowIso,
      durationSeconds: Math.floor(
        (new Date(nowIso).getTime() - new Date(session.startedAt).getTime()) / 1000,
      ),
      toolTimes: session.toolTimes,
      notes: session.notes,
    };
    clearActiveSession();
    savePracticeSession(completed).catch(() => {});
    dispatch({ type: 'END_SESSION', completed });
  }, [state.activeSession]);

  // Auto-end when countdown hits zero
  useEffect(() => {
    if (
      state.phase === 'active' &&
      activeGoalSeconds !== undefined &&
      state.elapsedSeconds >= activeGoalSeconds
    ) {
      endSession();
    }
  }, [state.phase, state.elapsedSeconds, activeGoalSeconds, endSession]);

  function buildGoal(): SessionGoal {
    const bpmNum = parseInt(state.goalBpmRaw, 10);
    return {
      durationMinutes: state.goalDurationMinutes,
      targetBpm: !isNaN(bpmNum) && bpmNum >= 20 && bpmNum <= 300 ? bpmNum : undefined,
      skillFocus: state.goalSkillFocus.trim() || undefined,
      tools: state.goalTools,
    };
  }

  function startSession() {
    const nowIso = new Date().toISOString();
    const firstTool = state.goalTools[0] ?? null;
    const session: ActiveSession = {
      id: crypto.randomUUID(),
      goal: buildGoal(),
      startedAt: nowIso,
      currentTool: firstTool,
      currentToolStartedAt: firstTool ? nowIso : null,
      toolTimes: {},
      notes: '',
    };
    saveActiveSession(session);
    dispatch({ type: 'START_SESSION', session });
  }

  function switchTool(tool: ToolId | null) {
    dispatch({ type: 'SWITCH_TOOL', tool, nowIso: new Date().toISOString() });
  }

  const streak = useMemo(() => computeStreak(state.history), [state.history]);
  const calendar = useMemo(() => computeWeeklyCalendar(state.history), [state.history]);
  const nudges = useMemo(() => computeNudges(state.history), [state.history]);
  const activeGoalTools = state.activeSession?.goal.tools ?? [];

  return (
    <div className="ps-page">
      <h1 className="text-2xl font-bold text-[#f0f0f0] mb-1">Practice Tracker</h1>
      <p className="text-sm text-[#666] mb-5">Set a goal, track your time, build a streak.</p>

      {/* Resume prompt */}
      {state.resumeCandidate && state.phase === 'setup' && (
        <div className="ps-section mb-4">
          <div className="ps-section-title">Unfinished session</div>
          <p className="text-sm text-[#aaa] mb-3">
            You have a session started {formatShortDuration(state.resumeCandidateAgo)} ago.
            Resume it?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                const candidate = state.resumeCandidate!;
                const initialElapsed = Math.floor(
                  (Date.now() - new Date(candidate.startedAt).getTime()) / 1000,
                );
                dispatch({ type: 'RESUME_SESSION', session: candidate, initialElapsed });
              }}
            >
              Resume
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearActiveSession();
                dispatch({ type: 'DISCARD_ACTIVE' });
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* ── Setup Phase ── */}
      {state.phase === 'setup' && (
        <div className="ps-section">
          <div className="ps-section-title">Session goal</div>

          <div className="mb-4">
            <Label className="text-[#888] text-xs mb-2 block">Duration</Label>
            <ToggleGroup
              type="single"
              value={
                state.goalDurationMinutes !== undefined
                  ? String(state.goalDurationMinutes)
                  : 'none'
              }
              onValueChange={val => {
                if (!val || val === 'none') {
                  dispatch({ type: 'SET_GOAL_DURATION', minutes: undefined });
                } else {
                  dispatch({ type: 'SET_GOAL_DURATION', minutes: Number(val) });
                }
              }}
              className="flex-wrap"
            >
              {DURATION_PRESETS.map(min => (
                <ToggleGroupItem key={min} value={String(min)} className="text-xs px-3">
                  {min}m
                </ToggleGroupItem>
              ))}
              <ToggleGroupItem value="none" className="text-xs px-3">
                No limit
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="mb-4">
            <Label className="text-[#888] text-xs mb-2 block">Tools to practice</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TOOLS.map(tool => (
                <button
                  key={tool}
                  onClick={() => dispatch({ type: 'TOGGLE_GOAL_TOOL', tool })}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs border transition-colors duration-100',
                    state.goalTools.includes(tool)
                      ? 'bg-[#1d4ed8] border-[#2563eb] text-white'
                      : 'bg-transparent border-[#333] text-[#888] hover:border-[#555] hover:text-[#bbb]',
                  )}
                >
                  {TOOL_META[tool].short}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <Label htmlFor="ps-bpm" className="text-[#888] text-xs mb-1 block">
                Target BPM <span className="text-[#555]">(optional)</span>
              </Label>
              <Input
                id="ps-bpm"
                type="number"
                min={20}
                max={300}
                placeholder="e.g. 120"
                value={state.goalBpmRaw}
                onChange={e => dispatch({ type: 'SET_GOAL_BPM', raw: e.target.value })}
                className="bg-[#0d0d0d] border-[#2a2a2a] text-[#e0e0e0] text-sm h-8"
              />
            </div>
            <div>
              <Label htmlFor="ps-skill" className="text-[#888] text-xs mb-1 block">
                Skill focus <span className="text-[#555]">(optional)</span>
              </Label>
              <Input
                id="ps-skill"
                type="text"
                placeholder="e.g. pentatonic runs"
                value={state.goalSkillFocus}
                onChange={e => dispatch({ type: 'SET_GOAL_SKILL', text: e.target.value })}
                className="bg-[#0d0d0d] border-[#2a2a2a] text-[#e0e0e0] text-sm h-8"
              />
            </div>
          </div>

          <Button onClick={startSession}>Start Session</Button>
        </div>
      )}

      {/* ── Active Phase ── */}
      {state.phase === 'active' && state.activeSession && (
        <>
          <div className="ps-section">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="ps-section-title">
                  {activeGoalSeconds !== undefined ? 'Time remaining' : 'Elapsed'}
                </div>
                <TimerDisplay
                  elapsedSeconds={state.elapsedSeconds}
                  goalSeconds={activeGoalSeconds}
                />
                {(state.activeSession.goal.skillFocus ||
                  state.activeSession.goal.targetBpm) && (
                  <p className="text-xs text-[#666] mt-1">
                    {state.activeSession.goal.skillFocus && (
                      <span>Focus: {state.activeSession.goal.skillFocus}</span>
                    )}
                    {state.activeSession.goal.targetBpm && (
                      <span>
                        {state.activeSession.goal.skillFocus ? ' · ' : ''}
                        {state.activeSession.goal.targetBpm} BPM
                      </span>
                    )}
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={endSession}>
                End Session
              </Button>
            </div>
          </div>

          {activeGoalTools.length > 0 && (
            <div className="ps-section">
              <div className="ps-section-title">Now practicing</div>
              <div className="flex flex-wrap gap-3 mb-3">
                {activeGoalTools.map(tool => (
                  <div key={tool} className="flex flex-col items-center gap-1">
                    <button
                      onClick={() =>
                        switchTool(
                          state.activeSession?.currentTool === tool ? null : tool,
                        )
                      }
                      className={cn(
                        'px-3 py-1.5 rounded text-sm border transition-colors duration-100',
                        state.activeSession?.currentTool === tool
                          ? 'bg-[#1d4ed8] border-[#2563eb] text-white'
                          : 'bg-transparent border-[#333] text-[#888] hover:border-[#555] hover:text-[#bbb]',
                      )}
                    >
                      {TOOL_META[tool].short}
                    </button>
                    <a
                      href={
                        tool === 'metronome' && state.activeSession?.goal.targetBpm
                          ? `${TOOL_META[tool].route}?bpm=${state.activeSession.goal.targetBpm}`
                          : TOOL_META[tool].route
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.6rem] text-[#555] hover:text-[#888] no-underline"
                    >
                      Open →
                    </a>
                  </div>
                ))}
              </div>
              <PerToolBreakdown toolTimes={state.activeSession.toolTimes} />
            </div>
          )}

          <div className="ps-section">
            <div className="ps-section-title">Session notes</div>
            <textarea
              className="ps-notes"
              placeholder="What did you work on? Any breakthroughs or things to revisit…"
              value={state.activeSession.notes}
              onChange={e => dispatch({ type: 'UPDATE_NOTES', text: e.target.value })}
            />
          </div>
        </>
      )}

      {/* ── Summary Phase ── */}
      {state.phase === 'summary' && state.lastCompleted && (
        <div className="ps-section">
          <div className="ps-section-title">Session complete</div>
          <p className="text-3xl font-bold text-[#f0f0f0] mb-1">
            {formatShortDuration(state.lastCompleted.durationSeconds)}
          </p>
          {state.lastCompleted.goal.skillFocus && (
            <p className="text-sm text-[#666] mb-3">
              Focus: {state.lastCompleted.goal.skillFocus}
            </p>
          )}
          {Object.keys(state.lastCompleted.toolTimes).length > 0 && (
            <div className="mb-3">
              <PerToolBreakdown toolTimes={state.lastCompleted.toolTimes} />
            </div>
          )}
          {state.lastCompleted.notes && (
            <p className="text-sm text-[#888] italic mb-4">{state.lastCompleted.notes}</p>
          )}
          <Button size="sm" onClick={() => dispatch({ type: 'RESET' })}>
            Start New Session
          </Button>
        </div>
      )}

      {/* ── History Panel ── */}
      {state.historyLoaded && (
        <>
          <div className="ps-section mt-4">
            <div className="flex items-center gap-4 mb-4">
              <div>
                <div className="ps-section-title">Streak</div>
                <div className="ps-streak">
                  <span className="ps-streak-number">{streak}</span>
                  <span className="ps-streak-label">
                    day{streak !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <div className="ps-section-title mb-2">This week</div>
                <WeeklyCalendar calendar={calendar} />
              </div>
            </div>

            {nudges.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {nudges.map((msg) => (
                  <div key={msg} className="ps-nudge">
                    <span>⏰</span>
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ps-section">
            <div className="ps-section-title">Recent sessions</div>
            <SessionHistoryList sessions={state.history} />
          </div>
        </>
      )}
    </div>
  );
}
