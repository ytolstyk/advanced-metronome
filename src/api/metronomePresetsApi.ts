import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';
import type { MetronomePersistedState } from './metronomeApi';

const client = generateClient<Schema>();
const LS_KEY = 'metronome-presets-v1';

export interface MetronomePreset {
  id: string;
  name: string;
  savedAt: number;
  state: MetronomePersistedState;
}

function loadFromLocalStorage(): MetronomePreset[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MetronomePreset[];
  } catch { return []; }
}

function saveToLocalStorage(presets: MetronomePreset[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(presets)); } catch { /* storage full */ }
}

export async function loadMetronomePresets(): Promise<MetronomePreset[]> {
  if (!(await isAuthenticated())) return loadFromLocalStorage();
  try {
    const { data: records } = await client.models.MetronomePreset.list();
    if (!records) return loadFromLocalStorage();
    const presets: MetronomePreset[] = [];
    for (const r of records) {
      if (r == null) continue;
      try {
        presets.push({
          id: r.id,
          name: r.name,
          savedAt: r.savedAt,
          state: JSON.parse(r.stateJson) as MetronomePersistedState,
        });
      } catch {
        void client.models.MetronomePreset.delete({ id: r.id }).catch(() => {});
      }
    }
    return presets.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return loadFromLocalStorage();
  }
}

export async function saveMetronomePreset(
  name: string,
  state: MetronomePersistedState,
): Promise<MetronomePreset | null> {
  const savedAt = Date.now();
  if (!(await isAuthenticated())) {
    const preset: MetronomePreset = { id: crypto.randomUUID(), name, savedAt, state };
    saveToLocalStorage([preset, ...loadFromLocalStorage()]);
    return preset;
  }
  try {
    const { data: created } = await client.models.MetronomePreset.create({
      name,
      savedAt,
      stateJson: JSON.stringify(state),
    });
    if (!created) return null;
    return { id: created.id, name: created.name, savedAt: created.savedAt, state };
  } catch {
    return null;
  }
}

export async function deleteMetronomePreset(id: string): Promise<void> {
  if (!(await isAuthenticated())) {
    saveToLocalStorage(loadFromLocalStorage().filter(p => p.id !== id));
    return;
  }
  try { await client.models.MetronomePreset.delete({ id }); } catch { /* silent */ }
}
