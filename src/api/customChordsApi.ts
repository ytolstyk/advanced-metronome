import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import type { RootNote, ChordVoicing, Barre } from '../data/chords';
import { loadFromStorage, saveToStorage } from './storageUtils';

const client = generateClient<Schema>();

const LS_KEY = 'custom-chords-v1';

export interface CustomChordRecord {
  id: string;
  root: RootNote;
  type: string;
  name?: string;
  voicing: ChordVoicing;
  isPublic: boolean;
  authorName?: string;
  stringCount: 6 | 7 | 8;
  tuningId: string;
  createdAt: string;
  isOwn: boolean;
}

export interface CreateCustomChordParams {
  root: RootNote;
  type: string;
  name?: string;
  voicing: ChordVoicing;
  isPublic: boolean;
  stringCount: 6 | 7 | 8;
  tuningId: string;
}

type AmplifyRecord = {
  id: string;
  root: string;
  type: string;
  name?: string | null;
  fretsJson: string;
  barreJson?: string | null;
  startFret?: number | null;
  isPublic: boolean;
  authorName?: string | null;
  stringCount: number;
  tuningId: string;
  createdAt: string;
};

interface AuthContext { username: string }

async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const { username } = await getCurrentUser();
    return username ? { username } : null;
  } catch {
    return null;
  }
}

function toRecord(r: AmplifyRecord, isOwn: boolean): CustomChordRecord {
  return {
    id: r.id,
    root: r.root as RootNote,
    type: r.type,
    name: r.name ?? undefined,
    voicing: {
      frets: JSON.parse(r.fretsJson) as number[],
      barre: r.barreJson ? (JSON.parse(r.barreJson) as Barre) : undefined,
      startFret: r.startFret ?? undefined,
    },
    isPublic: r.isPublic,
    authorName: r.authorName ?? undefined,
    stringCount: r.stringCount as 6 | 7 | 8,
    tuningId: r.tuningId,
    createdAt: r.createdAt,
    isOwn,
  };
}

export async function loadMyCustomChords(): Promise<CustomChordRecord[]> {
  const auth = await getAuthContext();
  if (!auth) return loadFromStorage<CustomChordRecord[]>(LS_KEY, []);
  try {
    const { data: records } = await client.models.UserCustomChord.list({
      filter: { authorName: { eq: auth.username } },
    });
    const chords = (records ?? [])
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map(r => toRecord(r as AmplifyRecord, true));
    saveToStorage(LS_KEY, chords);
    return chords;
  } catch {
    return loadFromStorage<CustomChordRecord[]>(LS_KEY, []);
  }
}

export async function loadCommunityChords(
  stringCount: 6 | 7 | 8,
  tuningId: string,
): Promise<CustomChordRecord[]> {
  const auth = await getAuthContext();
  if (!auth) return [];
  try {
    const { data: records } = await client.models.UserCustomChord.list({
      filter: {
        isPublic: { eq: true },
        stringCount: { eq: stringCount },
        tuningId: { eq: tuningId },
      },
    });
    return (records ?? [])
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map(r => toRecord(r as AmplifyRecord, r.authorName === auth.username));
  } catch {
    return [];
  }
}

export async function createCustomChord(
  params: CreateCustomChordParams,
): Promise<CustomChordRecord> {
  const fretsJson = JSON.stringify(params.voicing.frets);
  const barreJson = params.voicing.barre ? JSON.stringify(params.voicing.barre) : undefined;
  const startFret = params.voicing.startFret;
  const createdAt = new Date().toISOString();
  const auth = await getAuthContext();
  const authorName = auth?.username;

  function makeLocalRecord(id: string): CustomChordRecord {
    return {
      id,
      root: params.root,
      type: params.type,
      name: params.name,
      voicing: params.voicing,
      isPublic: auth ? params.isPublic : false,
      authorName,
      stringCount: params.stringCount,
      tuningId: params.tuningId,
      createdAt,
      isOwn: true,
    };
  }

  if (!auth) {
    const record = makeLocalRecord(crypto.randomUUID());
    saveToStorage(LS_KEY, [...loadFromStorage<CustomChordRecord[]>(LS_KEY, []), record]);
    return record;
  }

  try {
    const { data: created } = await client.models.UserCustomChord.create({
      root: params.root,
      type: params.type,
      name: params.name,
      fretsJson,
      barreJson,
      startFret,
      isPublic: params.isPublic,
      authorName,
      stringCount: params.stringCount,
      tuningId: params.tuningId,
      createdAt,
    });
    if (!created) throw new Error('Create returned null');
    const record = makeLocalRecord(created.id);
    saveToStorage(LS_KEY, [...loadFromStorage<CustomChordRecord[]>(LS_KEY, []), record]);
    return record;
  } catch {
    const record = makeLocalRecord(crypto.randomUUID());
    saveToStorage(LS_KEY, [...loadFromStorage<CustomChordRecord[]>(LS_KEY, []), record]);
    return record;
  }
}

export async function deleteCustomChord(id: string): Promise<void> {
  saveToStorage(
    LS_KEY,
    loadFromStorage<CustomChordRecord[]>(LS_KEY, []).filter(c => c.id !== id),
  );
  if (!(await getAuthContext())) return;
  try {
    await client.models.UserCustomChord.delete({ id });
  } catch {
    // silently ignore — optimistic removal already applied
  }
}
