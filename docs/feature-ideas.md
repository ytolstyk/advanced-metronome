# Feature Ideas

Surveyed the full codebase on 2026-06-03. Notes on what exists, what's missing, and prioritized suggestions.

---

## Priority Ranking

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Standalone Metronome | Low | High |
| 2 | Ear Training (intervals + chords) | Medium | Very High |
| 3 | Practice Session Tracker | Medium | High |
| 4 | Speed Trainer ramp mode (Click Track) | Low | High |
| 5 | CAGED System Visualizer | Medium | High |
| 6 | Fret Memorizer stats UI | Low | Medium |
| 7 | Chord Progression Builder | High | High |
| 8 | Reference Tone in Tuner | Low | Medium |

---

## New Tools

### Standalone Metronome
The app is called "advanced-metronome" but has no dedicated metronome page — the most glaring gap.

- Visual pulse: flashing ring, pendulum animation, or beat indicator
- Subdivision selector (quarter, eighth, triplet, sixteenth)
- Accent pattern controls (e.g. accent beats 1 and 3)
- Tap tempo
- The `ClickTrackEngine` already handles all the audio math — mostly a UI-only page

---

### Ear Training
Biggest learning gap in the app. The fret memorizer already has the quiz-loop, scoring, and cloud persistence infrastructure — ear training is the same pattern with sound as the prompt instead of a visual cue.

Three exercises to start:

**Interval Recognition**
- Play two notes (ascending, descending, or harmonic)
- User identifies the interval: unison, minor 2nd … octave
- Configurable range (e.g. only intervals up to a 5th)

**Chord Quality Recognition**
- Play a chord voicing
- User identifies: major, minor, dom7, maj7, dim, aug, sus2/sus4, etc.
- Reuses chord synthesis from `chordSynths.ts`

**Scale / Mode Recognition**
- Play a scale ascending and descending
- User identifies the mode: major, natural minor, Dorian, Phrygian, etc.
- Reuses `pluckString` + `SCALE_INTERVALS` from `src/data/scales.ts`

---

### Chord Progression Builder
Chords currently exist only as a browse library. A progression tool would:

- Chain chords by click or Roman numeral input (I–IV–V–I, ii–V–I, etc.)
- Loop-play the progression with selectable strum rhythm
- Show Roman numeral analysis and detected key
- Suggest scales/modes that fit the progression
- Integrates naturally with the drum machine chord layer already present

---

### CAGED System Visualizer
A core guitar theory tool that's entirely absent.

- Show the 5 chord shapes (C, A, G, E, D) for any root note across the full fretboard
- Highlight where each shape lives and how they connect end-to-end
- Click a shape to see it isolated with fingering dots
- Toggle to show the scale pattern that overlaps each shape
- Builds directly on the existing `Fretboard` SVG component in `src/components/Fretboard/`

---

### Practice Session Tracker
Turns the app from a collection of tools into a practice system.

- Set a session goal: duration, tools to use, target BPM or skill
- Timer with per-tool time tracking (how long on scales vs. tab editor vs. click track)
- Session log with notes field
- Streak counter and weekly practice calendar
- Could surface prompts like "you haven't practiced fret memorizer in 5 days"
- Cloud-persist via the same pattern as `fretMemorizerApi.ts`

---

### Interval Trainer on Fretboard
Like the fret memorizer, but for intervals — bridges theory and physical positions.

- Show a root note highlighted on the fretboard
- Ask: "find the minor 3rd above this note"
- User clicks the correct fret dot
- Score and cloud-persist like existing fret memorizer
- Difficulty progression: start with perfect 4th/5th, add more intervals as accuracy improves

---

### Arpeggio Library
Same structure as the chord library (`ChordVoicing` type in `src/data/chords.ts`) but for arpeggio patterns.

- Show fingering across the fretboard (not just one position)
- Multiple shapes per arpeggio (one per CAGED position)
- Playback sweeps the notes in sequence rather than strumming simultaneously
- Filter by chord quality (maj7 arpeggio, minor arpeggio, dom7 arpeggio, etc.)

---

### Capo Calculator
Enter a capo fret position, get all chord shapes transposed.

- "Capo 2: E-shape → F#, A-shape → B, …"
- Show before/after chord diagrams side by side
- Reuses the chord diagram renderer from `src/components/TabEditor/` (chord SVG) or `ChordsPage`
- Useful for songwriters working from chord charts in a different key

---

## Improvements to Existing Tools

### Click Track: Speed Trainer Ramp Mode
Already 80% there. Add a "ramp" segment type:

- Start BPM, end BPM, duration in measures
- `ClickTrackEngine` interpolates BPM linearly beat-by-beat across the segment
- Guitarists use this constantly: learn something slowly, gradually reach target tempo
- Could also add a "stepped ramp" variant: increase by X BPM every N measures

---

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

### General / Cross-Cutting

- **Dark/light theme toggle**: currently dark-only; light mode is better for printing and outdoor use. Wire into a `ThemeContext` similar to `NoteColorsContext`
- **PWA / offline support**: the app largely works offline (localStorage fallback everywhere) but isn't installable or cached as a PWA; adding a service worker + manifest would make it phone-friendly
- **Mobile optimization**: the tools most useful on a phone during practice (tuner, chord library, metronome, fret memorizer) should be made touch-friendly with larger tap targets
- **Print stylesheets**: tab editor and chord library are the main candidates; `PublishedTabViewPage` already has print support as a reference
- **Accessibility**: several SVG components lack `aria-label`; keyboard navigation in the chord library and scale page is incomplete
