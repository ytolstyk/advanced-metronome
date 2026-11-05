/**
 * Operator script: finds (and with --delete removes) backing track files that no row can reach.
 *
 *   npx tsx scripts/backing-tracks-sweep.ts --bucket <bucket> --table <BackingTrack table> [--region us-west-2]
 *   npx tsx scripts/backing-tracks-sweep.ts --bucket <bucket> --table <table> --delete --limit 100
 *
 * Dry run is the default. Uses your AWS credentials (S3 list/get/delete on the bucket, DynamoDB GetItem on
 * the table). The decision lives in `amplify/functions/backing-track/sweep.ts` and is unit tested; see
 * `docs/backing-tracks-runbook.md` for when to run it.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { createDbPort, createS3Port } from '../amplify/functions/backing-track/adapters';
import { sweepOrphans } from '../amplify/functions/backing-track/sweep';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const bucket = arg('bucket');
const table = arg('table');
if (!bucket || !table) {
  console.error('usage: backing-tracks-sweep.ts --bucket <bucket> --table <BackingTrack table> [--region r] [--delete] [--limit n]');
  process.exit(2);
}
const region = arg('region') ?? 'us-west-2';
const limit = Number(arg('limit') ?? 100);
if (!Number.isInteger(limit) || limit < 1) {
  console.error('--limit must be a positive whole number');
  process.exit(2);
}
const dryRun = !process.argv.includes('--delete');

const report = await sweepOrphans(
  {
    s3: createS3Port(new S3Client({ region }), bucket),
    // Only getTrack is used, so the other table names are never read.
    db: createDbPort(new DynamoDBClient({ region }), { band: '', member: '', setList: '', song: '', track: table }),
    now: Date.now,
  },
  { dryRun, limit },
);

console.log(`${dryRun ? 'DRY RUN: ' : ''}scanned ${report.scanned} objects, ${report.orphans.length} orphan(s)${dryRun ? '' : ' deleted'}`);
for (const key of report.orphans) console.log(` ${dryRun ? 'would delete' : 'deleted'} ${key}`);
if (report.truncated) console.log(`Stopped at --limit ${limit}; run it again for the rest.`);
if (dryRun && report.orphans.length > 0) console.log('Re-run with --delete to remove them.');
