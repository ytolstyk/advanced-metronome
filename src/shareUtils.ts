import type { AppState, LoopConfig, Pattern, ChordPattern, ChordInstrumentType } from './types';

// ── Scale share ───────────────────────────────────────────────────────────────

interface ScalePracticeNote {
  id: number;
  midiNote: number;
  label: string;
  dotKey: string;
}

export interface ScaleSharePayload {
  v: 1;
  key: string;
  mode: string;
  bpm: number;
  notes?: ScalePracticeNote[];
}

export function encodeScaleShare(
  key: string,
  mode: string,
  bpm: number,
  notes?: ScalePracticeNote[],
): string {
  const payload: ScaleSharePayload = {
    v: 1,
    key,
    mode,
    bpm,
    ...(notes && notes.length > 0 ? { notes } : {}),
  };
  const json = JSON.stringify(payload);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeScaleShare(encoded: string): ScaleSharePayload | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as unknown;
    if (!isScaleSharePayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isScaleSharePayload(value: unknown): value is ScaleSharePayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p['v'] !== 1) return false;
  if (typeof p['key'] !== 'string') return false;
  if (typeof p['mode'] !== 'string') return false;
  if (typeof p['bpm'] !== 'number') return false;
  return true;
}

export function buildScaleShareUrl(
  key: string,
  mode: string,
  bpm: number,
  notes?: ScalePracticeNote[],
): string {
  return `${window.location.origin}/scales?scaleshare=${encodeScaleShare(key, mode, bpm, notes)}`;
}

export interface SharePayload {
  v: 1;
  config: LoopConfig;
  pattern: Pattern;
  chordPattern: ChordPattern;
  chordInstrument: ChordInstrumentType;
  chordVolume: number;
}

export function encodeShareState(state: AppState): string {
  const payload: SharePayload = {
    v: 1,
    config: state.config,
    pattern: state.pattern,
    chordPattern: state.chordPattern,
    chordInstrument: state.chordInstrument,
    chordVolume: state.chordVolume,
  };
  const json = JSON.stringify(payload);
  // base64url: replace +/= for URL safety
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShareState(encoded: string): SharePayload | null {
  try {
    // Restore base64 padding and characters
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as unknown;
    if (!isSharePayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isSharePayload(value: unknown): value is SharePayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p['v'] !== 1) return false;
  if (typeof p['config'] !== 'object' || p['config'] === null) return false;
  const config = p['config'] as Record<string, unknown>;
  if (typeof config['bpm'] !== 'number') return false;
  if (!Array.isArray(config['measures'])) return false;
  if (typeof p['pattern'] !== 'object' || p['pattern'] === null) return false;
  if (!Array.isArray(p['chordPattern'])) return false;
  if (typeof p['chordInstrument'] !== 'string') return false;
  if (typeof p['chordVolume'] !== 'number') return false;
  return true;
}

export function buildShareUrl(state: AppState): string {
  return `${window.location.origin}/?share=${encodeShareState(state)}`;
}
