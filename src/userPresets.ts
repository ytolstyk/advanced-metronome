import type { LoopConfig, Pattern } from './types';

export interface UserPreset {
  id: string;
  name: string;
  config: LoopConfig;
  pattern: Pattern;
}

const STORAGE_KEY = 'drum-machine-user-presets';

export function loadUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UserPreset[];
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: UserPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // storage full or unavailable — silently ignore
  }
}
