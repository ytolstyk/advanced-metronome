import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';
import { loadFromStorage, saveToStorage } from './storageUtils';

const client = generateClient<Schema>();

// ── Progress ────────────────────────────────────────────────────────────────

const LS_PROGRESS_KEY = 'lessons-progress';

interface ProgressEntry {
  lessonId: string;
  moduleId: string;
  status: 'active' | 'completed';
  completedAt?: string;
}

function loadLocalProgress(): ProgressEntry[] {
  return loadFromStorage<ProgressEntry[]>(LS_PROGRESS_KEY, []);
}

function saveLocalProgress(entries: ProgressEntry[]): void {
  saveToStorage(LS_PROGRESS_KEY, entries);
}

export async function loadProgress(): Promise<{
  map: Map<string, 'active' | 'completed'>;
  idMap: Map<string, string>;
}> {
  if (!(await isAuthenticated())) {
    const map = new Map<string, 'active' | 'completed'>();
    for (const e of loadLocalProgress()) map.set(e.lessonId, e.status);
    return { map, idMap: new Map() };
  }
  try {
    const { data: records } = await client.models.LessonProgress.list();
    const map = new Map<string, 'active' | 'completed'>();
    const idMap = new Map<string, string>();
    const local: ProgressEntry[] = [];
    for (const r of records ?? []) {
      if (!r) continue;
      const status = r.status as 'active' | 'completed';
      map.set(r.lessonId, status);
      idMap.set(r.lessonId, r.id);
      local.push({ lessonId: r.lessonId, moduleId: r.moduleId, status, completedAt: r.completedAt ?? undefined });
    }
    saveLocalProgress(local);
    return { map, idMap };
  } catch {
    const map = new Map<string, 'active' | 'completed'>();
    for (const e of loadLocalProgress()) map.set(e.lessonId, e.status);
    return { map, idMap: new Map() };
  }
}

export async function saveProgress(
  lessonId: string,
  moduleId: string,
  status: 'active' | 'completed',
  cloudId: string | undefined,
): Promise<string | null> {
  const completedAt = status === 'completed' ? new Date().toISOString() : undefined;

  // Update localStorage
  const local = loadLocalProgress();
  const idx = local.findIndex(e => e.lessonId === lessonId);
  const entry: ProgressEntry = { lessonId, moduleId, status, completedAt };
  if (idx >= 0) local[idx] = entry; else local.push(entry);
  saveLocalProgress(local);

  if (!(await isAuthenticated())) return null;
  try {
    if (cloudId) {
      await client.models.LessonProgress.update({ id: cloudId, status, completedAt: completedAt ?? null });
      return cloudId;
    } else {
      const { data: created } = await client.models.LessonProgress.create({
        lessonId, moduleId, status, completedAt: completedAt ?? null,
      });
      return created?.id ?? null;
    }
  } catch {
    return null;
  }
}

// ── Favorites ───────────────────────────────────────────────────────────────

const LS_FAV_KEY = 'lessons-favorites';

function loadLocalFavorites(): string[] {
  return loadFromStorage<string[]>(LS_FAV_KEY, []);
}

function saveLocalFavorites(ids: string[]): void {
  saveToStorage(LS_FAV_KEY, ids);
}

export async function loadLessonFavorites(): Promise<{
  set: Set<string>;
  idMap: Map<string, string>;
}> {
  if (!(await isAuthenticated())) {
    return { set: new Set(loadLocalFavorites()), idMap: new Map() };
  }
  try {
    const { data: records } = await client.models.LessonFavorite.list();
    const set = new Set<string>();
    const idMap = new Map<string, string>();
    for (const r of records ?? []) {
      if (!r) continue;
      set.add(r.lessonId);
      idMap.set(r.lessonId, r.id);
    }
    saveLocalFavorites([...set]);
    return { set, idMap };
  } catch {
    return { set: new Set(loadLocalFavorites()), idMap: new Map() };
  }
}

export async function addLessonFavorite(lessonId: string, moduleId: string): Promise<string | null> {
  const local = loadLocalFavorites();
  if (!local.includes(lessonId)) saveLocalFavorites([...local, lessonId]);
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.LessonFavorite.create({ lessonId, moduleId });
    return created?.id ?? null;
  } catch {
    return null;
  }
}

export async function removeLessonFavorite(lessonId: string, cloudId: string | undefined): Promise<void> {
  saveLocalFavorites(loadLocalFavorites().filter(id => id !== lessonId));
  if (!cloudId || !(await isAuthenticated())) return;
  try {
    await client.models.LessonFavorite.delete({ id: cloudId });
  } catch {
    // silently ignore
  }
}
