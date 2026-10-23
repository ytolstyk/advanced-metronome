# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                 # Start development server (Vite + HMR)
rtk tsc                     # Type-check (tsc -b)
rtk err npm run build       # Production build (vite build)
rtk lint                    # ESLint (flat config, v9+)
npm run preview             # Preview production build locally
```

Test framework: **Vitest** + **React Testing Library** (preferred over Jest — same API, native Vite integration, faster).

```bash
npm test                    # Run tests (Vitest watch mode)
npm run test:run            # Single-pass test run (CI)
```

Bands auth regression check (needs a **sandbox** backend, never staging/prod). It refuses to run unless you name the target pool and it differs from this repo's own `amplify_outputs.json` (by path and by the committed copy); it creates throwaway Cognito users and deletes them when done:

```bash
BANDS_SANDBOX_POOL_ID=<sandbox user pool id> node scripts/bands-auth-check.mjs /path/to/sandbox/amplify_outputs.json
```

End-to-end tests: **Playwright** (Chromium only) running against the Vite dev server.

```bash
npm run test:e2e            # Run Playwright e2e tests (headless Chromium)
npm run test:e2e:ui         # Playwright test runner UI (interactive)
npm run test:e2e:debug      # Debug a single test with inspector
```

## E2E Tests

Playwright e2e tests live in `e2e/`. All test files import `{ test, expect }` from `'../fixtures/auth-bypass'` (not from `@playwright/test` directly) — this fixture blocks AWS Amplify network calls so tests run against the unauthenticated app state.

**When to write e2e tests:**
- Any new page added to the app must have a corresponding `e2e/<page-name>.spec.ts` covering at least the happy path: page renders, primary interaction works, navigation works.
- A new significant feature on an existing page (new mode, new form, new game flow) warrants a new `test()` block in the existing spec file for that page.

**When to run e2e tests:**
- Run `npm run test:e2e` before considering any new page or major feature complete.
- Always run after changes to `src/main.tsx` (routing), `src/pages/`, or any component that appears in the nav or welcome screen.

**Test patterns:**
- Prefer `getByRole`, `getByText`, `getByLabel` over CSS selectors.
- For Radix UI ToggleGroupItem, check `await expect(locator).toHaveAttribute('data-state', 'on')` for active state.
- For Radix UI Select, wait for `[role="listbox"]` before clicking an option.
- Never use `page.waitForTimeout()` — use `waitForSelector` or `waitForLoadState` instead.
- Microphone-dependent features (`/tuner` Start Tuner, `/fret-memorizer` mic mode) must be skipped with `test.skip` and a brief explanation comment.

## Architecture

Multi-page app (React Router) with a shared `<Nav>` rendered in `src/main.tsx`. Auth wraps the tree via `Authenticator.Provider` (AWS Amplify). Three contexts at root: `FavoritesProvider`, `LessonsProgressProvider`, `NoteColorsProvider`.

Routes:

- `/` — Welcome/landing (`src/pages/WelcomePage.tsx`)
- `/drums` — Drum machine (`src/pages/DrumMachinePage.tsx`, logic in `src/App.tsx`)
- `/metronome` — Standalone metronome, simple + advanced mode (`src/pages/MetronomePage.tsx`)
- `/tuner` — Guitar tuner (`src/pages/TunerPage.tsx`)
- `/chords` — Chord library (`src/pages/ChordsPage.tsx`)
- `/chord-progression` — Chord progression builder + key analysis (`src/pages/ChordProgressionPage.tsx`)
- `/scales` — Scale fretboard (`src/pages/ScalesPage.tsx`)
- `/caged` — CAGED system visualizer (`src/pages/CAGEDPage.tsx`)
- `/circle` — Circle of Fifths (`src/pages/CircleOfFifthsPage.tsx`)
- `/ear-training` — Ear training: intervals, chords, scales (`src/pages/EarTrainingPage.tsx`)
- `/interval-trainer` — Fretboard interval identification game (`src/pages/IntervalTrainerPage.tsx`)
- `/arpeggios` — Arpeggio library with CAGED shapes and sweep playback (`src/pages/ArpeggiosPage.tsx`)
- `/bands` — My bands: create, join by invite code (`src/pages/BandsPage.tsx`)
- `/bands/:bandId` — Band: set lists, roster, invite, moderation, leave/delete (`src/pages/BandPage.tsx`)
- `/bands/:bandId/availability` — Band availability calendar: mark when you can practice, see everyone's overlap (`src/pages/AvailabilityPage.tsx`)
- `/bands/:bandId/setlists/:setListId` — Set list: suggest songs, vote up/down (`src/pages/SetListPage.tsx`)
- `/shared/:setListId` — Public read-only view of a set list its band owner shared; works signed out (`src/pages/SharedSetListPage.tsx`)
- `/click-track` — Click track builder (`src/pages/ClickTrackPage.tsx`)
- `/fret-memorizer` — Fretboard note memorizer game (`src/pages/FretMemorizerPage.tsx`)
- `/practice` — Practice session tracker: goals, timer, history (`src/pages/PracticeSessionPage.tsx`)
- `/tab-editor` — Guitar tab editor + publish (`src/pages/TabEditorPage.tsx`)
- `/tabs` — Community tab library (`src/pages/TabLibraryPage.tsx`)
- `/tabs/:id` — Read-only published tab viewer (`src/pages/PublishedTabViewPage.tsx`)
- `/lessons` — Lesson library (`src/pages/LessonsPage.tsx`)
- `/lessons/:moduleId` — Module view (`src/pages/ModulePage.tsx`)
- `/lessons/:moduleId/:lessonId` — Individual lesson (`src/pages/LessonPage.tsx`)
- `/build-lesson` — Admin lesson builder (`src/pages/BuildLessonPage.tsx`)

Entry point: `index.html` → `src/main.tsx`.

- **Build:** ES2022 target, ESNext modules, bundler module resolution
- **JSX:** Automatic transform (react-jsx), no React import needed
- **Lint:** ESLint 9.x flat config with TypeScript, react-hooks, react-refresh plugins
- **CSS:** Tailwind CSS v4 (via `@tailwindcss/vite` plugin) + vanilla CSS for domain-specific components. Each component has a co-located `.css` file; page-level styles live in `src/App.css` or their own `src/pages/*.css`.
- **UI components:** shadcn/ui (New York style) — reusable primitives in `src/components/ui/` (Button, Input, Label, Slider, Select, ToggleGroup). Uses Radix UI primitives, `class-variance-authority`, `clsx`, `tailwind-merge`.
- **Path alias:** `@/*` maps to `./src/*` (configured in `tsconfig.app.json` + `vite.config.ts`)

## Drum machine state

All drum machine state lives in `App.tsx` via `useReducer`. The pure reducer and `Action` union type are in `src/state.ts`. Types are in `src/types.ts`:

- `Pattern = Record<InstrumentId, boolean[]>` — per-instrument beat grid
- `AppState` — config (measures, bpm, loopCount), pattern, playback state
- 7 instruments: kick, snare, hihat, openhat, clap, rim, tom

Dispatch is passed as props to all components — no external state library. `config` + `pattern` are persisted to `localStorage` on every change (`saveState` in `src/state.ts`).

Undo history is managed in `App.tsx` with a ref-based stack (not in the reducer). `volume` and `humanize` are local `useState` in `App.tsx` (not persisted, not in the reducer).

## Audio engine (drum machine)

Class-based `AudioEngine` in `src/audio/AudioEngine.ts`, held in a `useRef` via `useAudioEngine` hook. Uses Web Audio lookahead scheduling (25ms `setInterval`, 100ms lookahead).

Drum sounds are fire-and-forget synthesis in `src/audio/drumSynths.ts`. Each synth accepts `(ctx, dest, time, vel?, pitch?)` — `dest` is the engine's master `GainNode` (for volume control), not `ctx.destination` directly. `exportAudio.ts` passes `offlineCtx.destination` instead so WAV export is always at full volume.

`useAudioEngine` hook (`src/hooks/useAudioEngine.ts`) bridges the engine to React — it accepts `humanize` (0–100) and `volume` (0–1) and syncs them to the engine via `useEffect`. During playback, `updateConfig()` live-patches BPM, pattern, and loop count without restarting.

## Guitar tuner

Self-contained in `src/pages/TunerPage.tsx` + `TunerPage.css`. No shared state with the drum machine. Uses the McLeod Pitch Method (NSDF autocorrelation) on mic input via `getUserMedia` + `AnalyserNode` (fftSize 4096). Runs at ~20fps (every 3rd RAF frame) with a 5-frame median filter for stability. Displays a vertical meter: cursor moves up when sharp, down when flat.

## Click track

`src/pages/ClickTrackPage.tsx`. Timeline-based click track builder. Sequences `TrackPiece` segments (each with a time signature, BPM, subdivision, color, and repeat count) via `ClickTrackEngine` (`src/audio/ClickTrackEngine.ts`). Supports WAV export (`exportClickTrack.ts`), drag-and-drop segment reordering, and cloud save/load via `src/api/clickTrackApi.ts` (requires auth). Segments can be sent to the drum machine via `clickTrackToDrum` util.

## Fret memorizer

`src/pages/FretMemorizerPage.tsx`. SVG fretboard game — flashes a random note, the user clicks the correct dot (or plays it on mic). Tracks accuracy per session, saves scores to cloud via `src/api/fretMemorizerApi.ts` (requires auth). Supports 6/7/8-string tunings from `src/data/tunings.ts` (selection persisted to localStorage). Uses `pluckString` audio for feedback.

Two input modes: `click` (tap the fret dot) and `mic` (microphone pitch detection — same NSDF/MPM pipeline as the tuner). String focus filter: clicking a string label restricts both the quiz and fretboard display to that string.

Note colors are managed globally via `NoteColorsContext` (`src/context/NoteColorsContext.tsx`). Fill colors come from `src/data/noteColors.ts` (`DEFAULT_NOTE_FILL`); stroke is auto-derived by `lightenHex`. Colors persist to localStorage (unauthenticated) or cloud via `src/api/noteColorsApi.ts` (authenticated). The `SettingsModal` (`src/components/SettingsModal/`) exposes a per-note color picker with a reset button.

## Tab Editor

`src/pages/TabEditorPage.tsx` + `src/tabEditorTypes.ts` + `src/tabEditorState.ts` + `src/components/TabEditor/`.

**AlphaTab integration (critical):** The tab editor's internal data model must mirror the alphaTab library's domain model (`@coderline/alphatab`). When adding or updating any feature, the same feature must be reflected in both the alphaTab preview (visual rendering) and the `TabPlaybackEngine` (audio playback). Never add a feature to the UI/state model that isn't also wired up to alphaTab. The canonical mapping lives in `src/components/TabEditor/` — any new `TabNote` modifier, `Beat` property, or `Measure` property must have a corresponding alphaTab `Note`, `Beat`, or `Bar` property set during the score-building step.

Types in `tabEditorTypes.ts`:

- `TabTrack` — title, globalBpm, globalTimeSig, stringCount (6/7/8), tuningName, openMidi[], measures[]
- `Measure` — id, optional per-measure timeSignature/bpm, beats[]
- `Beat` — id, duration, dot modifier, notes[], optional dynamics/repeatStart/repeatEnd/tempoChange/tiedFrom
- `TabNote` — fret (0–24; -1 = empty), modifiers (ghost, staccato, letRing, palmMute, dead, naturalHarmonic, hammerOn, pullOff, legatoSlide, slides, bend, vibrato, tapping, pickDown/pickUp), optional bendAmount
- `DurationValue` — whole | half | quarter | eighth | sixteenth | thirtysecond | sixtyfourth; plus dotted/doubleDotted/triplet modifiers

State (`TabEditorState`) lives in `tabEditorState.ts` (pure reducer). Persisted to localStorage via `saveTabTrack`. Includes undo/redo stacks (separate from drum machine undo).

Keyboard editing: arrow keys move cursor, digits type fret numbers (two-digit buffering with 400ms timeout for frets 10–24), spacebar adds empty beat, Backspace/Delete removes note or beat, Cmd/Ctrl+Z/Shift+Z for undo/redo, Cmd+C/X/V for copy/cut/paste.

Overflow dialog: when a note duration exceeds the remaining measure capacity, `pendingOverflow` is set and a modal offers trim-to-fit or bleed-into-next-measure resolution.

Playback via `TabPlaybackEngine` (`src/audio/TabPlaybackEngine.ts`) — separate from the drum machine engine. Uses `pluckString` for preview notes.

View modes: `tab` (default) and `staff` — toggled via toolbar.

Publishing: a signed-in user can publish a tab to the Tab Library via `src/api/publishedTabApi.ts`. Published tabs are browsable at `/tabs` (`TabLibraryPage`) and rendered read-only at `/tabs/:id` (`PublishedTabViewPage`) using alphaTab.

Guitar Pro import/export is handled via alphaTab's built-in GP parser/serialiser, wired up in the tab editor toolbar.

Components in `src/components/TabEditor/`:

- `TabSvgCanvas` — SVG rendering with drag-to-select, click handlers
- `TabMeasureSvg` — per-measure SVG
- `StaffViewSvg` — staff notation view
- `TabEditorHeader` — title, tuning, time sig, BPM controls
- `TabEditorToolbar` — duration, modifiers, technique selector
- `TabEditorPlayback` — play/stop controls + view mode toggle
- `TabTechniquePaths` — SVG path definitions for technique symbols
- `tabSvgConstants.ts` — font and layout constants

## Metronome

`src/pages/MetronomePage.tsx`. Two modes: **simple** (single BPM/time sig/subdivision with animated pendulum) and **advanced** (multi-measure list, each measure has its own BPM/time sig/subdivision/repeat count). Both modes drive `ClickTrackEngine` for scheduling. Tap tempo averages the last 6 taps; resets after 3 s of inactivity. Beat accent fires on beat 0. Preferences (mode, BPM, time sig, subdivision) persist via `src/api/metronomeApi.ts` (localStorage + cloud).

## Ear Training

`src/pages/EarTrainingPage.tsx` + `src/pages/earTrainingLogic.ts`. Three tabs: intervals, chords, scales. Each tab has configurable question pool, difficulty tier (intervals only), game mode (10/20/30/∞), and a replay button. Audio synthesis in `src/audio/earTrainingSynths.ts`. Game flow managed by `useExercise` hook (`src/hooks/useExercise.ts`). Scores saved to cloud via `src/api/earTrainingApi.ts` (requires auth).

## Chord Progression

`src/pages/ChordProgressionPage.tsx`. Eight-slot progression builder. Chord picker modal selects root + quality. Playback scheduler (`ClickTrackEngine` pattern) fires chord audio at the selected beats-per-chord and BPM. Key detection and Roman numeral labelling in `src/utils/chordTheory.ts`. Three instruments (guitar/piano/pad) use synths from `src/audio/chordSynths.ts`. State persists via `src/api/chordProgressionApi.ts`.

**Coupling with Arpeggios:** The Chord Progression and Arpeggios pages share chord/quality vocabulary and fretboard rendering conventions. When adding a new chord quality, tuning, or instrument to either page, check whether the same addition makes sense on the other page — and prompt the user if unsure. Shared data lives in `src/data/arpeggios.ts` (arpeggio shapes) and `src/utils/chordTheory.ts` (quality labels, Roman numeral logic).

## CAGED Visualizer

`src/pages/CAGEDPage.tsx`. Renders the full neck (16 frets) as an SVG. CAGED shape positions computed by `computeCAGEDShapes` in `src/data/caged.ts`. Optional major scale overlay highlights scale tones within the selected shape. Root note and active shape persist via `src/api/cagedApi.ts`.

## Interval Trainer

`src/pages/IntervalTrainerPage.tsx`. Fretboard game — shows a root note dot; player clicks the correct target interval fret. Difficulty tiers progressively unlock interval types (P4/P5 → m3/M3/Oct → M2/m6/M6 → m2/m7/M7/Tritone). Supports 6/7/8-string tunings. Uses `pluckString` for audio. Scores saved via `src/api/intervalTrainerApi.ts`.

## Arpeggios

`src/pages/ArpeggiosPage.tsx`. Browsable arpeggio database keyed by quality (`ArpeggioQuality`) and CAGED shape. Data in `src/data/arpeggios.ts`. Each card shows an SVG fretboard diagram with barre support. Playback via `playArpeggio` in `src/audio/arpeggioSynths.ts` — sweep direction (up/down/alt) and BPM are user-configurable. No cloud persistence (stateless browse).

**Coupling with Chord Progression:** See the note under **Chord Progression** above. Changes to quality enums, tuning support, or fretboard layout on the Arpeggios page should be evaluated for parity on the Chord Progression page (and vice versa).

## Practice Session Tracker

`src/pages/PracticeSessionPage.tsx`. Phase-based UI (setup → active → summary). Goal fields: duration, target BPM, skill focus text, and which tools to practice. Live timer via `usePracticeTimer` hook (`src/hooks/usePracticeTimer.ts`). Interrupted sessions are persisted to localStorage so the user can resume. Completed sessions save to cloud via `src/api/practiceSessionApi.ts`. History view shows weekly calendar, streak counter, and contextual nudges (`computeNudges` in `src/practiceSessionUtils.ts`). Types in `src/practiceSessionTypes.ts`.

## Bands

`src/pages/BandsPage.tsx` → `BandPage.tsx` → `SetListPage.tsx`; components in `src/components/Bands/`; pure logic in `src/bandUtils.ts` (validators, sanitising, tallies) and `src/bandViews.ts` (raw rows → validated views), types/limits in `src/bandTypes.ts`; API in `src/api/bandsApi.ts` (bands, invites, members, owner moderation), `setListsApi.ts` (set lists, songs), `songVotesApi.ts` (votes), shared client/helpers/Band write protocol in `bandsShared.ts` (also `resolveReader`/`readArgs` for guest reads), `sharedSetListApi.ts` (the public loader), pagination + bounded parallelism in `api/paginate.ts`; data loading via `src/hooks/useLoader.ts`, optimistic voting in `useOptimisticVotes.ts`, song colors in `songColorsApi.ts` + `useSongColors.ts` (palette in `bandSongColors.ts`). The Bands list has a persisted "Only bands I’m in" filter (localStorage `bands-only-mine`, on by default; hides bands you were removed from). Band/set list/song cards share `components/Bands/cardStyles.ts` and the `surface` theme tokens. Users belong to bands (instant join by invite code), bands have set lists, set lists have songs; members suggest songs straight onto a set list and vote up/down, at most once each (switch/retract allowed). A set list is a vote-ranked suggestions board (no manual running order yet).

**Access model (no Lambda, Amplify auth rules only):** rows are reachable only by id (`get`) or by index queries that need a parent id; plain `list` is disabled on every public model. Possessing a `bandId` is the capability. **`Band` is the single root of trust**: only its owner can write it, and its owner-written arrays (`setListIds`, `archivedSetListIds`, `bannedSubs`, `hiddenSongIds`, `sharedSetListIds`) drive read-time validation. Every row shown must pass through the validators (`bandUtils.ts`, assembled in `bandViews.ts`); pages call `assembleBandView`/`assembleSetListView` on fetched rows and never render raw rows. Rows whose text changes when sanitised (zero-width/bidi characters, padding) are hidden, not repaired. Auth rules only check a row's own fields on write, so a signed-in user can write junk rows; validators make them invisible.

**Public sharing (the one signed-out read path):** the owner can share a set list (`Band.sharedSetListIds`, owner-written, a subset of `setListIds`, default off; archive and delete clear it) so anyone with `/shared/:setListId` can read it without signing in. `src/api/sharedSetListApi.ts` (`loadSharedSetList`) is the only code that reads as a guest (`allow.guest()` read rules in the schema, `authMode: 'identityPool'` via `resolveReader`). It reads the set list row plus songs/votes, then the Band, and returns `unavailable` unless the Band proves the list is shared; everything goes through the same validators. Public reads use tight page caps (`PUBLIC_READ_PAGES`) and the page refetches on focus only every 5 minutes. Every other API function stays `requireAuth()`-first: signed-in reads (`fetchSetListRows`, `listVotesForSetList`) and the guest ones (`fetchPublicSetListRows`, `listPublicVotes`) are deliberately separate functions. **Known limit:** auth rules can't see `sharedSetListIds`, so the signed-out read rules cover EVERY band, not just shared lists: a guest holding a shared link (or any band/set list id) can read the SetList row (so its `bandId`), then the whole band (invite code, roster with display names and subs, votes, unshared set lists' songs). The owner confirms this in a dialog before sharing. Public reads are page-capped, so a flood of junk rows against a known set list can push real rows off the public page (the `incomplete` banner shows). Anyone could already do this by signing up, and the privacy policy says so; "Stop sharing" only hides the list in the app. Closing it for real would need a separate public projection model (a snapshot that goes stale as members write songs/votes).

**Invariants — do not break:**
- All owner rules use `allow.owner().identityClaim('sub')` (`owner` = bare Cognito sub). Do **not** declare `owner` on Band/SetList/Song (undeclared, it is server-populated and absent from create/update inputs, so it can't be forged or reassigned). Vote/Member/MyBand declare `owner` only because it is part of their key.
- Never add an `owner`-keyed index to a public-read model (it would let anyone list every band a user belongs to). "My bands" comes from the private `MyBand` model.
- Band, BandInvite and SetList rows are **never deleted** (tombstones: `deletedAt`, `revokedAt`, `archivedAt`) so ids/codes can't be re-created and hijacked. `disableOperations(['delete', …])` enforces it.
- Band writes go through `updateBand` (checks sign-in, fresh read, partial update, `version` condition, per-band mutex, refuses tombstoned bands). Never send a whole Band object. Reads never write: dead bands are dropped by an explicit `pruneDeadBands`.
- Deleting a band is one atomic tombstone+scrub Band write (after retiring the invite), then set-list rows are tombstoned; every step is re-runnable.
- Text limits: band/set-list names 50 characters, display names 30 (`sanitizeName` vs `sanitizeDisplayName`); never clamp one with the other's limit.
- Votes: key `(songId, owner)` guarantees one row per member per song; the tally also dedupes and checks the voter is a valid member and the vote's parents match the song.
- Song colors: one `SongColor` row per `(songId, owner)` (like Vote, owner rule, signed-in reads only, never on the public page; clearing writes `none`, and leaving a band can delete the member's own rows via `deleteMyContent`). The song's shown color is the newest row by a valid, non-banned member (`resolveSongColors`), so any member can recolor and bans apply. Reading colors is best-effort (`fetchSetListRows` degrades to no colors, flagged incomplete) so a cosmetic query can't take the set list down. Optimistic writes go through `useOptimisticChoice`.
- Color labels: a band names its palette colors ("Ballad" for red) with one `ColorLabel` row per `(bandId, color, owner)` (owner rule, signed-in reads only via `listColorLabelByBand`, never on the public page; clearing writes `''`, and leaving a band deletes the member's own rows in `deleteMyContent`). The shown label is the newest row by a valid, non-banned member (`resolveColorLabels`), so any member can rename and bans apply; text goes through `sanitizeColorLabel` (20 chars) and unclean rows are hidden. Labels are band-wide but ride on the set list page: `loadPage` fetches them best-effort (`fetchColorLabelRows`, degrades to none, flagged incomplete) and merges them as `SetListRows.labels`. The labels dialog sends only the colors the person edited (never a full snapshot) so it can't revert another member's rename. Leaving a band deletes the leaver's rows, so the band's label for a color can fall back to an older member's (same as song colors). A color can also be chosen when suggesting a song (`SuggestSongDialog` → `colors.setColor` after `suggestSong`).
- Keys and GSIs are immutable after deploy. After any schema change run the sandbox check above and wait ~5 minutes for AppSync/GSIs to settle before trusting results.

**Known limits (disclosed in the privacy policy):** a `bandId` is the real capability — ex-members or anyone holding the link can still read a band; "remove member" and "reset code" are UI-level (reset only stops people without the id); banning is per account (Google and email sign-ins are different accounts); Vote rows are queryable by anyone (signed in or not) who knows the ids; a hostile signed-in user can flood a known set list's vote page (or a known band's color label rows, which can push real labels off the capped read; any member can also overwrite a label and only a ban reverts it); ownership can't be transferred and the owner can't leave (only delete). Caps (15 members, 10 set lists, 100 songs per list, 200 bans, 1000 hidden songs) are client-side only.

**Song link autofill:** pasting a Spotify/YouTube/Apple Music/SoundCloud link into the song form fills title/artist via the signed-in `lookupSongLink` query → `amplify/functions/song-metadata` (`parse.ts` is the SSRF allow-list: fixed provider hosts, validated ids, no redirects; `isLookupSupported` in `src/api/songMetadataApi.ts` reuses it so other links cost no request). Client orchestration lives in `src/hooks/useSongLinkAutofill.ts` (looks each link up once, never overwrites typed text). The Lambda output is untrusted and re-sanitised client-side; no per-user rate limit (reserved concurrency 5 only).

**Availability calendar** (`/bands/:bandId/availability`): each member marks the half hours they can practice; the page shows who overlaps and suggests the best windows.
- **Layout:** a Google-Calendar-style week: one column per day (7 on ≥640 px, 3 on a phone via `useDaysPerPage`), half-hour rows from **8 AM to 10 PM only** (`PRACTICE_START_HOUR`/`PRACTICE_END_HOUR`, `practiceSlots`; the band doesn't practice outside them, so those times can't be marked or suggested), hour labels in a gutter. The page is a rolling window starting today (`useWeekFocus`: Earlier/Today/Later by whole pages plus a date input). `AvailabilityWeekGrid` matches rows across days by position, so DST days and :15/:45 zones line up, and is one tab stop with arrow-key movement. My-times tools (range, clear, repeat) act on a "Day" picker.
- **Model:** one `Availability` row per `(bandId, owner)`, read **by exact key only** (`get`; no `list`, no index, no guest rule). Fields: `format` (must be 1), `startDay` (UTC day number of bit 0) and `mask` (lowercase hex, 12 chars per UTC day, bit 1 = free; slot = `floor(epochMs / 30min)`). **Only "free" is stored**: unmarked time is "not marked", never "busy", and the UI never says busy. Every save writes a fixed 62-day window from today and drops past slots, so a row prunes whenever its owner saves (one from someone who stops using the app stays as it was). There is deliberately no GSI: a bandId index page could be flooded (or bricked by oversized rows) by junk nobody else can delete.
- **Layers:** pure logic in `availabilitySlots.ts` (slots, codec, `encodeRow`, `applyEdits`), `availabilityUtils.ts` (strict `parseAvailabilityRow`, `classifyOwnRow`/`planSave`, `pickParticipants` capped at 30, `parseGroup` then `resolveAt(group, now, mine)`, `buildOverlap`, `describeSlot`), `availabilityWindows.ts` (`findBestWindows`) and `availabilityCalendar.ts` (Intl only: local days, DST-safe labels, `repeatWeekday`). API in `api/availabilityRows.ts` (a LEAF: keyed read, `saveMyAvailability`, deletes; imported by `bandsApi.dismissBand`, so it must not import `bandsApi`) and `api/availabilityApi.ts` (`loadAvailabilityPage`). Hooks: `useAvailabilityEditor` (edits, autosave, delete; the stored row has one source, the loader's, unless our own save/delete finished after that load began), `useAvailabilityView` (horizon days, week focus, the parse→resolve→overlap→windows pipeline), `useAvailabilityPrefs`, `useDaysPerPage`, `useClock`, `usePersistedState`. UI in `components/Bands/Availability*.tsx`; `pages/AvailabilityPage.tsx` only composes them.
- **Rows are untrusted** (auth rules can't look inside one): a row that is not exactly what this client writes is hidden, not repaired; a member whose row can't be read is named ("Couldn't read X"), never shown as "not responded". Own row from a newer client (`format > 1`) blocks saving; a known-format row that is malformed is replaced (the user is told). `updatedAt`/`createdAt` are not client-writable (the sandbox check proves it), so "last saved" is the server's; rows older than 14 days are flagged "may be out of date".
- **Saving:** `saveMyAvailability` re-reads the row, `planSave` decides what to write, then create or update; a create that finds the row, or an update that finds it gone (reported as **Unauthorized**), goes round again (3 passes). Two devices saving within one round trip can overwrite each other (own row only). Autosave (800 ms) is **paused until the person accepts the privacy notice**, and every flush path (unmount, tab hidden, retry) respects that; "Delete my availability" cancels pending edits first.
- **Cleanup:** the leave dialog deletes the row in parallel with `deleteMyContent` (a failure offers "Leave anyway"); `dismissBand` also cleans up best-effort (bounded 5 s, one retry, never blocks or fails the dismiss). The user-initiated delete (button and leave dialog) uses `deleteConfirmed`: a refused delete (Unauthorized) only counts as done if a re-read shows the row gone. Unlike votes/songs/colors this lives in the leave dialog and `dismissBand`, not `deleteMyContent`. A removed member's row, or one whose cleanup failed, stays readable until they dismiss the band.
- **Exposure (disclosed on the page, in the share-set-list dialog and the privacy policy):** anyone with an account who has the band link can read every member's free times (member ids are public through the guest-readable roster, and a shared set-list link reveals the bandId). Free-time patterns can show when someone is away. A hostile member can store an oversized row that every viewer downloads (the owner can ban them); caps (30 participants read, 62-day window) are client-side only.
- **Persistence:** like the rest of Bands this is cloud-only and sign-in gated. Only UI preferences (`availability-prefs`: shortest suggested window) and the privacy-notice acknowledgement (`availability-notice:<bandId>:<sub>`) are stored locally.
- **Sandbox check:** `scripts/bands-auth-check.mjs` covers `Availability` (no list/index query, owner binding, read by key, guests denied, forged timestamps not accepted, read-after-write, missing-row error shapes, oversized-row cost). Its header lists what a sandbox needs first: an identifier under 15 characters, placeholder `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets set **without a trailing newline**, `ALLOW_USER_PASSWORD_AUTH` enabled on the sandbox app client, and `cognito-idp` `AdminCreateUser`/`AdminSetUserPassword`/`AdminDeleteUser` on that pool.

**Persistence exception:** band data is cloud-only and requires sign-in (`<AuthGate>`); it is inherently multi-user, so it is not mirrored to localStorage. Only the pending invite code (sessionStorage, cleared after use or sign-out) is stored locally.

## Lessons

Three nested pages: `LessonsPage` → `ModulePage` → `LessonPage`. Lesson content lives in `src/data/lessons.ts` (static). Progress (completed/favorites) is tracked in `LessonsProgressContext` and persisted to localStorage. `BuildLessonPage` is an admin tool for drafting new lessons. `LessonTabView` component renders individual lesson steps.

## TypeScript strictness

Strict mode enabled. Notable settings in `tsconfig.app.json`:

- `erasableSyntaxOnly` — no enums or namespaces
- `verbatimModuleSyntax` — must use `import type` for type-only imports
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

## Key design decisions

- **Mixed time signatures:** each measure can have a different time signature; pattern arrays are resized/remapped on structural changes
- **Live editing during playback:** BPM, pattern toggles, and loop count update in real-time via `updateConfig()`; structural changes (measure count, time signatures) stop playback
- **DrumSynth dest param:** all synths route through a master GainNode — always pass `dest` not `ctx.destination`
- **WAV export:** uses `OfflineAudioContext` in `exportAudio.ts`, bypasses the master GainNode

## Reusable UI components (`src/components/ui/`)

shadcn/ui primitives — use these before writing custom elements:

- `Button` — variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes: `default`, `sm`, `lg`, `icon`
- `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` — Radix Dialog wrappers
- `Input` — styled form input
- `Label` — form label
- `Slider` — range slider
- `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` — dropdown select
- `Toggle` / `ToggleGroup` / `ToggleGroupItem` — toggle buttons
- `DropdownMenu` / `DropdownMenuTrigger` / `DropdownMenuContent` / `DropdownMenuItem` — dropdown menu
- `Tooltip` / `TooltipTrigger` / `TooltipContent` — tooltip

All use `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for class merging. Always use `cn()` for conditional classes.

## Reusable feature components

- `BeatCell` (`src/components/BeatCell/`) — drum grid cell; props: active, current, subdivision state
- `DrumGrid` (`src/components/DrumGrid/`) — scrollable beat grid with RAF-based scroll-follow (60px cell width, 4px gap)
- `InstrumentRow` (`src/components/InstrumentRow/`) — single instrument row in the drum grid
- `PianoKeyboard` (`src/components/PianoKeyboard/`) — visual piano keyboard for scales/note display
- `Fretboard` (`src/components/Fretboard/`) — guitar fretboard SVG visualization
- `TransportControls` (`src/components/TransportControls/`) — play/pause/stop/undo + BPM/humanize/volume sliders
- `StorageErrorBanner` (`src/components/StorageErrorBanner/`) — error notification banner
- `SettingsModal` (`src/components/SettingsModal/`) — per-note color picker with reset
- `AuthModal` (`src/components/AuthModal/`) — AWS Amplify auth modal
- `MeasureHeaders` (`src/components/MeasureHeaders/`) — time signature headers above drum grid
- `ChordPickerModal` (`src/components/ChordPickerModal/`) — root + quality chord picker used by chord progression builder
- `TabLibraryCard` (`src/components/TabLibrary/TabLibraryCard`) — card for a published tab in the library

## Custom hooks

- `useAudioEngine(humanize, volume)` (`src/hooks/useAudioEngine.ts`) — manages `AudioEngine` lifecycle; returns `{ play, pause, stop, resume, togglePlayback, getEngine, previewChord, previewDrum }`
- `useTapTempo()` (`src/hooks/useTapTempo.ts`) — BPM detection from taps; returns `[tap, flashing]`
- `usePlaybackCursor` (`src/hooks/usePlaybackCursor.ts`) — tracks current beat position
- `useFavorites` (`src/hooks/useFavorites.ts`) — favorites list management
- `useLessonAudio` (`src/hooks/useLessonAudio.ts`) — audio playback for lesson examples
- `useLessonsProgress` (`src/hooks/useLessonsProgress.ts`) — lesson completion tracking
- `useExercise(mode)` (`src/hooks/useExercise.ts`) — game state machine (idle/playing/result) shared by ear training tabs
- `useLoader(load)` (`src/hooks/useLoader.ts`) — load-on-mount + throttled refetch on tab focus + `reload()`; keeps last good data on a failed refresh, error state on a failed first load; mount with a `key` per resource
- `usePracticeTimer()` (`src/hooks/usePracticeTimer.ts`) — wall-clock elapsed timer for practice sessions; returns elapsed seconds and a reset function

## Context providers

Split into definition + provider pairs so consumers can import just the context type:

- `FavoritesContext` / `FavoritesProvider` (`src/context/FavoritesContext.tsx`) — favorited chords with cloud + localStorage sync
- `NoteColorsContext` / `NoteColorsProvider` (`src/context/NoteColorsContext.tsx`) — note fill colors; debounced cloud save (500ms); `lightenHex` auto-derives stroke
- `LessonsProgressContext` / `LessonsProgressProvider` (`src/context/LessonsProgressContext.tsx`) — completed/favorite lessons, localStorage-persisted

## Audio synthesis patterns

All drum synths in `src/audio/drumSynths.ts` follow: `(ctx, dest, time, vel?, pitch?)` where `dest` is always the engine's `masterGain`, never `ctx.destination`. Same rule applies to `chordSynths.ts` and `tabGuitarSynths.ts`.

For WAV export, `exportAudio.ts` passes `offlineCtx.destination` directly — the master GainNode is intentionally bypassed so export is always at full volume.

Chord synthesis (`src/audio/chordSynths.ts`):

- `playGuitarChord()` — uses `CHORD_DATABASE` voicings + `pluckString`
- `playPianoChord()` — harmonic series, 4-second sustain
- `playPadChord()` — sawtooth + sine, lowpass filter, 6-second sustain

Ear training synthesis (`src/audio/earTrainingSynths.ts`):

- `playInterval(ctx, rootMidi, targetMidi, direction)` — plays two notes sequentially or simultaneously
- `playEarTrainingChord(ctx, rootMidi, type)` — plays a chord voicing for chord identification
- `playScale(ctx, rootMidi, mode)` — plays scale tones ascending for scale identification

Arpeggio synthesis (`src/audio/arpeggioSynths.ts`):

- `playArpeggio(ctx, frets, openMidi, direction, bpm)` — sweeps an arpeggio shape using `pluckString`; `SweepDirection` = `'up' | 'down' | 'alt'`

## Data persistence pattern

**Every page that has user-configurable state must persist it.** This is a non-negotiable requirement:

- **Always** save to localStorage so state survives page refresh (unauthenticated users included).
- **If the user is signed in**, also save to the cloud via AWS Amplify so state roams across devices.
- Load from cloud on mount when authenticated; fall back to localStorage otherwise.

All API modules in `src/api/` follow this shape:

1. Call `isAuthenticated()` from `src/api/authUtils.ts`
2. If authenticated → read/write via AWS Amplify `generateClient()` with `amplify/data/resource` schema
3. If not → fall back to localStorage via `src/api/storageUtils.ts`
4. Debounce cloud saves (500ms) to avoid thrashing

When adding a new page with user state, create a corresponding `src/api/<feature>Api.ts` that implements both paths. Do not leave state ephemeral.

## Auth gating

**Cloud save/load and AI features must always be gated behind authentication.** This is a non-negotiable requirement:

- Any feature that reads from or writes to the cloud (AWS Amplify) must first check `isAuthenticated()` and must not attempt the cloud call if the user is not signed in.
- Any AI-powered feature (Gemini, Claude, or any other LLM call) must require the user to be signed in before the feature is accessible or invoked.
- The UI must reflect this: show the `AuthModal` (or a sign-in prompt) when an unauthenticated user attempts to use a gated feature. Never silently skip a cloud/AI call without telling the user why.
- localStorage-only operations (offline state persistence) are always allowed for unauthenticated users and must never be blocked.

## Common patterns

**Modal pattern** — use Radix `Dialog` with `DialogTrigger` + `DialogContent` + `DialogHeader` + `DialogTitle`. Never build custom overlay/modal from scratch.

**Class merging** — always `cn(baseClasses, conditionalClasses)` from `src/lib/utils.ts`.

**State + dispatch** — reducer state and `dispatch` are passed as props; no Context or external library for feature state. Only cross-cutting concerns (auth, note colors, lessons progress) use Context.

**Undo** — ref-based stack in the page component (not inside the reducer). Drum machine: `App.tsx`. Tab editor: `tabEditorState.ts` includes undo/redo stacks directly.

**URL sharing** — `src/shareUtils.ts` encodes `AppState` as base64url (`encodeShareState` / `decodeShareState`). Scale sharing uses `encodeScaleShare` / `buildScaleShareUrl`.

**Constants** — BPM range 40–300 (default 120), max 8 measures, chord disconnect 4000ms, preview decay 5000ms, autosave debounce 2000ms. All in `src/constants.ts`.

**Presets** — 8 built-in drum patterns in `src/presets.ts` (Basic Rock, Four on the Floor, Hip-Hop, Funk, Reggae, Bossa Nova, Waltz, Shuffle). User presets in `src/userPresets.ts`.

## Adding new pages

When a new page is created and added to the nav (`src/main.tsx`), it **must also be added to the welcome screen** (`src/pages/WelcomePage.tsx`).

## Responsive design

All pages must be responsive and usable on mobile screens. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) for layout breakpoints. Avoid fixed pixel widths that would cause horizontal scroll on small screens. Test layouts at 375px viewport width.

## Validations

Make sure all these checks pass before accepting changes:

1. **Lint** `rtk lint`
2. **Types** `rtk tsc`
3. **Build** `rtk err npm run build`

@CLAUDE.local.md
