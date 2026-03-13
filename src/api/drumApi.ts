import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import type { LoopConfig, Pattern, ChordPattern, ChordInstrumentType } from '../types';

const client = generateClient<Schema>();

async function isAuthenticated(): Promise<boolean> {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

// ─── Current Track ───────────────────────────────────────────────────────────

export interface TrackData {
  config: LoopConfig;
  pattern: Pattern;
  chordPattern: ChordPattern;
  chordInstrument: ChordInstrumentType;
  chordVolume: number;
}

// Cached ID so we update instead of create on subsequent saves
let cachedTrackId: string | null = null;

export async function loadCurrentTrack(): Promise<TrackData | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: tracks } = await client.models.CurrentTrack.list();
    if (!tracks || tracks.length === 0) return null;
    const track = tracks[0];
    cachedTrackId = track.id;
    return {
      config: JSON.parse(track.configJson) as LoopConfig,
      pattern: JSON.parse(track.patternJson) as Pattern,
      chordPattern: JSON.parse(track.chordPatternJson) as ChordPattern,
      chordInstrument: track.chordInstrument as ChordInstrumentType,
      chordVolume: track.chordVolume,
    };
  } catch {
    return null;
  }
}

export async function saveCurrentTrack(trackData: TrackData): Promise<void> {
  if (!(await isAuthenticated())) return;
  try {
    const payload = {
      configJson: JSON.stringify(trackData.config),
      patternJson: JSON.stringify(trackData.pattern),
      chordPatternJson: JSON.stringify(trackData.chordPattern),
      chordInstrument: trackData.chordInstrument,
      chordVolume: trackData.chordVolume,
    };
    if (cachedTrackId) {
      await client.models.CurrentTrack.update({ id: cachedTrackId, ...payload });
    } else {
      const { data: created } = await client.models.CurrentTrack.create(payload);
      if (created) cachedTrackId = created.id;
    }
  } catch {
    // Silently ignore — localStorage is the fallback
  }
}

// ─── Drum Tracks ─────────────────────────────────────────────────────────────

export interface CloudDrumTrack {
  id: string;
  name: string;
  config: LoopConfig;
  pattern: Pattern;
  chordPattern: ChordPattern;
}

export async function loadCloudDrumTracks(): Promise<CloudDrumTrack[]> {
  if (!(await isAuthenticated())) return [];
  try {
    const { data: tracks } = await client.models.DrumTrack.list();
    if (!tracks) return [];
    const good: CloudDrumTrack[] = [];
    for (const t of tracks) {
      if (t == null) continue;
      try {
        good.push({
          id: t.id,
          name: t.name,
          config: JSON.parse(t.configJson) as LoopConfig,
          pattern: JSON.parse(t.patternJson) as Pattern,
          chordPattern: JSON.parse(t.chordPatternJson) as ChordPattern,
        });
      } catch {
        void client.models.DrumTrack.delete({ id: t.id }).catch(() => {});
      }
    }
    return good;
  } catch {
    return [];
  }
}

export async function createCloudDrumTrack(
  name: string,
  config: LoopConfig,
  pattern: Pattern,
  chordPattern: ChordPattern,
): Promise<CloudDrumTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.DrumTrack.create({
      name,
      configJson: JSON.stringify(config),
      patternJson: JSON.stringify(pattern),
      chordPatternJson: JSON.stringify(chordPattern),
    });
    if (!created) return null;
    return { id: created.id, name: created.name, config, pattern, chordPattern };
  } catch {
    return null;
  }
}

export async function updateCloudDrumTrack(
  id: string,
  name: string,
  config: LoopConfig,
  pattern: Pattern,
  chordPattern: ChordPattern,
): Promise<CloudDrumTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: updated } = await client.models.DrumTrack.update({
      id,
      name,
      configJson: JSON.stringify(config),
      patternJson: JSON.stringify(pattern),
      chordPatternJson: JSON.stringify(chordPattern),
    });
    if (!updated) return null;
    return { id: updated.id, name: updated.name, config, pattern, chordPattern };
  } catch {
    return null;
  }
}

export async function deleteCloudDrumTrack(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  try {
    await client.models.DrumTrack.delete({ id });
  } catch {
    // Silently ignore
  }
}
