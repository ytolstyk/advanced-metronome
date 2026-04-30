import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import type { TabTrack } from '../tabEditorTypes';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export interface PublishedTabRecord {
  id: string;
  name: string;
  artist?: string;
  tabAuthor?: string;
  year?: string;
  trackJson: string;
  publishedAt: string;
  owner?: string | null;
}

function toRecord(t: {
  id: string;
  name: string;
  artist?: string | null;
  tabAuthor?: string | null;
  year?: string | null;
  trackJson: string;
  publishedAt: string;
  owner?: string | null;
}): PublishedTabRecord {
  return {
    id: t.id,
    name: t.name,
    artist: t.artist ?? undefined,
    tabAuthor: t.tabAuthor ?? undefined,
    year: t.year ?? undefined,
    trackJson: t.trackJson,
    publishedAt: t.publishedAt,
    owner: t.owner,
  };
}

export async function loadPublishedTabs(
  query?: string,
  limit = 20,
  nextToken?: string,
): Promise<{ tabs: PublishedTabRecord[]; nextToken?: string }> {
  if (!(await isAuthenticated())) return { tabs: [] };
  try {
    const q = query?.trim().toLowerCase();
    const filter = q
      ? { or: [{ nameLower: { contains: q } }, { artistLower: { contains: q } }] }
      : undefined;
    const { data, nextToken: nt } = await client.models.PublishedTab.list({
      filter,
      limit,
      nextToken,
    } as Parameters<typeof client.models.PublishedTab.list>[0]);
    const tabs = (data ?? []).filter(Boolean).map(toRecord);
    return { tabs, nextToken: nt ?? undefined };
  } catch {
    return { tabs: [] };
  }
}

export async function loadPublishedTab(id: string): Promise<PublishedTabRecord | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data } = await client.models.PublishedTab.get({ id });
    if (!data) return null;
    return toRecord(data);
  } catch {
    return null;
  }
}

export async function publishTab(params: {
  name: string;
  artist?: string;
  tabAuthor?: string;
  year?: string;
  track: TabTrack;
}): Promise<PublishedTabRecord> {
  if (!(await isAuthenticated())) throw new Error('Not authenticated');
  const { data, errors } = await client.models.PublishedTab.create({
    name: params.name,
    nameLower: params.name.toLowerCase(),
    artist: params.artist,
    artistLower: params.artist?.toLowerCase(),
    tabAuthor: params.tabAuthor,
    year: params.year,
    trackJson: JSON.stringify(params.track),
    publishedAt: new Date().toISOString(),
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
  if (!data) throw new Error('No data returned from API');
  return toRecord(data);
}

export async function updatePublishedTab(
  id: string,
  params: {
    name: string;
    artist?: string;
    tabAuthor?: string;
    year?: string;
    track: TabTrack;
  },
): Promise<PublishedTabRecord> {
  if (!(await isAuthenticated())) throw new Error('Not authenticated');
  const { data, errors } = await client.models.PublishedTab.update({
    id,
    name: params.name,
    nameLower: params.name.toLowerCase(),
    artist: params.artist,
    artistLower: params.artist?.toLowerCase(),
    tabAuthor: params.tabAuthor,
    year: params.year,
    trackJson: JSON.stringify(params.track),
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
  if (!data) throw new Error('No data returned from API');
  return toRecord(data);
}

export async function deletePublishedTab(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  try { await client.models.PublishedTab.delete({ id }); } catch { /* silent */ }
}

export async function getCurrentUsername(): Promise<string | null> {
  try {
    const { username } = await getCurrentUser();
    return username;
  } catch {
    return null;
  }
}
