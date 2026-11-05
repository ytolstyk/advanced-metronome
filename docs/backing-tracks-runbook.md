# Backing tracks: operator runbook

Audio files that band members attach to songs. This is the one part of the app where users send files
to your AWS account, so it has caps, a kill switch and a few things only you can do. Read this before
turning uploads on, and keep it handy for takedowns.

## What is where

| Thing | Where |
|---|---|
| Audio files | Private S3 bucket from `amplify/storage/resource.ts` (name: `storage.bucket_name` in `amplify_outputs.json`) |
| Committed files | `bt/{userSub}/{bandId}/{songId}/{trackId}.{mp3,m4a,wav,flac}` |
| Unfinished uploads | `pending/{userSub}/{0,1,2}` (at most 3 per user; expire after 1 day) |
| Rows (name, tags, key, size) | DynamoDB table `BackingTrack-<apiId>-NONE`, partition key `id` (= trackId) |
| The only writer | Lambda `backing-track` (`amplify/functions/backing-track`) |

Browsers cannot write to the bucket at all. They ask the Lambda for a 2-minute signed upload form that
S3 itself limits to one exact key, one content type and the declared size (at most 50 MB); the Lambda
then verifies the file and moves it into `bt/`. Any signed-in user can read `bt/*` if they know the key
(there is no listing), which is the same "whoever has the band link" model as the rest of Bands.

Limits (all in `src/backingTrackFormat.ts`): 50 MB per file; MP3, M4A, WAV, FLAC; 20 files and 600 MB per
person; 10 per song; 100 per band; 3 unfinished uploads per person.

## Launch gates

Uploads ship **off**. Do all of these, then set `BACKING_TRACKS_ENABLED=true` in the Amplify branch
environment variables and redeploy.

1. **Takedown address.** Replace `TODO-set-before-launch` in `src/legalContact.ts` with an inbox you
   read. A hosted build refuses to deploy with uploads on while it is still a placeholder. It appears in
   the Terms of Service and the Privacy Policy.
2. **Spend ceiling and alert.** Create an AWS Budget for the account (Billing > Budgets) with an email
   alert at a monthly amount you are comfortable losing, for example 80% and 100%. Add a CloudWatch alarm
   on the bucket's `BucketSizeBytes` (S3 > the bucket > Metrics) above a size you would not expect
   (for scale: 100 active users at the 600 MB cap is 60 GB, about $1.40 a month to store).
   **Downloads are unmetered**: every signed-in user can download without limit, and S3 data transfer
   out costs about $0.09 per GB after the free tier. A 50 MB track downloaded 1,000 times is about $4.50.
   The alert is your protection, so do not skip it.
3. **No DMCA agent is registered.** That is an accepted risk for launch: the Terms tell users to upload
   only what they may share, owners and you can remove anything, and the takedown address is published.
   If you want the safe-harbour protection, register a designated agent with the US Copyright Office
   (a small fee) and add the details to the Terms.
4. **Lambda concurrency.** Reserved concurrency is optional because AWS refuses a reservation that leaves
   the account under 10 unreserved executions (a new account's total limit is 10), and a commit holds a slot
   for a few seconds (it copies up to 50 MB inside S3). On a new account the 10 slots are shared with the
   Gemini functions, so a handful of overlapping AI calls can make uploads fail with "try again". Ask for a
   quota increase (Service Quotas > Lambda > Concurrent executions, 100 is usually granted), then set
   `BACKING_TRACKS_RESERVED_CONCURRENCY=10` (or 20) for this function and `FUNCTION_RESERVED_CONCURRENCY=5`
   for the Gemini and song-lookup functions. They are separate on purpose.
5. **Run the sandbox check.** Against a throwaway sandbox deployed with `BACKING_TRACKS_ENABLED=true`:
   `BANDS_SANDBOX_POOL_ID=<pool> node scripts/bands-auth-check.mjs <sandbox amplify_outputs.json>`. Gate
   `G8` covers the upload flow, the denials and the ban purge. Keys and indexes are permanent once
   deployed, so run it **before** the schema reaches production.
6. **Look at the bucket once.** S3 console > the bucket > Permissions: "Block all public access" is on,
   and Management shows the `expire-pending-uploads` rule.

## Kill switch and emergencies

- **Stop uploads now:** Lambda console > `backing-track` > Configuration > Environment variables > set
  `BACKING_TRACKS_ENABLED` to `false`. Takes effect immediately. Only uploading stops: playing, editing,
  removing, leaving and cleanup keep working. The next deploy resets it from the branch variable, so
  change that too.
- **Stop all playback and downloads** (abuse of the free reads, or a legal hold): add an explicit Deny
  statement to the bucket policy for `s3:GetObject` on `bt/*` for the authenticated role, or remove the
  `bt/*` rule from `amplify/storage/resource.ts` and redeploy. Undo it when resolved.
- **A user is flooding requests:** ban them from their band(s) (owner action) and purge their files
  (below). Their Cognito account can be disabled in the user pool console.

## Takedown of one track

1. Get the band, song and track name from the report. In DynamoDB (`BackingTrack` table) find the row,
   or ask the band owner to use **Remove** on it in the app (that deletes the file and the row).
2. To do it yourself, delete the file first, then the row:
   ```sh
   aws s3 rm s3://<bucket>/bt/<userSub>/<bandId>/<songId>/<trackId>.<ext>
   aws dynamodb delete-item --table-name <BackingTrack table> --key '{"id":{"S":"<trackId>"}}'
   ```
3. Also clear that user's pending uploads so a retried commit cannot bring the track back (only that
   user's prefix):
   ```sh
   aws s3 rm s3://<bucket>/pending/<userSub>/ --recursive
   ```
4. Keep the report and the date. If the uploader is a repeat offender, ask the band owner to remove them
   (that deletes all their files in the band), or disable their account.

## Delete everything one person uploaded (on request)

```sh
aws s3 rm s3://<bucket>/bt/<userSub>/ --recursive
aws s3 rm s3://<bucket>/pending/<userSub>/ --recursive
aws dynamodb scan --table-name <BackingTrack table> \
  --filter-expression "#o = :o" --expression-attribute-names '{"#o":"owner"}' \
  --expression-attribute-values '{":o":{"S":"<userSub>"}}' --projection-expression id
# then, for each id returned:
aws dynamodb delete-item --table-name <BackingTrack table> --key '{"id":{"S":"<id>"}}'
```

## Orphan sweep

Files can be left behind by a crash between steps, or when a member's own cleanup never ran. Each
person's own leftovers are cleared automatically when they hit their file quota. For the whole bucket:

```sh
# Report only (the default):
npx tsx scripts/backing-tracks-sweep.ts --bucket <bucket> --table <BackingTrack table>
# Delete up to 100 at a time:
npx tsx scripts/backing-tracks-sweep.ts --bucket <bucket> --table <BackingTrack table> --delete --limit 100
```

It only removes files older than 10 minutes that no row owns (or whose row names a different key), and
re-checks each one right before deleting. Run it weekly and after any incident or deploy that touched the
Lambda. It does not remove files whose row still exists (a departed member's or deleted song's files);
those are collected by the owner's purge, the member's own cleanup, or the quota reconcile.

## Reading the error codes

The app shows plain language, but logs and the sandbox check show the code:

| Code | Meaning |
|---|---|
| `uploads-disabled` | The kill switch is off |
| `bad-input`, `too-big`, `bad-file` | Bad request, over 50 MB, or the file's first bytes are not audio |
| `not-member`, `banned` | The caller is not in the band or was removed |
| `not-allowed` | The band owner has not allowed this member to upload |
| `over-quota`, `song-full`, `band-full` | A cap was hit |
| `not-found`, `gone` | The song, set list or band is gone, hidden or archived |
| `replaced`, `conflict` | Another upload took the slot, or the track id belongs to someone else |
| `retry` | Something transient failed, or an unexpected error (see the Lambda's CloudWatch logs) |

## Known limits

- **Who can upload:** only the band owner and members the owner ticks "Can upload" for (`Band.uploaderSubs`, owner-written; leavers and removed members are dropped from it on the next change). A stranger who learns a band's ids from a shared set list cannot upload into it. **Not closed:** anyone with an account can create their own band, become its owner and upload within the per-account quota (20 files / 600 MB), and any signed-in user can stage up to 3 x 50 MB in `pending/` (expires after a day; a refused commit leaves it there) because `requestBackingTrackUpload` has no band argument. Keep the spend alarm and the takedown address live; treat open sign-up as "anyone may host up to 600 MB". Existing bands start with nobody allowed but the owner.

- The membership check proves a caller knows the ids, because `Member`, `Song` and `SetList` rows are
  written by users themselves. The real controls are the structural ones: 3 pending slots, S3-enforced
  size, per-person storage, per-band cap, the kill switch and the budget alert. Many throwaway accounts
  multiply the per-person quota, which is why the alert matters.
- Per-song and per-band counts use an eventually consistent index, so they can overshoot slightly under
  parallel uploads.
- The first-bytes check is a speed bump, not a virus scan. Files are always served as audio, never as pages.
