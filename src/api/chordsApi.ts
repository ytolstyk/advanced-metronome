import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

async function isAuthenticated(): Promise<boolean> {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

const LS_KEY = 'chords-favorites';

function loadLocalFavoriteKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function saveLocalFavoriteKeys(keys: string[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(keys));
}

export function toFavoriteKey(root: string, type: string): string {
  return `${root}::${type}`;
}

export async function loadFavorites(): Promise<{ set: Set<string>; idMap: Map<string, string> }> {
  if (!(await isAuthenticated())) {
    return { set: new Set(loadLocalFavoriteKeys()), idMap: new Map() };
  }
  try {
    const { data: records } = await client.models.FavoriteChord.list();
    const set = new Set<string>();
    const idMap = new Map<string, string>();
    for (const r of records ?? []) {
      if (!r) continue;
      const key = toFavoriteKey(r.root, r.type);
      set.add(key);
      idMap.set(key, r.id);
    }
    saveLocalFavoriteKeys([...set]);
    return { set, idMap };
  } catch {
    return { set: new Set(loadLocalFavoriteKeys()), idMap: new Map() };
  }
}

export async function addFavorite(root: string, type: string): Promise<string | null> {
  const key = toFavoriteKey(root, type);
  const keys = loadLocalFavoriteKeys();
  if (!keys.includes(key)) saveLocalFavoriteKeys([...keys, key]);
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.FavoriteChord.create({ root, type });
    return created?.id ?? null;
  } catch {
    return null;
  }
}

export async function removeFavorite(root: string, type: string, cloudId: string | undefined): Promise<void> {
  const key = toFavoriteKey(root, type);
  saveLocalFavoriteKeys(loadLocalFavoriteKeys().filter(k => k !== key));
  if (!cloudId || !(await isAuthenticated())) return;
  try {
    await client.models.FavoriteChord.delete({ id: cloudId });
  } catch {
    // silently ignore
  }
}
