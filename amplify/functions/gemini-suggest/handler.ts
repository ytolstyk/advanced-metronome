import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type { AppSyncResolverHandler } from 'aws-lambda';

const SUGGESTION_COUNT = 3;
const GEMINI_MODEL = 'gemini-3.5-flash';
const MAX_PROMPT_LENGTH = 500;

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const ENHARMONIC: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  'D♭': 'C#', 'E♭': 'D#', 'G♭': 'F#', 'A♭': 'G#', 'B♭': 'A#',
};

function normalizeRoot(raw: string): string | null {
  const s = raw.trim();
  if ((ROOT_NOTES as readonly string[]).includes(s)) return s;
  const mapped = ENHARMONIC[s];
  return mapped && (ROOT_NOTES as readonly string[]).includes(mapped) ? mapped : null;
}

const QUALITY_MAP: Record<string, string> = {
  major: 'major', maj: 'major', M: 'major',
  minor: 'minor', min: 'minor', m: 'minor',
  '7': '7', dominant7: '7', dom7: '7', 'dominant 7': '7',
  maj7: 'maj7', major7: 'maj7', 'major 7': 'maj7',
  m7: 'm7', minor7: 'm7', 'minor 7': 'm7', min7: 'm7',
  sus2: 'sus2', suspended2: 'sus2',
  sus4: 'sus4', suspended4: 'sus4',
  aug: 'aug', augmented: 'aug',
  dim: 'dim', diminished: 'dim',
  dim7: 'dim7', diminished7: 'dim7',
  m7b5: 'm7b5', 'half-diminished': 'm7b5', 'half diminished': 'm7b5',
  add9: 'add9', 'add 9': 'add9',
  add4: 'add4', 'add 4': 'add4',
  add7: 'add7', 'add 7': 'add7',
  '6': '6', major6: '6', maj6: '6',
  m6: 'm6', minor6: 'm6',
  '9': '9', dominant9: '9', dom9: '9',
  maj9: 'maj9', major9: 'maj9',
  '5': '5', power: '5', 'power chord': '5',
};

function normalizeQuality(raw: string): string {
  const key = raw.trim();
  return QUALITY_MAP[key] ?? QUALITY_MAP[key.toLowerCase()] ?? 'major';
}

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    progressions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          chords: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                root: { type: SchemaType.STRING },
                quality: { type: SchemaType.STRING },
              },
              required: ['root', 'quality'],
            },
          },
          description: { type: SchemaType.STRING },
        },
        required: ['chords', 'description'],
      },
    },
  },
  required: ['progressions'],
};

const SYSTEM_INSTRUCTION = `You are a music theory assistant for guitar players.
Given a mood, genre, or description, suggest exactly ${SUGGESTION_COUNT} distinct chord progressions.
Rules:
- Each progression must have 4-8 chords (loopable; choose length naturally for the style).
- Use only these root note names: ${ROOT_NOTES.join(', ')}.
- Use only these quality names: major, minor, 7, maj7, m7, sus2, sus4, aug, dim, dim7, m7b5, add9, add4, add7, maj9, 9, 6, m6, 5.
- The ${SUGGESTION_COUNT} progressions must be genuinely different from each other in key, mood, or structure.
- Keep descriptions short (one sentence, ≤20 words) describing feel or genre context.`;

// AppSync cannot return a complex structured type from a.handler.function resolvers,
// so we serialize the progression array as a JSON string. The client re-parses and
// validates each field against the canonical ROOT_NOTES / CHORD_TYPES sets.
export const handler: AppSyncResolverHandler<{ prompt: string }, string | null> = async (event) => {
  // Strip newlines before interpolation to prevent prompt injection
  const prompt = (event.arguments.prompt ?? '').replace(/[\r\n]+/g, ' ').trim();

  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt must be 1–${MAX_PROMPT_LENGTH} characters.`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });

  const result = await model.generateContent(
    `Suggest ${SUGGESTION_COUNT} chord progressions for: ${prompt}`,
  );

  let raw: { progressions: Array<{ chords: Array<{ root: string; quality: string }>; description: string }> };
  try {
    raw = JSON.parse(result.response.text()) as typeof raw;
  } catch {
    throw new Error('No progressions returned — try rephrasing your prompt.');
  }

  if (!raw?.progressions?.length) {
    throw new Error('No progressions returned — try rephrasing your prompt.');
  }

  const progressions = raw.progressions.slice(0, SUGGESTION_COUNT).map((prog) => ({
    chords: prog.chords
      .map((c) => {
        const root = normalizeRoot(c.root);
        if (!root) return null;
        return { root, type: normalizeQuality(c.quality) };
      })
      .filter((c): c is { root: string; type: string } => c !== null),
    description: prog.description.slice(0, 200),
  }));

  return JSON.stringify(progressions);
};
