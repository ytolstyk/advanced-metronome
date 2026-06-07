# Feature Ideas

Surveyed the full codebase on 2026-06-03. Notes on what exists, what's missing, and prioritized suggestions.

---

## Done

All items below were shipped and are reflected in the codebase as of 2026-06-07.

| Feature | Notes |
|---------|-------|
| Standalone Metronome | `/metronome` — simple + advanced mode, pendulum, tap tempo, subdivisions |
| Ear Training | `/ear-training` — intervals, chord quality, scale/mode recognition |
| Chord Progression Builder | `/chord-progression` — 8-slot builder, Roman numeral analysis, key detection |
| CAGED System Visualizer | `/caged` — full-neck SVG, shape isolation, scale overlay |
| Practice Session Tracker | `/practice` — goal setup, live timer, streak counter, cloud persistence |
| Interval Trainer on Fretboard | `/interval-trainer` — click-the-fret quiz, difficulty tiers, cloud scores |
| Arpeggio Library | `/arpeggios` — CAGED shapes, sweep playback (up/down/alt), quality filter |
| Click Track: Speed Trainer Ramp Mode | Ramp segment type with linear BPM interpolation across measures |

---

## Priority Ranking (open items)

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Tuner: Reference Tone + A4 Calibration | Low | High |
| 2 | Fret Memorizer: Stats & Progression UI | Low | Medium |
| 3 | Scale Page: Degree Labels + Pentatonic Subset | Low | Medium |
| 4 | Chord Library: Left-Handed Mode + Scale Suggestions | Low | Medium |
| 5 | Capo Calculator | Medium | Medium |
| 6 | Drum Machine: Pattern Randomize / Mutation | Low | Medium |
| 7 | Tab Editor: MusicXML Export + Alternate Tuning Playback | Medium | High |
| 8 | PWA / Offline Support | Medium | High |
| 9 | Song Arranger | High | High |
| 10 | Rhythm Tap Trainer | Medium | Medium |

---

## New Tools

### Capo Calculator
Enter a capo fret position, get all chord shapes transposed.

- "Capo 2: E-shape → F#, A-shape → B, …"
- Show before/after chord diagrams side by side
- Reuses the chord diagram renderer from `ChordsPage`
- Useful for songwriters working from chord charts in a different key

---

### Song Arranger
Combine click track segments, drum patterns, and chord progressions into a full arrangement view.

- Drag sections (Intro, Verse, Chorus, Bridge) onto a timeline
- Each section links to a saved click track segment + drum pattern + chord progression
- Export the full arrangement as a WAV or share link
- Natural evolution of the existing click track builder — reuse `ClickTrackEngine` and `TrackPiece`

---

### Rhythm Tap Trainer
Complement to the metronome: instead of keeping time against a click, the user taps a target rhythm.

- Show a rhythm pattern on screen (e.g. as a notation grid or beat cells)
- User taps along; score is based on timing accuracy relative to the grid
- Difficulty: simple quarter-note patterns → syncopated rhythms → polyrhythms
- Reuse `ClickTrackEngine` for the reference pulse; score taps with `AudioContext.currentTime` delta

---

### Polyrhythm Visualizer
Two independent loops at different beat divisions displayed as rotating circles (like a clock face).

- Set numerator/denominator: e.g. 3 against 4, 5 against 3
- Color-coded click for each layer, aligned click when they coincide
- Audio via two `ClickTrackEngine` instances at different tempos
- Pure teaching tool — helps students internalize cross-rhythms

---

## Improvements to Existing Tools

### Fret Memorizer: Stats & Progression
The scoring API exists (`fretMemorizerApi.ts`) but the UI shows no history.

- Per-note accuracy breakdown ("you miss F# most often on string 3")
- Session accuracy graph over time
- Streak counter
- Filtered note sets: naturals only, sharps/flats only, specific fret range (e.g. frets 5–9), single string
- Visual trainer mode: show a fret position, reveal the note name after a delay (vs. quiz mode)

---

### Tuner: Reference Tone + Confidence Meter + A4 Calibration
Three small additions that together make the tuner significantly more useful:

- **Reference tone**: play a steady sine at the target string's frequency so you can tune by ear against it (one button per string)
- **Confidence meter**: the NSDF algorithm already produces a confidence value — show it so users know when the signal is too noisy to trust
- **A4 calibration**: slider to adjust from 432–446 Hz (default 440); useful for orchestral tuning at 442 Hz or historical/alternative tuning

---

### Chord Library Improvements

- **Left-handed mode**: mirror all chord diagrams with an SVG horizontal flip; persist preference to localStorage
- **Scale suggestions**: when viewing a chord, show which modes/scales contain it (e.g. "Cmaj7 fits: C major, G major, A natural minor, …")
- **Chord-to-progression suggestions**: "common progressions using this chord"
- **Fingering difficulty rating**: beginner / intermediate / advanced per voicing

---

### Scale Page Improvements

- **Degree labels**: label each dot with its scale degree (R, 2, ♭3, 3, 4, 5, 6, 7) instead of just the note name
- **CAGED shape overlay**: show which CAGED position the highlighted scale fingering corresponds to
- **Pentatonic subset highlighting**: when viewing a full major/minor scale, dim the non-pentatonic notes to show the pentatonic subset within it
- **Interval labels on hover**: hovering a dot shows "minor 3rd above root" alongside the note name

---

### Drum Machine: Pattern Randomize / Mutation
- **Mutate button**: randomly flip a small number of beats while preserving groove feel (e.g. vary 1–2 hits per instrument)
- **Randomize by genre**: generate a plausible rock/funk/reggae pattern from scratch (extends the existing AI generate modal)
- **Per-instrument swing**: currently humanize is global; allow per-instrument timing offset (e.g. snare slightly behind the grid)
- **Step length variation**: allow some steps to be half-length or double-length (polyrhythm support)

---

### Tab Editor Improvements

- **MIDI input**: connect a MIDI interface and have played notes appear in the tab editor in real time — biggest lift but dramatically improves transcription workflow
- **Export to MusicXML**: AlphaTab already supports this internally; expose it alongside the GP export
- **Alternate tuning playback**: the synth currently plays fixed MIDI pitches; it should account for the track's `openMidi` tuning array so playback matches what's written
- **Fingering suggestions**: given a fret position, suggest which left-hand finger to use based on common technique rules
- **Standard notation editing**: staff view is currently read-only; allow clicking a staff position to enter notes (especially useful for non-guitarists)

---

### Metronome Improvements

- **Accent pattern editor**: let users define a custom accent map per measure (e.g. accent beats 1 and 3, ghost beats 2 and 4) rather than only accenting beat 1
- **Polyrhythm mode**: two simultaneous subdivisions at different divisions (3 over 4) displayed visually as two rings
- **Practice goals integration**: from the practice session tracker, open the metronome at the target BPM so the workflow is one click

---

### Click Track: Stepped Ramp Variant
The linear ramp exists. Add a stepped variant:

- Increase by X BPM every N measures (e.g. +5 BPM every 4 measures)
- Surface as a new segment type alongside the existing ramp
- Useful for systematic speed-building exercises

---

### Chord Progression: Voicing Explorer
Currently the progression uses default voicings from `CHORD_DATABASE`. Let users swap voicings inline:

- Click a chord in the progression to open a voicing picker (shows all matching shapes from the chord library)
- Selected voicing persists per slot
- Show the fretboard diagram above each chord slot in the progression

---

## Polish & Cleanup

### Cross-Cutting

- **Dark/light theme toggle**: currently dark-only; light mode is better for printing and outdoor use. Wire into a `ThemeContext` similar to `NoteColorsContext`
- **PWA / offline support**: the app largely works offline (localStorage fallback everywhere) but isn't installable or cached as a PWA; adding a service worker + manifest would make it phone-friendly
- **Mobile optimization**: tools most useful on a phone (tuner, chord library, metronome, fret memorizer) should have larger tap targets and touch-friendly layouts; test at 375px
- **Print stylesheets**: tab editor and chord library are the main candidates; `PublishedTabViewPage` already has print support as a reference
- **Accessibility**: several SVG components lack `aria-label`; keyboard navigation in the chord library and scale page is incomplete
- **Welcome page categorization**: the welcome page lists all tools flat — group them (Learning, Rhythm, Theory, Composition) to help new users find the right tool faster
- **Nav overflow on mobile**: at small widths the nav wraps awkwardly; consider a hamburger menu or icon-only compact nav below a breakpoint

### Page-Specific Polish

| Page | Polish Item |
|------|------------|
| Metronome | Show BPM as large readable number during playback; current display is small |
| Ear Training | Add a "skip" button so users can pass on a question without failing it |
| Ear Training | Show the answer revealed on incorrect attempts (currently unclear what the right answer was) |
| Chord Progression | Add a "clear all" button; currently must remove chords one by one |
| Chord Progression | Show the fretboard diagram for the currently-playing chord above the progression |
| CAGED | Add a "next shape" shortcut to cycle through shapes without using the picker |
| Fret Memorizer | Add a visual "streak flame" indicator alongside the score counter for motivation |
| Tab Editor | Add a minimap / measure overview for long tabs (scrolling through 30+ measures is painful) |
| Click Track | Segment reordering via keyboard (arrow keys while focused) in addition to drag-and-drop |
| Practice Session | Add tags/categories to sessions (e.g. "technique", "song", "theory") for filtering in history |
| Tuner | Add a "hold" mode that freezes the last stable reading so users can check it hands-free |
