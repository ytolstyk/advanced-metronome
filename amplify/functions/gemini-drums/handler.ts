import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type { AppSyncResolverHandler } from 'aws-lambda';

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_RANGE_SEC = 30;

const VALID_INSTRUMENTS = new Set(['kick', 'snare', 'hihat', 'openhat', 'clap', 'rim', 'tom']);

// End-anchored regex — no trailing characters allowed after the video ID
const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+$/;

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    status: { type: SchemaType.STRING },
    detectedBpm: { type: SchemaType.NUMBER },
    hits: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          instrument: { type: SchemaType.STRING },
          offsetSec: { type: SchemaType.NUMBER },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['instrument', 'offsetSec', 'confidence'],
      },
    },
  },
  required: ['status', 'detectedBpm', 'hits'],
};

const SYSTEM_INSTRUCTION = `You are an expert music analyst specializing in percussion.
Given a video, identify every drum hit in the requested time range.
IMPORTANT: Return offsetSec as seconds from the START OF THE VIDEO (absolute time), not from the start of the requested range.
Use only these instrument names: kick | snare | hihat | openhat | clap | rim | tom
  - kick: bass drum / bass drum hit
  - snare: snare drum hit
  - hihat: closed hi-hat
  - openhat: open hi-hat
  - clap: handclap or electronic clap
  - rim: rimclick or cross-stick
  - tom: any tom drum (high, mid, or low)
Return status "ok" when drums are present, "no_drums" when the requested range has no drums.`;

interface RawHit {
  instrument: string;
  offsetSec: number;
  confidence: number;
}

interface LambdaArgs {
  url: string;
  startSec: number;
  endSec: number;
}

export const handler: AppSyncResolverHandler<LambdaArgs, string | null> = async (event) => {
  const { url, startSec, endSec } = event.arguments;

  if (!YOUTUBE_URL_RE.test(url)) {
    throw new Error('Invalid YouTube URL format.');
  }
  if (typeof startSec !== 'number' || typeof endSec !== 'number' || endSec <= startSec) {
    throw new Error('endSec must be greater than startSec.');
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

  let rawJson: string;
  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: url, mimeType: 'video/mp4' } },
          {
            text: `Analyze drum hits from ${startSec} seconds to ${endSec} seconds. ` +
              `Return absolute timestamps from the video start. JSON only.`,
          },
        ],
      }],
    });
    rawJson = result.response.text();
  } catch (err) {
    // Surface video-access errors distinctly so the client can show a useful message
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      status: 'video_unavailable',
      detectedBpm: 0,
      hits: [],
      confidence: {},
      error: msg,
    });
  }

  let parsed: { status: string; detectedBpm: number; hits: RawHit[] };
  try {
    parsed = JSON.parse(rawJson) as typeof parsed;
  } catch {
    return JSON.stringify({ status: 'error', detectedBpm: 0, hits: [], confidence: {} });
  }

  if (parsed.status === 'no_drums') {
    return JSON.stringify({ status: 'no_drums', detectedBpm: parsed.detectedBpm ?? 0, hits: [], confidence: {} });
  }

  // Filter to the requested range; convert absolute → clip-relative timestamps
  const filteredHits = (parsed.hits ?? [])
    .filter(h =>
      VALID_INSTRUMENTS.has(h.instrument) &&
      h.confidence >= 0.3 &&
      h.offsetSec >= startSec &&
      h.offsetSec <= endSec,
    )
    .map(h => ({
      instrument: h.instrument,
      offsetSec: parseFloat((h.offsetSec - startSec).toFixed(3)),
      confidence: h.confidence,
    }));

  // Aggregate per-instrument confidence
  const confMap: Record<string, number[]> = {};
  for (const h of filteredHits) {
    if (!confMap[h.instrument]) confMap[h.instrument] = [];
    confMap[h.instrument].push(h.confidence);
  }
  const confidence: Record<string, number> = {};
  for (const [id, vals] of Object.entries(confMap)) {
    confidence[id] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  return JSON.stringify({
    status: 'ok',
    detectedBpm: parsed.detectedBpm ?? 0,
    hits: filteredHits,
    confidence,
  });
};
