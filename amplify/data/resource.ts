import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { geminiSuggestFunction } from '../functions/gemini-suggest/resource';
import { geminiPlanFunction } from '../functions/gemini-plan/resource';

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

  // Generated practice plan — one record per user (latest plan wins)
  UserPracticePlan: a.model({
    inputJson: a.string().required(),
    planJson:  a.string().required(),
    generatedAt: a.string().required(),
  }).authorization(allow => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
