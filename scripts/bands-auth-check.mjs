// Bands auth regression check: attacks a SANDBOX deployment of the Bands schema with raw GraphQL.
//
//   BANDS_SANDBOX_POOL_ID=<the sandbox user pool id> \
//     node scripts/bands-auth-check.mjs /path/to/sandbox/amplify_outputs.json
//
// It creates throwaway Cognito users (AWS CLI admin APIs; needs permission on that pool) and writes
// rows that can never be deleted through the API, so it only runs when ALL of these hold:
//   - the outputs file does not point at the same backend as this repo's amplify_outputs.json
//     (located from this script's own path, not the working directory; that file is gitignored, so
//     a committed copy is also compared only if one happens to exist);
//   - BANDS_SANDBOX_POOL_ID is set and equals the pool in the outputs file. This is deliberate
//     self-attestation: you must name the throwaway pool you intend to attack.
// The users it creates are deleted when it finishes (also on Ctrl-C / SIGTERM).
// Deploy a disposable sandbox first (`npx ampx sandbox --identifier bands-spike --outputs-out-dir ...`).
// Setup the sandbox needs before this runs:
//   - the identifier must be under 15 characters;
//   - the backend reads the GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets, so set placeholders
//     first (`printf '%s' placeholder | npx ampx sandbox secret set GOOGLE_CLIENT_ID --identifier ...`;
//     no trailing newline, the identity pool rejects one);
//   - the user pool app client must allow the USER_PASSWORD_AUTH flow (Amplify enables only SRP by
//     default): Cognito console > the sandbox user pool > App clients > the client > Edit > turn on
//     "Sign in with username and password: ALLOW_USER_PASSWORD_AUTH". Leave the other settings alone.
//   - the AWS identity running this needs cognito-idp AdminCreateUser, AdminSetUserPassword and
//     AdminDeleteUser on that pool.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomUUID } from 'node:crypto';

const refuse = (why) => {
  console.error(`Refusing to run: ${why}`);
  process.exit(2);
};

const outputsPath = process.argv[2];
if (!outputsPath) refuse('usage: BANDS_SANDBOX_POOL_ID=<pool id> node scripts/bands-auth-check.mjs <path to a SANDBOX amplify_outputs.json>');
const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));

const sameBackend = (other) =>
  !!other && (other.auth?.user_pool_id === outputs.auth?.user_pool_id || other.data?.url === outputs.data?.url);

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const repoOutputs = `${repoRoot}amplify_outputs.json`;
if (existsSync(repoOutputs) && sameBackend(JSON.parse(readFileSync(repoOutputs, 'utf8')))) {
  refuse("these outputs point at the same backend as this repo's amplify_outputs.json (staging/prod).");
}
try {
  const committed = execFileSync('git', ['-C', repoRoot, 'show', 'HEAD:amplify_outputs.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (sameBackend(JSON.parse(committed))) refuse('these outputs point at the backend recorded in the committed amplify_outputs.json.');
} catch {
  /* no committed copy (or not a git checkout): the checks above still apply */
}
if (process.env.BANDS_SANDBOX_POOL_ID !== outputs.auth?.user_pool_id) {
  refuse('set BANDS_SANDBOX_POOL_ID to the sandbox user pool id you intend to test (it must match the outputs file).');
}
const REGION = outputs.auth.aws_region;
const POOL = outputs.auth.user_pool_id;
const CLIENT = outputs.auth.user_pool_client_id;
const API_URL = outputs.data.url;
const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'Spike-Pass-' + RUN + '!9';

const aws = (args) =>
  JSON.parse(execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], { encoding: 'utf8' }) || 'null');

const createdUsers = [];

function makeUser(tag) {
  // Users are created with admin APIs (scoped permission on the throwaway pool), then sign in with the public flow.
  const email = `bands-spike-${RUN}-${tag}@example.com`;
  aws(['cognito-idp', 'admin-create-user', '--user-pool-id', POOL, '--username', email,
    '--user-attributes', `Name=email,Value=${email}`, 'Name=email_verified,Value=true', '--message-action', 'SUPPRESS']);
  createdUsers.push(email); // from here on the user exists and must be cleaned up
  aws(['cognito-idp', 'admin-set-user-password', '--user-pool-id', POOL, '--username', email, '--password', PASSWORD, '--permanent']);
  const auth = aws(['cognito-idp', 'initiate-auth', '--client-id', CLIENT, '--auth-flow', 'USER_PASSWORD_AUTH',
    '--auth-parameters', `USERNAME=${email},PASSWORD=${PASSWORD}`, '--no-sign-request']);
  const token = auth.AuthenticationResult.AccessToken;
  const sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
  return { tag, email, sub, token };
}

async function gql(user, query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: user.token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  return { data: body.data ?? null, errors: body.errors ?? null, status: res.status };
}
const errType = (r) => (r.errors ?? []).map((e) => e.errorType ?? e.message).join('|') || '-';
const denied = (r) => !!r.errors?.some((e) => /Unauthorized/i.test(e.errorType ?? '') || /Unauthorized/i.test(e.message ?? ''));

// Signed-out visitors use the Cognito identity pool's guest role: AppSync then expects IAM (SigV4).
const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

function guestCredentials() {
  const identityPoolId = outputs.auth.identity_pool_id;
  const { IdentityId } = aws(['cognito-identity', 'get-id', '--identity-pool-id', identityPoolId, '--no-sign-request']);
  const { Credentials } = aws(['cognito-identity', 'get-credentials-for-identity', '--identity-id', IdentityId, '--no-sign-request']);
  return { accessKeyId: Credentials.AccessKeyId, secretKey: Credentials.SecretKey, sessionToken: Credentials.SessionToken };
}

async function gqlGuest(creds, query, variables = {}) {
  const url = new URL(API_URL);
  const body = JSON.stringify({ query, variables });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260101T000000Z
  const date = amzDate.slice(0, 8);
  const headers = { 'content-type': 'application/json', host: url.host, 'x-amz-date': amzDate, 'x-amz-security-token': creds.sessionToken };
  const signedHeaders = Object.keys(headers).sort().join(';');
  // Canonical headers are ONE block (each line ends in \n), so joining them with '\n' as separate items would add blank lines.
  // The signed set is fixed: content-type, host, x-amz-date, x-amz-security-token.
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonical = ['POST', url.pathname, '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n');
  const scope = `${date}/${REGION}/appsync/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${creds.secretKey}`, date), REGION), 'appsync'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(API_URL, { method: 'POST', headers, body });
  const parsed = await res.json();
  return { data: parsed.data ?? null, errors: parsed.errors ?? null, status: res.status };
}

const results = [];
function check(gate, name, pass, detail = '', blocking = false) {
  results.push({ gate, name, pass, detail, blocking });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${gate}${blocking ? '*' : ''}] ${name}${detail ? ' — ' + detail : ''}`);
}
function info(gate, name, detail) {
  results.push({ gate, name, pass: null, detail });
  console.log(`INFO [${gate}] ${name} — ${detail}`);
}

async function main() {
// ---------- setup ----------
console.log(`run ${RUN} against ${API_URL}`);
const A = makeUser('a'); // band owner
const B = makeUser('b'); // member / outsider
const C = makeUser('c'); // outsider
console.log('subs', { A: A.sub, B: B.sub, C: C.sub });

// ---------- G0: introspection ----------
const intro = await gql(A, `{ __schema { queryType { fields { name args { name } } } mutationType { fields { name } } subscriptionType { fields { name } } } }`);
const queries = Object.fromEntries(intro.data.__schema.queryType.fields.map((f) => [f.name, f.args.map((a) => a.name)]));
const mutations = intro.data.__schema.mutationType.fields.map((f) => f.name);
const subs = intro.data.__schema.subscriptionType?.fields?.map((f) => f.name) ?? [];
console.log('QUERIES', Object.keys(queries).sort().join(', '));
console.log('MUTATIONS', mutations.sort().join(', '));
console.log('SUBSCRIPTIONS', subs.join(', ') || '(none)');

for (const q of ['getBand', 'getBandInvite', 'getSetList', 'getSong', 'getVote', 'getMember', 'getMyBand', 'listMyBands', 'getSongColor', 'getColorLabel', 'getAvailability', 'listColorLabelByBand', 'listMemberByBandId', 'listSongBySetList', 'listVoteBySetList', 'listSongColorBySetList'])
  check('G0', `query ${q} exists`, q in queries, '', true);
for (const q of ['listBands', 'listBandInvites', 'listSetLists', 'listSongs', 'listVotes', 'listMembers', 'listSongColors', 'listColorLabels'])
  check('G1b', `plain ${q} absent`, !(q in queries), '', true);
// Availability is read by exact key only: no list, no index of any kind (a bandId index page could be
// flooded or bricked by junk rows nobody else can delete), so nothing starting `listAvailabilit` may exist.
check('G1b', 'no Availability list or index query exists', !Object.keys(queries).some((q) => q.startsWith('listAvailabilit')), Object.keys(queries).filter((q) => q.startsWith('listAvailabilit')).join(','), true);
for (const m of ['deleteBand', 'deleteSetList', 'deleteBandInvite'])
  check('G3', `mutation ${m} absent`, !mutations.includes(m), '', true);
for (const m of ['deleteSong', 'deleteVote', 'deleteMember', 'deleteMyBand', 'deleteSongColor', 'deleteColorLabel', 'deleteAvailability'])
  check('G0', `mutation ${m} present`, mutations.includes(m));
check('G0', 'subscriptions absent/empty', subs.length === 0, subs.join(','));
// No owner-partitioned query on public-read models (cross-band pivot).
for (const q of ['listMemberByBandId', 'listSongBySetList', 'listVoteBySetList', 'listSongColorBySetList', 'listColorLabelByBand'])
  check('G1b', `${q} partition arg is not owner`, (queries[q] ?? [])[0] !== 'owner' && (queries[q] ?? []).length > 0, `args=${(queries[q] ?? []).join(',')}`, true);

// ---------- helpers ----------
const FIELDS = {
  Band: 'id owner name inviteCode deletedAt version setListIds archivedSetListIds bannedSubs hiddenSongIds sharedSetListIds inviteTtlDays createdAt updatedAt',
  BandInvite: 'code bandId revokedAt owner createdAt',
  MyBand: 'owner bandId',
  Member: 'bandId owner displayName createdAt',
  SetList: 'id owner bandId name archivedAt',
  Song: 'id owner bandId setListId title createdAt',
  Vote: 'songId owner value bandId setListId createdAt',
  SongColor: 'songId owner color bandId setListId createdAt updatedAt',
  ColorLabel: 'bandId color owner label createdAt updatedAt',
  Availability: 'bandId owner format startDay mask createdAt updatedAt',
};
const create = (u, model, input) =>
  gql(u, `mutation($input: Create${model}Input!){ create${model}(input:$input){ ${FIELDS[model]} } }`, { input });
const update = (u, model, input) =>
  gql(u, `mutation($input: Update${model}Input!){ update${model}(input:$input){ ${FIELDS[model]} } }`, { input });
const getById = (u, model, key) => {
  const keys = Object.keys(key);
  const decl = keys.map((k) => `$${k}: ${k === 'id' ? 'ID' : 'String'}!`).join(', ');
  const args = keys.map((k) => `${k}: $${k}`).join(', ');
  return gql(u, `query(${decl}){ get${model}(${args}){ ${FIELDS[model]} } }`, key);
};

// ---------- fixtures ----------
const bandId = randomUUID();
const setListId = randomUUID();
const code = 'SPIKE' + RUN.toUpperCase();

let r = await create(A, 'Band', { id: bandId, name: 'Spike Band', inviteCode: code, version: 1, setListIds: [setListId] });
check('G3', 'owner creates Band; owner auto-populated = bare sub', r.data?.createBand?.owner === A.sub, `owner=${r.data?.createBand?.owner} err=${errType(r)}`, true);
r = await create(A, 'SetList', { id: setListId, bandId, name: 'Main Set' });
check('G0', 'owner creates SetList', !!r.data?.createSetList, errType(r));
r = await create(A, 'BandInvite', { code, bandId });
check('G0', 'owner creates BandInvite', !!r.data?.createBandInvite, errType(r));
r = await create(A, 'MyBand', { owner: A.sub, bandId });
check('G2', 'A creates own MyBand (owner as PARTITION key)', !!r.data?.createMyBand, errType(r));
r = await create(A, 'Member', { bandId, owner: A.sub, displayName: 'Alice' });
check('G2', 'A creates own Member (owner as SORT key)', !!r.data?.createMember, errType(r));

// ---------- G3a: create binds owner to caller ----------
r = await create(B, 'Band', { id: randomUUID(), name: 'forged', inviteCode: 'X', version: 1, owner: A.sub });
check('G3', 'B cannot create Band with owner=A', denied(r) || !r.data?.createBand, `got=${JSON.stringify(r.data?.createBand?.owner)} err=${errType(r)}`, true);
r = await create(B, 'Member', { bandId, owner: A.sub, displayName: 'Mallory' });
check('G3', 'B cannot create Member row for A (owner=A)', !r.data?.createMember, errType(r), true);
r = await create(B, 'Member', { bandId, owner: A.sub + '::x', displayName: 'Mallory' });
check('G3', 'B cannot create Member with non-canonical owner', !r.data?.createMember, errType(r));
r = await create(B, 'Member', { bandId, owner: B.sub, displayName: 'Bob' });
check('G2', 'B joins: creates own Member', !!r.data?.createMember, errType(r));
r = await create(B, 'Member', { bandId, owner: B.sub, displayName: 'Bob2' });
check('G2', 'B duplicate Member create is rejected (conditional)', !r.data?.createMember, errType(r));
r = await create(B, 'MyBand', { owner: B.sub, bandId });
check('G2', 'B creates own MyBand', !!r.data?.createMyBand, errType(r));
r = await create(B, 'MyBand', { owner: A.sub, bandId: randomUUID() });
check('G3', 'B cannot create MyBand for A', !r.data?.createMyBand, errType(r));

const songId = randomUUID();
r = await create(B, 'Song', { id: songId, bandId, setListId, title: 'Song 1' });
check('G3', 'B creates own Song', !!r.data?.createSong, errType(r));
r = await create(B, 'Song', { id: randomUUID(), owner: A.sub, bandId, setListId, title: 'Framed' });
check('G3', 'B cannot create Song with owner=A (field not accepted or Unauthorized)', !r.data?.createSong, errType(r), true);
r = await create(B, 'Song', { id: randomUUID(), bandId, setListId, title: 'Song 1b' });
check('G3', 'created Song.owner is auto-populated with caller sub', r.data?.createSong?.owner === B.sub, `owner=${r.data?.createSong?.owner}`, true);

// ---------- votes ----------
r = await create(B, 'Vote', { songId, owner: A.sub, value: 'down', bandId, setListId });
check('G2', 'B cannot squat vote key (songId, owner=A)', !r.data?.createVote, errType(r), true);
r = await create(A, 'Vote', { songId, owner: A.sub, value: 'up', bandId, setListId });
check('G2', 'A votes (key not squatted)', !!r.data?.createVote, errType(r));
r = await create(A, 'Vote', { songId, owner: A.sub, value: 'down', bandId, setListId });
check('G2', 'A second vote create rejected (one row per member per song)', !r.data?.createVote, errType(r));
r = await update(A, 'Vote', { songId, owner: A.sub, value: 'down' });
check('G2', 'A switches vote via update', r.data?.updateVote?.value === 'down', errType(r));
r = await getById(B, 'Vote', { songId, owner: A.sub });
check('G1', 'B can read A\'s vote by key (Vote rows are readable)', !!r.data?.getVote, errType(r));
r = await update(B, 'Vote', { songId, owner: A.sub, value: 'up' });
check('G3', 'B cannot update A\'s vote', !r.data?.updateVote, errType(r));
r = await gql(B, `mutation($input: DeleteVoteInput!){ deleteVote(input:$input){ songId } }`, { input: { songId, owner: A.sub } });
check('G3', 'B cannot delete A\'s vote', !r.data?.deleteVote, errType(r));

// ---------- song colors (one row per member per song; shown only if the writer is a valid member) ----------
r = await create(B, 'SongColor', { songId, owner: A.sub, color: 'red', bandId, setListId });
check('G2', 'B cannot create a SongColor row as A', !r.data?.createSongColor, errType(r), true);
r = await create(B, 'SongColor', { songId, owner: B.sub, color: 'blue', bandId, setListId });
check('G2', 'B colors a song as B', !!r.data?.createSongColor, errType(r));
r = await update(A, 'SongColor', { songId, owner: B.sub, color: 'red' });
check('G3', 'A cannot update B\'s SongColor row', !r.data?.updateSongColor, errType(r), true);
r = await create(A, 'SongColor', { songId, owner: A.sub, color: 'green', bandId, setListId, updatedAt: '2999-01-01T00:00:00.000Z' });
check('G2', 'a client-supplied updatedAt is rejected or ignored (newest-wins stays server-controlled)', !r.data?.createSongColor || !String(r.data.createSongColor.updatedAt).startsWith('2999'), errType(r), true);
r = await update(A, 'SongColor', { songId, owner: A.sub, updatedAt: '2999-01-01T00:00:00.000Z' });
check('G2', 'a client-supplied updatedAt on update is rejected or ignored', !r.data?.updateSongColor || !String(r.data.updateSongColor.updatedAt).startsWith('2999'), errType(r), true);
r = await gql(A, `mutation($input: DeleteSongColorInput!){ deleteSongColor(input:$input){ songId } }`, { input: { songId, owner: B.sub } });
check('G3', 'A cannot delete B\'s SongColor row', !r.data?.deleteSongColor, errType(r), true);
r = await getById(A, 'SongColor', { songId, owner: B.sub });
check('G1', 'A can read B\'s SongColor row (signed in)', !!r.data?.getSongColor, errType(r));

// ---------- color labels (one row per member per band color; shown only if the writer is a valid member) ----------
r = await create(B, 'ColorLabel', { bandId, color: 'red', owner: A.sub, label: 'Ballad' });
check('G2', 'B cannot create a ColorLabel row as A', !r.data?.createColorLabel, errType(r), true);
r = await create(B, 'ColorLabel', { bandId, color: 'red', owner: B.sub, label: 'Slow' });
check('G2', 'B labels a color as B', !!r.data?.createColorLabel, errType(r));
r = await update(A, 'ColorLabel', { bandId, color: 'red', owner: B.sub, label: 'Hijacked' });
check('G3', 'A cannot update B\'s ColorLabel row', !r.data?.updateColorLabel, errType(r), true);
r = await gql(A, `mutation($input: DeleteColorLabelInput!){ deleteColorLabel(input:$input){ bandId } }`, { input: { bandId, color: 'red', owner: B.sub } });
check('G3', 'A cannot delete B\'s ColorLabel row', !r.data?.deleteColorLabel, errType(r), true);
r = await getById(A, 'ColorLabel', { bandId, color: 'red', owner: B.sub });
check('G1', 'A can read B\'s ColorLabel row (signed in)', !!r.data?.getColorLabel, errType(r));

// ---------- availability (one row per member per band, read by exact key only) ----------
const MASK = '0'.repeat(11) + '8'; // one UTC day, one slot free
const avail = (owner, over = {}) => ({ bandId, owner, format: 1, startDay: 20000, mask: MASK, ...over });
r = await create(B, 'Availability', avail(A.sub));
check('G2', 'B cannot create an Availability row as A', !r.data?.createAvailability, errType(r), true);
r = await create(A, 'Availability', avail(A.sub));
check('G2', 'A creates own Availability row', !!r.data?.createAvailability, errType(r), true);
r = await create(B, 'Availability', avail(B.sub));
check('G2', 'B creates own Availability row', !!r.data?.createAvailability, errType(r), true);
r = await update(A, 'Availability', { bandId, owner: B.sub, mask: '1'.repeat(12) });
check('G3', 'A cannot update B\'s Availability row', !r.data?.updateAvailability, errType(r), true);
r = await gql(A, `mutation($input: DeleteAvailabilityInput!){ deleteAvailability(input:$input){ bandId } }`, { input: { bandId, owner: B.sub } });
check('G3', 'A cannot delete B\'s Availability row', !r.data?.deleteAvailability, errType(r), true);
r = await getById(A, 'Availability', { bandId, owner: B.sub });
check('G1', 'A can read B\'s Availability row by key (signed in)', !!r.data?.getAvailability, errType(r), true);
r = await getById(C, 'Availability', { bandId, owner: B.sub });
check('G1', 'outsider C can read B\'s Availability row by key (documented exposure: bandId + sub is the capability)', !!r.data?.getAvailability, errType(r));
// "Last saved" is shown from the server's updatedAt. If a client can set it, it is advisory only.
// A clean row comes first so a rejected forgery can't pass for the wrong reason (no row at all).
const FORGED = '2999-01-01T00:00:00.000Z';
const forged = (v) => String(v ?? '').startsWith('2999');
r = await create(C, 'Availability', avail(C.sub));
check('G2', 'C creates own Availability row (control for the forgery checks)', !!r.data?.createAvailability, errType(r), true);
{
  const forgedBand = randomUUID();
  r = await create(C, 'Availability', avail(C.sub, { bandId: forgedBand, updatedAt: FORGED, createdAt: FORGED }));
  const created = r.data?.createAvailability;
  check('G2', 'a client-supplied updatedAt/createdAt on create is rejected or ignored ("last saved" is trustworthy)', !created || (!forged(created.updatedAt) && !forged(created.createdAt)), errType(r));
  if (created) {
    const back = await getById(C, 'Availability', { bandId: forgedBand, owner: C.sub });
    check('G2', 'the stored row does not keep a forged timestamp', !forged(back.data?.getAvailability?.updatedAt) && !forged(back.data?.getAvailability?.createdAt), `${back.data?.getAvailability?.updatedAt}`);
  }
}
r = await update(C, 'Availability', { bandId, owner: C.sub, updatedAt: FORGED });
{
  const back = await getById(C, 'Availability', { bandId, owner: C.sub });
  check('G2', 'a client-supplied updatedAt on update is rejected or ignored', !forged(r.data?.updateAvailability?.updatedAt) && !forged(back.data?.getAvailability?.updatedAt), errType(r));
}
// Roster order for the participant cap uses Member.createdAt; if a client can backdate it, a hostile
// joiner could jump the queue. Own throwaway band, so the roster checks below are unaffected.
r = await create(C, 'Member', { bandId: randomUUID(), owner: C.sub, displayName: 'Backdated', createdAt: '2001-01-01T00:00:00.000Z' });
info('G3', 'client can supply Member.createdAt (participant cap order)', r.data?.createMember ? `accepted: ${r.data.createMember.createdAt}` : `rejected: ${errType(r)}`);
// Read-after-write: the editor trusts the row it just wrote; a stale keyed get would flicker marks back.
{
  let stale = 0;
  for (let i = 1; i <= 6; i++) {
    const mask = i.toString(16).repeat(12);
    await update(B, 'Availability', { bandId, owner: B.sub, mask });
    const got = await getById(B, 'Availability', { bandId, owner: B.sub });
    if (got.data?.getAvailability?.mask !== mask) stale++;
  }
  check('G5', 'a keyed get right after an update returns the new row (read-after-write)', stale === 0, `${stale}/6 stale reads`);
}
// The save loop re-branches on these; record the exact error shapes the backend returns.
const missingBand = randomUUID();
r = await update(B, 'Availability', { bandId: missingBand, owner: B.sub, mask: MASK });
info('G5', 'update of a missing own Availability row', r.data?.updateAvailability ? 'ACCEPTED (upserted?!)' : `rejected: ${errType(r)}`);
r = await gql(B, `mutation($input: DeleteAvailabilityInput!){ deleteAvailability(input:$input){ bandId } }`, { input: { bandId: missingBand, owner: B.sub } });
info('G5', 'delete of a missing own Availability row', r.data?.deleteAvailability === null && !r.errors ? 'ok (null)' : r.data?.deleteAvailability ? 'ok (row returned)' : `rejected: ${errType(r)}`);
r = await create(B, 'Availability', avail(B.sub));
info('G5', 'second create of an existing own row (createIdempotent maps this to "exists")', r.data?.createAvailability ? 'ACCEPTED (overwrote?!)' : `rejected: ${errType(r)}`);
// Cost of one hostile oversized row (nothing server-side caps it; the client hides it, but every viewer downloads it).
{
  const big = '0'.repeat(300_000);
  const bigBand = randomUUID();
  const t0 = Date.now();
  r = await create(C, 'Availability', avail(C.sub, { bandId: bigBand, mask: big }));
  const wrote = !!r.data?.createAvailability;
  info('G5', 'a ~300 KB Availability mask can be written', wrote ? `accepted in ${Date.now() - t0} ms` : `rejected: ${errType(r)}`);
  if (wrote) {
    const t1 = Date.now();
    const got = await gql(C, `query($b:String!,$o:String!){ getAvailability(bandId:$b, owner:$o){ mask } }`, { b: bigBand, o: C.sub });
    info('G5', 'reading it back by key', `${Date.now() - t1} ms, ${String(got.data?.getAvailability?.mask ?? '').length} chars`);
    // Leave no multi-hundred-KB row behind in the sandbox.
    await gql(C, `mutation($input: DeleteAvailabilityInput!){ deleteAvailability(input:$input){ bandId } }`, { input: { bandId: bigBand, owner: C.sub } });
  }
}

// ---------- Band root of trust ----------
r = await update(B, 'Band', { id: bandId, bannedSubs: [A.sub] });
check('G3', 'non-owner cannot update Band arrays', !r.data?.updateBand, errType(r), true);
r = await update(B, 'Band', { id: bandId, inviteTtlDays: 7 });
check('G3', 'non-owner cannot change Band.inviteTtlDays', !r.data?.updateBand, errType(r), true);
r = await update(A, 'Band', { id: bandId, inviteTtlDays: 3 });
check('G3', 'owner can set Band.inviteTtlDays', r.data?.updateBand?.inviteTtlDays === 3, errType(r));
r = await update(B, 'Band', { id: bandId, name: 'pwned' });
check('G3', 'non-owner cannot rename Band', !r.data?.updateBand, errType(r), true);
r = await getById(B, 'Band', { id: bandId });
check('G1b', 'non-member get Band returns the row (capability)', r.data?.getBand?.id === bandId, errType(r));
r = await getById(B, 'BandInvite', { code });
check('G0', 'any authenticated user can get BandInvite by code', r.data?.getBandInvite?.bandId === bandId, errType(r));
check('G0', 'a BandInvite carries a server createdAt (invite expiry is measured from it)', Number.isFinite(Date.parse(r.data?.getBandInvite?.createdAt)), `createdAt=${r.data?.getBandInvite?.createdAt}`);
r = await create(C, 'BandInvite', { code, bandId: randomUUID() });
check('G3', 'C cannot re-create existing invite code (squat)', !r.data?.createBandInvite, errType(r), true);
r = await update(C, 'BandInvite', { code, bandId: randomUUID() });
check('G3', 'C cannot update A\'s BandInvite', !r.data?.updateBandInvite, errType(r));
r = await update(B, 'SetList', { id: setListId, name: 'pwned' });
check('G3', 'non-owner cannot update SetList', !r.data?.updateSetList, errType(r));
r = await create(B, 'SetList', { id: setListId, bandId, name: 'squat' });
check('G3', 'B cannot re-create existing SetList id', !r.data?.createSetList, errType(r), true);
r = await create(B, 'Band', { id: bandId, name: 'squat', inviteCode: 'x', version: 1 });
check('G3', 'B cannot re-create existing Band id', !r.data?.createBand, errType(r), true);

// Song moderation boundaries: band owner A cannot edit/delete a member's song through the API (hide-list only).
r = await update(A, 'Song', { id: songId, title: 'owner edits member song' });
check('G3', 'band owner cannot edit a member\'s Song (moderation is via Band.hiddenSongIds)', !r.data?.updateSong, errType(r));
r = await gql(A, `mutation($input: DeleteSongInput!){ deleteSong(input:$input){ id } }`, { input: { id: songId } });
check('G3', 'band owner cannot delete a member\'s Song', !r.data?.deleteSong, errType(r));
r = await update(B, 'Song', { id: songId, setListId: randomUUID() });
info('G3b', 'author moves own Song to another setListId', r.data?.updateSong ? 'ACCEPTED (validators must re-check setListId ∈ Band.setListIds)' : `rejected: ${errType(r)}`);
r = await update(B, 'Song', { id: songId, title: 'Song 1 (edited)' });
check('G3', 'author edits own Song', !!r.data?.updateSong, errType(r));
r = await gql(B, `mutation($input: DeleteSongInput!){ deleteSong(input:$input){ id } }`, { input: { id: songId } });
check('G3', 'author deletes own Song', !!r.data?.deleteSong, errType(r));
r = await gql(B, `mutation($input: DeleteSongInput!){ deleteSong(input:$input){ id } }`, { input: { id: songId } });
info('G3', 'deleting an already-deleted Song', r.data?.deleteSong ? 'succeeds (idempotent)' : `error: ${errType(r)} (wrapper must treat as success)`);

// owner reassignment (G3b: information)
const song2 = randomUUID();
await create(B, 'Song', { id: song2, bandId, setListId, title: 'Song 2' });
r = await update(B, 'Song', { id: song2, owner: A.sub });

check('G3b', 'author cannot reassign Song.owner', !r.data?.updateSong, r.data?.updateSong ? `ACCEPTED owner now ${r.data.updateSong.owner}` : `rejected: ${errType(r)}`);
r = await update(A, 'Band', { id: bandId, owner: B.sub });
info('G3b', 'owner updates Band.owner to another sub', r.data?.updateBand ? `ACCEPTED (owner=${r.data.updateBand.owner === B.sub ? 'B' : '?'})` : `rejected: ${errType(r)}`);
if (r.data?.updateBand) await update(B, 'Band', { id: bandId, owner: A.sub }); // put it back

// createdAt client-supplied (non-blocking)
r = await create(B, 'Song', { id: randomUUID(), bandId, setListId, title: 'Backdated', createdAt: '2001-01-01T00:00:00.000Z' });
info('G3', 'client can supply createdAt', r.data?.createSong ? `accepted: ${r.data.createSong.createdAt}` : `rejected: ${errType(r)}`);

// ---------- G1: index queries ----------
r = await gql(C, `query($bandId:String!){ listMemberByBandId(bandId:$bandId){ items{ owner displayName } nextToken } }`, { bandId });
check('G1', 'outsider C can roster-query by bandId (capability)', (r.data?.listMemberByBandId?.items?.length ?? 0) === 2, `items=${r.data?.listMemberByBandId?.items?.length} err=${errType(r)}`, true);
r = await gql(C, `query($setListId:String!){ listSongBySetList(setListId:$setListId){ items{ id owner title } } }`, { setListId });
check('G1', 'outsider C can query songs by setListId', (r.data?.listSongBySetList?.items?.length ?? 0) >= 1, `err=${errType(r)}`, true);
r = await gql(C, `query($setListId:String!,$o:String!){ listVoteBySetList(setListId:$setListId, owner:{eq:$o}){ items{ songId owner value } } }`, { setListId, o: A.sub });
check('G1', 'owner sort-key condition works on Vote GSI ("my votes in this list")', (r.data?.listVoteBySetList?.items?.length ?? 0) === 1, `err=${errType(r)}`);

// ---------- G1b: MyBand privacy ----------
r = await gql(C, `query($o:String!){ listMyBands(owner:$o){ items{ owner bandId } } }`, { o: A.sub });
check('G1b', 'C cannot list A\'s MyBand rows', denied(r) || (r.data?.listMyBands?.items?.length ?? 0) === 0, `items=${r.data?.listMyBands?.items?.length} err=${errType(r)}`, true);
r = await getById(C, 'MyBand', { owner: A.sub, bandId });
check('G1b', 'C cannot get A\'s MyBand', !r.data?.getMyBand, errType(r), true);
r = await gql(B, `query{ listMyBands{ items{ owner bandId } } }`);
check('G1b', 'listMyBands with no owner arg only returns caller\'s rows', (r.data?.listMyBands?.items ?? []).every((x) => x.owner === B.sub), `n=${r.data?.listMyBands?.items?.length} err=${errType(r)}`, true);
r = await gql(A, `query($o:String!){ listMyBands(owner:$o){ items{ owner bandId } } }`, { o: A.sub });
check('G0', 'A lists own MyBand by owner partition', (r.data?.listMyBands?.items?.length ?? 0) === 1, errType(r));

// ---------- G5: pagination, flood, consistency ----------
const N = 130;
const floodSetList = randomUUID();
const pool = 10;
let created = 0;
for (let i = 0; i < N; i += pool) {
  const batch = await Promise.all(Array.from({ length: Math.min(pool, N - i) }, () =>
    create(A, 'Vote', { songId: randomUUID(), owner: A.sub, value: 'up', bandId, setListId: floodSetList })));
  created += batch.filter((x) => x.data?.createVote).length;
}
check('G5', `created ${N} votes`, created === N, `created=${created}`);
let total = 0, pages = 0, token = null, firstPage = 0;
do {
  const p = await gql(C, `query($s:String!,$t:String){ listVoteBySetList(setListId:$s, limit:250, nextToken:$t){ items{ songId } nextToken } }`, { s: floodSetList, t: token });
  const items = p.data?.listVoteBySetList?.items ?? [];
  if (pages === 0) firstPage = items.length;
  total += items.length; pages++; token = p.data?.listVoteBySetList?.nextToken ?? null;
} while (token && pages < 50);
check('G5', 'limit=250 accepted and listAll reaches every row', total === N, `first page=${firstPage}, total=${total}, pages=${pages}`);

let staleGet = 0, staleGsi = 0;
const T = 20;
for (let i = 0; i < T; i++) {
  const sid = randomUUID();
  await create(A, 'Vote', { songId: sid, owner: A.sub, value: 'up', bandId, setListId: 'consistency-' + RUN });
  const g = await getById(A, 'Vote', { songId: sid, owner: A.sub });
  if (!g.data?.getVote) staleGet++;
}
const gsi = await gql(A, `query($s:String!){ listVoteBySetList(setListId:$s){ items{ songId } } }`, { s: 'consistency-' + RUN });
staleGsi = T - (gsi.data?.listVoteBySetList?.items?.length ?? 0);
info('G5', 'read-after-write staleness', `primary-key get stale ${staleGet}/${T}; GSI list immediately after last write missing ${staleGsi}/${T}`);

// ---------- Band version condition (optimistic concurrency) ----------
const cond = (input, condition) => gql(A, `mutation($input: UpdateBandInput!, $condition: ModelBandConditionInput){ updateBand(input:$input, condition:$condition){ id version } }`, { input, condition });
r = await cond({ id: bandId, version: 2 }, { version: { eq: 1 } });
check('G0', 'Band update accepts a condition (version eq 1 → 2)', r.data?.updateBand?.version === 2, errType(r));
r = await cond({ id: bandId, version: 3 }, { version: { eq: 1 } });
check('G0', 'stale Band write (version eq 1 again) is rejected', !r.data?.updateBand && /ConditionalCheckFailed/.test(errType(r)), errType(r));
r = await update(A, 'Band', { id: bandId, bannedSubs: [B.sub] });
const afterPartial = await getById(A, 'Band', { id: bandId });
check('G0', 'partial Band update leaves other fields untouched', afterPartial.data?.getBand?.name === 'Spike Band' && afterPartial.data?.getBand?.setListIds?.[0] === setListId, errType(r));

// ---------- guests (signed-out visitors of a shared set list) ----------
// Read-only by design: they may get Band/SetList and read Member/Song/Vote by id or parent-id index,
// and nothing else. "Not shared" is client-side (Band.sharedSetListIds), so reads are NOT blocked here.
const guest = guestCredentials();
const G = (query, variables) => gqlGuest(guest, query, variables);
const guestSongId = randomUUID();
await create(B, 'Song', { id: guestSongId, bandId, setListId, title: 'Guest-visible song' });
await update(A, 'Band', { id: bandId, sharedSetListIds: [setListId] });

r = await G(`query($id:ID!){ getBand(id:$id){ id name sharedSetListIds } }`, { id: bandId });
check('G6', 'guest can get the Band (owner-written sharedSetListIds drives visibility)', r.data?.getBand?.sharedSetListIds?.[0] === setListId, errType(r), true);
r = await G(`query($id:ID!){ getSetList(id:$id){ id bandId name } }`, { id: setListId });
check('G6', 'guest can get the SetList', r.data?.getSetList?.id === setListId, errType(r), true);
// What a guest can read is wider than what the page shows (auth rules can't see sharedSetListIds): record it.
r = await G(`query($id:ID!){ getBand(id:$id){ inviteCode bannedSubs } }`, { id: bandId });
info('G6', 'guest reads Band.inviteCode / bannedSubs (known limit: the bandId is the capability)', r.data?.getBand ? `readable: inviteCode=${!!r.data.getBand.inviteCode}` : `denied: ${errType(r)}`);
r = await G(`query($s:String!){ listSongBySetList(setListId:$s){ items{ id title } } }`, { s: setListId });
check('G6', 'guest can list songs by setListId', (r.data?.listSongBySetList?.items?.length ?? 0) >= 1, errType(r), true);
r = await G(`query($s:String!){ listVoteBySetList(setListId:$s){ items{ songId } } }`, { s: setListId });
check('G6', 'guest can list votes by setListId', !!r.data?.listVoteBySetList, errType(r), true);
r = await G(`query($b:String!){ listMemberByBandId(bandId:$b){ items{ owner displayName } } }`, { b: bandId });
check('G6', 'guest can list the roster by bandId (needed to validate song authors)', (r.data?.listMemberByBandId?.items?.length ?? 0) >= 1, errType(r), true);

r = await G(`query($s:String!){ listSongColorBySetList(setListId:$s){ items{ songId } } }`, { s: setListId });
check('G6', 'guest cannot list song colors (signed-in only)', !r.data?.listSongColorBySetList, errType(r), true);
r = await G(`query($b:String!){ listColorLabelByBand(bandId:$b){ items{ color } } }`, { b: bandId });
check('G6', 'guest cannot list color labels (signed-in only)', !r.data?.listColorLabelByBand, errType(r), true);
r = await G(`query($b:String!,$o:String!){ getAvailability(bandId:$b, owner:$o){ mask } }`, { b: bandId, o: B.sub });
check('G6', 'guest cannot get an Availability row (signed-in only)', !r.data?.getAvailability && denied(r), errType(r), true);

// Guests never write, and never reach the private models.
const guestWrites = [
  ['createBand', 'CreateBandInput', { id: randomUUID(), name: 'g', inviteCode: 'G', version: 1 }, 'id'],
  ['updateBand', 'UpdateBandInput', { id: bandId, sharedSetListIds: [] }, 'id'],
  ['createSetList', 'CreateSetListInput', { id: randomUUID(), bandId, name: 'g' }, 'id'],
  ['updateSetList', 'UpdateSetListInput', { id: setListId, name: 'g' }, 'id'],
  ['createSong', 'CreateSongInput', { id: randomUUID(), bandId, setListId, title: 'g' }, 'id'],
  ['updateSong', 'UpdateSongInput', { id: guestSongId, title: 'g' }, 'id'],
  ['deleteSong', 'DeleteSongInput', { id: guestSongId }, 'id'],
  ['createVote', 'CreateVoteInput', { songId: guestSongId, owner: 'guest', value: 'up', bandId, setListId }, 'songId'],
  ['createMember', 'CreateMemberInput', { bandId, owner: 'guest', displayName: 'g' }, 'bandId'],
  ['createMyBand', 'CreateMyBandInput', { owner: 'guest', bandId }, 'bandId'],
  ['createBandInvite', 'CreateBandInviteInput', { code: 'GUESTCODE1', bandId }, 'code'],
];
// A denial must be an authorization error: a typo, bad signature or expired credential also returns
// no data and must not read as "the rule held". The G6 reads above (same signer) are the positive control.
const guestDenied = (res, field) => !res.data?.[field] && denied(res);
for (const [name, inputType, input, field] of guestWrites) {
  r = await G(`mutation($input:${inputType}!){ ${name}(input:$input){ ${field} } }`, { input });
  check('G6', `guest cannot ${name}`, guestDenied(r, name), errType(r), true);
}
r = await G(`query($c:String!){ getBandInvite(code:$c){ code bandId } }`, { c: code });
check('G6', 'guest cannot get a BandInvite', guestDenied(r, 'getBandInvite'), errType(r), true);
r = await G(`query($o:String!,$b:String!){ getMyBand(owner:$o, bandId:$b){ owner bandId } }`, { o: A.sub, b: bandId });
check('G6', 'guest cannot get a MyBand row', guestDenied(r, 'getMyBand'), errType(r), true);
r = await G(`query($o:String!){ listMyBands(owner:$o){ items{ bandId } } }`, { o: A.sub });
check('G6', 'guest cannot list MyBand rows', denied(r) && !r.data?.listMyBands?.items?.length, errType(r), true);
r = await G(`query($id:ID!){ getPublishedTab(id:$id){ id } }`, { id: randomUUID() });
check('G6', 'guest cannot read other (signed-in only) models', guestDenied(r, 'getPublishedTab'), errType(r));

// ---------- summary ----------
const failed = results.filter((x) => x.pass === false);
const blockingFailed = failed.filter((x) => x.blocking);
console.log(`\n${results.filter((x) => x.pass === true).length} passed, ${failed.length} failed (${blockingFailed.length} blocking), ${results.filter((x) => x.pass === null).length} info`);
if (blockingFailed.length) {
  console.log('BLOCKING FAILURES:');
  for (const f of blockingFailed) console.log(` - [${f.gate}] ${f.name} — ${f.detail}`);
}
console.log('\nTest users are deleted on exit; the Band/SetList/BandInvite rows remain (they cannot be deleted through the API): delete the sandbox when finished.');
return blockingFailed.length ? 1 : 0;
}

async function cleanupUsers() {
  for (const email of createdUsers) {
    try {
      aws(['cognito-idp', 'admin-delete-user', '--user-pool-id', POOL, '--username', email]);
    } catch {
      console.error(`could not delete test user ${email}; remove it by hand or delete the sandbox`);
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void cleanupUsers().finally(() => process.exit(130));
  });
}

let exitCode = 1;
try {
  exitCode = await main();
} finally {
  await cleanupUsers();
}
process.exit(exitCode);
