import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';
import { loadFromStorage, saveToStorage } from './storageUtils';
import type { ActiveSession, CompletedSession } from '../practiceSessionTypes';

const client = generateClient<Schema>();

const LS_HISTORY_KEY = 'practice-session.history';
const LS_ACTIVE_KEY = 'practice-session.active';

export function saveActiveSession(session: ActiveSession): void {
  saveToStorage(LS_ACTIVE_KEY, session);
}

export function loadActiveSession(): ActiveSession | null {
  return loadFromStorage<ActiveSession | null>(LS_ACTIVE_KEY, null);
}

export function clearActiveSession(): void {
  localStorage.removeItem(LS_ACTIVE_KEY);
}

export async function savePracticeSession(session: CompletedSession): Promise<void> {
  const history = loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
  history.unshift(session);
  saveToStorage(LS_HISTORY_KEY, history);

  if (!(await isAuthenticated())) return;
  try {
    await client.models.PracticeSession.create({
      goalDurationMinutes: session.goal.durationMinutes ?? null,
      goalBpm: session.goal.targetBpm ?? null,
      goalSkill: session.goal.skillFocus ?? null,
      goalToolsJson: JSON.stringify(session.goal.tools),
      actualDurationSeconds: session.durationSeconds,
      toolTimesJson: JSON.stringify(session.toolTimes),
      notes: session.notes || null,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    });
  } catch {
    // localStorage already saved; cloud failure is silent
  }
}

export async function loadPracticeSessions(): Promise<CompletedSession[]> {
  if (!(await isAuthenticated())) {
    return loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
  }
  try {
    const { data: records } = await client.models.PracticeSession.list();
    if (!records) return loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
    const sessions: CompletedSession[] = [];
    for (const r of records) {
      if (r == null) continue;
      try {
        sessions.push({
          id: r.id,
          goal: {
            durationMinutes: r.goalDurationMinutes ?? undefined,
            targetBpm: r.goalBpm ?? undefined,
            skillFocus: r.goalSkill ?? undefined,
            tools: r.goalToolsJson ? (JSON.parse(r.goalToolsJson) as CompletedSession['goal']['tools']) : [],
          },
          startedAt: r.startedAt ?? r.completedAt,
          completedAt: r.completedAt,
          durationSeconds: r.actualDurationSeconds,
          toolTimes: r.toolTimesJson ? (JSON.parse(r.toolTimesJson) as CompletedSession['toolTimes']) : {},
          notes: r.notes ?? '',
        });
      } catch {
        // skip corrupted records
      }
    }
    sessions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    saveToStorage(LS_HISTORY_KEY, sessions);
    return sessions;
  } catch {
    return loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
  }
}
