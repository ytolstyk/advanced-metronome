import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

const LS_KEY = 'noteColors';

let cachedId: string | null = null;

export async function loadNoteColors(): Promise<Record<string, string> | null> {
  if (!(await isAuthenticated())) {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as Record<string, string>; } catch { return null; }
  }
  try {
    const { data: records } = await client.models.UserNoteColors.list();
    if (!records || records.length === 0) return null;
    cachedId = records[0].id;
    return JSON.parse(records[0].colorsJson) as Record<string, string>;
  } catch {
    return null;
  }
}

export async function saveNoteColors(fill: Record<string, string>): Promise<void> {
  const colorsJson = JSON.stringify(fill);
  if (!(await isAuthenticated())) {
    localStorage.setItem(LS_KEY, colorsJson);
    return;
  }
  try {
    if (cachedId) {
      await client.models.UserNoteColors.update({ id: cachedId, colorsJson });
    } else {
      const { data: created } = await client.models.UserNoteColors.create({ colorsJson });
      if (created) cachedId = created.id;
    }
    // Also mirror to localStorage so offline reads are fresh
    localStorage.setItem(LS_KEY, colorsJson);
  } catch {
    // silent — cloud failure should not break UI
    localStorage.setItem(LS_KEY, colorsJson);
  }
}
