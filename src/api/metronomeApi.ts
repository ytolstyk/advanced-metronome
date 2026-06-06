import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

const LS_KEY = 'metronome-prefs-v1';

let cachedId: string | null = null;

export interface MetronomePersistedState {
  mode: string;
  bpm: number;
  numerator: number;
  denominator: number;
  subdivision: string;
  measures: unknown[];
}

export async function loadMetronomePrefs(): Promise<MetronomePersistedState | null> {
  if (!(await isAuthenticated())) {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as MetronomePersistedState; } catch { return null; }
  }
  try {
    const { data: records } = await client.models.UserMetronomePrefs.list();
    if (!records || records.length === 0) return null;
    cachedId = records[0].id;
    return JSON.parse(records[0].stateJson) as MetronomePersistedState;
  } catch {
    return null;
  }
}

export async function saveMetronomePrefs(state: MetronomePersistedState): Promise<void> {
  const stateJson = JSON.stringify(state);
  if (!(await isAuthenticated())) {
    localStorage.setItem(LS_KEY, stateJson);
    return;
  }
  try {
    if (cachedId) {
      await client.models.UserMetronomePrefs.update({ id: cachedId, stateJson });
    } else {
      const { data: created } = await client.models.UserMetronomePrefs.create({ stateJson });
      if (created) cachedId = created.id;
    }
    localStorage.setItem(LS_KEY, stateJson);
  } catch {
    localStorage.setItem(LS_KEY, stateJson);
  }
}
