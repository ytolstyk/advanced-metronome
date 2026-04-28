import type { Beat, DurationValue, Measure, TabNote } from '../../tabEditorTypes'
import { BEAT_WIDTHS } from '../../tabEditorState'

export const STRING_SPACING = 20
export const STRING_LABEL_W = 28
export const MEASURE_NUMBER_H = 16
export const TECHNIQUE_ZONE_H = 42
export const DURATION_MARK_H = 0
// Top zone order (from y=0 downward): MEASURE_NUMBER_H | TECHNIQUE_ZONE_H | strings…
export const TOP_MARGIN = MEASURE_NUMBER_H + TECHNIQUE_ZONE_H + DURATION_MARK_H

// Y positions for specific technique rows within TECHNIQUE_ZONE_H
export const TAPPING_ZONE_Y = MEASURE_NUMBER_H + 24    // row 1: tapping "T"
export const VIBRATO_ZONE_Y = MEASURE_NUMBER_H + 24   // row 2: vibrato sine wave
export const PALM_MUTE_ZONE_Y = MEASURE_NUMBER_H + 24 // row 3: palm mute bracket (no overlap)
export const PALM_MUTE_ELEVATED_Y = MEASURE_NUMBER_H + 6 // palm mute shifted up when overlapping other effects
export const LET_RING_ZONE_Y = MEASURE_NUMBER_H + 24 // same row as palm mute (mutually exclusive)
export const LET_RING_ELEVATED_Y = MEASURE_NUMBER_H + 6
export const STACCATO_ZONE_Y = MEASURE_NUMBER_H + 24 // dot above strings
export const MEASURE_NUMBER_FONT_SIZE = 12  // small measure index shown top-left of each measure
export const NOTE_FONT_SIZE = 15             // fret numbers on the strings

// Technique zone labels
export const TAPPING_LABEL_FONT_SIZE = 10    // "T" marker above tapping beats
export const BEND_LABEL_FONT_SIZE = 9        // bend amount text (e.g. "full", "½")
export const PICK_DIR_FONT_SIZE = 9          // pick direction arrows (⬇ ⬆)
export const TECHNIQUE_LABEL_FONT_SIZE = 11  // "ring" and "P.M." bracket labels

// Measure header elements
export const TIME_SIG_FONT_SIZE = 30         // stacked time signature numerals
export const BPM_DISPLAY_FONT_SIZE = 13      // ♩=120 label shown at start of BPM segment
export const STRING_LABEL_FONT_SIZE = 11     // tuning note names left of first measure (e.g. "E", "A")
export const MEASURE_OVERFLOW_FONT_SIZE = 12 // ⚠ overflow error shown on overfull measures
export const BOTTOM_PADDING = 8
export const BARLINE_W = 2
export const TIME_SIG_W = 40 // horizontal space reserved for a stacked time signature
export const BPM_LABEL_W = 52 // horizontal space reserved for a BPM display

export function beatHasBend(beat: Beat): boolean {
  return beat.notes.some((n) => n.fret >= 0 && n.modifiers.bend)
}

export const BEAT_LEFT_PAD = 12        // fixed left space before every beat's note anchor (same for all durations)
export const MEASURE_BEATS_OFFSET = 18 // x offset from measure left edge to first beat slot
export const BEND_EXTRA_W = 16        // extra width added to beats that contain a bend

export function rowSvgHeight(stringCount: number): number {
  return TOP_MARGIN + stringCount * STRING_SPACING + BOTTOM_PADDING
}

export function stringY(si: number, stringCount: number): number {
  return TOP_MARGIN + (stringCount - 1 - si) * STRING_SPACING
}

// fillRests: list of rest durations to show after existing beats (fill remaining measure capacity)
// beatWidthScale: multiplier applied only to BEAT_WIDTHS (the post-note spacing), not to any padding or structural widths
export function measureWidth(m: Measure, showTimeSig = false, fillRests: DurationValue[] = [], showBpm = false, beatWidthScale = 1.0): number {
  const beatsW = m.beats.reduce((acc, b) => acc + BEAT_LEFT_PAD + BEAT_WIDTHS[b.duration] * beatWidthScale + (beatHasBend(b) ? BEND_EXTRA_W : 0), 0)
  const fillW = fillRests.reduce((acc, d) => acc + BEAT_LEFT_PAD + BEAT_WIDTHS[d] * beatWidthScale, 0)
  return MEASURE_BEATS_OFFSET + (showTimeSig ? TIME_SIG_W : 0) + (showBpm ? BPM_LABEL_W : 0) + beatsW + fillW + BARLINE_W
}

export interface BeatPosition {
  x: number  // left edge of beat slot
  cx: number // note anchor (x + BEAT_LEFT_PAD)
  w: number  // total slot width (BEAT_LEFT_PAD + right spacing)
}

export interface FretLabelData {
  label: string
  fill: string
  fontStyle: 'normal' | 'italic'
}

export function formatFretLabel(note: TabNote, isTied: boolean): FretLabelData {
  if (note.fret < 0) return { label: '', fill: '#e8e8e8', fontStyle: 'normal' }
  if (isTied) return { label: `(${note.fret})`, fill: '#666', fontStyle: 'normal' }
  if (note.modifiers.dead) return { label: 'X', fill: '#cc4444', fontStyle: 'normal' }
  if (note.modifiers.naturalHarmonic) return { label: `<${note.fret}>`, fill: '#88ccff', fontStyle: 'italic' }
  if (note.modifiers.ghost) return { label: `(${note.fret})`, fill: '#888888', fontStyle: 'normal' }
  return { label: String(note.fret), fill: '#e8e8e8', fontStyle: 'normal' }
}

export function computeBeatPositions(m: Measure, showTimeSig = false, fillRests: DurationValue[] = [], showBpm = false, beatWidthScale = 1.0): BeatPosition[] {
  const positions: BeatPosition[] = []
  let x = MEASURE_BEATS_OFFSET + (showTimeSig ? TIME_SIG_W : 0) + (showBpm ? BPM_LABEL_W : 0)
  for (let i = 0; i < m.beats.length; i++) {
    const beat = m.beats[i]!
    const rightW = BEAT_WIDTHS[beat.duration] * beatWidthScale
    const w = BEAT_LEFT_PAD + rightW + (beatHasBend(beat) ? BEND_EXTRA_W : 0)
    positions.push({ x, cx: x + BEAT_LEFT_PAD, w })
    x += w
  }
  for (const d of fillRests) {
    const w = BEAT_LEFT_PAD + BEAT_WIDTHS[d] * beatWidthScale
    positions.push({ x, cx: x + BEAT_LEFT_PAD, w })
    x += w
  }
  return positions
}
