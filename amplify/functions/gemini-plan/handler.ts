import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type { AppSyncResolverHandler } from 'aws-lambda';

const GEMINI_MODEL = 'gemini-3.5-flash';
const WEEKS = 4;
const MAX_GOAL_LENGTH = 300;
const VALID_SKILL_LEVELS = new Set(['Beginner', 'Intermediate', 'Advanced']);

const TOOL_IDS = [
  'drums', 'tuner', 'chords', 'scales', 'circle',
  'click-track', 'fret-memorizer', 'tab-editor',
  'ear-training', 'chord-progression', 'caged', 'metronome',
] as const;

const TOOL_LABELS: Record<string, string> = {
  drums:              'Drum Machine — program and play drum grooves',
  tuner:              'Guitar Tuner — ensure your guitar is in tune',
  chords:             'Chord Library — browse and learn chord shapes',
  scales:             'Scale Explorer — visualize scales on the fretboard',
  circle:             'Circle of Fifths — understand key relationships',
  'click-track':      'Click Track — build complex tempo-change click tracks',
  'fret-memorizer':   'Fret Memorizer — quiz yourself on note positions',
  'tab-editor':       'Tab Editor — write and play guitar tablature',
  'ear-training':     'Ear Training — identify intervals, chords, and scales by ear',
  'chord-progression':'Chord Progression Builder — build and play progressions',
  caged:              'CAGED System — visualize the five CAGED shapes',
  metronome:          'Metronome — practice with a click at a target BPM',
};

// Precomputed at module scope so warm Lambda invocations don't recompute it
const TOOL_DESCRIPTIONS = Object.entries(TOOL_LABELS)
  .map(([id, desc]) => `  "${id}": ${desc}`)
  .join('\n');

const SESSION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    durationMin: { type: SchemaType.INTEGER },
    skillFocus:  { type: SchemaType.STRING },
    tools:       { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    targetBpm:   { type: SchemaType.INTEGER, nullable: true },
  },
  required: ['durationMin', 'skillFocus', 'tools'],
};

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    weeks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { sessions: { type: SchemaType.ARRAY, items: SESSION_SCHEMA } },
        required: ['sessions'],
      },
    },
  },
  required: ['weeks'],
};

type RawSession = {
  durationMin: number;
  skillFocus: string;
  tools: unknown[];
  targetBpm?: number | null;
};

type RawPlan = { weeks: Array<{ sessions: RawSession[] }> };

type HandlerArgs = {
  skillLevel: string;
  goal: string;
  dailyMinutes: number;
  daysOfWeekJson: string;
};

const validToolSet = new Set<string>(TOOL_IDS);

// Lazy-initialized so the key is validated at call time, not at cold-start
let cachedAi: GoogleGenerativeAI | null = null;
function getAiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  if (!cachedAi) cachedAi = new GoogleGenerativeAI(apiKey);
  return cachedAi;
}

function sanitizeSession(raw: RawSession, fallbackDuration: number) {
  const bpm = typeof raw.targetBpm === 'number' ? raw.targetBpm : null;
  return {
    durationMin: Math.max(5, Math.min(120, raw.durationMin ?? fallbackDuration)),
    skillFocus:  String(raw.skillFocus ?? '').slice(0, 80),
    tools:       (raw.tools ?? []).filter((t): t is string => typeof t === 'string' && validToolSet.has(t)).slice(0, 3),
    ...(bpm !== null && bpm >= 40 && bpm <= 300 ? { targetBpm: bpm } : {}),
  };
}

export const handler: AppSyncResolverHandler<HandlerArgs, string | null> = async (event) => {
  const { skillLevel, goal, dailyMinutes, daysOfWeekJson } = event.arguments;

  // Validate skill level against the canonical enum (not just a TypeScript type)
  if (!VALID_SKILL_LEVELS.has(skillLevel))
    throw new Error('Invalid skill level.');

  // Strip newlines before interpolation to prevent prompt injection
  const safeGoal = goal?.replace(/[\r\n]+/g, ' ').trim() ?? '';
  if (!safeGoal || safeGoal.length > MAX_GOAL_LENGTH)
    throw new Error(`Goal must be 1–${MAX_GOAL_LENGTH} characters.`);

  if (!dailyMinutes || dailyMinutes < 5 || dailyMinutes > 120)
    throw new Error('Daily minutes must be between 5 and 120.');

  let daysCount: number;
  try {
    const days = JSON.parse(daysOfWeekJson) as unknown;
    if (
      !Array.isArray(days) ||
      days.length === 0 ||
      !days.every((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)
    ) throw new Error();
    // Deduplicate so [1,1,1] doesn't produce 3 sessions/week for 1 day
    const uniqueDays = [...new Set(days as number[])];
    daysCount = Math.min(7, Math.max(1, uniqueDays.length));
  } catch {
    throw new Error('Invalid daysOfWeek — values must be integers 0–6.');
  }

  const systemInstruction = `You are an expert guitar practice coach. Generate a ${WEEKS}-week structured guitar practice plan.
Each week must have exactly ${daysCount} session(s). Do not generate more or fewer.
Each session must have:
- durationMin: integer, session length in minutes (match the user's available time)
- skillFocus: string ≤80 chars, specific and actionable description of what to practise
- tools: array of 1–3 tool IDs chosen from this exact list: ${TOOL_IDS.join(', ')}
- targetBpm: integer BPM goal (omit or set null if tempo is not relevant to the session)

Available tools:
${TOOL_DESCRIPTIONS}

The plan must progressively build skills: week 1 = foundations, weeks 2–3 = development, week 4 = consolidation.`;

  const prompt = `Create a ${WEEKS}-week guitar practice plan:
Skill level: ${skillLevel}
Primary goal: ${safeGoal}
Time per session: ${dailyMinutes} minutes
Sessions per week: ${daysCount}

Generate exactly ${WEEKS} weeks with exactly ${daysCount} session(s) each.`;

  const ai = getAiClient();
  const model = ai.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });

  const result = await model.generateContent(prompt);

  let raw: RawPlan;
  try {
    raw = JSON.parse(result.response.text()) as RawPlan;
  } catch {
    throw new Error('Failed to generate plan — please try again.');
  }

  if (!raw?.weeks?.length) throw new Error('Failed to generate plan — please try again.');

  const weeks = raw.weeks.slice(0, WEEKS).map((week) => ({
    sessions: (week.sessions ?? []).slice(0, daysCount).map((s) => sanitizeSession(s, dailyMinutes)),
  }));

  return JSON.stringify({ weeks });
};
