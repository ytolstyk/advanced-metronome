import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

// ── Shared types ───────────────────────────────────────────────────────────

/** Per-pitch-class accuracy; key is pitch class 0–11 */
export type NoteAccMap = Record<number, { correct: number; total: number }>;

export interface SessionEntry {
  date: string;
  score: number;
  total: number;
}

export interface FretMemorizerScorePayload {
  score: number;
  wrongAnswers: number;
  totalQuestions: number;
  elapsedSeconds: number;
  gameMode: string;
  stringCount: number;
  tuning: string;
}

export interface FretMemorizerScoreRecord extends FretMemorizerScorePayload {
  completedAt: string;
}

// ── Runtime validators ─────────────────────────────────────────────────────

function isNoteAccEntry(v: unknown): v is { correct: number; total: number } {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as { correct?: unknown }).correct === 'number' &&
    typeof (v as { total?: unknown }).total === 'number'
  );
}

function isNoteAccMap(v: unknown): v is NoteAccMap {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.entries(v).every(
    ([k, e]) => /^\d+$/.test(k) && Number(k) >= 0 && Number(k) <= 11 && isNoteAccEntry(e),
  );
}

function isSessionEntry(v: unknown): v is SessionEntry {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as SessionEntry).date === 'string' &&
    !isNaN(Date.parse((v as SessionEntry).date)) &&
    typeof (v as SessionEntry).score === 'number' && isFinite((v as SessionEntry).score) &&
    typeof (v as SessionEntry).total === 'number' && isFinite((v as SessionEntry).total)
  );
}

// ── localStorage helpers ───────────────────────────────────────────────────

const LS_NOTE_ACC = 'fretMem.noteAcc';
const LS_HISTORY = 'fretMem.history';

export function loadNoteAccFromStorage(): NoteAccMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LS_NOTE_ACC) ?? '{}');
    return isNoteAccMap(parsed) ? parsed : {};
  } catch { return {}; }
}

function saveNoteAccToStorage(m: NoteAccMap): void {
  try { localStorage.setItem(LS_NOTE_ACC, JSON.stringify(m)); } catch { /* ignore */ }
}

export function loadSessionHistoryFromStorage(): SessionEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LS_HISTORY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isSessionEntry).slice(-30);
  } catch { return []; }
}

export function saveSessionHistory(entries: SessionEntry[]): void {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(entries.slice(-30))); } catch { /* ignore */ }
}

// ── NoteAccuracy cloud sync ────────────────────────────────────────────────
// Follows the same create-or-update pattern as noteColorsApi.ts.

let progressRecordId: string | null = null;

export async function loadNoteAccuracy(): Promise<NoteAccMap> {
  // Always start from localStorage for instant display
  const local = loadNoteAccFromStorage();

  if (!(await isAuthenticated())) return local;

  try {
    const { data } = await client.models.FretMemorizerProgress.list();
    const record = data?.[0];
    if (!record) return local;
    progressRecordId = record.id;
    const parsed: unknown = JSON.parse(record.noteAccuracy);
    const cloud = isNoteAccMap(parsed) ? parsed : null;
    if (!cloud) return local;
    // Merge: take the max total for each pitch class (in case user played on both devices)
    const merged: NoteAccMap = { ...local };
    for (const [pcStr, cloudEntry] of Object.entries(cloud)) {
      const pc = Number(pcStr);
      const localEntry = local[pc];
      if (!localEntry || cloudEntry.total > localEntry.total) {
        merged[pc] = cloudEntry;
      }
    }
    saveNoteAccToStorage(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveNoteAccuracy(m: NoteAccMap): Promise<void> {
  saveNoteAccToStorage(m); // always persist locally first
  if (!(await isAuthenticated())) return;
  try {
    const noteAccuracy = JSON.stringify(m);
    const updatedAt = new Date().toISOString();
    if (progressRecordId) {
      await client.models.FretMemorizerProgress.update({ id: progressRecordId, noteAccuracy, updatedAt });
    } else {
      const { data } = await client.models.FretMemorizerProgress.create({ noteAccuracy, updatedAt });
      if (data?.id) progressRecordId = data.id;
    }
  } catch { /* silent — cloud failure must not affect gameplay */ }
}

// ── Session scores (cloud per-session, localStorage chart) ─────────────────

export async function saveScore(payload: FretMemorizerScorePayload): Promise<boolean> {
  if (!(await isAuthenticated())) return false;
  try {
    const { data } = await client.models.FretMemorizerScore.create({
      ...payload,
      completedAt: new Date().toISOString(),
    });
    return data != null;
  } catch {
    return false;
  }
}

export async function loadScores(limit = 30): Promise<FretMemorizerScoreRecord[]> {
  if (!(await isAuthenticated())) return [];
  try {
    const { data } = await client.models.FretMemorizerScore.list({ limit: Math.min(limit, 100) });
    return (data ?? []) as FretMemorizerScoreRecord[];
  } catch {
    return [];
  }
}
