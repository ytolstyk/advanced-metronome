import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { createDbPort, createS3Port } from './adapters';
import { commitTrack, requestUpload } from './core';
import { editTrack, leaveMine, removeForBand, removeSongTracks, removeTracks } from './manage';
import type { Deps } from './ports';
import { BackingTrackError } from './rules';

/**
 * Just the part of the AppSync event this function reads, kept local so the module needs no `aws-lambda`
 * types. For Amplify function resolvers `fieldName` is TOP-LEVEL on the event (verified against a sandbox).
 */
interface ResolverEvent {
  fieldName?: string;
  arguments: Record<string, unknown>;
  identity?: { sub?: string } | null;
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
};

// Without these a stalled socket would hold the invocation (and a scarce concurrency slot) for the whole 25 s.
let cached: Deps | undefined;

/** Built once per container; the clients are reused across invocations. */
function dependencies(): Deps {
  cached ??= {
    s3: createS3Port(new S3Client({ requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 } }), required('BACKING_TRACKS_BUCKET')),
    db: createDbPort(new DynamoDBClient({ requestHandler: { connectionTimeout: 2_000, requestTimeout: 5_000 } }), {
      band: required('TABLE_BAND'),
      member: required('TABLE_MEMBER'),
      setList: required('TABLE_SETLIST'),
      song: required('TABLE_SONG'),
      track: required('TABLE_BACKING_TRACK'),
    }),
    now: Date.now,
    random: Math.random,
    newId: randomUUID,
    enabled: process.env.BACKING_TRACKS_ENABLED === 'true',
  };
  return cached;
}

const reply = (body: Record<string, unknown>): string => JSON.stringify(body);

/**
 * Every outcome is a JSON string (AppSync cannot return a custom type from a function resolver):
 * `{ok:true, ...}` or `{ok:false, code}`. Expected failures carry a code the client maps to plain
 * language; anything unexpected is logged and reported as `retry`, never as a specific cause.
 */
export const handler = async (event: ResolverEvent): Promise<string> => {
  // A missing sub means the caller used identity-pool (IAM) auth, which this feature never accepts.
  const sub = event.identity?.sub;
  if (!sub) return reply({ ok: false, code: 'forbidden' });

  try {
    const deps = dependencies();
    switch (event.fieldName) {
      case 'requestBackingTrackUpload':
        return reply({ ok: true, ...(await requestUpload(deps, sub, event.arguments)) });
      case 'commitBackingTrack':
        return reply({ ok: true, track: await commitTrack(deps, sub, event.arguments) });
      case 'editBackingTrack':
        return reply({ ok: true, track: await editTrack(deps, sub, event.arguments) });
      case 'removeBackingTracks':
        return reply({ ok: true, results: await removeTracks(deps, sub, event.arguments) });
      case 'removeSongBackingTracks':
        return reply({ ok: true, ...(await removeSongTracks(deps, sub, event.arguments)) });
      case 'leaveMyBackingTracks':
        return reply({ ok: true, ...(await leaveMine(deps, sub, event.arguments)) });
      case 'removeMemberBackingTracks':
        return reply({ ok: true, ...(await removeForBand(deps, sub, event.arguments)) });
      default:
        return reply({ ok: false, code: 'bad-input' });
    }
  } catch (error) {
    if (error instanceof BackingTrackError) return reply({ ok: false, code: error.code });
    console.error('backing-track failure', event.fieldName, error);
    return reply({ ok: false, code: 'retry' });
  }
};
