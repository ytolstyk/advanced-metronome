import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import type { TrackPiece } from '../audio/ClickTrackEngine';

export interface SegmentGroup { id: string; name: string; color: string }

const client = generateClient<Schema>();

async function isAuthenticated(): Promise<boolean> {
  try { await getCurrentUser(); return true; } catch { return false; }
}

export interface CloudClickTrack {
  id: string;
  name: string;
  pieces: TrackPiece[];
  groups: SegmentGroup[];
}

export async function loadCloudClickTracks(): Promise<CloudClickTrack[]> {
  if (!(await isAuthenticated())) return [];
  try {
    const { data: tracks } = await client.models.ClickTrack.list();
    if (!tracks) return [];
    const good: CloudClickTrack[] = [];
    for (const t of tracks) {
      if (t == null) continue;
      try {
        good.push({
          id: t.id,
          name: t.name,
          pieces: JSON.parse(t.piecesJson) as TrackPiece[],
          groups: JSON.parse(t.groupsJson) as SegmentGroup[],
        });
      } catch {
        void client.models.ClickTrack.delete({ id: t.id }).catch(() => {});
      }
    }
    return good;
  } catch {
    return [];
  }
}

export async function saveCloudClickTrack(
  name: string,
  pieces: TrackPiece[],
  groups: SegmentGroup[],
): Promise<CloudClickTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.ClickTrack.create({
      name,
      piecesJson: JSON.stringify(pieces),
      groupsJson: JSON.stringify(groups),
    });
    if (!created) return null;
    return { id: created.id, name: created.name, pieces, groups };
  } catch {
    return null;
  }
}

export async function deleteCloudClickTrack(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  try { await client.models.ClickTrack.delete({ id }); } catch { /* silent */ }
}
