import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type { AppSyncResolverHandler } from 'aws-lambda';
import { ROOT_NOTES, normalizeRoot, QUALITY_MAP, normalizeQuality } from '../shared/chordNormalizers';

// Must stay in sync with gemini-suggest/handler.ts GEMINI_MODEL (cross-boundary duplication, forced by Lambda deployment)
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_RANGE_SEC = 20;
// Must stay in sync with src/constants.ts MIN_BPM / MAX_BPM (cross-boundary duplication, forced by Lambda deployment)
const BPM_MIN = 40;
const BPM_MAX = 300;
const MIN_CHORD_CONFIDENCE = 0.5;

// Must stay in sync with src/utils/youtubeUrl.ts YOUTUBE_VIDEO_ID_RE (cross-boundary duplication, forced by Lambda deployment)
const YOUTUBE_VIDEO_ID_RE = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]+)/;

const VALID_ROOTS = new Set(ROOT_NOTES as readonly string[]);
const VALID_QUALITIES = new Set(Object.values(QUALITY_MAP));
const KEY_MODES = new Set(['major', 'minor']);

interface RawChord {
  root: string;
  type: string;
  confidence: number;
}

interface LambdaResponse {
  status: 'ok' | 'no_chords' | 'video_unavailable' | 'error';
  detectedBpm: number;
  detectedKey: string;
  chords: Array<{ root: string; type: string; confidence: number }>;
}

interface RawGeminiResponse {
  status: string;
  detectedBpm: number;
  keyRoot: string;
  keyMode: string;
  chords: RawChord[];
}

interface LambdaArgs {
  url: string;
  startSec: number;
  endSec: number;
}

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    status: { type: SchemaType.STRING },
    detectedBpm: { type: SchemaType.NUMBER },
    keyRoot: { type: SchemaType.STRING },
    keyMode: { type: SchemaType.STRING },
    chords: {
      type: SchemaType.ARRAY,
      maxItems: 64,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          root: { type: SchemaType.STRING },
          type: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['root', 'type', 'confidence'],
      },
    },
  },
  required: ['status', 'detectedBpm', 'keyRoot', 'keyMode', 'chords'],
};

const SYSTEM_INSTRUCTION = `You are an expert music analyst. Given a YouTube video, identify all chord changes in the requested time range.
Return chords in order of appearance. Use only root names: C, C#, D, D#, E, F, F#, G, G#, A, A#, B.
The type field must be exactly one of: major minor 7 maj7 m7 sus2 sus4 aug dim dim7 m7b5 add9 add4 add7 6 m6 9 maj9 5
For each chord provide:
  - root (string): from the allowed note names above
  - type (string): from the allowed quality list above
  - confidence (number 0–1): your certainty about this chord
Return detectedBpm (number, 0 if uncertain), keyRoot (string, root note of the detected key, e.g. "A"), keyMode (string: "major" or "minor").
Return status "no_chords" if no recognizable harmony is present.`;

function errorResponse(status: LambdaResponse['status']): string {
  return JSON.stringify({ status, detectedBpm: 0, detectedKey: '', chords: [] } satisfies LambdaResponse);
}

export const handler: AppSyncResolverHandler<LambdaArgs, string | null> = async (event) => {
  const { url, startSec, endSec } = event.arguments;

  // Reject Shorts URLs before extraction
  if (/youtube\.com\/shorts\//.test(url)) {
    throw new Error('YouTube Shorts links are not supported — use a standard youtube.com/watch link.');
  }

  // Extract video ID and reconstruct a clean URL
  const match = YOUTUBE_VIDEO_ID_RE.exec(url);
  if (!match) throw new Error('Invalid YouTube URL format.');
  // cleanUrl is always valid: videoId is regex-constrained to [\w-]+, so no further validation needed.
  const cleanUrl = `https://www.youtube.com/watch?v=${match[1]}`;

  if (startSec < 0 || endSec < 0) {
    throw new Error('Start and end times cannot be negative.');
  }
  if (endSec <= startSec) {
    throw new Error('End time must be after start time.');
  }
  if (endSec - startSec > MAX_RANGE_SEC) {
    throw new Error(`Time range must be ${MAX_RANGE_SEC} seconds or less.`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  // 22 s: gives Gemini time to respond and leaves ~3 s for catch/serialize before the 25 s Lambda deadline
  const GEMINI_TIMEOUT_MS = 22_000;

  let rawJson: string;
  const geminiPromise = model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: cleanUrl, mimeType: 'video/mp4' } },
        { text: `Identify chord changes from ${startSec} seconds to ${endSec} seconds. JSON only.` },
      ],
    }],
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('gemini_timeout')), GEMINI_TIMEOUT_MS),
  );
  try {
    const result = await Promise.race([geminiPromise, timeoutPromise]);
    rawJson = result.response.text();
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === 'gemini_timeout';
    console.error('[gemini-chords] Gemini error:', err);
    return isTimeout ? errorResponse('error') : errorResponse('video_unavailable');
  }

  let parsed: RawGeminiResponse;
  try {
    parsed = JSON.parse(rawJson) as RawGeminiResponse;
  } catch {
    return errorResponse('error');
  }

  if (parsed.status === 'no_chords') {
    return errorResponse('no_chords');
  }

  // Normalize and filter chords
  const validChords = (parsed.chords ?? []).flatMap((chord) => {
    if (chord.confidence < MIN_CHORD_CONFIDENCE) return [];
    const root = normalizeRoot(chord.root);
    if (!root || !VALID_ROOTS.has(root)) return [];
    const type = normalizeQuality(chord.type);
    if (!type || !VALID_QUALITIES.has(type)) return [];
    return [{ root, type, confidence: chord.confidence }];
  });

  // Return no_chords if all chords were filtered (matches gemini-drums behavior for empty arrays)
  if (validChords.length === 0) {
    return errorResponse('no_chords');
  }

  // Clamp BPM to valid range; 0 signals "unknown"
  const rawBpm = typeof parsed.detectedBpm === 'number' ? parsed.detectedBpm : 0;
  const detectedBpm = rawBpm >= BPM_MIN && rawBpm <= BPM_MAX ? rawBpm : 0;

  // Validate key fields against allowlists before building display string
  const rawKeyRoot = typeof parsed.keyRoot === 'string' ? parsed.keyRoot.trim() : '';
  const rawKeyMode = typeof parsed.keyMode === 'string' ? parsed.keyMode.trim().toLowerCase() : '';
  const detectedKey =
    VALID_ROOTS.has(rawKeyRoot) && KEY_MODES.has(rawKeyMode)
      ? `${rawKeyRoot} ${rawKeyMode}`
      : '';

  return JSON.stringify({
    status: 'ok',
    detectedBpm,
    detectedKey,
    chords: validChords,
  } satisfies LambdaResponse);
};

