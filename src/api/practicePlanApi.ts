import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';
import { loadFromStorage, saveToStorage } from './storageUtils';
import { TOOL_META } from '../practiceSessionUtils';
import type { PlanInput, PlanSession, PlanWeek, PracticePlan, ToolId } from '../practiceSessionTypes';

const client = generateClient<Schema>();
const LS_KEY = 'practice-plan.current';
const LS_RECORD_ID_KEY = 'practice-plan.recordId';

// Derived from TOOL_META so adding a tool to the app automatically extends validation here
const VALID_TOOL_IDS = new Set(Object.keys(TOOL_META) as ToolId[]);
const VALID_SKILL_LEVELS = new Set(['Beginner', 'Intermediate', 'Advanced']);

function isValidToolId(s: unknown): s is ToolId {
  return typeof s === 'string' && VALID_TOOL_IDS.has(s as ToolId);
}

function parseRawSession(s: Record<string, unknown>): PlanSession | null {
  const durationMin = typeof s.durationMin === 'number' ? s.durationMin : null;
  const skillFocus  = typeof s.skillFocus  === 'string' ? s.skillFocus  : null;
  if (durationMin === null || skillFocus === null) return null;

  const tools = Array.isArray(s.tools) ? (s.tools as unknown[]).filter(isValidToolId) : [];
  const bpm   = typeof s.targetBpm === 'number' ? s.targetBpm : undefined;

  return {
    durationMin: Math.max(5, Math.min(120, durationMin)),
    skillFocus:  skillFocus.slice(0, 80),
    tools,
    ...(bpm !== undefined && bpm >= 40 && bpm <= 300 ? { targetBpm: bpm } : {}),
  };
}

function parseRawWeek(w: unknown): PlanWeek | null {
  if (typeof w !== 'object' || w === null) return null;
  const raw = w as Record<string, unknown>;
  const sessions = (Array.isArray(raw.sessions) ? (raw.sessions as unknown[]) : [])
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map(parseRawSession)
    .filter((s): s is PlanSession => s !== null);
  return { sessions };
}

function parseRawPlan(json: string, input: PlanInput): PracticePlan {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Failed to parse plan — please try again.');
  }

  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Record<string, unknown>).weeks))
    throw new Error('Invalid plan format received.');

  const weeks = ((raw as { weeks: unknown[] }).weeks)
    .map(parseRawWeek)
    .filter((w): w is PlanWeek => w !== null);

  if (!weeks.length) throw new Error('Plan returned no weeks — please try again.');

  return { id: crypto.randomUUID(), input, weeks, generatedAt: new Date().toISOString() };
}

function validatePlanInput(input: unknown): input is PlanInput {
  if (typeof input !== 'object' || input === null) return false;
  const i = input as Record<string, unknown>;
  return (
    typeof i.goal === 'string' &&
    i.goal.length <= 300 &&
    typeof i.skillLevel === 'string' &&
    VALID_SKILL_LEVELS.has(i.skillLevel) &&
    typeof i.dailyMinutes === 'number' &&
    Array.isArray(i.daysOfWeek) &&
    (i.daysOfWeek as unknown[]).every(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    )
  );
}

// Module-level cache: prevents redundant Cognito + DynamoDB round-trips on every mount
let planCache: Promise<PracticePlan | null> | null = null;

async function fetchPlan(): Promise<PracticePlan | null> {
  // Read localStorage immediately — synchronous, no await needed
  const local = loadFromStorage<PracticePlan | null>(LS_KEY, null);

  if (!(await isAuthenticated())) return local;

  try {
    // Try the cached record ID first to skip a full list scan
    const existingId = loadFromStorage<string | null>(LS_RECORD_ID_KEY, null);
    let record: { id: string; inputJson: string; planJson: string; generatedAt: string | null | undefined } | null = null;

    if (existingId) {
      try {
        const { data } = await client.models.UserPracticePlan.get({ id: existingId });
        if (data) record = data;
      } catch {
        // Stale ID — fall through to list
      }
    }

    if (!record) {
      const { data: records } = await client.models.UserPracticePlan.list();
      const r = records?.[0];
      if (r) {
        record = r;
        saveToStorage(LS_RECORD_ID_KEY, r.id);
      }
    }

    if (!record) return local;

    const rawInput = JSON.parse(record.inputJson) as unknown;
    if (!validatePlanInput(rawInput)) return local;

    const plan = parseRawPlan(record.planJson, rawInput);
    plan.generatedAt = record.generatedAt ?? plan.generatedAt;
    saveToStorage(LS_KEY, plan);
    return plan;
  } catch {
    return local;
  }
}

export function loadSavedPlan(): Promise<PracticePlan | null> {
  if (!planCache) planCache = fetchPlan();
  return planCache;
}

export async function savePracticePlan(plan: PracticePlan): Promise<void> {
  saveToStorage(LS_KEY, plan);
  // Update cache in-place rather than nulling it: prevents a concurrent loadSavedPlan() from
  // re-fetching from cloud while the write is still in flight and returning stale data.
  planCache = Promise.resolve(plan);

  if (!(await isAuthenticated())) return;
  try {
    const payload = {
      inputJson:   JSON.stringify(plan.input),
      planJson:    JSON.stringify({ weeks: plan.weeks }),
      generatedAt: plan.generatedAt,
    };
    const existingId = loadFromStorage<string | null>(LS_RECORD_ID_KEY, null);
    if (existingId) {
      await client.models.UserPracticePlan.update({ id: existingId, ...payload });
    } else {
      const { data: existing } = await client.models.UserPracticePlan.list();
      const r = existing?.[0];
      if (r?.id) {
        saveToStorage(LS_RECORD_ID_KEY, r.id);
        await client.models.UserPracticePlan.update({ id: r.id, ...payload });
      } else {
        const { data: created } = await client.models.UserPracticePlan.create(payload);
        if (created?.id) saveToStorage(LS_RECORD_ID_KEY, created.id);
      }
    }
  } catch {
    // localStorage already saved; cloud failure is silent
  }
}

export async function generatePracticePlan(input: PlanInput): Promise<PracticePlan> {
  if (!(await isAuthenticated())) throw new Error('AI practice plans are unavailable — please sign in.');
  if (!input.goal.trim()) throw new Error('Please enter a practice goal.');
  if (input.goal.length > 300) throw new Error('Goal must be 300 characters or fewer.');
  if (input.daysOfWeek.length === 0) throw new Error('Please select at least one practice day.');

  const { data, errors } = await client.queries.generatePracticePlan({
    skillLevel:     input.skillLevel,
    goal:           input.goal.trim(),
    dailyMinutes:   input.dailyMinutes,
    daysOfWeekJson: JSON.stringify(input.daysOfWeek),
  });

  if (errors?.length) throw new Error('Failed to generate plan — please try again.');
  if (!data) throw new Error('No plan returned — please try again.');

  return parseRawPlan(data, input);
}
