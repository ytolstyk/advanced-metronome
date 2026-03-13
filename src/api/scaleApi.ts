import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import type { RootNote } from '../data/chords';
import type { ScaleMode } from '../data/scales';

const client = generateClient<Schema>();

async function isAuthenticated(): Promise<boolean> {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

export interface PracticeNote {
  id: number;
  midiNote: number;
  label: string;
  dotKey: string;
}

export interface CloudScaleTrack {
  id: string;
  name: string;
  selectedKey: RootNote;
  selectedMode: ScaleMode;
  practiceNotes: PracticeNote[];
  bpm: number;
}

export async function loadCloudScaleTracks(): Promise<CloudScaleTrack[]> {
  if (!(await isAuthenticated())) return [];
  try {
    const { data: tracks } = await client.models.ScaleTrack.list();
    if (!tracks) return [];
    const good: CloudScaleTrack[] = [];
    for (const t of tracks) {
      if (t == null) continue;
      try {
        good.push({
          id: t.id,
          name: t.name,
          selectedKey: t.selectedKey as RootNote,
          selectedMode: t.selectedMode as ScaleMode,
          practiceNotes: JSON.parse(t.practiceNotesJson) as PracticeNote[],
          bpm: t.bpm,
        });
      } catch {
        void client.models.ScaleTrack.delete({ id: t.id }).catch(() => {});
      }
    }
    return good;
  } catch {
    return [];
  }
}

export async function createCloudScaleTrack(
  name: string,
  selectedKey: RootNote,
  selectedMode: ScaleMode,
  practiceNotes: PracticeNote[],
  bpm: number,
): Promise<CloudScaleTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.ScaleTrack.create({
      name,
      selectedKey,
      selectedMode,
      practiceNotesJson: JSON.stringify(practiceNotes),
      bpm,
    });
    if (!created) return null;
    return { id: created.id, name, selectedKey, selectedMode, practiceNotes, bpm };
  } catch {
    return null;
  }
}

export async function updateCloudScaleTrack(
  id: string,
  name: string,
  selectedKey: RootNote,
  selectedMode: ScaleMode,
  practiceNotes: PracticeNote[],
  bpm: number,
): Promise<CloudScaleTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: updated } = await client.models.ScaleTrack.update({
      id,
      name,
      selectedKey,
      selectedMode,
      practiceNotesJson: JSON.stringify(practiceNotes),
      bpm,
    });
    if (!updated) return null;
    return { id: updated.id, name, selectedKey, selectedMode, practiceNotes, bpm };
  } catch {
    return null;
  }
}

export async function deleteCloudScaleTrack(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  try {
    await client.models.ScaleTrack.delete({ id });
  } catch {
    // Silently ignore
  }
}
