# Feature Ideas

Surveyed the full codebase on 2026-06-03. Updated 2026-06-14 to reflect everything shipped since then.

---

## Done

All items below were shipped and are reflected in the codebase.

| Feature                                      | Notes                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Standalone Metronome                         | `/metronome` — simple + advanced mode, pendulum, tap tempo, subdivisions                                |
| Ear Training                                 | `/ear-training` — intervals, chord quality, scale/mode recognition                                     |
| Chord Progression Builder                    | `/chord-progression` — 8-slot builder, Roman numeral analysis, key detection                            |
| CAGED System Visualizer                      | `/caged` — full-neck SVG, shape isolation, scale overlay                                                |
| Practice Session Tracker                     | `/practice` — goal setup, live timer, streak counter, cloud persistence                                 |
| Interval Trainer on Fretboard                | `/interval-trainer` — click-the-fret quiz, difficulty tiers, cloud scores                               |
| Arpeggio Library                             | `/arpeggios` — CAGED shapes, sweep playback (up/down/alt), quality filter                               |
| Click Track: Speed Trainer Ramp Mode         | Linear ramp segment + stepped ramp (+X BPM every N measures)                                            |
| Tuner: Reference Tone + A4 Cal + Confidence  | Per-string reference tones, A4 calibration slider (432–446 Hz), confidence display                      |
| Scale Page: Degree Labels + Pentatonic + CAGED | Degree labels on dots, CAGED band overlay, pentatonic dimming, interval hover tooltips                |
| Chord Library: Left-Handed Mode              | Mirrored SVG diagrams, common voicings panel, persisted to localStorage                                 |
| Drum Machine: Pattern Randomize / Mutation   | Mutate button (flips 1–2 hits per instrument) + randomize by genre (clean/humanized variants)           |
| Metronome: Accents + Polyrhythm + Presets    | Per-beat accent editor, polyrhythm mode (two simultaneous divisions), save/load named presets           |
| Metronome: Practice Goals Integration        | Opens at target BPM from active practice session (one-click link)                                       |
| Welcome Page Categorization                  | Tools grouped by category (Rhythm, Theory, Practice, etc.) on welcome screen                            |
| PWA / Offline Support                        | `vite-plugin-pwa` with service worker, web manifest, and all icon sizes; installable on mobile          |
| Mobile Optimization                          | Responsive tap targets, touch-friendly layouts, tested at 375px                                         |
| Chord Progression: WAV Export                | Exports progression audio (all 3 instrument types) as a WAV file                                        |
| Chord Progression: Send to Tab Editor        | Converts chord progression to a `TabTrack` and saves it for editing in `/tab-editor`                    |
| Custom User-Built Chords                     | Interactive fretboard editor in Chord Library; custom chords persist to cloud                           |
| Tab Editor: Alternate Tuning Playback        | `TabPlaybackEngine` uses `openMidi[]` for per-string pitch, so non-standard tunings play correctly      |

---

## Priority Ranking (open items)

| #   | Feature                                             | Effort | Impact |
| --- | --------------------------------------------------- | ------ | ------ |
| 1   | Ear Training: Skip + Answer Reveal                  | Low    | High   |
| 2   | Chord Progression: Clear All + Fretboard Diagram    | Low    | Medium |
| 3   | Tuner: Hold Mode                                    | Low    | Medium |
| 4   | Fret Memorizer: Stats & Progression UI              | Medium | High   |
| 5   | CAGED: Next Shape Shortcut                          | Low    | Low    |
| 6   | Click Track: Keyboard Segment Reordering            | Low    | Low    |
| 7   | Chord Library: Scale Suggestions                    | Medium | High   |
| 8   | Chord Progression: Voicing Explorer                 | Medium | High   |
| 9   | Practice Session: Tags / Categories                 | Low    | Medium |
| 10  | Drum Machine: Per-Instrument Swing                  | Medium | Medium |
| 11  | Tab Editor: MusicXML Export                         | Medium | High   |
| 12  | Tab Editor: Minimap                                 | Medium | Medium |
| 13  | Capo Calculator                                     | Medium | Medium |
| 14  | Rhythm Tap Trainer                                  | Medium | Medium |
| 15  | Song Arranger                                       | High   | High   |
| 16  | Tab Editor: MIDI Input                              | High   | High   |

---

## New Tools

### Capo Calculator

Enter a capo fret position to see all chord shapes transposed.

- Input: root note + capo fret (1–7); output: show every open-position chord shape and what it sounds like with the capo
- "Capo 2: play E-shape → sounds like F#, play A-shape → sounds like B" — list all six EADGBE shapes
- Show before/after chord diagrams side by side using the existing `FretboardDiagram` renderer
- Add a "reverse lookup": enter the chord you want to play, get back which capo + shape achieves it
- Useful for songwriters transposing a chord chart to a singer's key without losing open-string voicings
- No cloud persistence needed; state can be URL-encoded for sharing ("capo 3, key of G")

---

### Song Arranger

Combine click track segments, drum patterns, and chord progressions into a full arrangement view.

- Drag-and-drop sections (Intro, Verse, Chorus, Bridge, Outro) onto a horizontal timeline
- Each section references a saved click track segment + drum pattern + chord progression by name/ID
- Sections can repeat: "Chorus ×3" compresses the view without duplicating the data
- Playback runs the full arrangement in sequence — transitions handled by `ClickTrackEngine`
- Export: render to WAV (reuse `OfflineAudioContext` pattern from `exportAudio.ts`) or share as a URL
- Start minimal: first ship the arrangement view + playback; WAV export is a second pass

---

### Rhythm Tap Trainer

Complement to the metronome: instead of keeping time *against* a click, the user taps a *target rhythm*.

- Show a target rhythm pattern on-screen (use the existing beat-cell grid from the drum machine)
- A reference pulse plays via `ClickTrackEngine`; user taps the spacebar or a large "Tap" button
- Score: each tap earns points proportional to how close it lands to the nearest grid subdivision
  - "Perfect" < 20ms off, "Good" < 50ms, "Late/Early" up to 100ms, "Miss" > 100ms
- Difficulty tiers: quarter notes only → mixed eighths → syncopated → dotted rhythms → triplets
- Show a replay of the session: a timeline with the target rhythm in grey and the user's taps in colour
- Reuse `ClickTrackEngine` for the reference pulse; score taps using `AudioContext.currentTime` delta

---

### Polyrhythm Visualizer

*(Metronome now has a polyrhythm mode; this is a standalone visual teaching tool)*

Two independent loops at different divisions, displayed as rotating dots on concentric circles.

- Set each layer's numerator independently: e.g. 3-against-4, 5-against-3
- One dot per layer rotates at its own period; both reset at the combined cycle length (LCM)
- Dots are color-coded; a shared "coincidence flash" triggers when they align
- Audio: two separate click tones (pitched differently) driven by two `ClickTrackEngine` instances
- Purely educational — helps students *see* cross-rhythms before internalizing them
- Simpler than the Song Arranger; a single canvas or SVG component with no persistence needed

---

## Improvements to Existing Tools

### Fret Memorizer: Stats & Progression

The scoring API exists (`fretMemorizerApi.ts`) but the UI only shows a session-level accuracy number. The real value is longitudinal tracking.

**Stats panel (post-session summary and history tab):**
- Per-note accuracy heatmap on the fretboard SVG: colour each dot from red (< 60%) to green (≥ 90%) based on all-time accuracy — shows at a glance which notes need work
- Session history: accuracy% per session over the last 30 days as a sparkline or bar chart
- Streak counter with visual indicator: show a flame icon (🔥 or SVG equivalent) next to the score that grows in size at 5, 10, 20 consecutive correct answers — motivates unbroken runs

**Adaptive difficulty:**
- After the stats panel shows weak spots, offer a "Focus Mode" that restricts the quiz to the 3–5 worst-performing notes until those reach 80%+ accuracy
- This replaces the current manual string/note filter for the most common use case

**Study Mode (new toggle alongside quiz mode):**
- Flash a fret position → wait 3 seconds → reveal the note name
- No score — pure memorization drill
- Lower cognitive load; good for beginners before they try quiz mode

---

### Ear Training: Skip + Answer Reveal

Two small UX fixes that together make the game significantly less frustrating.

**Skip button:**
- A "Skip →" button below the answer choices lets users pass on a question without a wrong mark
- Track skips separately in `useExercise` state (`skipped: number`) alongside `wrongAnswers`
- Show skip count in the end-of-round summary so users can see where they got stuck
- Don't penalize the score — skips are neutral (you didn't get it wrong, you just didn't answer)

**Answer reveal on incorrect:**
- Currently after a wrong answer, the app just flashes red and moves on — the user has no idea what the correct answer was
- After an incorrect guess: highlight the chosen answer in red *and* highlight the correct answer in green for 1.5 seconds before advancing
- Show a brief label: "That was a minor 3rd" directly below the highlighted button
- This is the single highest-value learning moment in the whole ear training flow

**Replay on answer reveal:**
- Include a small "♪ Play again" link during the 1.5-second reveal so users can re-listen while seeing the label
- Reuse the existing replay button logic; just suppress the "next question" auto-advance while the user is replaying

---

### Chord Library: Scale Suggestions

When viewing a chord in the detail modal, show which scales/modes contain all its tones.

**Theory logic (`chordTheory.ts`):**
- Compute the chord tones (root + intervals for the quality) as a set of pitch classes
- Check each of the 7 diatonic modes for every root: if chord tones ⊆ mode tones, it's a match
- Return matches as `{ rootName, modeName, degree }` — e.g. "Cmaj7 → G major (IV), C major (I), A natural minor (III)"

**UI in the chord detail modal:**
- Add a "Found in scales" section below the fretboard diagram
- Show at most 6 matches, sorted by how closely related they are (same root first, then parallel, then relative)
- Each scale is a pill/badge; clicking one navigates to `/scales` with that scale pre-selected
- This closes the loop between the Chord Library and the Scales page

**Chord-to-progression suggestions (secondary):**
- Below the scale list, show 2–3 common progressions that feature this chord: e.g. for Cmaj7 → "I–vi–IV–V in C", "ii–V–I in Bb (as IV)"
- A small curated database per chord quality is enough; no need to compute dynamically
- Tapping a progression navigates to `/chord-progression` with those slots pre-filled

---

### Chord Progression: Clear All + Fretboard Diagram

Two independent improvements that each take less than a day.

**Clear All button:**
- Add a "Clear all" button in the toolbar area (next to the key selector)
- Clicking it resets all 8 slots to empty (same as clicking the × on each slot one by one)
- Add a one-click confirmation via the existing Radix `Dialog` pattern to prevent accidental wipes
- After clearing, focus moves to slot 1 so the user can immediately start building a new progression

**Fretboard diagram above the currently-playing slot:**
- During playback, show a small `FretboardDiagram` (reuse from `ChordsPage`) that reflects whichever chord slot is currently sounding
- Position it above the progression row so it's visible without scrolling
- When not playing, show the diagram for whichever slot was last clicked/hovered
- This helps players who want to visualize the voicing while hearing it — especially useful for learning unfamiliar inversions

---

### Chord Progression: Voicing Explorer

Currently each slot plays the single default voicing from `CHORD_DATABASE`. Let users choose alternate voicings inline.

- Click a filled chord slot → open a small popover (not a full modal) listing all matching voicings for that quality + root
- Show each voicing as a miniature `FretboardDiagram` thumbnail with its position name (Open, 5th position, etc.)
- Selected voicing is highlighted; clicking a different one updates the slot immediately with audio preview
- Persist selected voicing per slot alongside the chord root/quality in state and localStorage
- The open-position voicings sound different from barre shapes — this single feature dramatically expands the musical range of the builder

---

### Tuner: Hold Mode

A "Hold" button that freezes the last stable reading, useful when someone else is turning the tuning peg while you check the display.

- Hold button appears below the frequency readout; pressing it locks the displayed note, cents, and meter position
- The microphone keeps running in the background (so you can release hold and get a live reading immediately)
- Auto-release after 10 seconds, or when the user taps Hold again
- Show a pulsing border or "HOLD" badge on the frequency display while locked so the state is unambiguous
- Implementation: flag in component state; the `detectPitch` RAF loop still runs but results are discarded while held

---

### CAGED: Next Shape Shortcut

Cycle through the 5 CAGED shapes with a keyboard shortcut or on-screen button.

- Arrow buttons ("← Prev shape" / "Next shape →") placed near the shape picker
- Keyboard: left/right arrow keys when no input is focused cycle through C → A → G → E → D → C
- Show the shape name prominently ("G shape") both in the picker and as a label on the SVG neck
- This removes the need to open a dropdown for every shape change — important for students who want to rapidly compare shapes in sequence

---

### Click Track: Keyboard Segment Reordering

Supplement drag-and-drop with arrow-key reordering for keyboard-first users.

- When a segment row has focus (tab-navigable), show two small arrow buttons ("↑" / "↓") at the right edge
- Pressing Alt+Up / Alt+Down while a row is focused moves it one position in the list
- Mirrors the pattern used by most list-editor UIs (accessibility best practice)
- Also useful on mobile where drag-and-drop is harder to control precisely

---

### Practice Session: Tags / Categories

Add freeform tags to practice sessions to make history filterable.

- Goal setup form: add a "Tags" multi-select input with common presets (Technique, Song, Theory, Ear Training, Improvisation) plus freeform entry
- Tags are stored alongside the session goal in `PracticeSession` type and persisted to cloud
- History view: tag filter chips above the session list let users narrow to "only Technique sessions" etc.
- Weekly summary panel can show a breakdown by tag ("3h technique, 1h theory this week")
- Small effort; most of the persistence and display patterns are already in `practiceSessionApi.ts` and the history view

---

### Drum Machine: Per-Instrument Swing + Step Length

Two groove enhancements that go beyond the current global humanize.

**Per-instrument timing offset:**
- Add a small ±ms offset slider per instrument row (range: −50ms to +50ms; default 0)
- Classic use: snare sits slightly behind the grid (−10ms) for a heavy feel; hihat slightly ahead for drive
- Implement in `AudioEngine`: when scheduling a hit, add the instrument's offset to the scheduled time
- Show the slider collapsed by default; expand with a small "≡" icon on the instrument label

**Step length variation (half-time and double-time cells):**
- Right-click a beat cell (or long-press on mobile) → context menu: "Normal / Short (½) / Long (2×)"
- Short cells fire at half the grid's subdivision length; Long cells sustain across two cells and suppress the next cell
- Render short cells as half-width, long cells spanning two cell widths in the grid
- Enables straight-ahead grooves with occasional 32nd-note fills without changing the global subdivision

---

### Tab Editor: MusicXML Export

AlphaTab's internal API supports MusicXML serialization — expose it alongside the existing GP export.

- Add "Export MusicXML (.musicxml)" to the same toolbar dropdown that has "Export Guitar Pro (.gp)"
- Use `AlphaTabApi`'s score object (already built during the preview step) and serialize via alphaTab's exporter
- MusicXML is the standard interchange format for notation software (Finale, Sibelius, MuseScore) — this makes tabs useful outside the app
- If alphaTab's exporter isn't directly accessible, fall back to building the XML from the internal `TabTrack` model (more effort, lower fidelity)

---

### Tab Editor: Minimap / Measure Overview

For tabs with 20+ measures, horizontal scrolling is disorienting.

- Render a compressed horizontal strip at the bottom of the editor showing all measures as narrow columns
- The currently-visible viewport is highlighted with a translucent overlay bar
- Clicking anywhere in the minimap jumps the main scroll position to that measure
- Dragging the viewport bar in the minimap scrubs the scroll position in real time
- Implementation: a second SVG canvas scaled down to fit the full tab width in a fixed-height strip (40px)
- The minimap only needs to render measure boundaries and beat counts — no note detail

---

### Metronome: Large BPM Display

During playback the BPM is shown in a small input field that's hard to read at a glance from across a room.

- Show current BPM as a large (72–96px) number in the center of the screen during playback, above or over the pendulum
- Fade back to the standard controls layout when playback is stopped
- In advanced mode, show the BPM of the currently-playing measure (it can change per measure)
- Also update the document `<title>` to `"120 BPM — Metronome"` during playback so users can glance at the browser tab

---

## Polish & Cleanup

### Cross-Cutting

- **Dark/light theme toggle**: currently dark-only; light mode helps for print, outdoor use, and low-vision users. Wire into a `ThemeContext` with a `data-theme` attribute on `<html>`; use CSS variables for all colour tokens
- **Print stylesheets**: tab editor and chord library are the best candidates; `PublishedTabViewPage` already has print support — use it as a reference
- **Accessibility**: several SVG components lack `aria-label`; keyboard navigation in the chord library and scale page is incomplete; add `role="button"` and keyboard handlers to all interactive SVG dots
- **Nav overflow on mobile**: at small widths the nav wraps awkwardly; consider icon-only compact nav below a breakpoint with tooltips on hover/focus

### Page-Specific Polish

| Page             | Polish Item                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Ear Training     | Skip button + answer reveal (see full spec above)                                                        |
| Ear Training     | Show remaining questions in the round as a progress bar ("7 / 10")                                      |
| Chord Progression | Clear All button + fretboard diagram above playing slot (see full spec above)                           |
| CAGED            | Next/Prev shape keyboard shortcut (see full spec above)                                                  |
| Fret Memorizer   | Streak flame indicator + per-note accuracy heatmap (see full spec above)                                 |
| Fret Memorizer   | Study mode: flash fret → reveal note name after 3 s delay (no scoring)                                  |
| Tab Editor       | Minimap / measure overview strip for long tabs (see full spec above)                                     |
| Click Track      | Keyboard segment reordering with Alt+↑/↓ (see full spec above)                                          |
| Practice Session | Session tags for history filtering (see full spec above)                                                 |
| Tuner            | Hold mode to freeze last stable reading (see full spec above)                                            |
| Metronome        | Large BPM display during playback (see full spec above)                                                  |
| Chord Library    | Fingering difficulty badge (Beginner / Intermediate / Advanced) computed from fret span and barre count  |
