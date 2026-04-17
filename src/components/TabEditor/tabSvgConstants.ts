import type { Measure } from '../../tabEditorTypes'
import { BEAT_WIDTHS } from '../../tabEditorState'

export const STRING_SPACING = 24
export const STRING_LABEL_W = 28
export const MEASURE_NUMBER_H = 16
export const TECHNIQUE_ZONE_H = 18
export const DURATION_MARK_H = 12
// Top zone order (from y=0 downward): MEASURE_NUMBER_H | TECHNIQUE_ZONE_H | DURATION_MARK_H | strings…
export const TOP_MARGIN = MEASURE_NUMBER_H + TECHNIQUE_ZONE_H + DURATION_MARK_H
export const BOTTOM_PADDING = 8
export const BARLINE_W = 2
export const TIME_SIG_W = 40 // horizontal space reserved for a stacked time signature

export function rowSvgHeight(stringCount: number): number {
  return TOP_MARGIN + stringCount * STRING_SPACING + BOTTOM_PADDING
}

export function stringY(si: number, stringCount: number): number {
  return TOP_MARGIN + (stringCount - 1 - si) * STRING_SPACING
}

export function measureWidth(m: Measure, showTimeSig = false): number {
  return BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + m.beats.reduce((s, b) => s + BEAT_WIDTHS[b.duration], 0) + BARLINE_W
}

export interface BeatPosition {
  x: number  // left edge of beat (after left barline)
  cx: number // center x
  w: number  // width
}

export function computeBeatPositions(m: Measure, showTimeSig = false): BeatPosition[] {
  const positions: BeatPosition[] = []
  let x = BARLINE_W + (showTimeSig ? TIME_SIG_W : 0)
  for (const beat of m.beats) {
    const w = BEAT_WIDTHS[beat.duration]
    positions.push({ x, cx: x + w / 2, w })
    x += w
  }
  return positions
}
