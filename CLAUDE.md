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

Type-check the Lambda and backend code (`tsc -b` never sees `amplify/functions`, which has no tsconfig of its own, so run this after touching it):

```bash
npm run typecheck:amplify
```

Bands auth regression check (needs a **sandbox** backend, never staging/prod). It refuses to run unless you name the target pool and it differs from this repo's own `amplify_outputs.json` (by path and by the committed copy); it creates throwaway Cognito users and deletes them when done:

```bash
BANDS_SANDBOX_POOL_ID=<sandbox user pool id> node scripts/bands-auth-check.mjs /path/to/sandbox/amplify_outputs.json
```

Backing track orphan sweep (operator script; dry run by default, see `docs/backing-tracks-runbook.md`):

```bash
npx tsx scripts/backing-tracks-sweep.ts --bucket <bucket> --table <BackingTrack table> [--delete --limit 100]
```

README screenshots (fake data only, seeded into localStorage; guest mode so no Bands/cloud pages; output in `docs/screenshots/`; needs the dev server running; optional third argument limits it to named shots, e.g. `drum-machine,scales`):

```bash
node scripts/take-screenshots.mjs http://localhost:5173
```

Standalone Jam Station wiring page (one self-contained HTML file built from the app's own router in `src/rigRouting.ts`; default output `~/Downloads/jam_station_architecture_v2.html`):

```bash
node scripts/build-jam-station.mjs [output.html]
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
- `/bands/:bandId/rig` — Band gear & rig diagrams: list equipment (ports, specs), draw and connect rigs (`src/pages/RigPage.tsx`)
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
- `/privacy`, `/terms` — Privacy Policy and Terms of Service (`PrivacyPolicyPage.tsx`, `TermsOfServicePage.tsx`, shared `components/LegalPage/LegalPage.tsx`, linked from the footer's Legal nav)

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

`src/pages/ClickTrackPage.tsx`. Timeline-based click track builder. Sequences `TrackPiece` segments (each with a time signature, BPM, subdivision, color, and repeat count) via `ClickTrackEngine` (`src/audio/ClickTrackEngine.ts`). Supports WAV or FLAC export (`exportClickTrack.ts`, `clickExportSinks.ts`, `flacEncoder.ts`), drag-and-drop segment reordering, and cloud save/load via `src/api/clickTrackApi.ts` (requires auth). Segments can be sent to the drum machine via `clickTrackToDrum` util.

**Import tempo map (Guitar Pro / AlphaTex file):** the header's "Import tempo map" button opens `SongImportDialog` (`src/components/ClickTrack/`), which reads the picked file, previews the segments, and on accept replaces the track (the page owns the `window.confirm` on a non-empty track; the dialog only reports `onAccept(pieces)`). Entirely local: no network, cloud, AI or Lambda, so no auth gating; the result persists through the usual `click-track-state`. Logic lives in `src/utils/scoreToClickTrack.ts`: callers use `importScoreFile(file)` (read + parse + expand; alphaTab types stay inside) then `barsToPieces(bars, meta, opts)`; all result types are defined there. Run-grouping, the shared piece id and the palette are in `src/utils/barRuns.ts` (also used by `tabToClickTrack.ts` and `drumToClickTrack.ts`), text sanitising is the leaf `src/utils/sanitizeText.ts` (re-exported by `bandUtils`), and the persist/share helpers are in `src/utils/clickTrackPage.ts`. Score-view bars render through the memoized `components/ClickTrack/MeasureCell.tsx` with stable handlers, so a click re-renders only the active bar; keep it that way (imports can reach 2000 bars).
- **Bars come from alphaTab's own playback order** (`MidiFileGenerator` + `AlphaSynthMidiFileHandler` → `tickLookup.masterBars`), so repeats, alternate endings and D.C./D.S. jumps are already expanded and tempo carries the way alphaTab plays it. Never strip `score.tracks` before generating: an anacrusis bar takes its length from its tracks' bars, so stripping makes every pickup 0 ticks.
- **Hostile-file guard:** alphaTab has no cap on repeat/jump expansion (Coda jumps can loop forever, closes multiply). `playedOrderBars` generates with a no-op MIDI handler (only the tick lookup is needed) and installs three guards sharing one wall-clock budget (3 s default; `importFromScore(..., { budgetMs })` for tests): `addMasterBar` (also caps played bars at 2000), `addBeat` (every 64th call; a single dense repeated bar needs it because `addMasterBar` runs before a bar's beats), and a getter on each bar's `alternateEndings` (the repeat walk reads it on every step, including steps that skip a bar and never reach the other two hooks; deeply nested alternate endings otherwise loop for hours without emitting a bar). The getters are removed again afterwards. Verified against alphaTab 1.8.2; the hostile-file tests are the early warning on an upgrade. Do not replace this with an estimator of repeat counts (a stack-walk undercounts multi-close groups). Parsing and expansion still run on the main thread, so a crafted file can freeze the picker's own tab for up to the budget (a Web Worker with `terminate()` is the complete fix, not done); picking a file stops playback first.
- **Per-bar rules:** a bar's tempo is the harmonic mean of the tempos inside it (preserves its duration), rounded to whole BPM and clamped to `CLICK_BPM_MIN..CLICK_BPM_MAX` (20-400, the page's own validator range; not `MIN_BPM/MAX_BPM`). Bar length comes from tick length, not the declared signature. Never drop a bar: an unrepresentable bar fails the import, except an unclickable pickup at the very start, which is skipped with a warning. `isAnacrusis` is only set by alphaTex `\ac`, GPIF, MusicXML and Capella (never by the GP3-5 binary importer), and `isLinear` is true on EVERY GP3-5 tempo change, so it only signals a ramp for other formats (`meta.hasGradualTempo`).
- **Limits:** 3 MB file (real files are under 1 MB), a pre-parse check that a `.gp` zip does not claim more than 64 MB unpacked (it reads both the central directory and the local headers, because alphaTab ignores the directory; a zip that lies in every header or uses data descriptors is NOT caught, since alphaTab inflates with no output limit and a crafted file can still exhaust memory in the picker's own tab; a Worker would only stop CPU hangs, not memory), `.gpx` containers (`BCFZ`/`BCFS`) are refused with a "save as .gp" message (alphaTab's reader can be driven to gigabytes by a few MB of sector pointers and `.gpx` was never verified), AlphaTex text is capped at 20000 `|` bar lines before parsing (applied by content, not extension, because alphaTab reads any text as AlphaTex), 2000 written and 2000 played bars, 500 tempo changes in one bar, 30 minutes at 100% speed (export renders in short slices and holds the finished mono 22.05 kHz file in one Blob, about 80 MB as WAV at 30 minutes, usually a few MB as FLAC; a failed render shows an inline alert), warn above 20 segments (about where a share link stops fitting), refuse above 400, warn above 300 clicks/minute (the engine clicks every denominator unit, so /16 and /32 signatures click very fast). Repeats per segment are chunked at 99.
- **Accepted file types:** the `accept` hint lists `.gp,.alphatex`; nothing rejects by extension. `.gp3`/`.gp4`/`.gp5` go through the same code but are unverified against real files (none were available); add them to the hint once a real `.gp5` imports correctly. `.gpx` is refused (see Limits); supporting it needs a bounded reader first.
- **Deferred on purpose** (data from 60 real tab files): combining repeating odd-meter patterns (5/8+7/8 → 12/8 would need `exportClickTrack`, `getMeasureDots` and `saveEdit` to honour `accentPattern`, which only `ClickTrackEngine` reads today), tempo-drift smoothing (helps 1 of 60 songs), "Add to end", undo. A Songsterr link import and a paste-Songsterr-JSON import were designed and parked (robots.txt disallows `/api/`; their terms bar tools that get around paid features): do not fetch songsterr.com `/api/` or `/a/wa/song`.
- **Replacing the track:** every path that swaps the whole track (file import, saved track, shared link, drum/tab hand-off) goes through `replaceTrack` in the page (stop playback, set pieces and groups, clear selection/loop/editing); keep it that way or stale loop selections survive.
- **Known render cost:** score-view bars are memoized and only the clicking bar re-renders per beat; the card list (default view) does not re-render per beat either (`handleBeat` ignores sub-beats unless expand view is on, guarded by `ClickTrackPage.render.test.tsx`), but it still re-renders ALL cards once per bar change. At the 400-segment ceiling that was ~80 ms in a dev/jsdom measurement (several times less in a production browser); a memoized `PieceCard` (same pattern as `MeasureCell`) is the fix if it ever shows up. Entering expand view with ~2000 bars mounts ~30k nodes (~0.4 s).
- **Fixtures:** tests build alphaTex in-test. Never commit a real tab file or a real Songsterr payload.
- **Band hand-offs:** "Save to Band" (signed-in, next to Save to Cloud) attaches the track to a band song, and "Open" on a set list song arrives here through `sessionStorage['band-to-click-import']`; see **Band click tracks** under Bands.
- Share links break at about 13 segments (`encodeTrack` is ~600 bytes per piece); `handleShare` shows `ShareTooLargeNotice` above 8000 characters instead of copying a broken link, and the persist effect uses `saveClickTrackState` so a full or blocked localStorage shows an inline alert instead of unmounting the page.

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

`src/pages/BandsPage.tsx` → `BandPage.tsx` → `SetListPage.tsx`; components in `src/components/Bands/` (invite section: `InviteSection.tsx`); pure logic in `src/bandUtils.ts` (validators, sanitising, tallies) and `src/bandViews.ts` (raw rows → validated views), types/limits in `src/bandTypes.ts`; API in `src/api/bandsApi.ts` (bands, invites, members, owner moderation), `setListsApi.ts` (set lists, songs), `songVotesApi.ts` (votes), shared client/helpers/Band write protocol in `bandsShared.ts` (also `resolveReader`/`readArgs` for guest reads), `sharedSetListApi.ts` (the public loader), pagination + bounded parallelism in `api/paginate.ts`; data loading via `src/hooks/useLoader.ts`, optimistic voting in `useOptimisticVotes.ts`, song colors in `songColorsApi.ts` + `useSongColors.ts` (palette in `bandSongColors.ts`). The Bands list has a persisted "Only bands I’m in" filter (localStorage `bands-only-mine`, on by default; hides bands you were removed from). Band/set list/song cards share `components/Bands/cardStyles.ts` and the `surface` theme tokens. Users belong to bands (instant join by invite code), bands have set lists, set lists have songs; members suggest songs straight onto a set list and vote up/down, at most once each (switch/retract allowed). A set list is a vote-ranked suggestions board until the owner sets a running order. **Song order:** `SetList.songOrder` (owner-written string array of song ids, top first; empty/absent = purely by votes) is applied by `applySongOrder` in `assembleSetListView` (listed songs first in that order, every other song after, still ranked by score; ids with no visible song are ignored) and `SetListView.customOrder` says whether it is in effect. The owner reorders from the set list page (`SetListReorderList`, reused with a `label`, draft saved once by Done through `reorderSongs`, a plain owner-only `SetList` update, no `updateBand`; "Reset to vote order" writes `[]`). Owner-only because only the owner can write `SetList` (members have no way to write an order without a new model); the whole order is sent, so a stale second tab of the owner can revert an earlier reorder; Reorder is disabled while the list is `incomplete` (the save would drop the stored places of songs that didn't load), and a hidden song restored later goes to the end; archiving clears `songOrder`; Done with no moves writes nothing; the just-saved order stays on screen until a load that started after the save arrives. The guest-readable public page shows the same order. **Set list order:** the band page lists set lists newest first. `Band.setListIds` is stored oldest to newest (creating appends), so display = reverse (`orderSetListsForDisplay`, applied once in `assembleBandView`). The owner can reorder them (`SetListReorderList`: drag the grip, type a position, or arrows; moves edit a local draft in `SetListsSection` and "Done" saves once through `reorderSetLists`, an `updateBand` write of `setListIds`). `reorderedSetListIds` is slot-preserving: it rewrites only the slots held by the listed ids, so a list whose row failed to load or is hidden is never shuffled. It sends the whole order, so a stale second tab can revert an earlier reorder (owner's own tabs only). Owner-only because only the owner can write `Band`; members see the owner's order.

**Copying songs between set lists:** "Add from another list" (`AddFromSetListDialog`, any member, set list page) copies songs a person ticks from the band's other set lists onto this one as new suggestions by the caller. Mounted only while open; it loads the band's full view itself (the page's own view holds just its one set list), then the source's songs via `fetchSongChoices` (songs only; validated by `assembleSongChoices`, hidden songs excluded). `addSongsFromOtherLists` re-validates every song through `songToRawInput` -> `parseSongInput`, checks the 100-song cap for the whole batch up front, creates with bounded parallelism (`COPY_SONGS_AT_ONCE`) and reports "Added N of M" on a partial failure (the page reloads either way). Copies are plain new `Song` rows: no votes, colors, click tracks or order come along. "Already on this list" is `songIdentity` (title + artist, case-insensitive). The shared one-shot loader hook is `hooks/useRemote.ts`.

**Access model (Amplify auth rules only; the one exception is backing tracks, below):** rows are reachable only by id (`get`) or by index queries that need a parent id; plain `list` is disabled on every public model. Possessing a `bandId` is the capability. **`Band` is the single root of trust**: only its owner can write it, and its owner-written arrays (`setListIds`, `archivedSetListIds`, `bannedSubs`, `hiddenSongIds`, `sharedSetListIds`) drive read-time validation. Every row shown must pass through the validators (`bandUtils.ts`, assembled in `bandViews.ts`); pages call `assembleBandView`/`assembleSetListView` on fetched rows and never render raw rows. Rows whose text changes when sanitised (zero-width/bidi characters, padding) are hidden, not repaired. Auth rules only check a row's own fields on write, so a signed-in user can write junk rows; validators make them invisible.

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
- Invite expiry: an invite link works for `Band.inviteTtlDays` (owner-written, whole days 1-7; absent or invalid reads as the default 1, `normalizeInviteTtlDays`) after the `BandInvite` row's server-set `createdAt`. The one rule is `inviteStatus` in `bandUtils.ts` (fails closed on a missing time; `isInviteExpired`, the band page and the join check all use it). `lookupInvite` rejects an older invite with `expired`; `useInviteIssuedAt`/`getInviteIssuedAt` let members see when theirs ends (read once per code, not on focus). Rotation is lazy and owner-driven, never on read: the owner's "Copy invite link" goes through `ensureFreshInvite`, which calls `resetInviteCode(bandId, currentCode)` only when the current invite is expired, retired or missing (a failed read throws instead of rotating; if another session already rotated, the locked check keeps their code and retires the unused row). The link is handed to the clipboard as a promise (`useCopyToClipboard` takes a `Promise<string>`) so Safari keeps the click's permission across that check. Raising the lifetime on an already-expired link renews it (`setInviteTtlDays`), so a longer setting never revives a dead link. Members can't rotate (owner-only writes), so they are told to ask the owner. Someone who opens a shared `/bands?join=CODE` link is checked on landing (`useInviteLinkCheck` in `BandsContent`, after sign-in; nothing else shows while it runs): an `expired` or `revoked` code gets the `ExpiredInviteNotice` page ("ask the band owner for a new link") instead of the list and is forgotten at once, a good one opens the join dialog straight on "Join <band>?" (`initialPreview`), and any other failure opens the dialog with the code filled in and the reason shown (`initialError`). `previewFor` hides a band whose name sanitising would change. **Rollout:** bands that predate the field read as 1 day, so every invite older than a day stops working when this ships and the owner's next copy makes a new one. **Soft control only:** `joinBand`/`previewBand` take a `bandId` and never check the code, `lookupInvite` hands out the `bandId`, and the age is judged against the viewer's clock, so expiry stops stale links, not anyone who has seen the id (same limit as "reset code").
- Keys and GSIs are immutable after deploy. After any schema change run the sandbox check above and wait ~5 minutes for AppSync/GSIs to settle before trusting results.

**Known limits (disclosed in the privacy policy):** a `bandId` is the real capability — ex-members or anyone holding the link can still read a band; "remove member" and "reset code" are UI-level (reset only stops people without the id); banning is per account (Google and email sign-ins are different accounts); Vote rows are queryable by anyone (signed in or not) who knows the ids; a hostile signed-in user can flood a known set list's vote page (or a known band's color label rows, which can push real labels off the capped read; any member can also overwrite a label and only a ban reverts it); ownership can't be transferred and the owner can't leave (only delete). Caps (15 members, 10 set lists, 100 songs per list, 200 bans, 1000 hidden songs) are client-side only.

**Tuning and instruments:** a `Song` has a `tuning` (preset from `src/bandTunings.ts` or free text up to `BAND_LIMITS.tuningMax`; `parseSongInput` stores `E Standard` when blank, rows without one read as it via `tuningOrDefault`; an unclean value hides the song like any other text field). A `Member` has `instruments` (keys from `src/bandInstruments.ts`, which stays free of React; icons live in `components/Bands/instrumentIcons.ts`). Instruments are cosmetic, so unknown keys are dropped on read (`toMember`) rather than hiding the member, and every write goes through `normalizeInstruments`. The member's name and instruments are set in `MemberProfileFields` (join, create) and changed later through `EditProfileDialog` → `updateMyProfile` (own Member row only; never joins anyone; plain-language errors, not `InviteError`). Like `displayName`, the `instruments` array is client-bounded only: a hostile member can store an oversized one that every roster reader downloads, and guests holding a shared link can read it.

**Song link autofill:** pasting a Spotify/YouTube/Apple Music/SoundCloud link into the song form fills title/artist via the signed-in `lookupSongLink` query → `amplify/functions/song-metadata` (`parse.ts` is the SSRF allow-list: fixed provider hosts, validated ids, no redirects; `isLookupSupported` in `src/api/songMetadataApi.ts` reuses it so other links cost no request). Client orchestration lives in `src/hooks/useSongLinkAutofill.ts` (looks each link up once, never overwrites typed text). The Lambda output is untrusted and re-sanitised client-side; no per-user rate limit (reserved concurrency 5 only).

**Availability calendar** (`/bands/:bandId/availability`): each member marks the half hours they can practice; the page shows who overlaps and suggests the best windows.
- **Layout:** a Google-Calendar-style week: one column per day (7 on ≥640 px, 3 on a phone via `useDaysPerPage`), half-hour rows from **8 AM to 10 PM only** (`PRACTICE_START_HOUR`/`PRACTICE_END_HOUR`, `practiceSlots`; the band doesn't practice outside them, so those times can't be marked or suggested), hour labels in a gutter. The days start on the Sunday of the current week (`buildCalendarDays`; earlier days this week show as past and can't be marked), so a 7-column page reads Sunday to Saturday, today's column is highlighted, and the window still ends where the 62-day horizon does. On a phone (3 columns) pages start at today instead. `useWeekFocus` pages by whole pages (Earlier/Today/Later) plus a date input. `AvailabilityWeekGrid` matches rows across days by position, so DST days and :15/:45 zones line up, and is one tab stop with arrow-key movement. My-times tools (range, clear, repeat) act on a "Day" picker.
- **Model:** one `Availability` row per `(bandId, owner)`, read **by exact key only** (`get`; no `list`, no index, no guest rule). Fields: `format` (must be 1), `startDay` (UTC day number of bit 0) and `mask` (lowercase hex, 12 chars per UTC day, bit 1 = free; slot = `floor(epochMs / 30min)`). **Only "free" is stored**: unmarked time is "not marked", never "busy", and the UI never says busy. Every save writes a fixed 62-day window from today and drops past slots, so a row prunes whenever its owner saves (one from someone who stops using the app stays as it was). There is deliberately no GSI: a bandId index page could be flooded (or bricked by oversized rows) by junk nobody else can delete.
- **Layers:** pure logic in `availabilitySlots.ts` (slots, codec, `encodeRow`, `applyEdits`), `availabilityUtils.ts` (strict `parseAvailabilityRow`, `classifyOwnRow`/`planSave`, `pickParticipants` capped at 30, `parseGroup` then `resolveAt(group, now, mine)`, `buildOverlap`, `describeSlot`), `availabilityWindows.ts` (`findBestWindows`) and `availabilityCalendar.ts` (Intl only: local days, DST-safe labels, `repeatWeekday`). API in `api/availabilityRows.ts` (a LEAF: keyed read, `saveMyAvailability`, deletes; imported by `bandsApi.dismissBand`, so it must not import `bandsApi`) and `api/availabilityApi.ts` (`loadAvailabilityPage`). Hooks: `useAvailabilityEditor` (edits, autosave, delete; the stored row has one source, the loader's, unless our own save/delete finished after that load began), `useAvailabilityView` (horizon days, week focus, the parse→resolve→overlap→windows pipeline), `useAvailabilityPrefs`, `useDaysPerPage`, `useClock`, `usePersistedState`. UI in `components/Bands/Availability*.tsx`; `pages/AvailabilityPage.tsx` only composes them.
- **Rows are untrusted** (auth rules can't look inside one): a row that is not exactly what this client writes is hidden, not repaired; a member whose row can't be read is named ("Couldn't read X"), never shown as "not responded". Own row from a newer client (`format > 1`) blocks saving; a known-format row that is malformed is replaced (the user is told). `updatedAt`/`createdAt` are not client-writable (the sandbox check proves it), so "last saved" is the server's; rows older than 14 days are flagged "may be out of date".
- **Saving:** `saveMyAvailability` re-reads the row, `planSave` decides what to write, then create or update; a create that finds the row, or an update that finds it gone (reported as **Unauthorized**), goes round again (3 passes). Two devices saving within one round trip can overwrite each other (own row only). Autosave (800 ms) is **paused until the person accepts the privacy notice**, and every flush path (unmount, tab hidden, retry) respects that; "Delete my availability" cancels pending edits first.
- **Cleanup:** the leave dialog deletes the row in parallel with `deleteMyContent` (a failure offers "Leave anyway"); `dismissBand` also cleans up best-effort (bounded 5 s, one retry, never blocks or fails the dismiss). The user-initiated delete (button and leave dialog) uses `deleteConfirmed`: a refused delete (Unauthorized) only counts as done if a re-read shows the row gone. Unlike votes/songs/colors this lives in the leave dialog and `dismissBand`, not `deleteMyContent`. A removed member's row, or one whose cleanup failed, stays readable until they dismiss the band.
- **Exposure (disclosed on the page, in the share-set-list dialog and the privacy policy):** anyone with an account who has the band link can read every member's free times (member ids are public through the guest-readable roster, and a shared set-list link reveals the bandId). Free-time patterns can show when someone is away. A hostile member can store an oversized row that every viewer downloads (the owner can ban them); caps (30 participants read, 62-day window) are client-side only.
- **Persistence:** like the rest of Bands this is cloud-only and sign-in gated. Only UI preferences (`availability-prefs`: shortest suggested window) and the privacy-notice acknowledgement (`availability-notice:<bandId>:<sub>`) are stored locally.
- **Sandbox check:** `scripts/bands-auth-check.mjs` covers `Availability` (no list/index query, owner binding, read by key, guests denied, forged timestamps not accepted, read-after-write, missing-row error shapes, oversized-row cost). Its header lists what a sandbox needs first: an identifier under 15 characters, placeholder `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets set **without a trailing newline**, `ALLOW_USER_PASSWORD_AUTH` enabled on the sandbox app client, and `cognito-idp` `AdminCreateUser`/`AdminSetUserPassword`/`AdminDeleteUser` on that pool.

**Gear & rigs** (`/bands/:bandId/rig`): each member lists their equipment and draws wiring diagrams; everyone in the band can view them, only the creator edits.
- **Model:** one `BandRig` row per `(bandId, owner)`, read **by exact key only** (`get`; no `list`, no index, no guest rule: an index page could be flooded or bricked by junk rows nobody else can delete). Fields: `format` (must be 1), `rev` (save counter), `gear` and `diagrams` (JSON strings). `gear` is the member's equipment (`{id,name,kind,specs?,copiedFrom?,ports:[{id,label,dir:'in'|'out'|'io',connector,note?}]}`); `diagrams` hold `nodes` (`{id,gearId,col}`, referring to the **owner's own** gear by id, so editing a gear item updates its diagrams) and `cables` (`{id,from:{n,p},to:{n,p},label?}`, stored from the output side). Someone else's gear is used by **copying** it into your own (a snapshot labelled "copied from X", no sync); live cross-member references were deliberately cut (Save would prune other members' references after a failed read, a ban or a leave). **If they are ever added they must bump `RIG_FORMAT`** so older clients read the row as `newer` and refuse to save, instead of pruning them; a v1 node that carries an `owner` makes its diagram unreadable.
- **Layers:** pure logic in `rigTypes.ts` (types, `RIG_LIMITS`), `rigUtils.ts` (direction rules `orderPorts`, `cableKind`), `rigData.ts` (strict parsing, size budget, `assembleRigMembers`), `rigEdit.ts` (immutable draft edits that cascade), `rigView.ts`, `rigPresets.ts` (~10 starter gear presets and the Jam Station example) and **`rigRouting.ts`**. API in `api/rigRows.ts` (a LEAF: keyed read, conditional save, delete trio; imported by `bandsApi.dismissBand`, so it must not import `bandsApi`) and `api/rigApi.ts` (`loadRigPage`). UI in `components/Bands/Rig/` (`RigWorkspace` composes `RigCanvas`, `CableSchedule`, `GearPanel`, `GearFormDialog`), local draft in `hooks/useRigDraft.ts`; `pages/RigPage.tsx` only composes.
- **Layout (why cables never cross a card):** `computeRigLayout` puts cards in 4 columns with a gutter before, between and after them and a channel above all cards. Pins sit on a card's outer edge (`in` left, `out` right, `io` toward its peer). A cable is a stub into the adjacent gutter, a vertical run on its own lane (unique x), and, when its two ends use different gutters, one horizontal run on its own channel row (unique y). Card heights and gaps are multiples of 32 and column `c` is shifted down `8*c` px, so pins in different columns never share a y and stubs can't overlap collinearly. One cable per port. Chips are numbered and listed in the Cable schedule. The same file builds the standalone page, so the two can't drift.
- **Rows are untrusted:** the byte cap is derived from `RIG_LIMITS` (`rigRowMaxBytes`, measured on a worst-case row, 4-byte characters); a row that is too big, malformed, the wrong format, or for another band/owner is hidden. Inside a good row a bad gear item, a node whose gear is missing, or a cable whose ports changed is hidden **individually** and the owner is told ("Save removes them"); structural problems (duplicate ids, out-of-range `col`, too many items) make that diagram or row unreadable. Save rewrites the row from the validated draft and refuses anything the parser would hide. `format > 1` (a newer app wrote it) blocks saving.
- **Saving:** one local draft with a single Save (no autosave; `beforeunload` guards unsaved edits, in-app navigation does not: BrowserRouter has no `useBlocker`). `rev` is captured at load and Save is a **raw conditional `UpdateBandRig`** (`rev == loaded`, writes `rev+1`; the model helpers can't send a condition, and `conditionalBandUpdate` is Band-specific). A failed condition, or an update on a vanished row (reported as Unauthorized), is a "changed elsewhere" conflict with Reload / Overwrite; a refresh that finds a higher own `rev` while dirty raises the same prompt instead of rebasing. A first create that finds the row is a conflict unless it is byte-identical (a lost response retried).
- **Cleanup & exposure:** leaving deletes your row (leave dialog, in parallel with votes/availability; a failure offers "Leave anyway") and `dismissBand` cleans up best-effort. Anyone with an account who has the band link can read every member's gear and rigs (same capability model as availability); disclosed on the page, in the share-set-list dialog and the privacy policy. Hostile members can store an oversized row every viewer downloads (the owner can ban them); caps are client-side only. Band equipment lives with its creator's membership (no ownership transfer). A stale tab can re-save a row after you left the band (Save doesn't re-check membership); it stays hidden from the band UI but readable by key until deleted.
- **Sandbox check:** `scripts/bands-auth-check.mjs` covers `BandRig` (owner binding on the composite key, no list/index, other members can't write/delete, the exact conditional update the client sends, error shapes, forged timestamps, guests denied, oversized-row cost). **Run it against a sandbox before the schema goes to prod**: keys are immutable once deployed.

**Band click tracks** (set list song rows + `/click-track` "Save to Band"): any member can attach a click track to a song; every member can Play, Download (WAV or FLAC) or Open it in the editor. Members only: never on the public `/shared/:id` page, no guest rule.
- **Model:** one `SongClickTrack` row per `(songId, owner)` like `SongColor` (owner rule + signed-in `get`/`list`, no guest). Fields: `format` (1), `bytes` (claimed UTF-8 size of `track`, 0 = cleared; not named `size`, a DynamoDB reserved word), `track` (optional JSON `{pieces, groups}`). The song shows the NEWEST valid row by a valid, non-banned member (`resolveSongTracks`, built on the shared `countedSongRows`; a row with no server stamp fails closed, so a projection that stopped returning `createdAt`/`updatedAt` shows no track instead of silently picking the highest sub), so any member replaces or removes it and bans apply. **Remove writes your own cleared row** (`bytes 0`), never a delete (deleting would resurface an older member's track).
- **The `setListId` index projects only `format`, `bytes`, `createdAt`, `updatedAt`** (`.projection('INCLUDE', ...)`; permanent once deployed, adding a display field later needs a two-deploy index replacement). `bandId` is deliberately NOT projected (member-written free string), nor is `track`. So **every query on that index must pass an explicit `selectionSet`** (`SONG_TRACK_INDEX_FIELDS`; a default one would hit non-null fields the index lacks), and writes select keys + metadata, never `track` (up to 250 KB). The set list page therefore reads metadata only (`listSongTrackMeta`, merged best-effort as `SetListRows.clicks`, like colors); Play / Download / Open fetch the payload by exact key (`getSongTrack`). The model-missing guard (`hasSongTrackModel`) makes an older backend read as "no tracks" (empty, not incomplete). Amplify builds backend and frontend in one pipeline, so that gap is real.
- **Plan B if the projection ever misbehaves:** two models with the same key, a small indexed `SongClickTrackMeta` (`format`, `bytes`) and an un-indexed payload row read by key, linked by a shared `nonce` for change detection.
- **Payload = `src/clickTrackBand.ts`** (pure leaf): `encodeBandTrack` normalises labels / group names / colors (so editor and importer output round-trips) and throws plain-language limit errors; `parseBandTrack` is strict and never repairs: the real UTF-8 length must equal `bytes` before `JSON.parse`, unknown keys, bad ids / colors (`#rrggbb`, they reach inline styles) / text that changes under `sanitizeText`, duplicate ids, dangling `groupId`, ramp / accent inconsistencies, or any cap exceeded make the whole track `unreadable` (a click track missing a bar is wrong). Limits (`BAND_TRACK_LIMITS`): 250 KB, 50 groups, pieces derived from the worst-case segment (`maxBandTrackPieces()`, at most 300), 20 min, 30,000 clicks; **Download renders the whole track, no length cap, as a WAV or a lossless FLAC** (`exportClickTrack(pieces, speed, filename?, format, signal?)`: mono 22.05 kHz, a click is a 500-1000 Hz tone so nothing audible is lost; it renders slices of at most 5 s or 500 clicks per `OfflineAudioContext` because render time grows with clicks x slice length (measured: 5 s slices are about 8x faster than 60 s ones), with 50 ms of lead so click tails carry across slice edges. Each slice becomes 16-bit PCM and goes to a `PcmSink` in `audio/clickExportSinks.ts`: `wavSink` folds it into a growing Blob (about 2.65 MB per minute, 53 MB for 20 minutes) and `flacSink` writes FLAC frames with the in-house `audio/flacEncoder.ts` (mono 16-bit, 1024-sample blocks, constant / fixed-predictor + Rice / verbatim per block, MD5 left unset; silence between clicks is a few bytes per block, so a sparse track is about 40x smaller than the WAV and a dense one about 6x). **Why FLAC and not MP3:** measured in Chrome on a 120 BPM click track, MP3 at 32 kbps / 22.05 kHz has 11 dB signal-to-noise, a ghost "pre-echo" click of 18% of the click's level up to 30 ms before it, 4.6% ringing after it, 6% level wobble between identical clicks, plus a constant 50 ms encoder delay; it takes 192 kbps (28 MB per 20 minutes) to get clean. MP3 smears sharp clicks in silence because it works in 26 ms blocks. FLAC decodes to exactly the WAV's samples (verified by decoding both in Chrome and comparing every sample) with no delay. A signal-to-noise or pre-echo regression is the thing to check before adding any lossy format. **Apple compatibility trap:** the spec lets a frame header say "sample rate: take it from STREAMINFO" (code 0), but Apple's decoder (Safari, iOS, QuickTime, GarageBand) then reads the file as 0 frames while Chrome and VLC play it, so frames always carry the explicit rate code (`SAMPLE_RATE_CODES`). Chrome and a hand-written reference decoder cannot catch this class of bug; on a Mac, check the real thing: write a file with the encoder, run `afconvert -f WAVE -d LEI16 in.flac out.wav` and compare the PCM (this passes bit-for-bit, including odd lengths). The `AbortSignal` cancels between slices (the page and the set list hook abort on unmount so nothing downloads after leaving). Memory per render is bounded; the finished file is held in one Blob and its object URL is revoked after 60 s. Slices render one after another and there is no progress bar; a failed render shows an inline error). `measureTrack` lives in `audio/clickMath.ts` next to `getBpmAtRepetition` and mirrors the exporter's tick count and spacing, so `clickTrackBand.ts` imports no engine and no API (it is a true leaf). A compile-time `Record<keyof TrackPiece, true>` guard fails `tsc` when `TrackPiece` gains a field until the parser (and, for a stored-shape change, `BAND_TRACK_FORMAT`) is updated. Saved at 100% speed, no count-in or loop; the editor's speed is not saved. Known difference: the engine honours `accentPattern`, `exportClickTrack` ignores it, so Download can differ from Play for accented odd-meter tracks.
- **Save to Band pre-fill:** `SaveToBandDialog` stores only what the person picked (`picked*` state) and falls back to the only option at each level (a sole band, then a sole set list, then a sole song), derived at render, not by effects. The fallback is deliberately withheld whenever the list may be partial, because Save can replace another member's track and the "has a click track" marks come from the same partial data: no band fill if `failedCount > 0`, no song fill if `songs.incomplete`, and a set list only counts as the only one when `soleSetListId` finds the band's own non-archived ids agree (`view.setLists` silently drops lists whose read failed). A pre-filled song that already has a track still shows the "replaces" warning and a **Replace** button.
- **Runway (while a set list song's track plays):** `components/Bands/ClickTrackRunway.tsx` (+ `.css`) draws the previous bar (faded), the current bar and the next two (the last fading in), slides left one bar when the current one completes, and shows the current BPM (ramp-aware) plus the group name (or the segment label; "Group · Section" when both). It is fed by `useSongTracks.runwayFor(songId)` -> `SongClickTrackControls.runway`. The position (`{pieceIndex, rep, subTick}`) lives in a `utils/playbackPosition.ts` store read with `useSyncExternalStore`, NOT React state, so a click re-renders only the runway. Bar math is pure in `utils/trackRunway.ts` (`buildBarIndex`/`locateBar`/`runwayWindow`, `effectiveColor` = group color like the editor, `barSeconds` caps the slide at 80% of a bar); dots come from `utils/measureDots.ts`, shared with `ClickTrackPage`. Bars are keyed by flat bar index so they slide instead of remounting, one extra bar is mounted off-screen each side, and the soft edges are a static CSS mask on the viewport. `useSongTracks` ignores callbacks of a superseded start (`runId`), and `ClickTrackEngine` drops bar-start/beat notifications queued before a `stop()` or newer `start()` (`runToken`); keep both, or a late beat from the previous song moves the new runway. Dense bars switch to smaller dots (`is-packed` > 12 dots, `is-tiny` > 32). Not yet checked in a real browser at 375 px.
- **API / UI:** `src/api/songTracksApi.ts` (`getSongTrack`, `saveSongTrack`, `clearSongTrack`, `deleteMyTrackRows`; per-song `withKeyLock`, `createIdempotent`/`upsertRow`), `fetchSongTargets` in `setListsApi.ts` for the picker, hook `useSongTracks` (one lazily created `ClickTrackEngine`; `prime()` runs synchronously in the click so iOS Safari keeps the gesture across the fetch), strip in `SongRow.tsx`, `components/ClickTrack/SaveToBandDialog.tsx` (band -> non-archived set list -> song; replacing shows whose track goes). **Open** hands the track over through `sessionStorage['band-to-click-import']` (`{pieces, groups, title, at}`, validated by `parseBandTrackHandoff`, ignored after 1 minute): an empty editor loads it directly, otherwise the existing "load it?" banner asks first. The key is read in a state initialiser (StrictMode runs those twice) and cleared in an effect.
- **Cleanup & limits (disclosed in the privacy policy and the share dialog):** leaving a band deletes your rows (`deleteMyTrackRows` is its own entry in `deleteMyContent`, so a failing colors cleanup can't skip it); `dismissBand` and song deletion do not clean up (orphans stay readable by key). Anyone signed in who has the ids can read a track (same capability model as colors / rigs). A hostile member's newest row can shadow a good track (`bytes` in range, junk payload); any member can write a newer row to restore service for one round, and **a ban is the durable fix**. An older member's track resurfaces when the newest author leaves or is banned, and a Remove is not durable if the remover later leaves. Caps are client-side only.
- **Sandbox check:** `scripts/bands-auth-check.mjs` covers `SongClickTrack` (owner binding, no list, forged timestamps, guests denied, the metadata-only index query and what the full selection does, `bytes` in updates, the 250 KB round trip, the over-limit row). **Run it against a sandbox before the schema goes to prod: keys, the GSI and its projection are immutable once deployed.**

**Backing tracks** (set list song rows, panel under each song): any member **the band owner has allowed** (`Band.uploaderSubs`; the owner always may) can attach audio (MP3, M4A, WAV, FLAC; 50 MB; 10 per song) with a label ("No drums") and who it is for (instrument tags, none = everyone); every signed-in user who has the ids can play and download. Members only: never on the public `/shared/:id` page, no guest rule (`guestAccessBoundary.test.ts` enforces it). **This is the first (and only) place a Lambda reads Band/Member/SetList/Song and writes rows directly; it never writes `Band`.** Uploads ship OFF (`BACKING_TRACKS_ENABLED`, see the runbook).
- **Why a Lambda:** Amplify storage rules cannot cap size or count, and a plain open bucket would let anyone fill it. So the bucket (`amplify/storage`) gives clients `get` only on `bt/*` (NOT `read`, which includes list and would leak every sub, band and key) and nothing at all on `pending/*`; nobody can write or delete from a browser. `amplify/functions/backing-track` is the only writer. `allow.resource` is schema-wide (it would hand the function every model), so access is granted per table in `amplify/backend.ts` (`GetItem` on Band/Member/SetList/Song; `GetItem/PutItem/UpdateItem/DeleteItem/Query` on BackingTrack, plus `Query` on `.../index/*` because `table.grant` does not cover indexes). Tables are `Import` constructs (no `CfnTable`), so the function finds its GSI names at runtime with `DescribeTable`. The function lives in the `data` resource group (its own stack would form a cycle). The function's S3 access is an explicit least-privilege policy (object get/put/delete plus an unconditioned `ListBucket`, which must stay unconditioned or a missing key answers 403 instead of 404), not `grantReadWrite`. The bucket's CORS allows only the app's own origins (prod domains, `*.amplifyapp.com`, `localhost:*`), Amplify's default is `*`. Its SDK clients have request timeouts so a hung socket cannot hold a scarce concurrency slot for the whole 25 s. The foreign-table row types in `ports.ts` are derived from the schema (type-only import), so renaming `Band.bannedSubs` fails `npm run typecheck:amplify` instead of silently turning the ban check off. `src/api/guestAccessBoundary.test.ts` and `scripts/bands-auth-check.mjs` gate `G8` are the regression checks.
- **Flow:** `requestBackingTrackUpload(ext, bytes)` returns a presigned POST valid 120 s with conditions pinning the exact key `pending/{sub}/{slot}` (slot 0-2, so at most 3 pending objects of 50 MB per user whatever is requested), the exact `Content-Type`, `x-amz-meta-track` = a trackId minted at request time, and `content-length-range [1, declared bytes]`. The browser POSTs straight to S3 (file part last). `commitBackingTrack` then: replays first (a row for the trackId means done; idempotent), Heads the pending object (its `track` metadata must equal the trackId; a mismatch is `replaced` and NEVER deletes, it is another upload's object), checks size, content type and the first 16 bytes (a speed bump, not a virus scan), runs the authorization chain with strongly consistent reads (band alive and caller not banned, caller has a Member row, song and set list belong to the band, not hidden or archived), checks the caps, `CopyObject` pinned to the verified ETag into `bt/{sub}/{bandId}/{songId}/{trackId}.{ext}`, conditionally creates the row, then REVALIDATES. Only a DEFINITE answer (banned, left, song or band gone) deletes the file and row, and hiding a song or archiving its list does NOT (those stop NEW attachments via `authorize('attach')` but `authorize('recheck')` ignores them, so a finished upload survives); a read that merely failed (throttle, timeout, 5xx) deletes nothing and returns `retry`, and the pending upload is kept until revalidation passes, so committing again from it finishes the job (deleting on a blip would lose a 50 MB upload with nothing to retry from). The copy is never deleted by the commit's own failure paths. Every unclassified error is `retry` and deletes nothing. The upload slot (0-2) is picked at random, so two concurrent uploads by one person collide one time in three (`replaced`; the client uploads one file at a time).
- **What is a control and what is not:** `Member`, `Song` and `SetList` rows are self-written by any signed-in user, so the chain proves only that the caller knows the ids: product validation, not abuse control. The abuse controls are structural: 3 pending slots, S3-enforced size and type, per-person committed storage (20 files / 600 MB, counted from S3), per-band cap, the kill switch and the spend alarm. Per-song / per-band counts use an eventually consistent GSI and can overshoot slightly. Many throwaway accounts multiply the per-person quota. The caps protect your bill, not the band: only members the owner has allowed can add tracks, so junk Member / Song / SetList rows cannot be used to upload into someone else's band; allowed members can still fill a song's 10 slots or the band's 100. Downloads are unmetered.
- **Model:** `BackingTrack` (`id` = trackId, `owner` declared and Lambda-written, `bandId`, `setListId`, `songId`, `label`, `forTags`, `key`, `contentType`, `bytes`, `format`). Client rules are `get`/`list` for signed-in users only: create, update, delete, plain list and subscriptions are disabled. Three GSIs (`setListId`, `songId`, `bandId`; permanent once deployed; none keyed by owner). **There is deliberately no owner rule on the model**, even though `owner` is declared; do not add one (it would let a client write rows).
- **Contract in one place:** `src/backingTrackFormat.ts` (limits, key builders and the strict key parser, label and tag rules, and `BACKING_TRACK_ERROR_CODES`, the one documented list of Lambda codes that both ends import; the client has a message for each via `Record<BackingTrackErrorCode, string>` and treats an unknown code as `retry`) is a pure leaf imported by both the Lambda and the client. `amplify/functions/backing-track/`: `rules.ts` (pure decisions), `ports.ts` (the two small S3 / DynamoDB interfaces), `core.ts` (request and commit), `manage.ts` (edit, remove, leave, purge), `reconcile.ts` (per-user orphan clearing), `sweep.ts` (operator sweep), `adapters.ts` (the SDK), `handler.ts` (AppSync event: `fieldName` is TOP-LEVEL on the event, not under `info`). Tests drive the core with in-memory `FakeS3` / `FakeDb` from `fakes.ts`. `src/backingTrackUtils.ts` validates rows on read like every other model: a row with a foreign key, an unknown type, a label that changes under `sanitizeText`, a non-member owner or no server stamp is hidden, never repaired.
- **Removing:** `editBackingTrack` is the row's owner only. `removeBackingTracks` (<= 20 ids) is the owner or the band owner, judged by each row's OWN stored band (never client arguments; a batch cannot span bands; an already-gone id counts as success). Always object first, then row, so a failed delete leaves a retryable row, not an invisible object. `leaveMyBackingTracks(bandId)` needs no membership (leavers and banned users can clean up) and is driven by the S3 prefix. `removeMemberBackingTracks(bandId, 'member' | 'all', memberSub?)` is band-owner only, verified against `Band.owner` (which survives the deleteBand scrub; spike-verified) and also valid on a deleted band. `removeSongBackingTracks(songId)` is the song's owner (while a member) or the band owner; once the Song row is gone only the band owner, judged by the rows' own bands. Bulk calls return `{done, removed}` and stop at an 18 s budget; the client asks again (`untilDone`, 5 rounds). None of these is ever blocked by the kill switch.
- **Is uploading on?** `amplify/backend.ts` publishes `BACKING_TRACKS_ENABLED` into `amplify_outputs.json` as `custom.backingTracksUploads`; `backingTrackFlags.ts` reads it (`Amplify.getConfig()` does not expose `custom`; `import.meta.glob` so a missing file reads as off), and the UI offers Add only when it is true (listening, editing and removing do not depend on it). It is baked at build time: flipping the Lambda console switch stops uploads at once but the UI offers Add until the next deploy, and the Lambda answers `uploads-disabled`.
- **Cleanup wiring:** `deleteSong` and `deleteMyContent` remove a song's tracks BEFORE the Song row (`removeSongBackingTracksIfAny`: skipped after one cheap index read when the song has none, so ordinary deletes never depend on the Lambda); a failure aborts `deleteSong` and keeps that song in the bulk path. The leave dialog runs `leaveMyBackingTracks` with the other cleanups ("Leave anyway" on failure), then once more after the Member row is gone. `dismissBand` and `deleteBand` clean up best-effort (`cleanupMyBackingTracks`, bounded 8 s, one retry, never blocks; `deleteBand` asks for mode `all` after the tombstone). Banning is `banMemberAndRemoveFiles` in `bandsApi`: ban FIRST (stops new uploads), then `removeMemberBackingTracks`; pressing Remove again retries a failed cleanup, and each row of the owner's "Removed" list has a "Delete files" button (`MembersSection`'s `onDeleteFiles`, shown only when the backend has backing tracks) for retrying it after the dialog is closed. `dismissBand(bandId, { filesCleaned: true })` skips its own file cleanup when the leave dialog already ran it. The leave dialog bounds its file cleanup with `leaveMyBackingTracksWithin` so a stalled call cannot hold it on "Working…". When a user's own quota looks full the Lambda clears THEIR unreachable files (older than 10 minutes, no owning row, or the band, membership or song is gone), re-checking each right before deleting, then counts again. Hiding a song does not remove its tracks; "Add from another list" does not copy them.
- **Client layout:** `api/backingTrackProtocol.ts` (codes, messages, `BackingTrackError`, `run`: a leaf), `api/backingTracksCleanup.ts` (song / member / band / leave removal: a leaf that `bandsApi` and `setListsApi` import so they do not pull in the XHR upload or storage config), `api/backingTracksApi.ts` (the rest), `backingTrackUtils.ts` (pure: row validation, `inspectBackingTrackFile`, `canRemoveBackingTrack`), `backingTrackFlags.ts`, `hooks/useBackingTracks.ts` (player), `hooks/useBackingTrackSection.tsx` (everything the set list page needs: panel per song, the three dialogs, the catch-up read), `components/Bands/BackingTracksPanel.tsx`, `BackingTrackPlayer.tsx` (the bar under the playing track) and `BackingTrackDialog.tsx` (`mode: 'add' | 'edit'`).
- **Client:** `src/api/backingTracksApi.ts` (`addBackingTrack`: request, XHR POST with progress and abort, commit retried on `retry` since it is idempotent; `getBackingTrackUrl` via Amplify `getUrl`, 600 s, content type forced to the track's own audio type, `attachment` + RFC 5987 filename for downloads), `isBackingTracksReady()` (model, mutations and storage config all present: a frontend that goes live before the backend shows nothing), hook `useBackingTracks` (one `<audio>` at a time, unlocked inside the click for iOS, one re-link when a signed URL expires mid-play), `components/Bands/BackingTracksPanel.tsx` and `BackingTrackDialog.tsx`. **Player bar:** while a track plays, `BackingTrackPlayer` (seek slider, elapsed / total time, pause-resume, back / forward 10 s) shows under its row. The position (`{currentTime, duration, paused}`) lives in `utils/playerProgress.ts` (`createProgressStore`, built on the generic `utils/externalStore.ts` `createStore`, which `playbackPosition.ts` also uses) and is read with `useSyncExternalStore`, NOT React state, so a `timeupdate` re-renders only the bar; the hook mirrors the element into it in whole seconds and exposes it read-only (`ReadableProgress`) plus `seek` / `skip` / `togglePause`. Seeks move the bar at once and reach the element after a 150 ms debounce (each seek is a new ranged request), stop 0.25 s short of the end, and `skip` is relative to the bar so quick presses add up. `stop()` is the one way playback ends (bumps `runId` so a late re-link is dropped, cancels a waiting seek, resets the store); the bar is disabled when the stream reports no usable duration. `ui/Slider` takes `thumbProps` (aria attributes on the focusable thumb) and `trackClassName` / `rangeClassName` for sliders with their own look. Rows come with the set list (`fetchSetListRows`, best-effort: a failed read shows the songs without tracks and flags the list `incomplete`).
- **Launch gates (all in the runbook):** a real `TAKEDOWN_CONTACT` (set in `src/legalContact.ts`; a hosted build with uploads on refuses to deploy while it starts with `TODO`; sandboxes are exempt), a spend ceiling and alarm, the DMCA-agent decision, optional reserved concurrency, `G8` run against a sandbox before the schema reaches production. Egress cost is the open risk: reads are unlimited by design.
- **Who may upload:** `Band.uploaderSubs` is an owner-written array of subs (written only through `setMemberUploads`, a version-locked `updateBand`; default `[]`, so a new member cannot upload until the owner ticks "Can upload" next to their name in the roster). The rule lives once in `mayAttachBackingTracks` (`src/backingTrackFormat.ts`): the band owner, or a listed sub. The Lambda's `authorize('attach')` refuses anyone else with `not-allowed`; `authorize('recheck')` ignores it, so taking the permission away never deletes a finished upload (a commit already past the check can survive a revoke, same as the ban race). The app mirrors it as `BandView.canUpload` (membership AND the rule) and offers the switch only to the owner while the backend has backing tracks. `setMemberUploads` is given the current member subs and prunes everyone else in the same write (so leavers do not keep the permission or fill the list; cap `BAND_LIMITS.maxUploaders` = the member cap); banning also removes the sub in the ban write, and restoring does not bring it back. **What this closes:** a stranger who learns a band's ids from a shared set list can no longer upload into someone else's band. **What it does not:** anyone can create their own band (client-side cap only), is then its owner, and can upload under the per-account quota (20 files / 600 MB) into your bucket; `requestBackingTrackUpload` has no band argument, so any signed-in user can still stage up to 3 pending objects of 50 MB (expire after a day) and a refused commit leaves that object in place. Spend alarm, kill switch and takedown address remain the controls for that. Existing bands read as `[]`: after this ships only the owner can add until they allow members. `uploaderSubs` is on every Band read/write selection (like `inviteTtlDays`), so the backend must deploy with the frontend (one Amplify pipeline).
- **Known limits (disclosed in the privacy policy and the share dialog):** anyone signed in who has the ids can read a track (same capability model as colors and rigs); the band owner and the author are the only deleters of a single track, and the song's owner deletes every member's tracks on it by deleting the song (the delete dialogs say so, including the leave dialog's "also delete the songs I suggested"); a stale tab can finish a commit after the person left (the revalidation catches the common race, the final sweep after leaving and the quota reconcile catch the rest); Safari and Chrome were not exercised against a slow 50 MB upload in the spike (S3 checks the signed expiry when the request STARTS).
- **Sandbox check:** `scripts/bands-auth-check.mjs` gate `G8` (schema shape, no client writes, S3 rejects oversize / wrong type / extra field, commit and replay, Lambda-written row reads back through AppSync, guests denied, outsider / non-owner denials, immediate refusal after a ban, owner purge). Deploy the sandbox with `BACKING_TRACKS_ENABLED=true` or the upload flow is skipped.

**Persistence exception:** band data (including availability and gear & rigs) is cloud-only and requires sign-in (`<AuthGate>`); it is inherently multi-user, so it is not mirrored to localStorage. Only the pending invite code (sessionStorage, cleared after use or sign-out) is stored locally.

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
- `Slider` — range slider (optional `thumbProps`, `trackClassName`, `rangeClassName` for custom looks / aria on the thumb)
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

## Legal pages, licences and README

**Keep these in step with the code.** When a change does any of the following, update `src/pages/PrivacyPolicyPage.tsx` and/or `TermsOfServicePage.tsx` in the same change, bump their `lastUpdated` date, and extend their tests (`*.test.tsx`; the e2e `legal-pages.spec.ts` only checks the footer links):

- stores a new kind of user data in the cloud, or changes who can read existing data (Privacy: the matching bullet under "Information we collect", including who can read it and how it is deleted);
- sends data to a new third-party service, or loads a third-party script (Privacy: "Third-party services");
- adds, upgrades across a licence boundary, or removes an open-source library with a notice requirement (Terms: "Open-source software"). **Currently listed:** `@coderline/alphatab` (MPL-2.0). There is deliberately no MP3 encoder: the only browser ones (lamejs) are LGPL-3.0 and, measured, smear a click badly at small bitrates (see the export bullet under Band click tracks). Check the licence of any new dependency before adding it; LGPL/GPL-family ones need a decision from the owner;
- adds user-facing behaviour that processes the user's files or audio (say whether it stays on their device). **Backing tracks are the one feature that UPLOADS audio** (Privacy: "Band backing tracks"; Terms: "Backing tracks"; `TAKEDOWN_CONTACT` in `src/legalContact.ts`).

Features that run entirely in the browser (click track import and WAV/FLAC rendering, Guitar Pro import, microphone pitch detection) are described as local-only in the Privacy Policy; if one starts uploading anything, that wording must change first.

**README.md** has one section per page plus Tech Stack, Architecture and Open-source licences. When a page, major feature, library or audio/export module is added or renamed, update the matching section (and the Architecture file tree) in the same change.

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
3. **Build** `rtk err npm run build` (also runs the Lambda type check below)
4. **Lambda types** `npm run typecheck:amplify` — `tsc -b` cannot see `amplify/` (no tsconfig of its own), and the Lambda's foreign-table row types are derived from the schema so that a renamed field fails here instead of silently disabling a check

@CLAUDE.local.md
