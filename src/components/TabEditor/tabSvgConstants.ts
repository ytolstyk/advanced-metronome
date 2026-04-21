import type { Measure } from '../../tabEditorTypes'
import { BEAT_WIDTH } from '../../tabEditorState'

export const STRING_SPACING = 20
export const STRING_LABEL_W = 28
export const MEASURE_NUMBER_H = 16
export const TECHNIQUE_ZONE_H = 42
export const DURATION_MARK_H = 0
// Top zone order (from y=0 downward): MEASURE_NUMBER_H | TECHNIQUE_ZONE_H | strings…
export const TOP_MARGIN = MEASURE_NUMBER_H + TECHNIQUE_ZONE_H + DURATION_MARK_H

// Y positions for specific technique rows within TECHNIQUE_ZONE_H
export const TAPPING_ZONE_Y = MEASURE_NUMBER_H + 20    // row 1: tapping "T"
export const VIBRATO_ZONE_Y = MEASURE_NUMBER_H + 20   // row 2: vibrato sine wave
export const PALM_MUTE_ZONE_Y = MEASURE_NUMBER_H + 20 // row 3: palm mute bracket
export const BOTTOM_PADDING = 8
export const BARLINE_W = 2
export const TIME_SIG_W = 40 // horizontal space reserved for a stacked time signature
export const BPM_LABEL_W = 52 // horizontal space reserved for a BPM display

export function rowSvgHeight(stringCount: number): number {
  return TOP_MARGIN + stringCount * STRING_SPACING + BOTTOM_PADDING
}

export function stringY(si: number, stringCount: number): number {
  return TOP_MARGIN + (stringCount - 1 - si) * STRING_SPACING
}

// virtualSlots: 0 or 1 — whether to include width for the pending virtual beat slot
export function measureWidth(m: Measure, showTimeSig = false, virtualSlots = 0, showBpm = false): number {
  return BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + (showBpm ? BPM_LABEL_W : 0) + (m.beats.length + virtualSlots) * BEAT_WIDTH + BARLINE_W
}

export interface BeatPosition {
  x: number  // left edge of beat (after left barline)
  cx: number // center x
  w: number  // width
}

export function computeBeatPositions(m: Measure, showTimeSig = false, virtualSlots = 0, showBpm = false): BeatPosition[] {
  const positions: BeatPosition[] = []
  let x = BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + (showBpm ? BPM_LABEL_W : 0)
  const totalSlots = m.beats.length + virtualSlots
  for (let i = 0; i < totalSlots; i++) {
    positions.push({ x, cx: x + BEAT_WIDTH / 2, w: BEAT_WIDTH })
    x += BEAT_WIDTH
  }
  return positions
}
