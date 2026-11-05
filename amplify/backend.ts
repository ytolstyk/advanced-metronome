import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { isTakedownContactSet } from "../src/legalContact";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { backingTrackFunction } from "./functions/backing-track/resource";
import { geminiTabsFunction } from "./functions/gemini-tabs/resource";
import { songMetadataFunction } from "./functions/song-metadata/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  backingTrackFunction,
  geminiTabsFunction,
  songMetadataFunction,
});

// ---- Backing tracks: the one function with direct access to the Bands tables -------------------------
// `allow.resource(fn)` is schema-wide (it would hand the function every model), so access is granted
// per table instead: read-only on the four tables the authorization chain checks, and just enough on
// BackingTrack to create/read/delete its own rows. The function never writes Band.
const uploadsEnabled = process.env.BACKING_TRACKS_ENABLED === "true";
// Launch gate: the Terms promise a takedown address, so a hosted branch cannot go live with uploads on
// while it is a placeholder. (`AWS_BRANCH` is set by Amplify Hosting builds, never in a developer sandbox.)
if (uploadsEnabled && process.env.AWS_BRANCH && !isTakedownContactSet()) {
  throw new Error("BACKING_TRACKS_ENABLED=true needs a real TAKEDOWN_CONTACT in src/legalContact.ts");
}
const trackFn = backend.backingTrackFunction;
const lambda = trackFn.resources.lambda;
const tables = backend.data.resources.tables;
const bucket = backend.storage.resources.bucket;

// Exactly what the function does and nothing more (grantReadWrite would add tagging, ACL and multipart
// actions it never uses): read/write/delete objects, plus ListBucket so a missing key answers 404 rather
// than 403. ListBucket stays unconditioned on purpose: a `s3:prefix` condition would also apply to that
// 404-vs-403 check and turn "missing" into "forbidden".
lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
    resources: [`${bucket.bucketArn}/*`],
  }),
);
lambda.addToRolePolicy(new PolicyStatement({ actions: ["s3:ListBucket"], resources: [bucket.bucketArn] }));
trackFn.addEnvironment("BACKING_TRACKS_BUCKET", bucket.bucketName);
trackFn.addEnvironment("BACKING_TRACKS_ENABLED", uploadsEnabled ? "true" : "false");
// The same switch, published to the client through amplify_outputs.json (`custom`), so the app only offers
// "Add" while uploads are on instead of letting people pick a 50 MB file and then say no. Listening,
// removing and editing stay available either way. (The Lambda console kill switch is not reflected here until
// the next deploy; the Lambda still refuses, and the app shows its plain-language message.)
backend.addOutput({ custom: { backingTracksUploads: uploadsEnabled } });

for (const [model, variable] of [
  ["Band", "TABLE_BAND"],
  ["Member", "TABLE_MEMBER"],
  ["SetList", "TABLE_SETLIST"],
  ["Song", "TABLE_SONG"],
] as const) {
  tables[model].grant(lambda, "dynamodb:GetItem");
  trackFn.addEnvironment(variable, tables[model].tableName);
}
// DescribeTable lets the function find the (Amplify-generated) index names once per container.
tables.BackingTrack.grant(lambda, "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:DescribeTable");
// `table.grant` covers the table ARN only; Query on a GSI needs the `/index/*` ARN too.
lambda.addToRolePolicy(
  new PolicyStatement({ actions: ["dynamodb:Query"], resources: [`${tables.BackingTrack.tableArn}/index/*`] }),
);
trackFn.addEnvironment("TABLE_BACKING_TRACK", tables.BackingTrack.tableName);

// Unfinished uploads must not pile up: a pending object is only ever needed for minutes, and the
// lifecycle rule is the backstop for ones that were never committed (S3 expires in whole days).
const cfnBucket = backend.storage.resources.cfnResources.cfnBucket;
// Explicit, although S3 applies both today: nothing here may ever be public.
cfnBucket.publicAccessBlockConfiguration = {
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
};
// Only the app's own origins may drive the browser upload (a presigned POST needs CORS to report its status)
// and read audio. Amplify's default is `*`. Preview branches live under amplifyapp.com; S3 allows one `*`
// per origin, and dev servers run on any localhost port.
cfnBucket.corsConfiguration = {
  corsRules: [
    {
      allowedOrigins: [
        "https://drummallama.com",
        "https://www.drummallama.com",
        "https://drummallama.app",
        "https://*.amplifyapp.com",
        "http://localhost:*",
      ],
      allowedMethods: ["GET", "HEAD", "POST"],
      allowedHeaders: ["*"],
      exposedHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
      maxAge: 3000,
    },
  ],
};
cfnBucket.lifecycleConfiguration = {
  rules: [
    { id: "expire-pending-uploads", status: "Enabled", prefix: "pending/", expirationInDays: 1 },
    { id: "abort-incomplete-multipart", status: "Enabled", abortIncompleteMultipartUpload: { daysAfterInitiation: 1 } },
  ],
};

// Reserved concurrency caps cost and abuse: gemini-tabs bills Gemini audio calls (so one user can't
// exhaust Gemini quota via parallel requests), song-metadata makes outbound requests, backing-track
// fans out to S3 and DynamoDB.
// DynamoDB-backed per-user rate limiting via TabTranscriptionUsage is a planned upgrade.
//
// Opt-in: AWS refuses any reservation that leaves the account under 10 unreserved executions, and new
// accounts default to a total limit of 10, so a reservation there fails the whole deploy. Set
// FUNCTION_RESERVED_CONCURRENCY (e.g. 5) once the account's Lambda concurrency quota is raised, and
// BACKING_TRACKS_RESERVED_CONCURRENCY (e.g. 10-20) for the backing-track function on its own.
//
// Functions are registered on defineBackend above: `backend.data.resources.functions` only holds the
// API construct's internal Lambdas, not the ones the schema handlers point at.
const reservedFor = (name: string): number | undefined => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
};
const reserve = (fn: { resources: { lambda: { node: { defaultChild?: unknown } } } }, value: number | undefined) => {
  if (value !== undefined) (fn.resources.lambda.node.defaultChild as CfnFunction).reservedConcurrentExecutions = value;
};
const sharedReserved = reservedFor("FUNCTION_RESERVED_CONCURRENCY");
reserve(backend.geminiTabsFunction, sharedReserved);
reserve(backend.songMetadataFunction, sharedReserved);
// Its own knob: commits hold a slot for a few seconds each (a server-side copy of up to 50 MB), so the
// small number that suits the Gemini functions would throttle uploads. Falls back to the shared value.
reserve(backend.backingTrackFunction, reservedFor("BACKING_TRACKS_RESERVED_CONCURRENCY") ?? sharedReserved);
