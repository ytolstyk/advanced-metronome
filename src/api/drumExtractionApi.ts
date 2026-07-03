import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';
import type { InstrumentId, Measure, Pattern } from '../types';
import { INSTRUMENT_IDS } from '../constants';
import { quantizeHits } from '../utils/drumPatternQuantize';
import type { HitEvent } from '../utils/drumPatternQuantize';
import { normalizeYoutubeUrl } from '../utils/youtubeUrl';

const client = generateClient<Schema>();

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

function isValidHitEvent(h: unknown): h is HitEvent {
  if (typeof h !== 'object' || h === null) return false;
  const candidate = h as Record<string, unknown>;
  return (
    typeof candidate.instrument === 'string' &&
    (INSTRUMENT_IDS as string[]).includes(candidate.instrument) &&
    typeof candidate.offsetSec === 'number' &&
    typeof candidate.confidence === 'number'
  );
}

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
      if (isValidHitEvent(h)) hits.push(h);
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

  const cleanUrl = normalizeYoutubeUrl(url);
  if (!cleanUrl) {
    throw new Error('Please enter a valid YouTube URL (e.g. https://youtube.com/watch?v=...)');
  }

  const { data, errors } = await client.queries.extractDrumPattern({ url: cleanUrl, startSec, endSec });

  if (errors?.length) throw new Error('Analysis failed — please try again.');
  if (!data) throw new Error('No response from analysis service.');

  const raw = parseRawResponse(data);
  const status = raw.status as DrumExtractionStatus;

  if (status !== 'ok') {
    throw new Error(STATUS_MESSAGES[status] ?? STATUS_MESSAGES.error);
  }

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
