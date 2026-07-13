import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';
import { loadFromStorage, saveToStorage } from './storageUtils';
import { TOOL_META } from '../practiceSessionUtils';
import type { ActiveSession, CompletedSession, ToolId } from '../practiceSessionTypes';

const VALID_TOOL_IDS = new Set(Object.keys(TOOL_META));

// Fetch at most one year of sessions per cloud refresh. Enough for all
// derived stats (streak, nudges, weekly breakdown) while bounding serial RTTs.
const CLOUD_HISTORY_PAGE_LIMIT = 365;
// Mirror the client-side constraints so cloud-sourced data can't bypass them.
const MAX_TAG_LENGTH = 50;
const MAX_TAG_COUNT = 20;
// Safety cap on pagination: guards against infinite loops from a buggy paginator.
const MAX_PAGES = 20;

function parseStringArray(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= MAX_TAG_LENGTH)
      .slice(0, MAX_TAG_COUNT);
  } catch { return []; }
}

function parseToolIds(json: string | null | undefined): ToolId[] {
  try {
    const parsed = JSON.parse(json ?? '[]');
    return Array.isArray(parsed) && parsed.every((t): t is ToolId => typeof t === 'string' && VALID_TOOL_IDS.has(t))
      ? parsed : [];
  } catch { return []; }
}

function parseToolTimes(json: string | null | undefined): Partial<Record<ToolId, number>> {
  try {
    const parsed = JSON.parse(json ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([k, v]) => VALID_TOOL_IDS.has(k) && typeof v === 'number'),
    ) as Partial<Record<ToolId, number>>;
  } catch { return {}; }
}

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

/** Synchronous — returns whatever is in localStorage right now. */
export function loadCachedPracticeSessions(): CompletedSession[] {
  return loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
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
      goalTagsJson: JSON.stringify(session.goal.tags ?? []),
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

/**
 * Fetches sessions from the cloud (authenticated) or localStorage (unauthenticated).
 *
 * Callers should dispatch the cached snapshot first (via loadCachedPracticeSessions)
 * so the UI renders immediately, then dispatch the result of this function when it
 * resolves — stale-while-revalidate pattern.
 */
export async function loadPracticeSessions(): Promise<CompletedSession[]> {
  if (!(await isAuthenticated())) {
    return loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
  }
  try {
    const sessions: CompletedSession[] = [];
    let nextToken: string | null | undefined = undefined;
    let pages = 0;
    do {
      const listArgs: { limit: number; nextToken?: string } = { limit: CLOUD_HISTORY_PAGE_LIMIT };
      if (nextToken) listArgs.nextToken = nextToken;
      const result = await client.models.PracticeSession.list(listArgs);
      nextToken = result.nextToken;
      const records = result.data;
      if (!records) break;
      for (const r of records) {
        if (r == null) continue;
        try {
          sessions.push({
            id: r.id,
            goal: {
              durationMinutes: r.goalDurationMinutes ?? undefined,
              targetBpm: r.goalBpm ?? undefined,
              skillFocus: r.goalSkill ?? undefined,
              tools: parseToolIds(r.goalToolsJson),
              tags: parseStringArray(r.goalTagsJson),
            },
            startedAt: r.startedAt ?? r.completedAt,
            completedAt: r.completedAt,
            durationSeconds: r.actualDurationSeconds,
            toolTimes: parseToolTimes(r.toolTimesJson),
            notes: r.notes ?? '',
          });
        } catch {
          // skip corrupted records
        }
      }
      if (++pages >= MAX_PAGES) break;
    } while (nextToken);
    sessions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    saveToStorage(LS_HISTORY_KEY, sessions);
    return sessions;
  } catch {
    return loadFromStorage<CompletedSession[]>(LS_HISTORY_KEY, []);
  }
}
