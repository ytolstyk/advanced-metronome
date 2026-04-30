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

No test framework is configured yet.

## Architecture

Multi-page app (React Router) with a shared `<Nav>` rendered in `src/main.tsx`. Auth wraps the tree via `Authenticator.Provider` (AWS Amplify). Three contexts at root: `FavoritesProvider`, `LessonsProgressProvider`, `NoteColorsProvider`.

Routes:

- `/` — Welcome/landing (`src/pages/WelcomePage.tsx`)
- `/drums` — Drum machine (`src/pages/DrumMachinePage.tsx`, logic in `src/App.tsx`)
- `/tuner` — Guitar tuner (`src/pages/TunerPage.tsx`)
- `/chords` — Chord library (`src/pages/ChordsPage.tsx`)
- `/scales` — Scale fretboard (`src/pages/ScalesPage.tsx`)
- `/circle` — Circle of Fifths (`src/pages/CircleOfFifthsPage.tsx`)
- `/click-track` — Click track builder (`src/pages/ClickTrackPage.tsx`)
- `/fret-memorizer` — Fretboard note memorizer game (`src/pages/FretMemorizerPage.tsx`)
- `/tab-editor` — Guitar tab editor (`src/pages/TabEditorPage.tsx`)
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

Components in `src/components/TabEditor/`:
- `TabSvgCanvas` — SVG rendering with drag-to-select, click handlers
- `TabMeasureSvg` — per-measure SVG
- `StaffViewSvg` — staff notation view
- `TabEditorHeader` — title, tuning, time sig, BPM controls
- `TabEditorToolbar` — duration, modifiers, technique selector
- `TabEditorPlayback` — play/stop controls + view mode toggle
- `TabTechniquePaths` — SVG path definitions for technique symbols
- `tabSvgConstants.ts` — font and layout constants

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

## Custom hooks

- `useAudioEngine(humanize, volume)` (`src/hooks/useAudioEngine.ts`) — manages `AudioEngine` lifecycle; returns `{ play, pause, stop, resume, togglePlayback, getEngine, previewChord, previewDrum }`
- `useTapTempo()` (`src/hooks/useTapTempo.ts`) — BPM detection from taps; returns `[tap, flashing]`
- `usePlaybackCursor` (`src/hooks/usePlaybackCursor.ts`) — tracks current beat position
- `useFavorites` (`src/hooks/useFavorites.ts`) — favorites list management
- `useLessonAudio` (`src/hooks/useLessonAudio.ts`) — audio playback for lesson examples
- `useLessonsProgress` (`src/hooks/useLessonsProgress.ts`) — lesson completion tracking

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

## Data persistence pattern

Cloud-first with localStorage fallback. All API modules in `src/api/` follow this shape:

1. Call `isAuthenticated()` from `src/api/authUtils.ts`
2. If authenticated → read/write via AWS Amplify `generateClient()` with `amplify/data/resource` schema
3. If not → fall back to localStorage via `src/api/storageUtils.ts`
4. Debounce cloud saves (500ms) to avoid thrashing

## Common patterns

**Modal pattern** — use Radix `Dialog` with `DialogTrigger` + `DialogContent` + `DialogHeader` + `DialogTitle`. Never build custom overlay/modal from scratch.

**Class merging** — always `cn(baseClasses, conditionalClasses)` from `src/lib/utils.ts`.

**State + dispatch** — reducer state and `dispatch` are passed as props; no Context or external library for feature state. Only cross-cutting concerns (auth, note colors, lessons progress) use Context.

**Undo** — ref-based stack in the page component (not inside the reducer). Drum machine: `App.tsx`. Tab editor: `tabEditorState.ts` includes undo/redo stacks directly.

**URL sharing** — `src/shareUtils.ts` encodes `AppState` as base64url (`encodeShareState` / `decodeShareState`). Scale sharing uses `encodeScaleShare` / `buildScaleShareUrl`.

**Constants** — BPM range 40–300 (default 120), max 8 measures, chord disconnect 4000ms, preview decay 5000ms, autosave debounce 2000ms. All in `src/constants.ts`.

**Presets** — 8 built-in drum patterns in `src/presets.ts` (Basic Rock, Four on the Floor, Hip-Hop, Funk, Reggae, Bossa Nova, Waltz, Shuffle). User presets in `src/userPresets.ts`.

## Validations

Make sure all these checks pass before accepting changes:

1. **Lint** `rtk lint`
2. **Types** `rtk tsc`
3. **Build** `err npm run build`
