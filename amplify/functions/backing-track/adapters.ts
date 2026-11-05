/** The AWS SDK implementations of the ports in `ports.ts`. Thin on purpose: all decisions live in `core.ts`. */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { BandItem, CopyResult, DbPort, HeadResult, MemberItem, S3Port, SetListItem, SongItem, TrackRow } from './ports';
import type { StoredObject } from './rules';

type AwsError = { name?: string; $metadata?: { httpStatusCode?: number } };
const statusOf = (error: unknown): number | undefined => (error as AwsError).$metadata?.httpStatusCode;
const nameOf = (error: unknown): string | undefined => (error as AwsError).name;

const isMissing = (error: unknown) => statusOf(error) === 404 || nameOf(error) === 'NotFound' || nameOf(error) === 'NoSuchKey';
const isPreconditionFailed = (error: unknown) => statusOf(error) === 412 || nameOf(error) === 'PreconditionFailed';

export function createS3Port(client: S3Client, bucket: string): S3Port {
  return {
    async head(key): Promise<HeadResult | null> {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
          etag: out.ETag ?? '',
          size: out.ContentLength ?? 0,
          contentType: out.ContentType,
          track: out.Metadata?.track,
          lastModified: out.LastModified?.getTime() ?? 0,
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error; // a 403 or a 5xx is "retry", never "missing"
      }
    },

    async readStart(key, length, ifMatch) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}`, IfMatch: ifMatch }),
        );
        return (await out.Body?.transformToByteArray()) ?? null;
      } catch (error) {
        if (isMissing(error) || isPreconditionFailed(error)) return null;
        throw error;
      }
    },

    async copy(source, destination, options): Promise<CopyResult> {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: destination,
            CopySource: `${bucket}/${source.split('/').map(encodeURIComponent).join('/')}`,
            CopySourceIfMatch: options.ifMatch,
            MetadataDirective: 'REPLACE',
            ContentType: options.contentType,
          }),
        );
        return 'ok';
      } catch (error) {
        if (isMissing(error)) return 'missing';
        if (isPreconditionFailed(error)) return 'changed';
        throw error;
      }
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(prefix): Promise<StoredObject[]> {
      const objects: StoredObject[] = [];
      let token: string | undefined;
      do {
        const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const item of out.Contents ?? []) {
          if (item.Key) objects.push({ key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified?.getTime() ?? 0 });
        }
        token = out.NextContinuationToken;
      } while (token);
      return objects;
    },

    async presignPost({ key, policy, expiresSeconds }) {
      // The library pins `key` and every other form field as exact-match conditions by itself.
      const fields = Object.fromEntries(Object.entries(policy.fields).filter(([name]) => name !== 'key'));
      const signed = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Fields: fields,
        Conditions: policy.conditions as never,
        Expires: expiresSeconds,
      });
      return { url: signed.url, fields: signed.fields };
    },
  };
}

export interface DbConfig {
  band: string;
  member: string;
  setList: string;
  song: string;
  track: string;
}

/** Counting stops after this many pages: the caps are 10 and 100, so more pages mean "full" anyway. */
const MAX_COUNT_PAGES = 3;

export function createDbPort(client: DynamoDBClient, config: DbConfig): DbPort {
  const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

  // Amplify generates the index names, so find them once per container instead of guessing a convention.
  let indexNames: Promise<Map<string, string>> | undefined;
  const indexOn = async (attribute: string): Promise<string> => {
    indexNames ??= client.send(new DescribeTableCommand({ TableName: config.track })).then((out) => {
      const names = new Map<string, string>();
      for (const index of out.Table?.GlobalSecondaryIndexes ?? []) {
        const hash = index.KeySchema?.find((key) => key.KeyType === 'HASH')?.AttributeName;
        if (hash && index.IndexName) names.set(hash, index.IndexName);
      }
      return names;
    });
    // A failed lookup must not be cached for the container's lifetime: forget it so the next call retries.
    indexNames.catch(() => {
      indexNames = undefined;
    });
    const name = (await indexNames).get(attribute);
    if (!name) throw new Error(`BackingTrack has no index on ${attribute}`);
    return name;
  };

  const get = async <T>(TableName: string, Key: Record<string, string>): Promise<T | null> => {
    const out = await doc.send(new GetCommand({ TableName, Key, ConsistentRead: true }));
    return (out.Item as T | undefined) ?? null;
  };

  return {
    getBand: (id) => get<BandItem>(config.band, { id }),
    getMember: (bandId, sub) => get<MemberItem>(config.member, { bandId, owner: sub }),
    getSetList: (id) => get<SetListItem>(config.setList, { id }),
    getSong: (id) => get<SongItem>(config.song, { id }),
    getTrack: (id) => get<TrackRow>(config.track, { id }),

    async createTrack(row) {
      try {
        await doc.send(
          new PutCommand({
            TableName: config.track,
            Item: { ...row, __typename: 'BackingTrack' },
            ConditionExpression: 'attribute_not_exists(id)',
          }),
        );
        return true;
      } catch (error) {
        if (nameOf(error) === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },

    async deleteTrack(id, owner) {
      try {
        await doc.send(
          new DeleteCommand({
            TableName: config.track,
            Key: { id },
            ConditionExpression: '#o = :o',
            ExpressionAttributeNames: { '#o': 'owner' },
            ExpressionAttributeValues: { ':o': owner },
          }),
        );
      } catch (error) {
        if (nameOf(error) !== 'ConditionalCheckFailedException') throw error;
      }
    },

    async countTracks(by) {
      const [field, value] = 'songId' in by ? (['songId', by.songId] as const) : (['bandId', by.bandId] as const);
      const IndexName = await indexOn(field);
      let count = 0;
      let startKey: Record<string, unknown> | undefined;
      for (let page = 0; page < MAX_COUNT_PAGES; page += 1) {
        const out = await doc.send(
          new QueryCommand({
            TableName: config.track,
            IndexName,
            KeyConditionExpression: '#f = :v',
            ExpressionAttributeNames: { '#f': field },
            ExpressionAttributeValues: { ':v': value },
            Select: 'COUNT',
            ExclusiveStartKey: startKey,
          }),
        );
        count += out.Count ?? 0;
        startKey = out.LastEvaluatedKey;
        if (!startKey) break;
      }
      return count;
    },

    async listTracks(by, max) {
      const [field, value] = 'songId' in by ? (['songId', by.songId] as const) : (['bandId', by.bandId] as const);
      const IndexName = await indexOn(field);
      const rows: TrackRow[] = [];
      let startKey: Record<string, unknown> | undefined;
      do {
        const out = await doc.send(
          new QueryCommand({
            TableName: config.track,
            IndexName,
            KeyConditionExpression: '#f = :v',
            ExpressionAttributeNames: { '#f': field },
            ExpressionAttributeValues: { ':v': value },
            Limit: max - rows.length,
            ExclusiveStartKey: startKey,
          }),
        );
        rows.push(...((out.Items ?? []) as TrackRow[]));
        startKey = out.LastEvaluatedKey;
      } while (startKey && rows.length < max);
      return rows;
    },

    async updateTrackMeta(id, owner, patch) {
      try {
        const out = await doc.send(
          new UpdateCommand({
            TableName: config.track,
            Key: { id },
            // No upsert: the row must exist and be the caller's. `label` is a plain attribute name here.
            ConditionExpression: 'attribute_exists(id) AND #o = :o',
            UpdateExpression: 'SET #l = :l, forTags = :t, updatedAt = :u',
            ExpressionAttributeNames: { '#o': 'owner', '#l': 'label' },
            ExpressionAttributeValues: { ':o': owner, ':l': patch.label, ':t': patch.forTags, ':u': patch.updatedAt },
            ReturnValues: 'ALL_NEW',
          }),
        );
        return (out.Attributes as TrackRow | undefined) ?? null;
      } catch (error) {
        if (nameOf(error) === 'ConditionalCheckFailedException') return null;
        throw error;
      }
    },
  };
}
