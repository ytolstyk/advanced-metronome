# 🥁 Drumma Llama

[https://drummallama.com/](https://drummallama.com/)

> A step sequencer that really knows how to **hit** it.

![Drumma Llama screenshot](public/screenshot.png)

Drumma Llama is a browser-based drum machine, step sequencer, click track builder, guitar tuner, fretboard trainer, chord library, scale visualizer, and music theory tool built with React 19, TypeScript, and the Web Audio API. No plugins, no dependencies on your patience — just beats.

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

## Chord Library

Navigate to the **Chords** tab to browse guitar chord diagrams and tab notation.

- **Full chord database** — major, minor, dominant 7th, major 7th, minor 7th, sus2, sus4, augmented, diminished, and more
- **Filter by key and chord type** — narrow down to exactly what you need
- **Fretboard diagrams and tab view** — toggle between visual fretboard diagrams and text tab notation
- **Playback** — click any chord card to hear it strummed with a guitar-like timbre via Web Audio synthesis

---

## Scales

Navigate to the **Scales** tab to visualize scales on the fretboard.

- **Full 24-fret fretboard** in standard tuning (high e on top, as viewed from the player)
- **Scale modes** — major, natural minor, pentatonic major/minor, dorian, phrygian, lydian, mixolydian, and more
- **Root note selector** — choose any of the 12 chromatic roots
- **Practice mode** — highlights notes one by one to help you learn patterns across the neck
- **Note labels** — each highlighted dot shows the note name

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

## Fret Memorizer

Navigate to the **Fret Memorizer** tab to drill fretboard note recognition.

- **Interactive SVG fretboard** — 24 frets, color-coded by note
- **6, 7, and 8-string support** with tuning selection
- **Quiz mode** — a random note is shown; click the correct dot on the fretboard
- **Audio feedback** — correct answers play a plucked string sound
- **Score tracking** — session accuracy tracked and saved to the cloud (requires sign-in)

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
- **Cloud API** — save/load click tracks and fret memorizer scores (authenticated users)

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
│   ├── clickTrackApi.ts     # Cloud save/load for click tracks
│   └── fretMemorizerApi.ts  # Cloud score saving for fret memorizer
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
│   └── LessonsProgressContext.tsx  # Lesson completion tracking (localStorage)
├── data/
│   ├── lessons.ts   # Static lesson content (modules + lessons)
│   └── tunings.ts   # Guitar tunings for 6/7/8-string
├── hooks/
│   ├── useAudioEngine.ts    # React bridge: callbacks → dispatch, volume/humanize sync
│   ├── usePlaybackCursor.ts # Auto-scroll logic for the beat grid
│   └── useLessonsProgress.ts # Consumes LessonsProgressContext
├── utils/
│   └── clickTrackToDrum.ts  # Convert click track segments to drum machine measures
├── pages/
│   ├── WelcomePage.tsx         # Landing page
│   ├── DrumMachinePage.tsx     # Wraps App.tsx drum machine
│   ├── TunerPage.tsx           # Guitar tuner: pitch detection (NSDF/MPM), vertical meter
│   ├── ChordsPage.tsx          # Chord library: diagrams, tab view, playback
│   ├── ScalesPage.tsx          # 24-fret fretboard scale visualizer + practice mode
│   ├── CircleOfFifthsPage.tsx  # Interactive circle of fifths diagram
│   ├── ClickTrackPage.tsx      # Click track builder + export + cloud save
│   ├── FretMemorizerPage.tsx   # Fretboard note recognition game
│   ├── LessonsPage.tsx         # Lesson module browser
│   ├── ModulePage.tsx          # Lessons within a module
│   ├── LessonPage.tsx          # Individual lesson steps
│   └── BuildLessonPage.tsx     # Admin lesson authoring tool
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
    └── GenerateDrumsModal/    # AI drum pattern generation modal
```

---

_"In the beginning there was the beat, and it was in 4/4, and it was good."_
