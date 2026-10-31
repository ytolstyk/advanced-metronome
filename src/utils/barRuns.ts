/** Colours cycled through when turning runs of bars into click-track segments. */
export const CLICK_RUN_PALETTE = [
  '#8b5cf6', '#38bdf8', '#34d399', '#fbbf24',
  '#fb7185', '#fb923c', '#2dd4bf', '#94a3b8',
]

export function newPieceId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** What makes two consecutive bars the same click-track segment. */
export interface BarShape {
  numerator: number
  denominator: number
  bpm: number
}

export interface BarRun<T extends BarShape> {
  /** Index of the run's first bar in the input. */
  start: number
  first: T
  repeats: number
}

export interface GroupBarRunsOptions<T extends BarShape> {
  /** A run never grows past this many bars; the next bar starts a new run of the same shape. */
  maxRepeats?: number
  /** Return true to force a new run at `bar` even though it has the same shape as `prev`. */
  breakBefore?: (bar: T, index: number, prev: T) => boolean
}

const sameShape = (a: BarShape, b: BarShape) =>
  a.numerator === b.numerator && a.denominator === b.denominator && a.bpm === b.bpm

/** Groups consecutive bars with the same time signature and tempo into runs. Pure. */
export function groupBarRuns<T extends BarShape>(
  bars: readonly T[],
  { maxRepeats, breakBefore }: GroupBarRunsOptions<T> = {},
): Array<BarRun<T>> {
  const runs: Array<BarRun<T>> = []
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!
    const prev = bars[i - 1]
    const last = runs[runs.length - 1]
    const extendsLast =
      last !== undefined &&
      prev !== undefined &&
      sameShape(prev, bar) &&
      !breakBefore?.(bar, i, prev) &&
      (maxRepeats === undefined || last.repeats < maxRepeats)
    if (extendsLast) last.repeats++
    else runs.push({ start: i, first: bar, repeats: 1 })
  }
  return runs
}
