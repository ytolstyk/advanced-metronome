import React, { useReducer, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthGate } from '@/components/AuthGate/AuthGate';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePracticeTimer } from '@/hooks/usePracticeTimer';
import {
  saveActiveSession,
  loadActiveSession,
  clearActiveSession,
  savePracticeSession,
  loadPracticeSessions,
  loadCachedPracticeSessions,
} from '@/api/practiceSessionApi';
import {
  generatePracticePlan,
  savePracticePlan,
  loadSavedPlan,
} from '@/api/practicePlanApi';
import type {
  ToolId,
  SessionGoal,
  ActiveSession,
  CompletedSession,
  SkillLevel,
  PlanSession,
  PracticePlan,
} from '../practiceSessionTypes';
import {
  TOOL_META,
  PRESET_TAGS,
  formatDuration,
  formatShortDuration,
  computeStreak,
  computeWeeklyCalendar,
  computeNudges,
  computeWeeklyTagBreakdown,
} from '../practiceSessionUtils';
import type { CalendarDay } from '../practiceSessionUtils';
import './PracticeSessionPage.css';

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_TOOLS = Object.keys(TOOL_META) as ToolId[];
const DURATION_PRESETS = [15, 30, 45, 60] as const;
const MAX_TAG_LENGTH = 50;
const MAX_TAG_COUNT = 20;
// BPM range for practice goals (intentionally wider than the metronome's 40–300
// to accommodate very slow exercises like sight-reading at 20 bpm).
const SESSION_BPM_MIN = 20;
const SESSION_BPM_MAX = 300;
const ACTIVE_SESSION_SAVE_INTERVAL_MS = 5_000;

// ── Helpers ────────────────────────────────────────────────────────────────

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];
}

function containsTagCI(tags: string[], tag: string): boolean {
  const lower = tag.toLowerCase();
  return tags.some(t => t.toLowerCase() === lower);
}

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
  goalTags: string[];
  activeSession: ActiveSession | null;
  elapsedSeconds: number; // wall-clock elapsed, updated each tick
  history: CompletedSession[];
  historyLoaded: boolean;
  lastCompleted: CompletedSession | null;
  currentPlan: PracticePlan | null;
  planLoaded: boolean;
}

type PageAction =
  | { type: 'SET_GOAL_DURATION'; minutes: number | undefined }
  | { type: 'SET_GOAL_BPM'; raw: string }
  | { type: 'SET_GOAL_SKILL'; text: string }
  | { type: 'TOGGLE_GOAL_TOOL'; tool: ToolId }
  | { type: 'TOGGLE_GOAL_TAG'; tag: string }
  | { type: 'ADD_CUSTOM_TAG'; tag: string }
  | { type: 'APPLY_PLAN_SESSION'; session: PlanSession }
  | { type: 'PLAN_LOADED'; plan: PracticePlan | null }
  | { type: 'PLAN_GENERATED'; plan: PracticePlan }
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
    goalTags: [],
    activeSession: null,
    elapsedSeconds: 0,
    history: [],
    historyLoaded: false,
    lastCompleted: null,
    currentPlan: null,
    planLoaded: false,
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
    case 'TOGGLE_GOAL_TOOL':
      return { ...state, goalTools: toggleItem(state.goalTools, action.tool) };
    case 'TOGGLE_GOAL_TAG': {
      const lower = action.tag.toLowerCase();
      return {
        ...state,
        goalTags: containsTagCI(state.goalTags, action.tag)
          ? state.goalTags.filter(t => t.toLowerCase() !== lower)
          : [...state.goalTags, action.tag],
      };
    }
    case 'ADD_CUSTOM_TAG': {
      const trimmed = action.tag.trim();
      if (!trimmed || trimmed.length > MAX_TAG_LENGTH) return state;
      if (state.goalTags.length >= MAX_TAG_COUNT) return state;
      if (containsTagCI(state.goalTags, trimmed)) return state;
      return { ...state, goalTags: [...state.goalTags, trimmed] };
    }
    case 'APPLY_PLAN_SESSION':
      return {
        ...state,
        goalDurationMinutes: action.session.durationMin,
        goalBpmRaw: action.session.targetBpm ? String(action.session.targetBpm) : '',
        goalSkillFocus: action.session.skillFocus,
        goalTools: action.session.tools,
        goalTags: [],
      };
    case 'PLAN_LOADED':
      return { ...state, currentPlan: action.plan, planLoaded: true };
    case 'PLAN_GENERATED':
      return { ...state, currentPlan: action.plan, planLoaded: true };
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
      const savedToolSeconds = Object.values(session.toolTimes).reduce((a, b) => a + (b ?? 0), 0);
      const unaccountedSeconds = Math.max(0, action.initialElapsed - savedToolSeconds);
      const toolTimes =
        session.currentTool && unaccountedSeconds > 0
          ? { ...session.toolTimes, [session.currentTool]: (session.toolTimes[session.currentTool] ?? 0) + unaccountedSeconds }
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
      return {
        ...initialState(),
        history: state.history,
        historyLoaded: state.historyLoaded,
        currentPlan: state.currentPlan,
        planLoaded: state.planLoaded,
      };
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

const PerToolBreakdown = React.memo(function PerToolBreakdown({ toolTimes }: { toolTimes: Partial<Record<ToolId, number>> }) {
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
});

const WeeklyCalendar = React.memo(function WeeklyCalendar({ calendar }: { calendar: CalendarDay[] }) {
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
});

const HISTORY_CAP_DEFAULT = 10;
const HISTORY_CAP_FILTERED = 50;

const SessionHistoryList = React.memo(function SessionHistoryList({
  sessions,
  emptyMessage = 'No sessions yet. Start your first one!',
  maxSessions = HISTORY_CAP_DEFAULT,
}: {
  sessions: CompletedSession[];
  emptyMessage?: string;
  maxSessions?: number;
}) {
  if (sessions.length === 0) {
    return <p className="text-sm text-[#555] italic">{emptyMessage}</p>;
  }
  const displayed = sessions.slice(0, maxSessions);
  return (
    <div>
      {displayed.map(s => {
        const toolNames = (Object.entries(s.toolTimes) as [ToolId, number][])
          .filter(([, sec]) => sec > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([id]) => TOOL_META[id].short)
          .join(' · ');
        const tags = s.goal.tags ?? [];
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
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map(tag => (
                  <span key={tag} className="ps-tag-chip">{tag}</span>
                ))}
              </div>
            )}
            {s.notes && <div className="ps-history-notes">{s.notes}</div>}
          </div>
        );
      })}
    </div>
  );
});

const TagInputSection = React.memo(function TagInputSection({
  onAdd,
  existingTags,
}: {
  onAdd: (tag: string) => void;
  existingTags: string[];
}) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const isDuplicate = !!trimmed && existingTags.some(t => t.toLowerCase() === trimmed.toLowerCase());
  const isAtCap = existingTags.length >= MAX_TAG_COUNT;
  const isDisabled = !trimmed || isDuplicate || isAtCap;

  function submit() {
    if (isDisabled) return;
    onAdd(trimmed);
    setValue('');
  }

  return (
    <div className="mt-1">
      <div className="flex gap-1.5">
        <Input
          type="text"
          placeholder="Add custom tag…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          maxLength={MAX_TAG_LENGTH}
          className="bg-[#0d0d0d] border-[#2a2a2a] text-[#e0e0e0] text-xs h-8 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={submit}
          disabled={isDisabled}
          className="h-8 px-3 text-xs"
        >
          Add
        </Button>
      </div>
      {isDuplicate && (
        <p className="text-xs text-[#888] mt-0.5">Already added</p>
      )}
      {!isDuplicate && isAtCap && (
        <p className="text-xs text-[#888] mt-0.5">Tag limit reached ({MAX_TAG_COUNT})</p>
      )}
    </div>
  );
});

// ── Plan Generator ─────────────────────────────────────────────────────────

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
// 60 is intentionally included; all values render from the same map
const DAILY_MINUTE_PRESETS = [5, 10, 20, 30, 60] as const;
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function PlanGeneratorSection({
  plan,
  onPlanGenerated,
  onApply,
}: {
  plan: PracticePlan | null;
  onPlanGenerated: (plan: PracticePlan) => void;
  onApply: (session: PlanSession) => void;
}) {
  const [formVisible, setFormVisible] = useState(!plan);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Intermediate');
  const [goal, setGoal] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(20);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number>(0);

  // One-shot: when a saved plan first arrives (async cloud load), auto-collapse to plan view.
  // A ref prevents re-collapsing if the user has intentionally opened the form via "Regenerate".
  const didReceivePlan = useRef(!!plan);
  useEffect(() => {
    if (plan && !didReceivePlan.current) {
      didReceivePlan.current = true;
      setFormVisible(false);
    }
  }, [plan]);

  function toggleDay(day: number) {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const newPlan = await generatePracticePlan({ skillLevel, goal, dailyMinutes, daysOfWeek });
      // Notify the parent immediately so the plan is in the reducer's state
      onPlanGenerated(newPlan);
      setFormVisible(false);
      setExpandedWeek(0);
      // Persist in the background — don't block the UI on the cloud round-trip
      savePracticePlan(newPlan).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate plan.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="ps-section">
      <div className="ps-plan-header">
        <div className="ps-section-title">AI Practice Plan</div>
        {plan && (
          <button
            className="ps-plan-toggle-btn"
            onClick={() => setFormVisible(v => !v)}
          >
            {formVisible ? 'View plan' : 'Regenerate'}
          </button>
        )}
      </div>

      {formVisible && (
        <div className="ps-plan-form">
          <div className="ps-plan-form-row">
            <Label className="text-[#888] text-xs mb-1.5 block">Skill level</Label>
            <ToggleGroup
              type="single"
              value={skillLevel}
              onValueChange={v => { if (v) setSkillLevel(v as SkillLevel); }}
              className="flex-wrap"
            >
              {SKILL_LEVELS.map(lvl => (
                <ToggleGroupItem key={lvl} value={lvl} className="text-xs px-3">
                  {lvl}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="ps-plan-form-row">
            <Label htmlFor="ps-plan-goal" className="text-[#888] text-xs mb-1 block">
              Primary goal
            </Label>
            <Input
              id="ps-plan-goal"
              type="text"
              placeholder="e.g. learn sweep picking at 140 BPM"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              maxLength={300}
              className="bg-[#0d0d0d] border-[#2a2a2a] text-[#e0e0e0] text-sm h-8"
            />
          </div>

          <div className="ps-plan-form-row">
            <Label className="text-[#888] text-xs mb-1.5 block">Time per session</Label>
            <ToggleGroup
              type="single"
              value={String(dailyMinutes)}
              onValueChange={v => { if (v) setDailyMinutes(Number(v)); }}
              className="flex-wrap"
            >
              {DAILY_MINUTE_PRESETS.map(m => (
                <ToggleGroupItem key={m} value={String(m)} className="text-xs px-3">
                  {m}m
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="ps-plan-form-row">
            <Label className="text-[#888] text-xs mb-1.5 block">Practice days</Label>
            <div className="flex gap-1">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={label}
                  onClick={() => toggleDay(idx)}
                  className={cn(
                    'w-8 h-8 rounded text-xs border transition-colors duration-100',
                    daysOfWeek.includes(idx)
                      ? 'bg-[#1d4ed8] border-[#2563eb] text-white'
                      : 'bg-transparent border-[#333] text-[#666] hover:border-[#555] hover:text-[#999]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-[#ef4444] mt-1">{error}</p>}

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating || !goal.trim() || daysOfWeek.length === 0}
            className="mt-2"
          >
            {generating ? 'Generating…' : plan ? 'Regenerate Plan' : 'Generate Plan'}
          </Button>
        </div>
      )}

      {plan && !formVisible && (
        <div className="ps-plan-weeks">
          <p className="text-xs text-[#555] mb-3">
            {plan.weeks.length}-week plan for <span className="text-[#888]">{plan.input.goal}</span>
          </p>
          {plan.weeks.map((week, wi) => (
            <div key={wi} className="ps-plan-week">
              <button
                className="ps-plan-week-header"
                onClick={() => setExpandedWeek(expandedWeek === wi ? -1 : wi)}
              >
                <span>Week {wi + 1}</span>
                <span className="ps-plan-week-meta">
                  {week.sessions.length} session{week.sessions.length !== 1 ? 's' : ''}
                </span>
                <span className="ps-plan-week-chevron">{expandedWeek === wi ? '▲' : '▼'}</span>
              </button>

              {expandedWeek === wi && (
                <div className="ps-plan-sessions">
                  {week.sessions.map((session, si) => (
                    <div key={si} className="ps-plan-session">
                      <div className="ps-plan-session-top">
                        <span className="ps-plan-session-focus">{session.skillFocus}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ps-plan-start-btn"
                          onClick={() => onApply(session)}
                        >
                          Use
                        </Button>
                      </div>
                      <div className="ps-plan-session-meta">
                        <span className="ps-plan-chip">{session.durationMin}m</span>
                        {session.targetBpm && (
                          <span className="ps-plan-chip">{session.targetBpm} BPM</span>
                        )}
                      </div>
                      {session.tools.length > 0 && (
                        <div className="ps-plan-session-tools">
                          {session.tools.map(tool => (
                            <a
                              key={tool}
                              href={TOOL_META[tool].route}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ps-plan-tool-chip"
                            >
                              {TOOL_META[tool].short}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function PracticeSessionPage() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  // Filter-tag state lives here, not in the reducer: it is transient UI state
  // that has no cross-phase business meaning and should not inflate the action union.
  // Cleared explicitly at RESET dispatch sites so history filter doesn't persist
  // across session boundaries.
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // On mount: immediately show cached history, then refresh from cloud (stale-while-revalidate).
  useEffect(() => {
    const active = loadActiveSession();
    if (active) {
      const agoSeconds = Math.floor(
        (Date.now() - new Date(active.startedAt).getTime()) / 1000,
      );
      dispatch({ type: 'SET_RESUME_CANDIDATE', session: active, agoSeconds });
    }

    // Dispatch cached snapshot first so the UI renders without waiting for the network.
    const cached = loadCachedPracticeSessions();
    dispatch({ type: 'HISTORY_LOADED', sessions: cached });

    // Then fetch fresh data from the cloud and replace the cache when it arrives.
    loadPracticeSessions()
      .then(sessions => dispatch({ type: 'HISTORY_LOADED', sessions }))
      .catch(() => {}); // cached snapshot already visible; cloud failure is silent

    loadSavedPlan()
      .then(plan => dispatch({ type: 'PLAN_LOADED', plan }))
      .catch(() => dispatch({ type: 'PLAN_LOADED', plan: null }));
  }, []);

  // Throttled localStorage persist: write at most every 5 seconds to avoid
  // synchronous JSON.stringify + setItem on every TICK (60x/min).
  const lastActiveSaveRef = useRef(0);
  useEffect(() => {
    if (!state.activeSession) return;
    const now = Date.now();
    if (now - lastActiveSaveRef.current < ACTIVE_SESSION_SAVE_INTERVAL_MS) return;
    lastActiveSaveRef.current = now;
    saveActiveSession(state.activeSession);
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

  // Keep a ref so endSession always sees the latest session without being
  // recreated every TICK (which would otherwise defeat auto-end memo deps).
  const activeSessionRef = useRef(state.activeSession);
  useEffect(() => {
    activeSessionRef.current = state.activeSession;
  }, [state.activeSession]);

  const endSession = useCallback(() => {
    const session = activeSessionRef.current;
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
  }, []);

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
      targetBpm: !isNaN(bpmNum) && bpmNum >= SESSION_BPM_MIN && bpmNum <= SESSION_BPM_MAX ? bpmNum : undefined,
      skillFocus: state.goalSkillFocus.trim() || undefined,
      tools: state.goalTools,
      tags: state.goalTags.length > 0 ? state.goalTags : undefined,
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

  const handleApplyPlanSession = useCallback(
    (session: PlanSession) => dispatch({ type: 'APPLY_PLAN_SESSION', session }),
    [],
  );

  const handlePlanGenerated = useCallback(
    (plan: PracticePlan) => dispatch({ type: 'PLAN_GENERATED', plan }),
    [],
  );

  const handleAddCustomTag = useCallback(
    (tag: string) => dispatch({ type: 'ADD_CUSTOM_TAG', tag }),
    [],
  );

  const streak   = useMemo(() => computeStreak(state.history), [state.history]);
  const calendar = useMemo(() => computeWeeklyCalendar(state.history), [state.history]);
  const nudges   = useMemo(() => computeNudges(state.history), [state.history]);
  const tagBreakdown = useMemo(
    () => computeWeeklyTagBreakdown(state.history, calendar.map(d => d.dateKey)),
    [state.history, calendar],
  );
  const sortedTagBreakdown = useMemo(
    () => Object.entries(tagBreakdown).sort(([, a], [, b]) => b - a),
    [tagBreakdown],
  );
  const filteredHistory = useMemo(
    () => filterTags.length === 0
      ? state.history
      : state.history.filter(s => s.goal.tags?.some(t => filterTags.includes(t))),
    [state.history, filterTags],
  );
  const allHistoryTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.history) {
      for (const tag of s.goal.tags ?? []) set.add(tag);
    }
    return Array.from(set).sort();
  }, [state.history]);
  // Must be memoized: TICK fires every second during active phase.
  const untaggedSessionCount = useMemo(
    () => state.history.filter(s => (s.goal.tags ?? []).length === 0).length,
    [state.history],
  );

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
                min={SESSION_BPM_MIN}
                max={SESSION_BPM_MAX}
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

          <div className="mb-4">
            <Label className="text-[#888] text-xs mb-2 block">
              Tags <span className="text-[#555]">(optional)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => dispatch({ type: 'TOGGLE_GOAL_TAG', tag })}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs border transition-colors duration-100',
                    containsTagCI(state.goalTags, tag)
                      ? 'ps-tag-chip-active'
                      : 'bg-transparent border-[#333] text-[#888] hover:border-[#555] hover:text-[#bbb]',
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
            {state.goalTags.filter(t => !containsTagCI(PRESET_TAGS, t)).map(tag => (
              <button
                key={tag}
                onClick={() => dispatch({ type: 'TOGGLE_GOAL_TAG', tag })}
                className="ps-tag-chip ps-tag-chip-active mr-1.5 mb-1.5"
              >
                {tag} ×
              </button>
            ))}
            <TagInputSection onAdd={handleAddCustomTag} existingTags={state.goalTags} />
          </div>

          <Button onClick={startSession}>Start Session</Button>
        </div>
      )}

      {state.phase === 'setup' && (
        authStatus === 'authenticated' ? (
          <PlanGeneratorSection
            plan={state.currentPlan}
            onPlanGenerated={handlePlanGenerated}
            onApply={handleApplyPlanSession}
          />
        ) : (
          <div className="ps-section">
            <div className="ps-section-title">AI Practice Plan</div>
            <AuthGate message="Sign in to generate an AI-powered 4-week practice plan" />
          </div>
        )
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
          {(state.lastCompleted.goal.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {state.lastCompleted.goal.tags?.map(tag => (
                <span key={tag} className="ps-tag-chip">{tag}</span>
              ))}
            </div>
          )}
          {state.lastCompleted.notes && (
            <p className="text-sm text-[#888] italic mb-4">{state.lastCompleted.notes}</p>
          )}
          <Button size="sm" onClick={() => { setFilterTags([]); dispatch({ type: 'RESET' }); }}>
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

            {sortedTagBreakdown.length > 0 && (
              <div className="ps-tag-breakdown">
                {sortedTagBreakdown.map(([tag, secs]) => (
                  <span key={tag} className="ps-tag-breakdown-item">
                    <strong>{tag}</strong> {formatShortDuration(secs)}
                  </span>
                ))}
              </div>
            )}

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
            {allHistoryTags.length > 0 && (
              <div className="ps-tag-filter-bar">
                <span className="text-[#444] text-xs">Filter:</span>
                {allHistoryTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setFilterTags(prev => toggleItem(prev, tag))}
                    className={cn(
                      'ps-tag-chip',
                      filterTags.includes(tag) && 'ps-tag-chip-active',
                    )}
                  >
                    {tag}
                  </button>
                ))}
                {filterTags.length > 0 && (
                  <button
                    onClick={() => setFilterTags([])}
                    className="text-xs text-[#555] hover:text-[#999] ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {filterTags.length > 0 && untaggedSessionCount > 0 && (
              <p className="text-xs text-[#444] mb-2">
                {untaggedSessionCount} untagged session{untaggedSessionCount !== 1 ? 's' : ''} hidden
              </p>
            )}
            <SessionHistoryList
              sessions={filteredHistory}
              emptyMessage="No sessions match the selected filters."
              maxSessions={filterTags.length > 0 ? HISTORY_CAP_FILTERED : HISTORY_CAP_DEFAULT}
            />
          </div>
        </>
      )}
    </div>
  );
}
