# Feature Ideas

Surveyed the full codebase on 2026-06-03. Updated 2026-06-19 to reflect everything shipped since then.

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
| Ear Training: Skip + Answer Reveal           | Skip button (neutral, tracked separately), correct answer highlighted green + "Play again" for 1.5 s   |
| Chord Progression: Clear All + Fretboard Diagram | Clear All with Radix Dialog confirmation; `FretboardDiagram` above the currently-playing slot      |

---

## Priority Ranking (open items)

Sorted by impact/effort ratio. Low-effort / High-impact items first; High-effort items regardless of impact last.

| #   | Feature                                             | Effort | Impact |
| --- | --------------------------------------------------- | ------ | ------ |
| 1   | AI: Chord Progression Suggester                     | Low    | High   |
| 2   | AI: Practice Plan Generator                         | Low    | High   |
| 3   | Fret Memorizer: Stats & Progression UI              | Medium | High   |
| 4   | Chord Library: Scale Suggestions                    | Medium | High   |
| 5   | AI: YouTube Drum Pattern Extraction                 | Medium | High   |
| 6   | AI: YouTube Chord Progression Detection             | Medium | High   |
| 7   | AI: Tab Import from Image                           | Medium | High   |
| 8   | Chord Progression: Voicing Explorer                 | Medium | High   |
| 9   | Tab Editor: MusicXML Export                         | Medium | High   |
| 10  | Tuner: Hold Mode                                    | Low    | Medium |
| 11  | Practice Session: Tags / Categories                 | Low    | Medium |
| 12  | AI: Key Change Detector                             | Low    | Medium |
| 13  | Tab Editor: Minimap                                 | Medium | Medium |
| 14  | Drum Machine: Per-Instrument Swing                  | Medium | Medium |
| 15  | AI: Progress Coach Weekly Insights                  | Medium | Medium |
| 16  | Capo Calculator                                     | Medium | Medium |
| 17  | Rhythm Tap Trainer                                  | Medium | Medium |
| 18  | CAGED: Next Shape Shortcut                          | Low    | Low    |
| 19  | Click Track: Keyboard Segment Reordering            | Low    | Low    |
| 20  | Song Arranger                                       | High   | High   |
| 21  | Tab Editor: MIDI Input                              | High   | High   |
| 22  | AI: Hum-to-Tab Transcription                        | High   | High   |

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

## AI / Gemini Integration

All features in this section use the Gemini API via the `@google/generative-ai` npm package. Use **Gemini 2.0 Flash** for latency-sensitive interactions (< 2 s expected), **Gemini 2.5 Pro** for complex multi-step analysis where a few extra seconds are acceptable. All AI calls must be gated behind Amplify auth (sign-in required) to prevent anonymous abuse of the API key. Every call must use `responseMimeType: "application/json"` with an explicit schema so the response can be parsed directly into the app's types without fragile string manipulation. Results that are expensive to generate (audio analysis, image parsing) should be cached keyed by a hash of the input so re-analyzing the same content is instant and free.

**YouTube audio pipeline** (shared by all YouTube-based features): a serverless function (AWS Lambda or Vercel Edge) receives the URL, calls `yt-dlp --extract-audio --audio-format mp3 --audio-quality 5` to get a compressed audio file, uploads it to the Gemini Files API (`model.uploadFile`), then passes the file URI in the Gemini prompt. The function returns structured JSON; the client never touches yt-dlp directly. Gate the endpoint behind the same Amplify JWT used elsewhere in `src/api/`.

---

### YouTube: Drum Pattern Extraction

Learning a drum groove from a YouTube video currently means pausing, rewinding, and tediously transcribing each hit by ear — a process that takes beginners 30+ minutes for a single bar. This feature eliminates that workflow entirely.

**User flow:**
- An "Import from YouTube" button appears in the drum machine toolbar
- User pastes a YouTube URL and optionally sets a time range (start/end in mm:ss) to focus on a specific section
- A loading state shows while the serverless function fetches and analyzes the audio (typically 5–15 s)
- Gemini's audio model is prompted to return a JSON array of hit events: `{ instrument: "kick"|"snare"|"hihat"|"openhat"|"clap"|"rim"|"tom", beat: number, subdivision: number }`
- The app quantizes hits to the nearest subdivision slot in the current `Pattern` grid and shows a diff preview — which cells will be filled vs. the current pattern — so the user can accept or reject per instrument row
- Confidence score (0–1) is shown per instrument; rows below 0.5 are flagged with a warning icon

**Implementation:**
- New `src/api/aiApi.ts` module; `extractDrumPattern(url, startSec, endSec)` hits the Lambda endpoint and returns `{ pattern: Pattern, confidence: Record<InstrumentId, number> }`
- Quantization logic: take the hit's timestamp offset within the excerpt, divide by the beat duration at the detected BPM, round to the nearest subdivision index; clamp to the pattern length
- The diff preview reuses the existing `DrumGrid` component with a "proposed" prop layer rendered in a distinct color (e.g., teal) over the current pattern
- Structural change (measure count, subdivision) does not auto-apply — if the detected groove requires a different subdivision, ask the user before applying

---

### YouTube: Chord Progression Detection

Figuring out the chords in a song is the most common theory exercise guitarists do by ear, but for beginners it can be impenetrable. Feeding a YouTube clip to Gemini converts a 20-minute ear-training session into a 10-second operation.

**User flow:**
- "Detect from YouTube" button in the Chord Progression Builder toolbar (next to the existing key selector)
- User pastes a URL and an optional time range; the request goes to the same serverless pipeline as the drum extractor
- Gemini returns a JSON array of `{ root: string, quality: string, startBeat: number }` objects (e.g., `[{ root: "A", quality: "minor", startBeat: 0 }, { root: "F", quality: "major", startBeat: 2 }]`)
- The app maps root+quality pairs to the existing `CHORD_DATABASE` entries in `src/audio/chordSynths.ts`, filling the 8 slots in order; if more than 8 chords are detected, show a scrollable list and let the user pick which 8 to use
- Key detection and Roman numeral labels run automatically via `chordTheory.ts` after the slots are filled, same as when the user picks chords manually
- If a detected quality doesn't exist in `CHORD_DATABASE` (e.g., `maj9`), fall back to the closest available quality and note the substitution

**Implementation:**
- Reuses the YouTube audio pipeline; add a `detectChordProgression(url, startSec, endSec)` function to `src/api/aiApi.ts`
- The chord mapping step does a case-insensitive lookup of `quality` strings against the keys of `CHORD_DATABASE`; build a normalizer map (`"minor" → "m"`, `"dominant7" → "7"`, etc.) to handle Gemini's verbose quality names
- Show a 3-slot confirmation dialog (detected key, detected BPM, slot preview) before writing to the progression state so the user can back out

---

### YouTube: BPM + Time Signature Detection

Before building anything in the app — a drum pattern, a click track, a chord progression — the user needs to know the song's tempo. Finding this manually means tap-tempo-ing along with headphones or using a separate app.

**User flow:**
- Accessible from the metronome page, drum machine toolbar, and click track toolbar via a small "Detect BPM" icon button
- User pastes a YouTube URL; Gemini analyzes the pulse and returns `{ bpm: number, timeSignature: { numerator: number, denominator: number }, confidence: number }`
- The detected BPM (clamped to 40–300 per `src/constants.ts`) is shown with a "Apply" button alongside the current BPM value so the user can compare before committing
- If confidence < 0.7, show a warning: "Tempo is ambiguous — common in live recordings with drift"
- Also offers "half-time" and "double-time" alternatives (detected BPM ÷ 2 and × 2) since Gemini may detect the subdivisions rather than the beat

**Implementation:**
- `detectTempo(url, startSec?, endSec?)` in `src/api/aiApi.ts`; short clips (10–30 s) are sufficient for BPM detection so default the range to the first 30 s of the video if not specified
- On the metronome page, clicking "Apply" dispatches to the same BPM state used by `ClickTrackEngine`; on the drum machine, it calls `dispatch({ type: 'SET_BPM', bpm })` in `src/state.ts`

---

### YouTube: Scale / Mode Detection

A guitarist listening to a solo wants to know "what scale is this in so I can jam along?" — but scale identification requires music theory knowledge that beginners don't yet have.

**User flow:**
- "Detect Scale" button on the Scales page alongside the existing root + mode dropdowns
- User pastes a YouTube URL pointing to a melodic passage (solo, riff, bass line); Gemini analyzes the pitch content and returns `{ root: string, mode: string, confidence: number, alternates: Array<{ root, mode }> }`
- The root and mode dropdowns on the Scales page update automatically; the fretboard SVG redraws with the detected scale's dot positions
- Up to 3 alternate interpretations are shown as chips (e.g., "also fits Dorian") — clicking one switches the fretboard to that mode

**Implementation:**
- `detectScale(url, startSec?, endSec?)` in `src/api/aiApi.ts`; map Gemini's mode string (`"natural minor"`, `"mixolydian"`, etc.) to the `ScaleMode` type already used by the Scales page
- If the detected root isn't a valid note name, normalize enharmonic equivalents (`"Db" → "C#"`)

---

### YouTube: Arpeggio Shape Identification

When a guitarist watches a sweep-picking video and wants to replicate the shape, identifying which CAGED arpeggio shape is being played requires both visual pattern recognition and music theory — a two-skill hurdle.

**User flow:**
- "Identify Arpeggio" button on the Arpeggios page, next to the quality/shape filter
- User pastes a YouTube URL; Gemini analyzes the melodic contour and string transitions to identify the arpeggio quality and likely CAGED shape
- Returns `{ quality: ArpeggioQuality, cagedShape: "C"|"A"|"G"|"E"|"D", rootFret: number, confidence: number }`
- The Arpeggios page filters to the identified quality and highlights the detected shape; playback auto-loads so the user can hear the comparison immediately

**Implementation:**
- `identifyArpeggio(url, startSec?, endSec?)` in `src/api/aiApi.ts`; map quality string to `ArpeggioQuality` from `src/data/arpeggios.ts`
- If `rootFret` is out of range for any shape in the database, show the closest shape and note "detected at fret X — showing nearest available voicing"

---

### Tab Import from Image / Screenshot

Guitarists routinely photograph printed tab books, screenshot PDF tabs, or snap handwritten charts on paper. Today there's no path from those images into the tab editor. This closes that gap.

**User flow:**
- "Import from image" button in the Tab Editor toolbar (alongside the existing Guitar Pro import)
- User uploads a PNG/JPG (drag-and-drop or file picker); the image is sent directly to Gemini Vision (no audio pipeline needed — Gemini's multimodal API accepts images inline)
- Gemini parses the tab notation and returns a structured JSON representation matching the app's `TabTrack` / `Measure` / `Beat` / `TabNote` model
- A preview dialog shows the parsed result in the tab editor's SVG canvas before committing; the user can click "Import" or "Cancel"
- Errors (illegible fret numbers, ambiguous rhythms) are flagged per measure in the preview with yellow warning icons; the user can manually fix those measures after importing

**Implementation:**
- `importTabFromImage(base64Image: string)` in `src/api/aiApi.ts`; pass the image as an inline `inlineData` part in the Gemini request (no Files API upload needed for images under 20 MB)
- The Gemini prompt must include the full JSON schema of `TabTrack` in the system instruction so the model knows what structure to output
- Duration inference from tab images is inherently lossy (standard ASCII tab omits rhythm); default all beats to `"quarter"` and set a flag `durationInferred: true` so the UI can highlight those beats for the user to correct
- Reuse the existing `parseGP` error handling pattern in the tab editor toolbar for the import preview dialog

---

### "Describe This Tab" — Natural Language Summary

When a guitarist finishes a tab and wants to share it — with a teacher, a band member, or in the Tab Library description — they have to write the description themselves. Gemini can do it better and faster.

**User flow:**
- "Describe" button in the Tab Editor toolbar; also auto-triggered as a pre-fill step in the publish flow
- Sends the serialized `TabTrack` (title, BPM, time sig, measure count, all beat/note/modifier data) to Gemini as a structured JSON prompt
- Returns a 2–4 sentence natural language description: "This is a 16-bar instrumental piece in E minor at 140 BPM. It opens with a repeating palm-muted riff on strings 5–6, builds through a hammer-on lead melody on string 1, and resolves with a natural harmonic chord. Suitable for intermediate players; the main challenge is the legato run in measures 9–12."
- The description appears in a text area the user can edit before copying or inserting into the publish modal

**Implementation:**
- `describeTab(track: TabTrack)` in `src/api/aiApi.ts`; the input is the full serialized track (already serializable since it's persisted to localStorage)
- Compress the prompt by summarizing note content statistically (e.g., "measures 1–4: repeated 16th-note pattern on strings 5–6, frets 0–3") rather than sending every beat verbatim — keeps token count manageable for long tabs
- In the publish modal (`TabEditorPage.tsx`), add a "Generate description" icon button next to the description text area that calls this function and fills the field

---

### Tab Difficulty Estimator

The Tab Library has no difficulty metadata, so a beginner browsing tabs has no way to know whether a piece is within their reach before spending 10 minutes trying to play it.

**User flow:**
- Difficulty is auto-computed when a tab is published; also available as a manual "Estimate difficulty" button in the Tab Editor toolbar for unpublished tabs
- Gemini receives the tab's technique inventory (modifier counts: bends, hammer-ons, pull-offs, palm mutes, harmonics, sweeps), max fret stretch, average BPM, and total note density
- Returns `{ rating: "Beginner"|"Intermediate"|"Advanced"|"Expert", rationale: string }` — e.g., "Advanced — sweep arpeggios at 180 BPM across a 4-fret stretch require significant right-hand precision"
- The rating is stored alongside the published tab in `amplify/data/resource` schema and displayed as a badge in `TabLibraryCard` and on the `PublishedTabViewPage`

**Implementation:**
- `estimateDifficulty(track: TabTrack)` in `src/api/aiApi.ts`; extract the summary statistics client-side before sending (no need to send the full note data — technique counts are sufficient)
- Update the Amplify data schema to add a `difficulty` field to the published tab type
- Add the badge to `TabLibraryCard` (`src/components/TabLibrary/TabLibraryCard.tsx`) using the same styling as existing quality/tag chips

---

### AI Tab Completion / Autocomplete

Composing tab is often blocked by "I have a great riff but don't know where to go next." Gemini can suggest a continuation in the same style, breaking creative block without replacing the human decision.

**User flow:**
- "Suggest next measure" button appears when the cursor is at the last beat of any measure
- Gemini receives the preceding 2–4 measures (serialized as JSON) and is asked to generate one measure that continues naturally in the same style and key
- The suggested measure appears in the tab canvas as a "ghost" overlay (lighter color, dotted border) rather than being inserted directly
- Three navigation buttons appear: "Accept", "Try another", "Dismiss"; accepting inserts the ghost beats into the measure as real beats
- "Try another" re-calls the API with `temperature: 1.2` to get a different suggestion

**Implementation:**
- `suggestNextMeasure(precedingMeasures: Measure[], track: TabTrack)` in `src/api/aiApi.ts`; include global BPM, time sig, tuning, and string count in the system prompt so Gemini's output stays within playable range for the instrument
- The ghost overlay is a new rendering mode in `TabMeasureSvg` — add an optional `ghost?: boolean` prop that applies reduced opacity and a dashed SVG stroke to all note elements
- Validate the returned fret numbers (0–24) and beat durations before inserting; discard and re-request if the response fails schema validation

---

### Tab Style Classifier

Users browsing the Tab Library can't filter by genre. A guitarist looking for blues tabs has to scroll through everything. Auto-classification makes the library searchable without requiring manual tagging by authors.

**User flow:**
- Style classification runs automatically when a tab is published (same batch request as the difficulty estimator above — combine both in a single Gemini call to save a round trip)
- Returns `{ genre: string, subgenre?: string, techniques: string[] }` — e.g., `{ genre: "Blues", subgenre: "Chicago Blues", techniques: ["string bending", "vibrato", "blues scale"] }`
- The genre tag appears in `TabLibraryCard` as a colored pill; the Tab Library gains a genre filter dropdown
- On the individual tab view (`PublishedTabViewPage`), the technique list is shown as chips below the tab title, giving readers a quick preview of what skills the piece exercises

**Implementation:**
- Bundle with `estimateDifficulty` in a single `analyzeTab(track: TabTrack)` function that returns `{ difficulty, genre, subgenre, techniques }`; one Gemini call, two results, same cost as separate calls but half the latency
- Add `genre`, `subgenre`, `techniques` fields to the Amplify published tab schema alongside `difficulty`
- The genre filter in `TabLibraryPage` uses the same Radix `Select` component pattern as other filters on the page

---

### Practice Plan Generator

A beginner who wants to "get better at guitar" has no idea what to practice or in what order. A structured plan removes the paralysis — and grounding it in the tools already in the app means the user can follow the plan without leaving.

**User flow:**
- New "Generate Plan" flow on the Practice Session Tracker's setup screen, below the manual goal fields
- A short form: current skill level (Beginner / Intermediate / Advanced), primary goal (free text, e.g., "learn sweep picking at 140 BPM"), available time per day (5 / 10 / 20 / 30+ min), and which days of the week
- Gemini generates a 4-week structured plan: each week has daily sessions, each session has a goal object matching `PracticeSession` fields (duration, target BPM, skill focus, which tools to open)
- The plan is rendered as a week-by-week accordion; tapping any session's "Start" button pre-fills the Practice Session goal form and navigates there

**Implementation:**
- `generatePracticePlan(input: PlanInput)` in `src/api/aiApi.ts`; the response schema is `{ weeks: Array<{ sessions: Array<{ durationMin: number, targetBpm?: number, skillFocus: string, tools: string[] }> }> }`
- Persist the generated plan to localStorage (and cloud if authenticated) via a new `src/api/practicePlanApi.ts` — same dual-persistence pattern as every other API module in the project
- The "tools" field maps to app route names (`"/metronome"`, `"/ear-training"`, etc.); render each as a clickable chip that opens the linked page in a new tab or panel
- Add a "Regenerate" button so users can get a fresh plan if the first one doesn't fit their style

---

### Progress Coach — Weekly Insights

The Practice Session history view shows raw data (session count, total time, streaks) but doesn't interpret it. Most users won't analyze their own data; a coaching summary turns numbers into action.

**User flow:**
- A "Weekly Insights" card appears at the top of the Practice Session history view at the start of each week (or on demand via a "Get insights" button)
- Gemini receives the last 4 weeks of session data: durations, skill focus tags, target BPM values, and streak history
- Returns a coaching note of 3–5 bullet points: what went well, where there's a plateau, and one concrete suggestion for the coming week
- Example: "You practiced 5 of 7 days — great consistency. Your average session length dropped from 25 to 12 minutes mid-week; shorter sessions are fine but try to hit 20+ min at least twice. You haven't opened Ear Training in 2 weeks — even 10 minutes of interval drills would complement your speed work."
- The coaching card is dismissible and non-blocking; it doesn't gate any other functionality

**Implementation:**
- `generateWeeklyInsights(sessions: PracticeSession[])` in `src/api/aiApi.ts`; send only the last 28 days of data (filter in the client before the API call) to keep the prompt compact
- The insights response is a `{ bullets: string[], generatedAt: string }` object cached in localStorage with a TTL of 7 days so the same week's data doesn't trigger repeated API calls
- Render the coaching card above the weekly calendar in `PracticeSessionPage.tsx` using the same `StorageErrorBanner` visual pattern — a dismissible card with an icon and close button

---

### Ear Training Difficulty Calibration

The ear training game has a fixed difficulty tier system but no memory of which specific intervals or chord types an individual user struggles with. A user who has mastered P4 but struggles with m7 is still shown P4 questions at the same rate.

**User flow:**
- After any completed round, a "Personalized focus" chip appears below the score with a brief insight: "You're getting P5 right 95% of the time but m7 only 40% — focusing on that next"
- Clicking the chip opens a small panel with a per-item accuracy breakdown and a toggle: "Use adaptive weighting"
- When adaptive weighting is on, Gemini's recommendation (returned as `{ weights: Record<string, number> }`) biases the question pool — weak items appear more often, mastered items less often — without changing which items are in the pool
- The weighting update runs after every 10 questions; each update is a lightweight API call (just accuracy statistics, no audio)

**Implementation:**
- `calibrateEarTraining(history: AnswerRecord[])` in `src/api/aiApi.ts`; `AnswerRecord` is `{ item: string, correct: boolean, timestamp: number }` — already capturable from the `useExercise` hook's existing `wrongAnswers` state
- The returned weights are applied in `earTrainingLogic.ts` when building the question pool; higher-weight items appear multiple times in the shuffled array before deduplication
- Weights persist to localStorage per user so calibration survives a page reload; cloud sync is not required (this is session-quality data, not high-value)

---

### Lesson Content Q&A

Static lesson text can't answer follow-up questions. A student reading "barre chords are played by flattening one finger across all strings" may have 5 questions that the text doesn't address — and currently has to leave the app to search.

**User flow:**
- A "Ask a question" text input appears at the bottom of each lesson step in `LessonPage.tsx`
- Gemini receives the full lesson step text as the system context and the user's question as the user turn
- The response appears inline below the question as a collapsible card; questions and answers accumulate in the step view so the user can scroll back through them
- Responses are scoped to music theory and guitar technique — if the question is off-topic, Gemini politely declines and suggests rephrasing

**Implementation:**
- `askLessonQuestion(lessonStepContent: string, question: string)` in `src/api/aiApi.ts`; the system prompt includes the lesson text and a constraint: "Answer only questions about music theory, guitar technique, and the concepts covered in this lesson"
- Render Q&A pairs as an `<details>`/`<summary>` accordion below each step in `LessonPage.tsx` — progressively disclosed so they don't crowd the lesson layout
- Cap at 5 questions per lesson step per session (tracked in component state) to avoid runaway API usage

---

### Custom Lesson Builder Assistant

Writing a lesson in `BuildLessonPage` currently requires the author to structure everything from scratch. This is high enough friction that only technically confident users will create lessons, limiting the community content pool.

**User flow:**
- A "Draft with AI" button in `BuildLessonPage` opens a modal with a single text input: "Describe the concept you want to teach"
- User types something like "pentatonic minor scale in 5 positions across the neck, for intermediate players" and hits "Draft"
- Gemini returns a full lesson outline: module title, learning objectives, 4–8 step breakdown (each with title, body text, and a suggested tab/chord example), and prerequisite knowledge
- The draft is imported into the lesson builder's existing form fields, where the author edits, reorders, and refines before saving
- A "Regenerate" option resubmits the same description with a different seed for variety

**Implementation:**
- `draftLesson(description: string)` in `src/api/aiApi.ts`; response schema mirrors the `Lesson` type from `src/data/lessons.ts`
- The draft is imported into `BuildLessonPage` state via an `importDraft` action — same reducer pattern used for everything else
- Flag all AI-drafted content with `aiDrafted: true` in lesson metadata so admins can review before publishing; show a small "AI-assisted draft" badge in the lesson builder that disappears after the author edits the step

---

### Chord Progression Suggester

A blank Chord Progression Builder is intimidating — most users don't know where to start. Giving them a single-sentence prompt to get a playable progression dramatically lowers the barrier to experimentation.

**User flow:**
- A "Suggest progression" button in the Chord Progression Builder toolbar (smaller, secondary to the existing chord picker)
- A compact popover opens with a single free-text field: "Describe a mood, genre, or starting point" — placeholder: "e.g. dark jazz, uplifting pop, Radiohead-style"
- Gemini returns 3 progression options, each with Roman numeral labels and a brief description: "i – VI – III – VII (natural minor): a melancholic, cinematic feel"
- Clicking one option fills the 8 slots via the existing slot state; Roman numeral labels and key detection run automatically via `chordTheory.ts`
- If the user's Amplify auth is active, the last 5 generated progressions are saved to localStorage so they can revisit them without re-generating

**Implementation:**
- `suggestChordProgressions(prompt: string)` in `src/api/aiApi.ts`; response is `{ progressions: Array<{ chords: Array<{ root: string, quality: string }>, description: string }> }`
- Map returned root+quality pairs to `CHORD_DATABASE` entries using the same normalizer from the YouTube chord detection feature — share the normalization utility
- The 3-option UI uses a Radix `RadioGroup` inside a `Popover` (both already available in `src/components/ui/`); selecting an option and clicking "Use this" closes the popover and fills the slots

---

### Click Track Pacing from Song Description

Building a click track for a complex song (multiple tempo changes, time signature shifts, a breakdown, a double-time section) requires knowing the song's structure in advance and manually entering each segment. This feature inverts that: describe the structure, get the segments.

**User flow:**
- "Build from description" button in the Click Track toolbar
- User types a natural language description: "Intro at 90 BPM in 4/4 for 4 bars, verse at 110 BPM, chorus doubles to 220 BPM, breakdown in 7/8 at 95 BPM for 8 bars, then back to verse"
- Gemini parses the description and returns a `TrackPiece[]` array with each segment's `bpm`, `timeSignature`, `subdivision`, and `repeatCount` filled in
- A preview list shows the proposed segments before they're written to the Click Track state; user can edit individual fields inline in the preview before committing

**Implementation:**
- `buildClickTrackFromDescription(description: string)` in `src/api/aiApi.ts`; response schema is `{ segments: TrackPiece[] }` matching the `TrackPiece` type from `ClickTrackPage.tsx`
- BPM values are clamped to 40–300 on the client side after parsing; time signature denominators are constrained to `[2, 4, 8, 16]`
- The preview renders using the existing segment row component from `ClickTrackPage` in read-only mode; "Import" replaces the current segment list, "Append" adds to it

---

### Drum Fill Suggester

Drum fills are the hardest part of a pattern to compose by ear — they need to resolve back to beat 1 and match the groove's style and tempo. Most drum machine users loop the same 4-bar pattern indefinitely because they don't know how to vary it.

**User flow:**
- Right-click (or long-press) any measure row in the drum machine → "Suggest fill for this bar" context menu item
- Gemini receives the current 4-bar pattern (all 7 instruments), the BPM, and the target bar number, and returns a single-bar `Pattern` object designed to work as a fill resolving into the downbeat of the next bar
- The fill is shown in a side-by-side preview: current bar on the left, suggested fill on the right, using the existing `DrumGrid` renderer
- "Accept" swaps that bar's data into the pattern; "Try again" re-requests with higher temperature; "Cancel" leaves the pattern unchanged

**Implementation:**
- `suggestDrumFill(currentPattern: Pattern, measures: number, bpm: number, targetMeasure: number)` in `src/api/aiApi.ts`; response is a single `Pattern` record (same shape as `src/types.ts`'s `Pattern` type)
- This feature requires sending more data than most (the full pattern grid) — compress by sending the boolean arrays as run-length encoded strings before base64 to keep the prompt compact
- The preview uses a read-only `DrumGrid` instance with `interactive={false}`; add that prop to the component if it doesn't already exist

---

### Song Section Labeler

A long tab or click track has no inherent structure — every measure looks identical in the UI. Adding structural labels (Intro, Verse, Chorus) makes navigation dramatically easier, especially when a piece is 40+ measures.

**User flow:**
- "Label sections" button in the Tab Editor toolbar and the Click Track toolbar
- Gemini analyzes the content — in the tab editor, it looks at pattern repetition, technique changes, and dynamic markers; in the click track, it looks at BPM and time signature transitions
- Returns `{ labels: Array<{ measureStart: number, measureEnd: number, label: "Intro"|"Verse"|"Chorus"|"Bridge"|"Solo"|"Outro"|"Breakdown" }> }`
- Labels appear as color-coded horizontal banners spanning their measure range above the tab canvas or click track timeline; clicking a banner scrolls to that section

**Implementation:**
- `labelSongSections(track: TabTrack | TrackPiece[])` in `src/api/aiApi.ts`; overloaded for both input types
- Render section labels in `TabSvgCanvas` as a thin colored strip above the measure headers, using the existing measure-position coordinate system in `tabSvgConstants.ts`
- In the Click Track, render labels as colored background fills behind the segment rows (same approach as the existing `color` field on `TrackPiece` but spanning a range)
- Labels are persisted as an optional `sectionLabels` field on `TabTrack` and the click track's saved state

---

### Lyric / Rhythm Alignment Tool

Songwriters writing original music often have lyrics before they have a tempo or rhythm grid. Figuring out the natural rhythmic feel of a lyric — which syllables land on the beat, where the bars fall — requires either musical experience or a lot of trial and error.

**User flow:**
- New tool accessible from the Click Track page: "Rhythm from lyrics" button in the toolbar
- User pastes a verse or chorus of lyrics into a text area
- Gemini analyzes syllable count, natural speech stress, and poetic meter, then returns `{ bpm: number, timeSignature: { numerator, denominator }, syllableBeatMap: Array<{ word: string, syllable: string, beat: number, subdivision: number }> }`
- The app shows the lyrics annotated with beat positions (color-coded per beat) and previews a click track segment at the suggested BPM so the user can hear the rhythm before committing
- "Apply to Click Track" creates a new segment with the detected time sig and BPM

**Implementation:**
- `alignLyricsToRhythm(lyrics: string)` in `src/api/aiApi.ts`; this is a text-only Gemini call (no audio), so it's fast and cheap
- The annotated lyrics display uses a `<span>` per syllable with `data-beat` and `data-subdivision` attributes; beats are highlighted with the same color scheme as the `BeatCell` component
- The BPM suggestion is advisory — show a slider so the user can nudge it ±20 BPM before creating the segment

---

### CAGED Shape Explanation

The CAGED visualizer shows the shapes but doesn't explain them. Students often know which shapes exist but don't understand why they work, how to connect them, or what scale tones they emphasize — so they memorize patterns without internalizing the theory.

**User flow:**
- A "Explain this shape" button appears in the CAGED page's shape info panel (already exists as a sidebar) when a shape is active
- Gemini receives the current root note, CAGED shape name, and the computed fret positions from `computeCAGEDShapes` in `src/data/caged.ts`
- Returns a 3–5 sentence explanation: which scale degrees are under which fingers, how this shape connects to the adjacent shape (ascending and descending the neck), and a practical tip ("the G-shape is often used for lead playing because the root sits under the ring finger, freeing the pinky for extensions")
- The explanation appears in a collapsible panel below the shape info; collapses by default to not crowd the visualizer

**Implementation:**
- `explainCAGEDShape(root: string, shape: string, fretPositions: number[])` in `src/api/aiApi.ts`
- The explanation is cached in a `Map<string, string>` keyed by `"${root}-${shape}"` in component state — the same root+shape combination always gets the same explanation, so one API call per combination per session is enough
- Render the explanation in a `<details>` element in `CAGEDPage.tsx` with the shape name as the `<summary>` label

---

### Circle of Fifths Walkthrough

The Circle of Fifths page currently displays the circle and lets users click a key, but it doesn't teach what the circle means or how to use it. A student who doesn't already know music theory gets limited value from it.

**User flow:**
- "Explain this key" button appears in the Circle of Fifths key detail panel when a key is selected
- Gemini receives the selected key (root + major/minor) and returns: (1) the key signature (sharps/flats), (2) the diatonic chords as Roman numerals with names, (3) two common modulation targets and how to pivot, (4) a famous song example in that key
- The walkthrough is displayed as a structured panel with four collapsible sections, so the user can drill into whichever aspect interests them
- "Show in Chord Progression" button pre-fills the Chord Progression Builder with the key's I–IV–V–I as a starting point

**Implementation:**
- `explainKey(root: string, mode: "major"|"minor")` in `src/api/aiApi.ts`; response schema has four labeled sections for predictable rendering
- Cache per key (42 combinations total — 7 roots × 3 accidentals × 2 modes) in localStorage so each explanation is generated once and reused
- The "Show in Chord Progression" deep link uses the existing URL parameter approach for pre-filling the progression builder

---

### Interval Trainer Hint Engine

Wrong answers in the Interval Trainer are currently silent — the player just sees a red flash and moves on. For intervals the player repeatedly misses, a memorable mnemonic dramatically accelerates learning by giving the ear something to hook onto.

**User flow:**
- After a wrong answer, a "Need a hint?" link appears below the correct answer reveal (which is already planned in the "Skip + Answer Reveal" feature above)
- Clicking it calls Gemini, which returns a short mnemonic: a well-known song whose opening melodic interval matches the one the player missed
- Example: "A minor 3rd sounds like the first two notes of 'Smoke on the Water' (D–F). Try humming it before your next attempt."
- The hint is cached per interval pair and shown immediately on subsequent misses without a new API call
- A "Hint library" tab in the Ear Training page eventually accumulates all generated mnemonics so the user can review them outside of game mode

**Implementation:**
- `getIntervalMnemonic(intervalName: string)` in `src/api/aiApi.ts`; since there are at most ~14 distinct intervals (P1 through P8 including enharmonics), pre-generate and cache all 14 on first use in a single batch call
- Store the full mnemonic table in localStorage keyed by interval name; subsequent sessions never need an API call for this feature
- Render the hint as a small `Tooltip` or inline card in the `IntervalTrainerPage` answer reveal phase

---

### Hum-to-Tab Transcription

The hardest part of tab writing is often transferring a melody that exists only in the composer's head into notation. Humming into the mic and getting tab output bypasses the fret-finding step entirely.

**User flow:**
- "Hum to tab" button in the Tab Editor toolbar — only visible when a microphone is available
- A recording modal opens: a large "Record" button and a waveform display (using `AnalyserNode` from the existing tuner pipeline)
- User records 2–30 seconds of humming, singing, or whistling; the recording is converted to a WAV blob client-side
- The WAV is sent to Gemini's audio model, which transcribes the melody to `{ notes: Array<{ midi: number, durationBeats: number }> }`
- The app maps MIDI numbers to the closest fret positions on the current tuning (`openMidi[]` from `TabTrack`) and inserts the result as a new measure in the tab editor
- Fret mapping prefers lower positions on lower strings (matching idiomatic guitar playing) over higher frets on higher strings

**Implementation:**
- Recording: reuse the `getUserMedia` + `AnalyserNode` setup from `TunerPage.tsx`; add a `MediaRecorder` around it to capture the audio stream as a WebM/WAV blob
- `transcribeMelody(audioBlob: Blob)` in `src/api/aiApi.ts`; upload via the Gemini Files API (not inline, since mic audio can be >20 MB for long recordings)
- Fret mapping: for each MIDI note, iterate the `openMidi[]` array and find the string where `fret = midi - openMidi[string]` is in 0–24 range; prefer the string with the lowest resulting fret (open strings and low positions sound more natural)
- Duration quantization: snap returned `durationBeats` to the nearest `DurationValue` using the existing duration ladder in `tabEditorState.ts`
- Show a "Review transcription" step (the same ghost-overlay pattern as tab autocomplete) before committing to the measure

---

### Key Change Detector in Chord Progressions

Users building progressions longer than 4–8 chords often modulate without realizing it, or deliberately borrow chords from parallel modes. The existing `chordTheory.ts` key detection only assigns a single key to the whole progression — it doesn't flag the moment the harmony shifts.

**User flow:**
- "Analyze harmony" button in the Chord Progression Builder toolbar (runs after the progression is fully built)
- Gemini receives the full slot sequence as Roman numerals and identifies: (1) the primary key, (2) any pivot chords or modal borrowing, (3) if a secondary key is established, where it starts
- Returns `{ primaryKey: string, annotations: Array<{ slotIndex: number, label: string, explanation: string }> }` — e.g., `{ slotIndex: 3, label: "bVII", explanation: "Borrowed from Mixolydian — common in rock and Britpop" }`
- Annotations appear as small badges below the chord slots; hovering one shows the explanation in a tooltip
- This feature works with the existing 8-slot model and doesn't require longer progressions, though it's most useful for complex ones

**Implementation:**
- `analyzeHarmony(chords: Array<{ root: string, quality: string }>)` in `src/api/aiApi.ts`; this is a pure text call (no audio), fast and cheap
- The annotation badges use the existing chord slot component in `ChordProgressionPage.tsx` — add an optional `annotation?: string` prop to the slot renderer
- The `chordTheory.ts` module's existing `detectKey` function already runs on every progression change; this feature supplements it with per-chord annotation rather than replacing it

---

### Auto-Generated Tab Description for Publishing

The publish modal for the Tab Library currently has an empty description field that most users skip, resulting in a library of tabs with no useful metadata. Auto-generating the description removes the blank-field friction entirely.

**User flow:**
- When the user opens the publish modal in the Tab Editor, the description field auto-populates with an AI-generated summary (uses the same `describeTab` function from the "Describe This Tab" feature)
- The auto-generated text is shown with a subtle "AI-assisted" chip next to it; the user can edit or clear it entirely
- If the user has already typed a description before opening the modal, the auto-fill is suppressed — never overwrite user-written content
- The publish flow otherwise unchanged; AI-generated descriptions are stored identically to user-written ones

**Implementation:**
- Trigger `describeTab(track)` when the publish modal opens (`onOpenChange` in the Radix `Dialog`); show a skeleton loader in the description field while the call is in flight
- Cache the result in component state so re-opening the modal doesn't re-trigger the API call during the same session

---

### Tag Generator for Tab Library

The Tab Library has no tagging or filtering system. Every published tab is a flat list — there's no way to find "blues fingerpicking in drop D" without scrolling through everything.

**User flow:**
- Tags are auto-generated at publish time alongside the difficulty rating and genre classification (combine all three in the single `analyzeTab` call described in the Tab Difficulty Estimator section)
- Gemini returns 3–6 suggested tags drawn from a controlled vocabulary: genre, key, tuning, primary technique, difficulty, mood
- Tags appear as editable chips in the publish modal; the user can remove any auto-generated tag or add custom ones from a free-text input
- The Tab Library page gains a tag filter: a multi-select chip bar above the tab list; selecting tags narrows results (AND logic)
- Tags are stored in the Amplify schema alongside the published tab; the `TabLibraryPage` query filters by tags server-side

**Implementation:**
- The tag controlled vocabulary is defined as a TypeScript const in `src/api/aiApi.ts` and passed to Gemini in the system prompt to constrain its output — prevents hallucinated tags like "Jimi Hendrix style" that can't be filtered
- The editable chip input in the publish modal uses a `combobox` pattern (type to filter the controlled vocabulary + add custom); this is the only new UI component needed
- Filter chips in `TabLibraryPage` match the same Tailwind color scheme as the existing difficulty badges

---

### "Similar Tabs" Recommendation

A user who finishes a published tab has no path to discover related material. The Tab Library is a dead end after the current tab. Similar-tabs recommendations convert a one-and-done view into a session.

**User flow:**
- A "You might also like" section appears at the bottom of `PublishedTabViewPage`, below the alphaTab renderer
- When the page loads, Gemini receives the current tab's metadata (genre, tags, difficulty, key, techniques, BPM) and a list of other published tab summaries (title, genre, tags, difficulty — not the full note data)
- Returns 3 recommended tab IDs with a one-line reason for each: "Similar blues fingerpicking style in the same key"
- Each recommendation renders as a `TabLibraryCard` (reuse existing component); clicking navigates to that tab's view page

**Implementation:**
- `findSimilarTabs(currentTab: PublishedTabSummary, allTabs: PublishedTabSummary[])` in `src/api/aiApi.ts`; pass only summary metadata, not full note data — keeps the prompt small even with hundreds of tabs
- If the total number of tabs is large (> 50), pre-filter to the same genre before sending to Gemini so the context stays manageable
- Cache recommendations per tab ID in localStorage (7-day TTL) so every view of the same tab doesn't incur an API call

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
