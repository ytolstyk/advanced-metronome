import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

const LS_KEY = 'caged-prefs-v1';

let cachedId: string | null = null;

export interface CAGEDPrefs {
  rootNote: string;
  activeShape: string | null;
  showScale: boolean;
}

export async function loadCAGEDPrefs(): Promise<CAGEDPrefs | null> {
  if (!(await isAuthenticated())) {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as CAGEDPrefs; } catch { return null; }
  }
  try {
    const { data: records } = await client.models.UserCAGEDPrefs.list();
    if (!records || records.length === 0) return null;
    cachedId = records[0].id;
    return JSON.parse(records[0].prefsJson) as CAGEDPrefs;
  } catch {
    return null;
  }
}

export async function saveCAGEDPrefs(prefs: CAGEDPrefs): Promise<void> {
  const prefsJson = JSON.stringify(prefs);
  if (!(await isAuthenticated())) {
    localStorage.setItem(LS_KEY, prefsJson);
    return;
  }
  try {
    if (cachedId) {
      await client.models.UserCAGEDPrefs.update({ id: cachedId, prefsJson });
    } else {
      const { data: created } = await client.models.UserCAGEDPrefs.create({ prefsJson });
      if (created) cachedId = created.id;
    }
    localStorage.setItem(LS_KEY, prefsJson);
  } catch {
    localStorage.setItem(LS_KEY, prefsJson);
  }
}
