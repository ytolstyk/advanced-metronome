import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export interface GeminiTabNote {
  string: number; // 1 = high E (standard tab convention)
  fret: number;
}

export interface GeminiTabBeat {
  duration: string;
  dot: string;
  notes: GeminiTabNote[];
}

export interface GeminiTabMeasure {
  beats: GeminiTabBeat[];
}

export interface GeminiTabResult {
  status: 'ok' | 'no_notes' | 'error';
  detectedBpm: number;
  measures: GeminiTabMeasure[];
  error?: string;
}

export interface TranscribeParams {
  audioBlob: Blob;
  tuningName: string;
  openMidi: number[];
  stringCount: number;
  bpm: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data URL prefix (e.g. "data:audio/webm;base64,")
      const base64 = dataUrl.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio'));
    reader.readAsDataURL(blob);
  });
}

function parseResponse(json: string): GeminiTabResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { status: 'error', detectedBpm: 0, measures: [], error: 'Invalid response from server.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'error', detectedBpm: 0, measures: [], error: 'Unexpected response format.' };
  }
  const r = parsed as Record<string, unknown>;
  const status = (r.status as string) === 'ok' ? 'ok'
    : (r.status as string) === 'no_notes' ? 'no_notes'
    : 'error';
  return {
    status,
    detectedBpm: typeof r.detectedBpm === 'number' ? r.detectedBpm : 0,
    measures: Array.isArray(r.measures) ? (r.measures as GeminiTabMeasure[]) : [],
    error: typeof r.error === 'string' ? r.error : undefined,
  };
}

export async function transcribeGuitarAudio(params: TranscribeParams): Promise<GeminiTabResult> {
  // Run auth check and base64 encoding in parallel — they are independent
  const [authed, audioBase64] = await Promise.all([
    isAuthenticated(),
    blobToBase64(params.audioBlob),
  ]);

  if (!authed) throw new Error('Sign in to use AI tab transcription.');
  if (!audioBase64) throw new Error('Failed to encode audio for upload.');

  // Use the blob's native MIME type (set by MediaRecorder at record time)
  const mimeType = params.audioBlob.type || 'audio/webm';

  const { data, errors } = await client.queries.transcribeGuitarTab({
    audioBase64,
    mimeType,
    tuningName: params.tuningName,
    openMidi: JSON.stringify(params.openMidi),
    stringCount: params.stringCount,
    bpm: params.bpm,
    timeSigNumerator: params.timeSigNumerator,
    timeSigDenominator: params.timeSigDenominator,
  });

  if (errors?.length) throw new Error('Transcription failed — please try again.');
  if (!data) throw new Error('No response from transcription service.');

  const result = parseResponse(data);
  if (result.status === 'error') {
    throw new Error(result.error ?? 'Transcription failed — please try again.');
  }

  return result;
}
