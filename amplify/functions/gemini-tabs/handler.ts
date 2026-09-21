import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type { AppSyncResolverHandler } from 'aws-lambda';

const GEMINI_MODEL = 'gemini-2.5-flash';
// 22 s: leaves ~7 s headroom under the 29-s AppSync resolver timeout
const GEMINI_TIMEOUT_MS = 22_000;
const MAX_FRET = 24;
// Standard MIDI/alphaTab PPQ: 4 quarter-note ticks × 240 subdivisions
const TICKS_PER_WHOLE_NOTE = 960;
// Allow 1-tick rounding error from triplet math
const TICK_ROUNDING_TOLERANCE = 1;
// rough sanity floor: even a 1-second clip encodes to thousands of base64 chars
const MIN_AUDIO_BASE64_CHARS = 100;
// 30 s at 64 kbps ≈ 240 KB audio ≈ 320 KB base64; 2 MB gives generous headroom against abuse
const MAX_AUDIO_BASE64_CHARS = 2_000_000;
// 1 call per minute per user per Lambda instance (best-effort; full DynamoDB-backed limiting is a future upgrade)
const RATE_LIMIT_MS = 60_000;

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;
const ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/mp3', 'audio/mpeg']);
const VALID_TIME_SIG_DENOMINATORS = new Set([2, 4, 8, 16]);

// Module-level in-process rate limiter keyed by Cognito user sub
const lastCallByUser = new Map<string, number>();

// Strip codec qualifiers so mimeType matches Gemini's accepted list:
// audio/webm;codecs=opus → audio/webm
// audio/mp4;codecs=aac  → audio/aac
function normalizeMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0]!.trim();
  // Treat audio/mp4 as audio/aac (more broadly accepted by Gemini)
  if (base === 'audio/mp4') return 'audio/aac';
  return base;
}

const DURATION_VALUES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirty_second', 'sixty_fourth'] as const;
type DurationStr = (typeof DURATION_VALUES)[number];
const DOT_VALUES = ['none', 'dotted', 'double_dotted', 'triplet'] as const;
type DotStr = (typeof DOT_VALUES)[number];

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    detectedBpm: { type: SchemaType.NUMBER },
    measures: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          beats: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                duration: { type: SchemaType.STRING, enum: [...DURATION_VALUES] },
                dot: { type: SchemaType.STRING, enum: [...DOT_VALUES] },
                notes: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      string: { type: SchemaType.INTEGER },
                      fret:   { type: SchemaType.INTEGER },
                    },
                    required: ['string', 'fret'],
                  },
                },
              },
              required: ['duration', 'dot', 'notes'],
            },
          },
        },
        required: ['beats'],
      },
    },
  },
  required: ['detectedBpm', 'measures'],
};

// Ticks per duration — must stay in sync with DURATION_TICKS in src/tabEditorState.ts
const DURATION_TICKS: Record<DurationStr, number> = {
  whole: TICKS_PER_WHOLE_NOTE, half: 480, quarter: 240,
  eighth: 120, sixteenth: 60, thirty_second: 30, sixty_fourth: 15,
};
const DOT_MULTIPLIER: Record<DotStr, number> = {
  none: 1, dotted: 1.5, double_dotted: 1.75, triplet: 2 / 3,
};

function measureCapacity(numerator: number, denominator: number): number {
  return (numerator / denominator) * TICKS_PER_WHOLE_NOTE;
}

interface LambdaArgs {
  audioBase64: string;
  mimeType: string;
  tuningName: string;
  openMidi: string; // JSON array of MIDI numbers, low→high
  stringCount: number;
  bpm: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

interface RawNote {
  string: number;
  fret: number;
}
interface RawBeat {
  duration: string;
  dot: string;
  notes: RawNote[];
}
interface RawMeasure {
  beats: RawBeat[];
}
interface RawResponse {
  detectedBpm: number;
  measures: RawMeasure[];
}

function buildSystemInstruction(
  stringCount: number,
  tuningName: string,
  openMidi: number[],
  bpm: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  const pitchNames = [...openMidi]
    .reverse()
    .map(midi => NOTE_NAMES[midi % 12] + String(Math.floor(midi / 12) - 1))
    .join(', ');

  return `You are an expert guitar transcription engine.
Strings are numbered 1 (highest/thinnest) to ${stringCount} (lowest/thickest), following standard guitar tab notation.
The guitar is tuned to ${tuningName}. From string 1 (high) to string ${stringCount} (low): ${pitchNames}.
The recording was made at approximately ${bpm} BPM in ${timeSigNumerator}/${timeSigDenominator} time.
Transcribe only notes you can clearly identify from the audio. Prefer single-note runs over chord voicing guesses.
Frets range from 0 (open string) to 24. Return detectedBpm as the tempo you detected.
Group notes into beats and beats into measures. Match the ${timeSigNumerator}/${timeSigDenominator} time signature.
Use duration values: whole, half, quarter, eighth, sixteenth, thirty_second, sixty_fourth.
Use dot values: none (plain), dotted (1.5×), double_dotted (1.75×), triplet (2/3).`;
}

function validateAndSanitize(
  raw: RawResponse,
  stringCount: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): RawResponse {
  const capacity = measureCapacity(timeSigNumerator, timeSigDenominator);

  const measures = raw.measures.map((m): RawMeasure => {
    let usedTicks = 0;
    const beats: RawBeat[] = [];

    for (const beat of m.beats) {
      const durStr = DURATION_VALUES.includes(beat.duration as DurationStr)
        ? (beat.duration as DurationStr) : 'quarter';
      const dotStr = DOT_VALUES.includes(beat.dot as DotStr)
        ? (beat.dot as DotStr) : 'none';
      const baseTicks = DURATION_TICKS[durStr] ?? DURATION_TICKS.quarter;
      const beatTicks = baseTicks * DOT_MULTIPLIER[dotStr];

      if (usedTicks + beatTicks > capacity + TICK_ROUNDING_TOLERANCE) break;

      const notes = beat.notes
        .map((n): RawNote => ({
          string: Math.max(1, Math.min(stringCount, Math.round(n.string))),
          fret:   Math.max(0, Math.min(MAX_FRET, Math.round(n.fret))),
        }))
        // Deduplicate by string (keep first occurrence)
        .filter((n, idx, arr) => arr.findIndex(x => x.string === n.string) === idx);

      beats.push({ duration: durStr, dot: dotStr, notes });
      usedTicks += beatTicks;
    }

    return { beats };
  }).filter(m => m.beats.length > 0);

  return { detectedBpm: raw.detectedBpm, measures };
}

export const handler: AppSyncResolverHandler<LambdaArgs, string | null> = async (event) => {
  const {
    audioBase64,
    mimeType,
    tuningName,
    openMidi: openMidiJson,
    stringCount,
    bpm,
    timeSigNumerator,
    timeSigDenominator,
  } = event.arguments;

  // Rate limit: 1 call per minute per user per Lambda instance (in-process, best-effort)
  const identity = event.identity as { sub?: string } | null;
  const userId = identity?.sub ?? 'unknown';
  const lastCall = lastCallByUser.get(userId) ?? 0;
  if (Date.now() - lastCall < RATE_LIMIT_MS) {
    return JSON.stringify({ status: 'error', error: 'Please wait a moment before transcribing again.' });
  }

  // Input validation
  if (!audioBase64 || audioBase64.length < MIN_AUDIO_BASE64_CHARS) {
    return JSON.stringify({ status: 'error', error: 'No audio data provided.' });
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return JSON.stringify({ status: 'error', error: 'Audio payload too large.' });
  }
  if (stringCount < 6 || stringCount > 8) {
    return JSON.stringify({ status: 'error', error: 'Invalid string count.' });
  }
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 40 || bpm > 300) {
    return JSON.stringify({ status: 'error', error: 'Invalid BPM.' });
  }
  if (!VALID_TIME_SIG_DENOMINATORS.has(timeSigDenominator) || timeSigNumerator < 1 || timeSigNumerator > 16) {
    return JSON.stringify({ status: 'error', error: 'Invalid time signature.' });
  }
  // Strip all characters except word chars, literal space, and music-notation punctuation.
  // Deliberately excludes \s so newlines/tabs cannot inject multi-line directives into the system prompt.
  const safeTuningName = tuningName.replace(/[^\w #/-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);

  const normalizedMime = normalizeMimeType(mimeType);
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return JSON.stringify({ status: 'error', error: 'Unsupported audio format.' });
  }

  let openMidi: number[];
  try {
    openMidi = JSON.parse(openMidiJson) as number[];
  } catch {
    return JSON.stringify({ status: 'error', error: 'Invalid openMidi JSON.' });
  }
  if (!Array.isArray(openMidi) || openMidi.length !== stringCount) {
    return JSON.stringify({ status: 'error', error: 'Invalid openMidi format.' });
  }
  if (!openMidi.every(v => Number.isInteger(v) && v >= 0 && v <= 127)) {
    return JSON.stringify({ status: 'error', error: 'openMidi values out of range.' });
  }

  // Set optimistically before the Gemini call so concurrent same-instance requests are blocked
  // even if the first call is still in-flight (closes the TOCTOU window within one Lambda instance).
  // Cross-instance rate limiting via DynamoDB TabTranscriptionUsage is a planned upgrade.
  lastCallByUser.set(userId, Date.now());

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const systemInstruction = buildSystemInstruction(
    stringCount, safeTuningName, openMidi, bpm, timeSigNumerator, timeSigDenominator,
  );

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let rawJson: string;
  try {
    const geminiPromise = model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: normalizedMime, data: audioBase64 } },
          { text: 'Transcribe the guitar playing in this audio recording to guitar tablature. JSON only.' },
        ],
      }],
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS),
    );
    const geminiResponse = await Promise.race([geminiPromise, timeoutPromise]);
    rawJson = geminiResponse.response.text();
  } catch (err) {
    console.error('[gemini-tabs] Gemini call failed:', err);
    return JSON.stringify({ status: 'error', error: 'Transcription service unavailable. Please try again.' });
  }

  let parsed: RawResponse;
  try {
    // Cast is intentional: validateAndSanitize below performs the real structural cleanup
    parsed = JSON.parse(rawJson) as RawResponse;
  } catch {
    return JSON.stringify({ status: 'error', error: 'Failed to parse Gemini response.' });
  }

  if (!Array.isArray(parsed.measures) || parsed.measures.length === 0) {
    return JSON.stringify({ status: 'no_notes', detectedBpm: 0, measures: [] });
  }

  const sanitized = validateAndSanitize(parsed, stringCount, timeSigNumerator, timeSigDenominator);

  return JSON.stringify({
    status: 'ok',
    detectedBpm: typeof parsed.detectedBpm === 'number' ? Math.round(parsed.detectedBpm) : bpm,
    measures: sanitized.measures,
  });
};
