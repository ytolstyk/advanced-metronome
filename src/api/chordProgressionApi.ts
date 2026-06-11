import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export const CHORD_PROGRESSION_LS_KEY = 'chord-progression-v1';

let cachedId: string | null = null;

export interface ChordProgressionPersistedState {
  slots: unknown[];
  bpm: number;
  instrument: string;
  selectedKey?: { root: string; mode: 'major' | 'minor' } | null;
}

export async function loadChordProgression(): Promise<ChordProgressionPersistedState | null> {
  if (!(await isAuthenticated())) {
    const raw = localStorage.getItem(CHORD_PROGRESSION_LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as ChordProgressionPersistedState; } catch { return null; }
  }
  try {
    const { data: records } = await client.models.UserChordProgressionPrefs.list();
    if (!records || records.length === 0) {
      // First cloud load — migrate existing localStorage data
      const raw = localStorage.getItem(CHORD_PROGRESSION_LS_KEY);
      if (raw) return JSON.parse(raw) as ChordProgressionPersistedState;
      return null;
    }
    cachedId = records[0].id;
    return JSON.parse(records[0].stateJson) as ChordProgressionPersistedState;
  } catch {
    return null;
  }
}

export async function saveChordProgression(state: ChordProgressionPersistedState): Promise<void> {
  const stateJson = JSON.stringify(state);
  if (!(await isAuthenticated())) {
    localStorage.setItem(CHORD_PROGRESSION_LS_KEY, stateJson);
    return;
  }
  try {
    if (cachedId) {
      await client.models.UserChordProgressionPrefs.update({ id: cachedId, stateJson });
    } else {
      const { data: created } = await client.models.UserChordProgressionPrefs.create({ stateJson });
      if (created) cachedId = created.id;
    }
    localStorage.setItem(CHORD_PROGRESSION_LS_KEY, stateJson);
  } catch {
    localStorage.setItem(CHORD_PROGRESSION_LS_KEY, stateJson);
  }
}
