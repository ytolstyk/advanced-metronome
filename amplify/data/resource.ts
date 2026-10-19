import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { geminiSuggestFunction } from '../functions/gemini-suggest/resource';
import { geminiPlanFunction } from '../functions/gemini-plan/resource';
import { geminiDrumsFunction } from '../functions/gemini-drums/resource';
import { geminiChordsFunction } from '../functions/gemini-chords/resource';
import { geminiTabsFunction } from '../functions/gemini-tabs/resource';
import { songMetadataFunction } from '../functions/song-metadata/resource';

const schema = a.schema({
  // One record per user — auto-saved on every change
  CurrentTrack: a.model({
    configJson: a.string().required(),
    patternJson: a.string().required(),
    chordPatternJson: a.string().required(),
    chordInstrument: a.string().required(),
    chordVolume: a.float().required(),
  }).authorization(allow => [allow.owner()]),

  // Many records per user — saved explicitly as named drum tracks
  DrumTrack: a.model({
    name: a.string().required(),
    configJson: a.string().required(),
    patternJson: a.string().required(),
    chordPatternJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Many records per user — saved explicitly as named scale practice tracks
  ScaleTrack: a.model({
    name: a.string().required(),
    selectedKey: a.string().required(),
    selectedMode: a.string().required(),
    practiceNotesJson: a.string().required(),
    bpm: a.integer().required(),
  }).authorization(allow => [allow.owner()]),

  // Many records per user — saved explicitly as named click tracks
  ClickTrack: a.model({
    name: a.string().required(),
    piecesJson: a.string().required(),
    groupsJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Many records per user — saved explicitly as named guitar tabs
  TabEditorTrack: a.model({
    name: a.string().required(),
    trackJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // One record per chord per user — persists favorite chords
  FavoriteChord: a.model({
    root: a.string().required(),
    type: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Lesson progress — one record per lesson per user
  LessonProgress: a.model({
    lessonId: a.string().required(),
    moduleId: a.string().required(),
    status: a.string().required(),
    completedAt: a.string(),
  }).authorization(allow => [allow.owner()]),

  // Lesson favorites — one record per lesson per user
  LessonFavorite: a.model({
    lessonId: a.string().required(),
    moduleId: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Note color preferences — one record per user
  UserNoteColors: a.model({
    colorsJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Publicly published guitar tabs — readable by all authenticated users, writable only by owner
  PublishedTab: a.model({
    name: a.string().required(),
    nameLower: a.string().required(),
    artist: a.string(),
    artistLower: a.string(),
    tabAuthor: a.string(),
    year: a.string(),
    trackJson: a.string().required(),
    publishedAt: a.datetime().required(),
  }).authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['read']),
  ]),

  // Fret memorizer game scores — one record per completed session
  FretMemorizerScore: a.model({
    score: a.integer().required(),
    wrongAnswers: a.integer().required(),
    totalQuestions: a.integer().required(),
    elapsedSeconds: a.integer().required(),
    gameMode: a.string().required(),
    stringCount: a.integer().required(),
    tuning: a.string().required(),
    completedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Fret memorizer per-note accuracy — one record per user, updated on each answer
  FretMemorizerProgress: a.model({
    noteAccuracy: a.string().required(), // JSON-encoded NoteAccMap
    updatedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Ear training game scores — one record per completed session
  EarTrainingScore: a.model({
    exerciseType: a.string().required(),
    score: a.integer().required(),
    wrongAnswers: a.integer().required(),
    totalQuestions: a.integer().required(),
    elapsedSeconds: a.integer().required(),
    gameMode: a.string().required(),
    difficulty: a.string().required(),
    completedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // CAGED visualizer prefs — one record per user
  UserCAGEDPrefs: a.model({
    prefsJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Chord progression builder state — one record per user
  UserChordProgressionPrefs: a.model({
    stateJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Metronome prefs — one record per user
  UserMetronomePrefs: a.model({
    stateJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Named metronome presets — many records per user
  MetronomePreset: a.model({
    name: a.string().required(),
    savedAt: a.integer().required(),
    stateJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Interval trainer game scores — one record per completed session
  IntervalTrainerScore: a.model({
    score: a.integer().required(),
    wrongAnswers: a.integer().required(),
    totalQuestions: a.integer().required(),
    elapsedSeconds: a.integer().required(),
    gameMode: a.string().required(),
    stringCount: a.integer().required(),
    tuning: a.string().required(),
    intervalsJson: a.string().required(),
    completedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // User-created custom chord voicings — private or shared with the community
  UserCustomChord: a.model({
    root:        a.string().required(),
    type:        a.string().required(),
    name:        a.string(),
    fretsJson:   a.string().required(),
    barreJson:   a.string(),
    startFret:   a.integer(),
    isPublic:    a.boolean().required(),
    authorName:  a.string(),
    stringCount: a.integer().required(),
    tuningId:    a.string().required(),
    createdAt:   a.string().required(),
  }).authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['read']),
  ]),

  // Practice session records — one record per completed practice session
  PracticeSession: a.model({
    goalDurationMinutes: a.integer(),
    goalBpm: a.integer(),
    goalSkill: a.string(),
    goalToolsJson: a.string(),
    goalTagsJson: a.string(),
    actualDurationSeconds: a.integer().required(),
    toolTimesJson: a.string().required(),
    notes: a.string(),
    startedAt: a.string().required(),
    completedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  suggestChordProgressions: a.query()
    .arguments({ prompt: a.string().required() })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(geminiSuggestFunction)),

  // Reads title/artist from a pasted Spotify/YouTube/Apple Music/SoundCloud link (JSON string, or null).
  // Not AI, but it makes outbound requests on the user's behalf, so it is signed-in only.
  lookupSongLink: a.query()
    .arguments({ url: a.string().required() })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(songMetadataFunction)),

  generatePracticePlan: a.query()
    .arguments({
      skillLevel:    a.string().required(),
      goal:          a.string().required(),
      dailyMinutes:  a.integer().required(),
      daysOfWeekJson: a.string().required(),
    })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(geminiPlanFunction)),

  extractDrumPattern: a.query()
    .arguments({
      url:      a.string().required(),
      startSec: a.float().required(),
      endSec:   a.float().required(),
    })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(geminiDrumsFunction)),

  detectChordProgression: a.query()
    .arguments({
      url:      a.string().required(),
      startSec: a.float().required(),
      endSec:   a.float().required(),
    })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(geminiChordsFunction)),

  // Generated practice plan — one record per user (latest plan wins)
  UserPracticePlan: a.model({
    inputJson: a.string().required(),
    planJson:  a.string().required(),
    generatedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // Rate-limit record for AI guitar tab transcription — one per user
  TabTranscriptionUsage: a.model({
    lastTranscribedAt: a.string().required(), // ISO timestamp
  }).authorization(allow => [allow.owner()]),

  transcribeGuitarTab: a.query()
    .arguments({
      audioBase64:       a.string().required(),
      mimeType:          a.string().required(),
      tuningName:        a.string().required(),
      openMidi:          a.string().required(),
      stringCount:       a.integer().required(),
      bpm:               a.integer().required(),
      timeSigNumerator:  a.integer().required(),
      timeSigDenominator: a.integer().required(),
    })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(geminiTabsFunction)),

  // ── Bands ────────────────────────────────────────────────────────────────
  // Capability-style access (see the Bands plan): rows are reachable only by id (`get`) or by
  // index queries that need a parent id; plain `list` is disabled on every public model.
  // `identityClaim('sub')` makes `owner` the bare Cognito sub. Do NOT add owner-keyed indexes to
  // public-read models (they would let anyone look up all bands a user belongs to), and do NOT
  // declare `owner` on Band/SetList/Song (undeclared, it is server-populated and not in any input,
  // so it can neither be forged nor reassigned). Keys/GSIs are immutable once deployed.

  // Shared (public) set lists: `allow.guest()` lets signed-out visitors READ Band/SetList/Song/Vote/
  // Member by id or parent-id index (never write). Auth rules can't look at a row's contents, so
  // "not shared" is enforced only by the client validators via `Band.sharedSetListIds`, like every
  // other owner-written moderation array. Consequence (disclosed in the privacy policy): a visitor
  // with a shared link can read the SetList row, hence its bandId, hence the whole band (inviteCode,
  // roster, votes) without signing in. Anyone could already do this by signing up; guests just skip
  // that step. Real per-list revocation would need a separate public projection model.

  // Root of trust. Only the owner can write it; the owner-written arrays below drive validation.
  Band: a.model({
    name: a.string().required(),
    inviteCode: a.string().required(),
    deletedAt: a.datetime(),            // tombstone: Band rows are never deleted
    version: a.integer().required(),    // optimistic lock via update condition (version eq N)
    setListIds: a.string().array(),
    archivedSetListIds: a.string().array(),
    bannedSubs: a.string().array(),
    hiddenSongIds: a.string().array(),
    sharedSetListIds: a.string().array(), // owner-written: set lists anyone with the link may read
  })
    .disableOperations(['delete', 'list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub').to(['create', 'read', 'update']),
      allow.authenticated().to(['get']),
      allow.guest().to(['get']),
    ]),

  // Invite code → bandId lookup. Rows are never deleted (a retired code can't be re-created).
  BandInvite: a.model({
    code: a.string().required(),
    bandId: a.string().required(),
    revokedAt: a.datetime(),
  })
    .identifier(['code'])
    .disableOperations(['delete', 'list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub').to(['create', 'read', 'update']),
      allow.authenticated().to(['get']),
    ]),

  // Private per-user "my bands" list. No authenticated read.
  MyBand: a.model({
    owner: a.string().required(),
    bandId: a.string().required(),
  })
    .identifier(['owner', 'bandId'])
    .disableOperations(['subscriptions'])
    .authorization(allow => [allow.owner().identityClaim('sub')]),

  // Self-written membership row; roster is read through the bandId index.
  Member: a.model({
    bandId: a.string().required(),
    owner: a.string().required(),
    displayName: a.string().required(),
  })
    .identifier(['bandId', 'owner'])
    .secondaryIndexes(index => [index('bandId').queryField('listMemberByBandId')])
    .disableOperations(['list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub'),
      allow.authenticated().to(['get', 'list']),
      allow.guest().to(['get', 'list']),
    ]),

  // Loaded by `get` for each id in Band.setListIds; rows are never deleted (archived instead).
  SetList: a.model({
    bandId: a.string().required(),
    name: a.string().required(),
    archivedAt: a.datetime(),
  })
    .disableOperations(['delete', 'list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub').to(['create', 'read', 'update']),
      allow.authenticated().to(['get']),
      allow.guest().to(['get']),
    ]),

  Song: a.model({
    bandId: a.string().required(),
    setListId: a.string().required(),
    title: a.string().required(),
    artist: a.string(),
    key: a.string(),
    bpm: a.integer(),
    notes: a.string(),
    songUrl: a.string(),                // http(s) link to the song (validated in the client)
    tabUrl: a.string(),                 // http(s) link to the tab (validated in the client)
  })
    .secondaryIndexes(index => [index('setListId').queryField('listSongBySetList')])
    .disableOperations(['list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub'),
      allow.authenticated().to(['get', 'list']),
      allow.guest().to(['get', 'list']),
    ]),

  // A member's color for a song, one row per (song, member) like Vote. The song's shared color is the
  // newest row written by a valid, non-banned member (resolved in the client), so a stranger or a
  // banned user can't recolor anything and the owner's bans still apply. Clearing writes `none`; a
  // member's rows can be deleted by that member (leave-band cleanup). `owner` is declared only
  // because it is part of the key. Signed-in reads only (no guest rule).
  SongColor: a.model({
    songId: a.string().required(),
    owner: a.string().required(),
    bandId: a.string().required(),
    setListId: a.string().required(),
    color: a.string().required(),       // a SONG_COLOR_KEYS value or 'none', validated in the client
  })
    .identifier(['songId', 'owner'])
    .secondaryIndexes(index => [
      index('setListId').sortKeys(['owner']).queryField('listSongColorBySetList'),
    ])
    .disableOperations(['list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub'),
      allow.authenticated().to(['get', 'list']),
    ]),

  // One row per (song, voter). The key makes a second vote a conflict and stops key squatting.
  Vote: a.model({
    songId: a.string().required(),
    owner: a.string().required(),
    value: a.string().required(),       // 'up' | 'down', validated in the client
    bandId: a.string().required(),
    setListId: a.string().required(),
  })
    .identifier(['songId', 'owner'])
    .secondaryIndexes(index => [
      index('setListId').sortKeys(['owner']).queryField('listVoteBySetList'),
    ])
    .disableOperations(['list', 'subscriptions'])
    .authorization(allow => [
      allow.owner().identityClaim('sub'),
      allow.authenticated().to(['get', 'list']),
      allow.guest().to(['get', 'list']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
