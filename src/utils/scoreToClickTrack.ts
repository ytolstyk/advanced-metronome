import * as at from '@coderline/alphatab'
import type { TrackPiece } from '../audio/ClickTrackEngine'
import { CLICK_BPM_MAX, CLICK_BPM_MIN, DEFAULT_BPM } from '../constants'
import { CLICK_RUN_PALETTE, groupBarRuns, newPieceId, type BarRun } from './barRuns'
import { sanitizeText } from './sanitizeText'

/**
 * Turns a Guitar Pro / AlphaTex score into click-track segments. Entirely local (no network).
 *
 * Bars come from alphaTab's own playback order (`MidiFileGenerator`'s tick lookup), so repeats,
 * alternate endings and D.C./D.S. jumps are already expanded the way the song plays. The score's
 * tracks must stay in place while generating: an anacrusis (pickup) bar takes its length from its
 * tracks' bars, so stripping them makes every pickup 0 ticks long.
 *
 * Entry point for callers: `importScoreFile` (file -> bars) then `barsToPieces` (bars -> segments).
 */

// ── Limits ──────────────────────────────────────────────────────────────────
/** Real Guitar Pro files are well under 1 MB. */
export const MAX_FILE_BYTES = 3 * 1024 * 1024
/** What a zip may claim to unpack to (alphaTab inflates with no output limit of its own). */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024
/** A '|' ends a bar in AlphaTex, and every track repeats them; alphaTab builds the whole score before any bar limit applies. */
const MAX_ALPHATEX_BAR_LINES = 20000
const MAX_WRITTEN_BARS = 2000
/** Tempo changes in one bar; tempoOfBar copies and sorts them for every played copy of the bar. */
const MAX_TEMPO_CHANGES_PER_BAR = 500
/** Bars in the repeat-expanded sequence. alphaTab has no cap of its own, so hostile repeats/jumps could run forever. */
export const MAX_PLAYED_BARS = 2000
/** Wall-clock budget for expanding the song; a typical song takes well under 300 ms. */
export const DEFAULT_BUDGET_MS = 3000
/** The longest click track we build: WAV export renders it in memory (~10 MB per minute of stereo float audio). */
export const MAX_SECONDS = 1800
export const MAX_PIECES = 400
/** Roughly where a share link stops fitting (~390 URL characters per imported segment against an 8000 limit). */
export const WARN_PIECES = 20
export const MAX_CLICKS_PER_MINUTE = 300
const MAX_REPEATS_PER_PIECE = 99
const MAX_NUMERATOR = 32
const VALID_DENOMINATORS = [1, 2, 4, 8, 16, 32]
const TITLE_MAX = 100
const ARTIST_MAX = 100
const SECTION_MAX = 40
/** A segment label is "<section> (n/d ♩=bpm)", so it needs room beyond the section name. */
const LABEL_MAX = 60
/** How often the hostile-file guards look at the clock (checking every call would dominate the cost). */
const BEATS_PER_CLOCK_CHECK = 64
const READS_PER_CLOCK_CHECK = 256

const TICKS_PER_QUARTER = 960
const TICKS_PER_WHOLE = TICKS_PER_QUARTER * 4
/** A pickup bar can be expressed as k/4, k/8, k/16 or k/32: the finest unit is a 32nd note. */
const FINEST_DENOMINATOR = 32
const COARSEST_DERIVED_DENOMINATOR = 4
const TICKS_PER_FINEST_UNIT = TICKS_PER_WHOLE / FINEST_DENOMINATOR
/** GP3-5 files mark EVERY tempo change `isLinear`, so there `isLinear` says nothing about ramps. */
const GP3_TO_5 = new Set(['gp3', 'gp4', 'gp5'])

const NOT_READABLE = 'That doesn\'t look like a readable Guitar Pro or AlphaTex file.'
const GPX_UNSUPPORTED = 'Guitar Pro 6 (.gpx) files aren\'t supported yet. In Guitar Pro, save the song as a .gp file (Guitar Pro 7 or later) and import that.'

// ── Types ───────────────────────────────────────────────────────────────────
export interface ImportWarning {
  code: WarningCode
  message: string
  count: number
  /** 1-based number of the first affected bar in the played sequence (including any pickup). */
  firstBar: number
}

export interface PlayedBar {
  numerator: number
  denominator: number
  bpm: number
  section?: string
  isPickup: boolean
}

export interface ImportMeta {
  title: string
  artist: string
  writtenBars: number
  hasGradualTempo: boolean
}

export interface ImportStats {
  writtenBars: number
  playedBars: number
  segments: number
  bpmMin: number
  bpmMax: number
  signatures: string[]
  /** The largest denominator in use (8 means eighth-note clicks or finer). */
  finestDenominator: number
  /** Length of the imported track at 100% speed, in seconds. */
  seconds: number
  peakClicksPerMin: number
}

export interface ImportOptions {
  /** Wall-clock budget for expanding repeats (tests pass a small value). */
  budgetMs?: number
}

export type ImportedSong = { bars: PlayedBar[]; meta: ImportMeta; warnings: ImportWarning[] }

export const pluralize = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Half a BPM as a share of the slowest tempo: the most the whole-BPM rounding can shift the length. */
export const maxRoundingErrorPercent = (slowestBpm: number): number => 50 / slowestBpm

// ── Warnings ────────────────────────────────────────────────────────────────
type WarningMessage = (count: number, firstBar: number, detail: number) => string

const WARNING_TEXT = {
  'mid-bar-tempo': (n, bar) => `Tempo changes partway through ${pluralize(n, 'bar')} (first: bar ${bar}); each is imported at its time-averaged tempo.`,
  'bad-tempo': (n, bar) => `No usable tempo for ${pluralize(n, 'bar')} (first: bar ${bar}); the previous bar's tempo is reused.`,
  'tempo-clamped': (n, bar) => `A tempo outside ${CLICK_BPM_MIN}-${CLICK_BPM_MAX} BPM in ${pluralize(n, 'bar')} (first: bar ${bar}) was limited to that range.`,
  'free-time': (n, bar) => `Free-time in ${pluralize(n, 'bar')} (first: bar ${bar}); imported at the stated tempo.`,
  'fermata': (n, bar) => `A fermata in ${pluralize(n, 'bar')} (first: bar ${bar}); the click does not pause.`,
  'full-pickup-flag': (n, bar) => `${pluralize(n, 'bar')} marked as a pickup (first: bar ${bar}) ${n === 1 ? 'is a full bar and was' : 'are full bars and were'} imported as normal.`,
  'rest-pickup': (n, bar) => `${pluralize(n, 'bar')} marked as a pickup (first: bar ${bar}) ${n === 1 ? 'is a whole-bar rest and was' : 'are whole-bar rests and were'} imported as full.`,
  'long-pickup': (n, bar) => `${pluralize(n, 'bar')} marked as a pickup (first: bar ${bar}) ${n === 1 ? 'is' : 'are'} longer than the time signature; imported with the real length.`,
  'skipped-pickup': (n) => `${pluralize(n, 'opening bar')} with a length that cannot be clicked (a tuplet) ${n === 1 ? 'was' : 'were'} left out.`,
  // count = bars that play, detail = bars written
  'repeats-expanded': (played, _bar, written) => `Repeats and jumps expanded: ${written} written bars play as ${played}.`,
  // count = segments
  'many-segments': (segments) => `This song becomes ${segments} segments, which is slow to edit and too big to share as a link (Save to Cloud works).`,
  // count = clicks per minute
  'fast-clicks': (rate, bar) => `The click reaches ${rate} clicks per minute (bar ${bar}). Set that segment's subdivision to whole-bar, or lower its BPM, if that is too fast.`,
} satisfies Record<string, WarningMessage>

export type WarningCode = keyof typeof WARNING_TEXT

function makeWarning(code: WarningCode, count: number, firstBar: number, detail = 0): ImportWarning {
  return { code, count, firstBar, message: WARNING_TEXT[code](count, firstBar, detail) }
}

/** Collects counted, first-occurrence warnings so a 200-bar issue is one line, not 200. */
class WarningLog {
  private readonly entries = new Map<WarningCode, { count: number; firstBar: number }>()
  add(code: WarningCode, bar: number) {
    const entry = this.entries.get(code)
    if (entry) entry.count++
    else this.entries.set(code, { count: 1, firstBar: bar })
  }
  list(): ImportWarning[] {
    return [...this.entries].map(([code, { count, firstBar }]) => makeWarning(code, count, firstBar))
  }
}

// ── Reading a file ──────────────────────────────────────────────────────────
const readUint32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
const readUint16 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true)
const ZIP_LOCAL_HEADER = 0x04034b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50
const ZIP_CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const ZIP_END_RECORD_SCAN = 0xffff + 22 // a trailing comment can be up to 64 KB
const ZIP_DATA_DESCRIPTOR_FLAG = 0x8

/** Sum of the unpacked sizes a zip's central directory claims; 0 when the directory can't be read. */
function zipCentralDirectorySize(bytes: Uint8Array): number {
  const lowest = Math.max(0, bytes.length - ZIP_END_RECORD_SCAN)
  for (let end = bytes.length - 22; end >= lowest; end--) {
    if (readUint32(bytes, end) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue
    const entries = readUint16(bytes, end + 10)
    let offset = readUint32(bytes, end + 16)
    let total = 0
    for (let i = 0; i < entries; i++) {
      if (offset + 46 > bytes.length || readUint32(bytes, offset) !== ZIP_CENTRAL_DIRECTORY_ENTRY) break
      total += readUint32(bytes, offset + 24)
      offset += 46 + readUint16(bytes, offset + 28) + readUint16(bytes, offset + 30) + readUint16(bytes, offset + 32)
    }
    return total
  }
  return 0
}

/** Sum of the unpacked sizes the local file headers claim, walked front to back the way alphaTab reads a zip. */
function zipLocalHeaderSize(bytes: Uint8Array): number {
  let offset = 0
  let total = 0
  while (offset + 30 <= bytes.length && readUint32(bytes, offset) === ZIP_LOCAL_HEADER) {
    total += readUint32(bytes, offset + 22)
    // With a data descriptor the sizes come after the data, so the walk can't continue.
    if (readUint16(bytes, offset + 6) & ZIP_DATA_DESCRIPTOR_FLAG) break
    offset += 30 + readUint16(bytes, offset + 26) + readUint16(bytes, offset + 28) + readUint32(bytes, offset + 18)
  }
  return total
}

/**
 * Cheap pre-parse check of what a zip (.gp) CLAIMS to unpack to, because alphaTab inflates every entry
 * with no output limit. It reads both the central directory and the local headers (alphaTab ignores the
 * directory, so a zip with the directory stripped would otherwise slip through). A zip that lies in
 * every header it has, or that uses data descriptors, is not caught: that residual risk is a freeze or
 * crash of the tab of the person who picked the file.
 */
export function declaredSizeTooLarge(bytes: Uint8Array): boolean {
  if (bytes.length < 30 || readUint32(bytes, 0) !== ZIP_LOCAL_HEADER) return false
  return Math.max(zipCentralDirectorySize(bytes), zipLocalHeaderSize(bytes)) > MAX_UNPACKED_BYTES
}

/** Guitar Pro 6 containers ("BCFZ" compressed or "BCFS" plain). */
const isGpxContainer = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x42 && bytes[1] === 0x43 && bytes[2] === 0x46 && (bytes[3] === 0x5a || bytes[3] === 0x53)

/** A zip (.gp) or a GP3-5 binary ("FICHIER GUITAR PRO ..." after a length byte); anything else is read as AlphaTex text. */
const GP3_TO_5_SIGNATURE = new TextEncoder().encode('FICHIER GUITAR PRO')
function isBinaryScore(bytes: Uint8Array): boolean {
  if (bytes.length >= 4 && readUint32(bytes, 0) === ZIP_LOCAL_HEADER) return true
  return bytes.length > GP3_TO_5_SIGNATURE.length && GP3_TO_5_SIGNATURE.every((byte, i) => bytes[i + 1] === byte)
}

const BAR_LINE = 0x7c // '|'
function countBarLines(bytes: Uint8Array): number {
  let count = 0
  for (const byte of bytes) if (byte === BAR_LINE) count++
  return count
}

export async function parseScoreFile(file: File): Promise<{ score: at.model.Score; ext: string } | { error: string }> {
  if (file.size > MAX_FILE_BYTES) return { error: `That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB, which is far more than a Guitar Pro file should be.` }
  const dot = file.name.lastIndexOf('.')
  const ext = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase()
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // alphaTab's .gpx reader can be driven to gigabytes by a few MB (a sector chain amplifies about 1000x),
    // and .gpx was never verified against real files, so it is refused until it has a bounded reader.
    if (isGpxContainer(bytes)) return { error: GPX_UNSUPPORTED }
    if (declaredSizeTooLarge(bytes)) return { error: 'That file claims to unpack to far more data than a Guitar Pro file should hold.' }
    // alphaTab falls back to reading ANY text as AlphaTex, whatever the file is called, so this is decided by content.
    if (!isBinaryScore(bytes) && countBarLines(bytes) > MAX_ALPHATEX_BAR_LINES) return { error: 'That AlphaTex file has far too many bars to be a song.' }
    const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, new at.Settings())
    return { score, ext }
  } catch {
    // UnsupportedFormatError for non-score bytes, RangeError for truncated binary GP3-5 files, etc.
    return { error: NOT_READABLE }
  }
}

// ── Expanding the score ─────────────────────────────────────────────────────
class ImportLimitError extends Error {
  readonly reason: 'bars' | 'time'
  constructor(reason: 'bars' | 'time') {
    super(reason)
    this.reason = reason
  }
}

const ignore = () => undefined
/** The tick lookup is all we need, so every MIDI event the generator would store is thrown away. */
const NO_OP_MIDI_HANDLER: at.midi.IMidiFileHandler = {
  addTimeSignature: ignore,
  addRest: ignore,
  addNote: ignore,
  addControlChange: ignore,
  addProgramChange: ignore,
  addTempo: ignore,
  addNoteBend: ignore,
  addBend: ignore,
  finishTrack: ignore,
  addTickShift: ignore,
}

/**
 * Generates once so alphaTab fills its tick lookup with the played-order bars, with guards against
 * hostile files (alphaTab has no limit of its own). Verified against alphaTab 1.8.2; the hostile-file
 * tests are the early warning if an upgrade changes how it calls these members.
 * - `addMasterBar` counts played bars and checks the clock. It runs BEFORE a bar's beats are generated.
 * - `addBeat` (every 64th call) catches one dense repeated bar that the per-bar check can't interrupt.
 * - `alternateEndings` is read on every step of the repeat walk, including steps that skip a bar and so
 *   never reach the two hooks above (deeply nested alternate endings can loop for hours without emitting
 *   a bar), so reading it checks the clock too.
 */
function playedOrderBars(score: at.model.Score, budgetMs: number): at.midi.MasterBarTickLookup[] {
  const generator = new at.midi.MidiFileGenerator(score, new at.Settings(), NO_OP_MIDI_HANDLER)
  const lookup = generator.tickLookup
  const startedAt = performance.now()
  const checkClock = () => {
    if (performance.now() - startedAt > budgetMs) throw new ImportLimitError('time')
  }

  let bars = 0
  const addMasterBar = lookup.addMasterBar.bind(lookup)
  lookup.addMasterBar = (masterBar: at.midi.MasterBarTickLookup) => {
    if (++bars > MAX_PLAYED_BARS) throw new ImportLimitError('bars')
    checkClock()
    addMasterBar(masterBar)
  }

  let beats = 0
  const addBeat = lookup.addBeat.bind(lookup)
  lookup.addBeat = (beat: at.model.Beat, start: number, duration: number) => {
    if (++beats % BEATS_PER_CLOCK_CHECK === 0) checkClock()
    addBeat(beat, start, duration)
  }

  let reads = 0
  const endings = score.masterBars.map((masterBar) => masterBar.alternateEndings)
  score.masterBars.forEach((masterBar, i) => {
    Object.defineProperty(masterBar, 'alternateEndings', {
      configurable: true,
      get: () => {
        if (++reads % READS_PER_CLOCK_CHECK === 0) checkClock()
        return endings[i]
      },
      set: (value: number) => {
        endings[i] = value
      },
    })
  })

  try {
    generator.generate()
  } finally {
    score.masterBars.forEach((masterBar, i) => {
      Object.defineProperty(masterBar, 'alternateEndings', { value: endings[i], writable: true, configurable: true, enumerable: true })
    })
  }
  return lookup.masterBars
}

const isUsableTempo = (tempo: unknown): tempo is number => typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0

/**
 * A bar's tempo. The initial tempo is the LAST change at or before the bar start (a zero-length bar
 * can carry two at the same tick). Changes inside the bar are averaged by time (harmonic mean), which
 * preserves the bar's real duration.
 */
function tempoOfBar(entry: at.midi.MasterBarTickLookup, fallback: number): { bpm: number; averaged: boolean; fellBack: boolean } {
  const changes = entry.tempoChanges.filter((c) => Number.isFinite(c.tick)).sort((a, b) => a.tick - b.tick)
  const [firstChange] = changes
  let initial: number | undefined
  for (const change of changes) if (change.tick <= entry.start) initial = change.tempo

  // A tempo of 0, NaN or nothing at all: reuse the previous bar's tempo.
  let fellBack = changes.length < entry.tempoChanges.length // a change at an unusable tick was dropped
  if (!isUsableTempo(initial)) {
    fellBack = fellBack || initial !== undefined || firstChange === undefined || firstChange.tick > entry.start
    initial = fallback
  }

  const inside = changes.filter((c) => c.tick > entry.start && c.tick < entry.end)
  const ticks = entry.end - entry.start
  if (inside.length === 0 || ticks <= 0) return { bpm: initial, averaged: false, fellBack }

  let current = initial
  let cursor = entry.start
  let quartersTaken = 0
  const distinct = new Set([initial])
  for (const change of inside) {
    quartersTaken += (change.tick - cursor) / current
    cursor = change.tick
    if (isUsableTempo(change.tempo)) current = change.tempo
    else fellBack = true
    distinct.add(current)
  }
  quartersTaken += (entry.end - cursor) / current
  return { bpm: ticks / quartersTaken, averaged: distinct.size > 1, fellBack }
}

/** A bar length in ticks as the coarsest of k/4, k/8, k/16, k/32; null when it is not a whole number of 32nds or k > 32. */
function signatureFromTicks(ticks: number): { numerator: number; denominator: number } | null {
  if (ticks <= 0 || ticks % TICKS_PER_FINEST_UNIT !== 0) return null
  let numerator = ticks / TICKS_PER_FINEST_UNIT
  let denominator = FINEST_DENOMINATOR
  while (numerator % 2 === 0 && denominator > COARSEST_DERIVED_DENOMINATOR) {
    numerator /= 2
    denominator /= 2
  }
  return numerator <= MAX_NUMERATOR ? { numerator, denominator } : null
}

type BarShapeResult =
  | { kind: 'bar'; signature: { numerator: number; denominator: number }; isPickup: boolean }
  | { kind: 'skip' }
  | { kind: 'error'; message: string }

/**
 * The time signature of one played bar. Its real length (end - start ticks) wins over the declared
 * signature, because that is how an anacrusis (pickup) bar reports itself.
 *
 *   flagged anacrusis | length vs declared signature | result
 *   yes               | 0 ticks (whole-bar rest)     | full bar at the declared signature            ('rest-pickup')
 *   yes               | shorter                      | pickup with the derived signature; if that
 *                     |                              | can't be derived: skipped at the very start,
 *                     |                              | an error anywhere else (skipping would shift the click)
 *   yes               | equal                        | full bar                                      ('full-pickup-flag')
 *   yes               | longer                       | derived signature, not a pickup               ('long-pickup')
 *   no                | equal                        | declared signature
 *   no                | different (not expected)     | derived signature, or an error
 */
function resolveBarShape(masterBar: at.model.MasterBar, ticks: number, barNo: number, isFirst: boolean, warnings: WarningLog): BarShapeResult {
  const declared = { numerator: masterBar.timeSignatureNumerator, denominator: masterBar.timeSignatureDenominator }
  if (declared.numerator < 1 || declared.numerator > MAX_NUMERATOR || !VALID_DENOMINATORS.includes(declared.denominator)) {
    return {
      kind: 'error',
      message: `Bar ${barNo} is in ${declared.numerator}/${declared.denominator}, which can't be clicked (numerators 1-${MAX_NUMERATOR}, denominators ${VALID_DENOMINATORS.join(', ')}).`,
    }
  }

  const flagged = masterBar.isAnacrusis
  const declaredTicks = (TICKS_PER_WHOLE * declared.numerator) / declared.denominator
  if (flagged && ticks === 0) {
    warnings.add('rest-pickup', barNo)
    return { kind: 'bar', signature: declared, isPickup: false }
  }
  if (ticks === declaredTicks) {
    if (flagged) warnings.add('full-pickup-flag', barNo)
    return { kind: 'bar', signature: declared, isPickup: false }
  }

  const isShort = ticks < declaredTicks
  const derived = signatureFromTicks(ticks)
  if (!derived) {
    if (flagged && isShort && isFirst) {
      warnings.add('skipped-pickup', barNo)
      return { kind: 'skip' }
    }
    return { kind: 'error', message: `Bar ${barNo} has a length that can't be turned into a time signature.` }
  }
  if (flagged && !isShort) warnings.add('long-pickup', barNo)
  return { kind: 'bar', signature: derived, isPickup: flagged && isShort }
}

/** The whole-BPM tempo of one played bar, limited to the click track's range. */
function resolveBarBpm(entry: at.midi.MasterBarTickLookup, previousBpm: number, barNo: number, warnings: WarningLog): number {
  const tempo = tempoOfBar(entry, previousBpm)
  if (tempo.fellBack) warnings.add('bad-tempo', barNo)
  if (tempo.averaged) warnings.add('mid-bar-tempo', barNo)
  const rounded = Math.round(tempo.bpm)
  const bpm = Math.min(CLICK_BPM_MAX, Math.max(CLICK_BPM_MIN, rounded))
  if (bpm !== rounded) warnings.add('tempo-clamped', barNo)
  return bpm
}

function collectPlayedBars(played: at.midi.MasterBarTickLookup[], initialBpm: number, warnings: WarningLog): { bars: PlayedBar[] } | { error: string } {
  const bars: PlayedBar[] = []
  let previousBpm = initialBpm
  for (const entry of played) {
    const barNo = bars.length + 1
    const masterBar = entry.masterBar
    const shape = resolveBarShape(masterBar, entry.end - entry.start, barNo, bars.length === 0, warnings)
    if (shape.kind === 'error') return { error: shape.message }
    if (shape.kind === 'skip') continue

    previousBpm = resolveBarBpm(entry, previousBpm, barNo, warnings)
    if (masterBar.isFreeTime) warnings.add('free-time', barNo)
    if (masterBar.fermata !== null && masterBar.fermata.size > 0) warnings.add('fermata', barNo)

    const section = sanitizeText(masterBar.section?.text ?? '', SECTION_MAX)
    bars.push({
      numerator: shape.signature.numerator,
      denominator: shape.signature.denominator,
      bpm: previousBpm,
      ...(section ? { section } : {}),
      isPickup: shape.isPickup,
    })
  }
  return { bars }
}

export function importFromScore(
  score: at.model.Score,
  ext: string,
  { budgetMs = DEFAULT_BUDGET_MS }: ImportOptions = {},
): ImportedSong | { error: string } {
  const writtenBars = score.masterBars.length
  if (writtenBars === 0) return { error: 'This file has no bars to import.' }
  if (writtenBars > MAX_WRITTEN_BARS) return { error: `This song has ${writtenBars} bars; the limit is ${MAX_WRITTEN_BARS}.` }

  const crowded = score.masterBars.find((mb) => mb.tempoAutomations.length > MAX_TEMPO_CHANGES_PER_BAR)
  if (crowded) return { error: `Bar ${crowded.index + 1} has more than ${MAX_TEMPO_CHANGES_PER_BAR} tempo changes, which is far more than a song needs.` }

  let played: at.midi.MasterBarTickLookup[]
  try {
    played = playedOrderBars(score, budgetMs)
  } catch (e) {
    if (!(e instanceof ImportLimitError)) return { error: 'Could not work out how this song repeats.' }
    return {
      error: e.reason === 'bars'
        ? 'The repeat structure of this song is too large to import.'
        : 'This file is too complex to import on this device.',
    }
  }

  const warnings = new WarningLog()
  const collected = collectPlayedBars(played, isUsableTempo(score.tempo) ? score.tempo : DEFAULT_BPM, warnings)
  if ('error' in collected) return collected
  const { bars } = collected
  if (bars.length === 0) return { error: 'This file has no bars to import.' }

  const warningList = warnings.list()
  // Decided from the played order: a skipped opening pickup also changes the bar count, and a jump that
  // skips bars can cancel a repeat's extra bars.
  const expanded = played.some((entry, i) => entry.masterBar.index !== i)
  if (expanded) warningList.unshift(makeWarning('repeats-expanded', played.length, 1, writtenBars))
  return {
    bars,
    meta: {
      title: sanitizeText(score.title ?? '', TITLE_MAX),
      artist: sanitizeText(score.artist ?? '', ARTIST_MAX),
      writtenBars,
      // isLinear only means a ramp outside GP3-5 files.
      hasGradualTempo: !GP3_TO_5.has(ext) && score.masterBars.some((mb) => mb.tempoAutomations.some((a) => a.isLinear)),
    },
    warnings: warningList,
  }
}

/** Reads, parses and expands a picked file. The only function a caller needs; alphaTab types stay inside. */
export async function importScoreFile(file: File, options?: ImportOptions): Promise<ImportedSong | { error: string }> {
  const parsed = await parseScoreFile(file)
  if ('error' in parsed) return parsed
  return importFromScore(parsed.score, parsed.ext, options)
}

// ── Click-track segments ────────────────────────────────────────────────────
const clicksPerMinute = (bar: { bpm: number; denominator: number }) => (bar.bpm * bar.denominator) / 4

function runsToPieces(runs: Array<BarRun<PlayedBar>>): TrackPiece[] {
  return runs.map((run, i) => {
    const { numerator, denominator, bpm, section } = run.first
    const base = `${numerator}/${denominator} ♩=${bpm}`
    return {
      id: newPieceId(),
      // Section first, so the length cap keeps the part that names the section.
      label: sanitizeText(section ? `${section} (${base})` : base, LABEL_MAX),
      color: CLICK_RUN_PALETTE[i % CLICK_RUN_PALETTE.length]!, // palette length is fixed and non-zero
      groupId: null,
      timeSignature: { numerator, denominator },
      subdivision: 'quarter',
      bpm,
      repeats: run.repeats,
    }
  })
}

/** The fastest click rate among the segments and the (numbered) bar it first occurs at. */
function findPeakClickRate(runs: Array<BarRun<PlayedBar>>, firstBarNo: number): { rate: number; bar: number } {
  let peak = { rate: 0, bar: firstBarNo }
  for (const run of runs) {
    const rate = clicksPerMinute(run.first)
    if (rate > peak.rate) peak = { rate, bar: firstBarNo + run.start }
  }
  return peak
}

function summarizeBars(list: PlayedBar[]): Pick<ImportStats, 'bpmMin' | 'bpmMax' | 'signatures' | 'finestDenominator' | 'seconds'> {
  const signatures: string[] = []
  let seconds = 0
  let bpmMin = Infinity
  let bpmMax = -Infinity
  let finestDenominator = 0
  for (const bar of list) {
    const label = `${bar.numerator}/${bar.denominator}`
    if (!signatures.includes(label)) signatures.push(label)
    seconds += (bar.numerator * 60 * 4) / (bar.bpm * bar.denominator)
    bpmMin = Math.min(bpmMin, bar.bpm)
    bpmMax = Math.max(bpmMax, bar.bpm)
    finestDenominator = Math.max(finestDenominator, bar.denominator)
  }
  return { bpmMin, bpmMax, signatures, finestDenominator, seconds }
}

export function barsToPieces(
  bars: PlayedBar[],
  meta: ImportMeta,
  { includePickup }: { includePickup: boolean },
): { pieces: TrackPiece[]; stats: ImportStats; warnings: ImportWarning[] } | { error: string } {
  const skipFirst = !includePickup && bars[0]?.isPickup === true
  const list = skipFirst ? bars.slice(1) : bars
  if (list.length === 0) return { error: 'There are no bars left to import.' }
  const firstBarNo = bars.length - list.length + 1 // bar numbers always count the pickup

  const summary = summarizeBars(list)
  if (summary.seconds > MAX_SECONDS) {
    return { error: `This song runs ${Math.round(summary.seconds / 60)} minutes at 100% speed; click tracks are limited to ${MAX_SECONDS / 60} minutes.` }
  }

  const runs = groupBarRuns(list, {
    maxRepeats: MAX_REPEATS_PER_PIECE,
    // A new section, and a pickup on either side, always start a new segment.
    breakBefore: (bar, _index, prev) => bar.section !== undefined || bar.isPickup || prev.isPickup,
  })
  if (runs.length > MAX_PIECES) {
    return {
      error: `This song changes tempo or meter in too many places (${runs.length} segments) to edit as a click track; the limit is ${MAX_PIECES}.`,
    }
  }

  const warnings: ImportWarning[] = []
  if (runs.length > WARN_PIECES) warnings.push(makeWarning('many-segments', runs.length, firstBarNo))
  const peak = findPeakClickRate(runs, firstBarNo)
  if (peak.rate > MAX_CLICKS_PER_MINUTE) warnings.push(makeWarning('fast-clicks', Math.round(peak.rate), peak.bar))

  return {
    pieces: runsToPieces(runs),
    stats: {
      writtenBars: meta.writtenBars,
      playedBars: list.length,
      segments: runs.length,
      ...summary,
      peakClicksPerMin: peak.rate,
    },
    warnings,
  }
}
