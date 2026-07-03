import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type { AppSyncResolverHandler } from 'aws-lambda';
import { ROOT_NOTES, normalizeRoot, normalizeQuality } from '../shared/chordNormalizers';

const SUGGESTION_COUNT = 3;
// Must stay in sync with gemini-chords/handler.ts GEMINI_MODEL (cross-boundary duplication, forced by Lambda deployment)
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_PROMPT_LENGTH = 500;

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
        const type = normalizeQuality(c.quality);
        if (!type) return null;
        return { root, type };
      })
      .filter((c): c is { root: string; type: string } => c !== null),
    description: prog.description.slice(0, 200),
  }));

  return JSON.stringify(progressions);
};
