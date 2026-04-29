import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { TabTrack } from '../tabEditorTypes';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export interface CloudTabTrack {
  id: string;
  name: string;
  track: TabTrack;
}

export async function loadCloudTabTracks(): Promise<CloudTabTrack[]> {
  if (!(await isAuthenticated())) return [];
  try {
    const { data: tracks } = await client.models.TabEditorTrack.list();
    if (!tracks) return [];
    const good: CloudTabTrack[] = [];
    for (const t of tracks) {
      if (t == null) continue;
      try {
        good.push({
          id: t.id,
          name: t.name,
          track: JSON.parse(t.trackJson) as TabTrack,
        });
      } catch {
        void client.models.TabEditorTrack.delete({ id: t.id }).catch(() => {});
      }
    }
    return good;
  } catch {
    return [];
  }
}

export async function saveCloudTabTrack(
  name: string,
  track: TabTrack,
): Promise<CloudTabTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.TabEditorTrack.create({
      name,
      trackJson: JSON.stringify(track),
    });
    if (!created) return null;
    return { id: created.id, name: created.name, track };
  } catch {
    return null;
  }
}

export async function updateCloudTabTrack(
  id: string,
  name: string,
  track: TabTrack,
): Promise<CloudTabTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: updated } = await client.models.TabEditorTrack.update({
      id,
      name,
      trackJson: JSON.stringify(track),
    });
    if (!updated) return null;
    return { id: updated.id, name: updated.name, track };
  } catch {
    return null;
  }
}

export async function deleteCloudTabTrack(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  try { await client.models.TabEditorTrack.delete({ id }); } catch { /* silent */ }
}
