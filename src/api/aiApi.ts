import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { ChordSlot } from '../utils/chordTheory';
import { ROOT_NOTES, CHORD_TYPES } from '../data/chords';
import { isAuthenticated } from './authUtils';
import type { InstrumentId, Measure, Pattern } from '../types';
import { INSTRUMENT_IDS } from '../constants';
import { quantizeHits } from '../utils/drumPatternQuantize';
import type { HitEvent } from '../utils/drumPatternQuantize';

export interface SuggestedProgression {
  chords: ChordSlot[];
  description: string;
}

export const SUGGESTION_COUNT = 3;
const MAX_PROMPT_LENGTH = 500;

// AppSync auth enforces authenticated() on this query server-side.
// This client-side check is a fast-fail UX guard only.
const client = generateClient<Schema>();

function parseAndValidateProgressions(json: string): SuggestedProgression[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('No progressions returned — try rephrasing your prompt.');
  }

  if (!Array.isArray(parsed) || !parsed.length)
    throw new Error('No progressions returned — try rephrasing your prompt.');

  return (parsed as unknown[]).flatMap((prog) => {
    if (
      typeof prog !== 'object' ||
      prog === null ||
      !Array.isArray((prog as Record<string, unknown>).chords) ||
      typeof (prog as Record<string, unknown>).description !== 'string'
    ) return [];

    const chords: ChordSlot[] = ((prog as Record<string, unknown>).chords as unknown[]).flatMap(
      (c) => {
        if (typeof c !== 'object' || c === null) return [];
        const { root, type } = c as Record<string, unknown>;
        if (typeof root !== 'string' || typeof type !== 'string') return [];
        const validRoot = ROOT_NOTES.find((r) => r === root);
        const validType = CHORD_TYPES.find((t) => t === type);
        if (!validRoot || !validType) return [];
        return [{ root: validRoot, type: validType }];
      },
    );

    if (!chords.length) return [];
    return [{ chords, description: String((prog as Record<string, unknown>).description) }];
  });
}

// End-anchored — must match the Lambda's validation regex exactly
const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+$/;

export type DrumExtractionStatus = 'ok' | 'no_drums' | 'video_unavailable' | 'error';

export interface DrumExtractionResult {
  /** Raw clip-relative hits, preserved for re-quantization if the grid changes before Apply */
  hits: HitEvent[];
  /** Pre-quantized preview using the measures passed at call time */
  pattern: Pattern;
  confidence: Record<InstrumentId, number>;
  detectedBpm: number;
  status: DrumExtractionStatus;
}

const STATUS_MESSAGES: Record<DrumExtractionStatus, string> = {
  ok: '',
  no_drums: 'No drums detected in this section — try a different time range.',
  video_unavailable: 'Could not access this video. Check that it is public and try again.',
  error: 'Analysis failed — please try again.',
};

function parseRawResponse(json: string): {
  status: string;
  detectedBpm: number;
  hits: HitEvent[];
  confidence: Record<string, number>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { status: 'error', detectedBpm: 0, hits: [], confidence: {} };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'error', detectedBpm: 0, hits: [], confidence: {} };
  }
  const r = parsed as Record<string, unknown>;
  const hits: HitEvent[] = [];
  if (Array.isArray(r.hits)) {
    for (const h of r.hits as unknown[]) {
      if (
        typeof h === 'object' && h !== null &&
        typeof (h as Record<string, unknown>).instrument === 'string' &&
        typeof (h as Record<string, unknown>).offsetSec === 'number' &&
        typeof (h as Record<string, unknown>).confidence === 'number' &&
        (INSTRUMENT_IDS as string[]).includes((h as Record<string, unknown>).instrument as string)
      ) {
        hits.push({
          instrument: (h as Record<string, unknown>).instrument as InstrumentId,
          offsetSec: (h as Record<string, unknown>).offsetSec as number,
          confidence: (h as Record<string, unknown>).confidence as number,
        });
      }
    }
  }
  const confidence: Record<string, number> = {};
  if (typeof r.confidence === 'object' && r.confidence !== null) {
    for (const [k, v] of Object.entries(r.confidence as Record<string, unknown>)) {
      if (typeof v === 'number') confidence[k] = v;
    }
  }
  return {
    status: typeof r.status === 'string' ? r.status : 'error',
    detectedBpm: typeof r.detectedBpm === 'number' ? r.detectedBpm : 0,
    hits,
    confidence,
  };
}

export async function extractDrumPattern(
  url: string,
  startSec: number,
  endSec: number,
  measures: Measure[],
): Promise<DrumExtractionResult> {
  if (!(await isAuthenticated())) throw new Error('Sign in to use drum extraction.');

  if (!YOUTUBE_URL_RE.test(url)) {
    throw new Error('Please enter a valid YouTube URL (e.g. https://youtube.com/watch?v=...)');
  }

  const { data, errors } = await client.queries.extractDrumPattern({ url, startSec, endSec });

  if (errors?.length) throw new Error('Analysis failed — please try again.');
  if (!data) throw new Error('No response from analysis service.');

  const raw = parseRawResponse(data);
  const status = raw.status as DrumExtractionStatus;

  if (status !== 'ok') {
    throw new Error(STATUS_MESSAGES[status] ?? STATUS_MESSAGES.error);
  }

  // Build the empty confidence map for all instruments, then overlay what Lambda returned
  const fullConfidence = Object.fromEntries(INSTRUMENT_IDS.map(id => [id, 0])) as Record<InstrumentId, number>;
  for (const id of INSTRUMENT_IDS) {
    if (raw.confidence[id] !== undefined) fullConfidence[id] = raw.confidence[id];
  }

  const pattern = quantizeHits(raw.hits, measures, raw.detectedBpm);

  return {
    hits: raw.hits,
    pattern,
    confidence: fullConfidence,
    detectedBpm: raw.detectedBpm,
    status,
  };
}

export async function suggestChordProgressions(prompt: string): Promise<SuggestedProgression[]> {
  if (!(await isAuthenticated())) throw new Error('AI suggestions are unavailable.');
  if (prompt.length > MAX_PROMPT_LENGTH)
    throw new Error(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);

  const { data, errors } = await client.queries.suggestChordProgressions({ prompt });

  if (errors?.length) throw new Error('AI suggestions are unavailable.');
  if (!data) throw new Error('No progressions returned — try rephrasing your prompt.');

  const progressions = parseAndValidateProgressions(data);
  if (!progressions.length)
    throw new Error('No progressions returned — try rephrasing your prompt.');

  return progressions.slice(0, SUGGESTION_COUNT);
}
