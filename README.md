# 🥁 Drumma Llama

[https://drummallama.com/](https://drummallama.com/)

> A step sequencer that really knows how to **hit** it.

![Drumma Llama screenshot](public/screenshot.png)

Drumma Llama is a browser-based drum machine, step sequencer, metronome, click track builder, guitar tab editor, guitar tuner, fretboard trainer, ear training tool, chord library, chord progression builder, arpeggio library, scale visualizer, CAGED system visualizer, interval trainer, practice session tracker, and music theory tool built with React 19, TypeScript, and the Web Audio API. No plugins, no dependencies on your patience — just beats.

---

## Features

### The Beat Goes On

- **7 instruments** — Kick, Snare, Hi-Hat, Open Hat, Clap, Rim, Tom
- **Step sequencer grid** with 16th-note resolution (fully configurable)
- **Mixed time signatures** — each measure can have its own time sig (3/4, 7/8, 11/16, whatever you can dream up)
- **Live editing during playback** — tweak BPM, toggle beats, and adjust loop count without missing a snare

### Don't Miss a Beat

- **Play / Pause / Stop** transport controls
- **BPM control** — slider for feel, number input for precision (40–300 BPM)
- **Volume control** — master output level for the drum loop
- **Humanize** — adds subtle timing, velocity, and pitch variation to make the loop feel less robotic
- **Configurable loop count** — or loop infinitely, because some grooves never get old
- **Configurable measure count** — up to 8 measures per loop
- **Space bar** shortcut to play/pause
- **Scroll follows the beat** — the grid auto-scrolls to keep the active step visible

### Preset? I Barely Know It

8 built-in patterns to get you snare-ted:

| Pattern           | Vibe                        |
| ----------------- | --------------------------- |
| Basic Rock        | The one that started it all |
| Four on the Floor | Send it to the dance floor  |
| Hip-Hop           | Boom. Bap.                  |
| Funk              | It'll get you               |
| Reggae            | One drop, no problem        |
| Bossa Nova        | Sophisticated syncopation   |
| Waltz             | Three's company             |
| Shuffle           | The swing's the thing       |

### Save Your Snare-atives

- **Save custom presets** to localStorage — name your masterpiece and bring it back any time
- **User preset library** — your beats survive page reloads, browser restarts, and existential crises
- **Delete presets** you've outgrown

### Measure Up

- **Per-measure time signature editor** — type in any beats/subdivision combination
- **Copy measure** — clone a measure's pattern to any other measure

### Ctrl+Z for the Soul

- **10-step undo history** — because every drummer has at least one fill they regret
- **Ctrl+Z / Cmd+Z** keyboard shortcut

---

## Getting Started

```bash
npm install
npm run dev      # Start development server (Vite + HMR)
```

```bash
npm run build    # Type-check + production build
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

---

## Metronome

Navigate to the **Metronome** tab for a standalone metronome with visual feedback.

- **Simple mode** — single BPM, time signature, and subdivision; animated pendulum with color-coded beat accent
- **Advanced mode** — multi-measure sequences, each with its own BPM, time signature, and subdivision (powered by the same `ClickTrackEngine` as the click track builder)
- **Tap tempo** — tap to detect BPM; auto-resets after 3 seconds of inactivity
- **Subdivisions** — quarter, eighth, sixteenth, quarter triplet
- **Beat counter** — dot row flashes each beat; first beat accented
- **Preferences saved** — mode, BPM, time signature, and subdivision persist across sessions (localStorage + cloud if signed in)

---

## Guitar Tuner

Navigate to the **Tuner** tab to tune your guitar using your microphone.

- **Chromatic detection** — identifies the closest note to the incoming signal in real time
- **Vertical meter** — cursor moves up when sharp, down when flat, sits at centre when in tune
- **Direction guidance** — shows "Tune up" or "Tune down" so you know which way to turn the peg
- **6, 7, and 8-string support**
- **Tuning presets** for each string count:

| 6-string | 7-string | 8-string |
|---|---|---|
| Standard (EADGBe) | Standard (BEADGBe) | Standard (F#BEADGBe) |
| Drop D | Drop A | Drop E |
| Open G | Eb Standard | Eb Standard |
| Open D | D Standard | |
| Open E | | |
| DADGAD | | |
| Eb Standard | | |
| D Standard | | |
| Drop C | | |

---

## Ear Training

Navigate to the **Ear Training** tab to develop your ability to identify sounds by ear.

- **Three exercise types** — intervals, chords, and scales
- **Interval training** — hear two notes and identify the interval (unison through octave + compound); configurable range (ascending/descending/both) and difficulty tier (Starter → Hard)
- **Chord training** — identify major, minor, dominant 7th, major 7th, diminished, augmented, sus2, sus4, and more; configurable chord type pool
- **Scale training** — identify major, minor, dorian, phrygian, lydian, mixolydian, pentatonic major/minor, and more; configurable scale pool
- **Game modes** — 10, 20, or 30 questions, or infinite practice
- **Score & streak tracking** — session score displayed with correct/incorrect feedback
- **Replay** — replay the sound before answering

---

## Chord Library

Navigate to the **Chords** tab to browse guitar chord diagrams and tab notation.

- **Full chord database** — major, minor, dominant 7th, major 7th, minor 7th, sus2, sus4, augmented, diminished, and more
- **Filter by key and chord type** — narrow down to exactly what you need
- **Fretboard diagrams and tab view** — toggle between visual fretboard diagrams and text tab notation
- **Playback** — click any chord card to hear it strummed with a guitar-like timbre via Web Audio synthesis

---

## Chord Progression Builder

Navigate to the **Chord Progression** tab to build, play, and analyse multi-chord progressions.

- **8-slot progression** — fill each slot with any chord (root + quality)
- **Roman numeral analysis** — auto-detects the key and labels each chord with its Roman numeral function (I, IV, V7, etc.)
- **Scale suggestions** — displays scales that fit the detected key
- **Three instruments** — strum with guitar, piano, or pad synthesis
- **BPM and beats-per-chord control** — from tight 1-beat changes to relaxed 4-beat chunks
- **Loop playback** — cycles through the progression with live chord highlighting
- **Favorites** — star progressions to save them for later
- **Cloud save** — progression auto-saves to localStorage and cloud (if signed in)

---

## Scales

Navigate to the **Scales** tab to visualize scales on the fretboard.

- **Full 24-fret fretboard** in standard tuning (high e on top, as viewed from the player)
- **Scale modes** — major, natural minor, pentatonic major/minor, dorian, phrygian, lydian, mixolydian, and more
- **Root note selector** — choose any of the 12 chromatic roots
- **Practice mode** — highlights notes one by one to help you learn patterns across the neck
- **Note labels** — each highlighted dot shows the note name

---

## CAGED System Visualizer

Navigate to the **CAGED** tab to explore the five CAGED chord shapes across the fretboard.

- **Full 16-fret fretboard** in standard tuning (high e on top)
- **Root note selector** — choose any of the 12 chromatic roots
- **Five CAGED shapes** (C, A, G, E, D) — click to highlight each shape's voicing on the fretboard
- **Scale overlay** — toggle the major scale overlay to see how scale notes align with the CAGED shape
- **Color-coded shapes** — each CAGED position has a distinct color for quick identification
- **Preferences saved** — root note and active shape persist across sessions

---

## Circle of Fifths

Navigate to the **Circle of 5ths** tab for an interactive music theory reference.

- **Full 12-key diagram** — all major keys in the outer ring, relative minors in the inner ring
- **Color-coded** — each key position has a unique hue for quick visual reference
- **Hover highlighting** — hovering a key lights up that key and its immediate neighbours
- **Click to select** — selecting a key draws connection lines to related keys (solid to 1-step neighbours, dashed to 2-step)
- **Info panel** — shows the relative minor, key signature, and neighbouring keys for the selected key
- **Rotate orientation** — toolbar lets you set any key to the 12 o'clock position

---

## Click Track

Navigate to the **Click Track** tab to build and export tempo-change sequences.

- **Segment-based timeline** — add pieces with individual BPM, time signature, subdivision, and repeat count
- **Subdivision options** — whole, half, quarter, eighth, sixteenth, quarter triplet, eighth triplet
- **Color-coded segments** — 8-color palette for visual organization
- **Drag-and-drop reordering** — rearrange segments on the fly
- **WAV export** — render the full click track to a downloadable audio file
- **Cloud save/load** — save and share click tracks (requires sign-in)
- **Send to Drum Machine** — convert a click track to drum machine measures

---

## Interval Trainer

Navigate to the **Interval Trainer** tab to drill interval identification on the fretboard.

- **Interactive SVG fretboard** — a root note is shown; identify and click the target interval note
- **Difficulty tiers** — Starter (P4/P5), Easy (adds m3/M3/Octave), Medium (adds M2/m6/M6), Hard (adds m2/m7/M7/Tritone)
- **6, 7, and 8-string support** with tuning selection
- **Audio feedback** — hear the root and target notes when answering
- **Game modes** — 10, 20, 30 questions or infinite
- **Score tracking** — saved to cloud when signed in

---

## Arpeggios

Navigate to the **Arpeggios** tab to browse arpeggio shapes across the fretboard.

- **Full arpeggio database** — major, minor, dominant 7th, major 7th, minor 7th, diminished, augmented, and more
- **CAGED-based shapes** — each quality displayed as five CAGED shapes across the neck
- **Fretboard diagrams** — clean SVG diagrams with barre markers and open/muted string indicators
- **Root note and quality filters** — narrow down to exactly what you need
- **Sweep direction** — choose ascending, descending, or alternating sweep for playback
- **BPM control** — set playback speed for the sweep
- **Playback** — click any shape card to hear it swept with a plucked guitar timbre

---

## Fret Memorizer

Navigate to the **Fret Memorizer** tab to drill fretboard note recognition.

- **Interactive SVG fretboard** — 24 frets, color-coded by note
- **6, 7, and 8-string support** with tuning selection (selection persists across sessions)
- **String focus filter** — click a string to restrict both the quiz and fretboard display to that string
- **Quiz mode** — a random note is shown; click the correct dot on the fretboard
- **Microphone input mode** — answer questions by playing the note on your instrument instead of clicking
- **Audio feedback** — correct answers play a plucked string sound
- **Score tracking** — session accuracy tracked and saved to the cloud (requires sign-in)
- **Customizable note colors** — open Settings to assign any color to each of the 12 chromatic notes; colors sync to the cloud (requires sign-in)

---

## Practice Session Tracker

Navigate to the **Practice** tab to plan, time, and log your practice sessions.

- **Goal setting** — choose a duration (15/30/45/60 min or custom), target BPM, skill focus description, and which tools you plan to use
- **Live timer** — counts up from zero; shows elapsed time and progress toward goal
- **Resume detection** — if a session was interrupted, offers to resume it on next visit
- **Session summary** — shows duration, goal achievement, and notes when you end a session
- **Practice history** — full log of completed sessions with date, duration, and goals
- **Weekly calendar** — visual calendar showing which days you practiced this week
- **Streak counter** — tracks consecutive practice days
- **Nudges** — contextual suggestions based on your history
- **Cloud persistence** — history saves to cloud (requires sign-in); active session survives page refresh via localStorage

---

## Tab Editor

Navigate to the **Tab Editor** tab to write and play back guitar tablature.

- **6, 7, and 8-string support** with standard and custom tunings
- **Full note duration palette** — whole, half, quarter, eighth, sixteenth, 32nd, 64th; dotted, double-dotted, and triplet modifiers
- **Guitar techniques** — palm mute, let ring, ghost note, staccato, dead note, natural harmonic, hammer-on, pull-off, legato slide, bend (with amount), vibrato, tapping, pick direction, slide-in/slide-out
- **Keyboard-first editing** — type fret numbers (two-digit buffering for frets 10–24), navigate with arrow keys, spacebar adds empty beat, Backspace/Delete removes note or beat
- **Measure overflow dialog** — when a note doesn't fit, choose to trim or bleed into the next measure
- **Beat-level and note-level selection** — click to select, Shift+click for multi-select, drag to range-select
- **Copy / Cut / Paste** beats across measures
- **Undo / Redo** (Cmd+Z / Cmd+Shift+Z)
- **Per-measure time signatures and BPM** overrides
- **Dynamics** (ppp–fff) and repeat markers per beat
- **Tab and staff view** — toggle between tablature and standard notation
- **Playback** — play from cursor position with live playhead tracking
- **Auto-save** to localStorage
- **Publish to Tab Library** — share your tab publicly; published tabs appear in the searchable Tab Library (requires sign-in)
- **Guitar Pro import/export** — import `.gp`/`.gpx` files and export tabs to Guitar Pro format via alphaTab

---

## Tab Library

Navigate to the **Tabs** tab to browse and discover community-published guitar tabs.

- **Search** — debounced full-text search across published tab titles
- **Paginated results** — load more tabs with a "Load more" button
- **Tab viewer** — open any published tab in a read-only alphaTab-rendered view with playback
- **Requires sign-in** to browse

---

## Lessons

Navigate to the **Lessons** tab for structured guitar technique and theory lessons.

- **Module browser** — lessons organized into technique and theory modules
- **Progress tracking** — completed lessons and favorites persist across sessions
- **Favorites** — star lessons to find them quickly later
- **Lesson content** — step-by-step tabs with interactive components

---

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **React Router** — client-side routing between all pages
- **Web Audio API** — lookahead drum scheduler (25ms interval, 100ms lookahead), click track engine, fire-and-forget synthesis, microphone pitch detection via `getUserMedia`
- **`useReducer`** — all drum machine state in one place, pure reducer, no external state library
- **Tailwind CSS v4** + vanilla CSS — component-scoped stylesheets, no CSS-in-JS
- **shadcn/ui** — Radix UI-based component primitives
- **AWS Amplify** — authentication (sign-in/sign-up) for cloud features
- **localStorage** — auto-saves your current loop, user presets, and lesson progress
- **Cloud API** — save/load click tracks, fret memorizer scores, chord progressions, CAGED prefs, metronome prefs, practice sessions, published tabs, and interval trainer scores (authenticated users)

---

## Architecture

```
src/
├── main.tsx             # BrowserRouter, Nav, Amplify auth provider, context providers, routes
├── App.tsx              # Drum machine: useReducer, undo history, keyboard shortcuts
├── state.ts             # Reducer + Action union
├── types.ts             # AppState, Pattern, LoopConfig, TimeSignature
├── presets.ts           # 8 built-in beat patterns
├── userPresets.ts       # Custom preset persistence (localStorage)
├── constants.ts         # Instruments, defaults, limits
├── auth/
│   └── amplify.ts       # AWS Amplify configuration
├── api/
│   ├── clickTrackApi.ts        # Cloud save/load for click tracks
│   ├── fretMemorizerApi.ts     # Cloud score saving for fret memorizer
│   ├── noteColorsApi.ts        # Cloud save/load for note color preferences
│   ├── chordProgressionApi.ts  # Cloud save/load for chord progressions
│   ├── cagedApi.ts             # Cloud save for CAGED root/shape prefs
│   ├── metronomeApi.ts         # Cloud save for metronome prefs
│   ├── practiceSessionApi.ts   # Cloud save/load for practice session history
│   ├── intervalTrainerApi.ts   # Cloud score saving for interval trainer
│   ├── earTrainingApi.ts       # Cloud score saving for ear training
│   ├── publishedTabApi.ts      # Cloud CRUD for published tabs
│   ├── tabEditorApi.ts         # Cloud save/load for tab editor drafts
│   ├── drumApi.ts              # Cloud save/load for drum machine patterns
│   ├── scaleApi.ts             # Cloud save for scale page preferences
│   ├── chordsApi.ts            # Cloud save for chord page preferences
│   ├── lessonsApi.ts           # Cloud save for lesson progress
│   ├── authUtils.ts            # isAuthenticated() helper
│   └── storageUtils.ts         # localStorage read/write helpers
├── audio/
│   ├── AudioEngine.ts       # Web Audio drum scheduler (master GainNode for volume)
│   ├── drumSynths.ts        # Per-instrument synthesis functions
│   ├── exportAudio.ts       # WAV export via OfflineAudioContext
│   ├── ClickTrackEngine.ts  # Click track segment sequencer
│   ├── exportClickTrack.ts  # Click track WAV export
│   ├── pianoSynth.ts        # Piano synthesis
│   ├── pianoPresets.ts      # Piano preset definitions
│   └── pluckString.ts       # Plucked string sound for fret memorizer
├── context/
│   ├── FavoritesContext.tsx        # Lesson favorites (localStorage)
│   ├── LessonsProgressContext.tsx  # Lesson completion tracking (localStorage)
│   ├── NoteColorsContext.tsx       # Note fill/stroke colors with cloud sync
│   └── noteColorsContextDef.ts     # Context definition + useNoteColors hook
├── data/
│   ├── lessons.ts   # Static lesson content (modules + lessons)
│   ├── tunings.ts   # Guitar tunings for 6/7/8-string
│   └── noteColors.ts  # DEFAULT_NOTE_FILL palette + color utilities (lightenHex)
├── hooks/
│   ├── useAudioEngine.ts    # React bridge: callbacks → dispatch, volume/humanize sync
│   ├── usePlaybackCursor.ts # Auto-scroll logic for the beat grid
│   └── useLessonsProgress.ts # Consumes LessonsProgressContext
├── utils/
│   └── clickTrackToDrum.ts  # Convert click track segments to drum machine measures
├── pages/
│   ├── WelcomePage.tsx         # Landing page
│   ├── DrumMachinePage.tsx     # Wraps App.tsx drum machine
│   ├── TunerPage.tsx              # Guitar tuner: pitch detection (NSDF/MPM), vertical meter
│   ├── ChordsPage.tsx             # Chord library: diagrams, tab view, playback
│   ├── ChordProgressionPage.tsx   # Chord progression builder + key analysis + playback
│   ├── ScalesPage.tsx             # 24-fret fretboard scale visualizer + practice mode
│   ├── CAGEDPage.tsx              # CAGED system fretboard visualizer
│   ├── CircleOfFifthsPage.tsx     # Interactive circle of fifths diagram
│   ├── ClickTrackPage.tsx         # Click track builder + export + cloud save
│   ├── FretMemorizerPage.tsx      # Fretboard note recognition game
│   ├── EarTrainingPage.tsx        # Ear training: intervals, chords, scales
│   ├── IntervalTrainerPage.tsx    # Fretboard interval identification game
│   ├── ArpeggiosPage.tsx          # Arpeggio library: CAGED shapes, sweep playback
│   ├── MetronomePage.tsx          # Metronome: simple + advanced multi-measure mode
│   ├── PracticeSessionPage.tsx    # Practice session tracker: goals, timer, history
│   ├── TabEditorPage.tsx          # Guitar tab editor + publish to library
│   ├── TabLibraryPage.tsx         # Searchable community tab library
│   ├── PublishedTabViewPage.tsx   # Read-only alphaTab tab viewer
│   ├── LessonsPage.tsx            # Lesson module browser
│   ├── ModulePage.tsx             # Lessons within a module
│   ├── LessonPage.tsx             # Individual lesson steps
│   └── BuildLessonPage.tsx        # Admin lesson authoring tool
└── components/
    ├── Nav/               # Sticky top navigation
    ├── NavDropdown/       # Dropdown nav for grouped routes
    ├── DrumGrid/          # Scrollable step sequencer grid
    ├── MeasureHeaders/    # Time signature editors + copy/paste
    ├── InstrumentRow/     # One row per instrument
    ├── BeatCell/          # Individual step button
    ├── TransportControls/ # Playback, BPM, volume, humanize, presets, undo
    ├── PianoKeyboard/     # Playable piano with presets
    ├── Fretboard/         # Shared SVG fretboard component
    ├── ChordRow/          # Chord card row for chord library
    ├── LessonTabView/     # Tab-based lesson step renderer
    ├── AuthModal/         # Sign-in/sign-up modal
    ├── DonationModal/     # Donation prompt
    ├── StorageErrorBanner/    # localStorage quota error banner
    ├── ChordPickerModal/      # Chord selection modal
    ├── GenerateDrumsModal/    # AI drum pattern generation modal
    ├── SettingsModal/         # Note color picker (per chromatic note, cloud-synced)
    └── TabEditor/             # Tab editor SVG canvas, toolbar, header, playback, technique paths
├── tabEditorTypes.ts    # TabTrack, Measure, Beat, TabNote, TabCursor, NoteModifiers, etc.
└── tabEditorState.ts    # Tab editor reducer, localStorage persistence, overflow logic
```

---

_"In the beginning there was the beat, and it was in 4/4, and it was good."_
