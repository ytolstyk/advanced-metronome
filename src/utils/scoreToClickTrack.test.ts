import { describe, it, expect } from 'vitest'
import * as at from '@coderline/alphatab'
import {
  barsToPieces,
  declaredSizeTooLarge,
  importFromScore,
  importScoreFile,
  MAX_FILE_BYTES,
  MAX_PIECES,
  MAX_SECONDS,
  parseScoreFile,
  WARN_PIECES,
  type ImportMeta,
  type PlayedBar,
} from './scoreToClickTrack'

// ── Fixtures ────────────────────────────────────────────────────────────────
// alphaTex: `\tempo`, `\ts n d` (time signature), `\ro` / `\rc N` (repeat open / close with N plays),
// `\ae` (alternate ending), `\ac` (anacrusis), `\section`, `{tempo N}` on a beat. `f.s.d` = fret.string.duration.
const load = (tex: string): at.model.Score =>
  at.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(tex), new at.Settings())

const imported = (tex: string, ext = 'alphatex') => {
  const result = importFromScore(load(tex), ext)
  if ('error' in result) throw new Error(`import failed: ${result.error}`)
  return result
}

const shape = (bars: PlayedBar[]) => bars.map((b) => `${b.numerator}/${b.denominator}@${b.bpm}${b.isPickup ? 'p' : ''}`)
const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code)

/** Distinguishes bars by section label so the played order can be read back. */
const sectionsOf = (tex: string) => imported(tex).bars.map((b) => b.section)

/** A dense score: tracks x bars of 64th-note beats; `hostile` wraps the bars in nested `\rc 99` repeats. */
function denseTex(tracks: number, barCount: number, perBar: number, hostile: boolean): string {
  let tex = '\\tempo 120\n\\ts 4 4\n'
  const body = Array(perBar).fill('3.3.64').join(' ')
  for (let t = 0; t < tracks; t++) {
    tex += `\\track "t${t}"\n\\staff{tabs}\n`
    for (let b = 0; b < barCount; b++) {
      const prefix = t === 0 && hostile ? (b < 3 ? '\\ro ' : b >= barCount - 3 ? '\\rc 99 ' : '') : ''
      tex += `${prefix}${body} |\n`
    }
  }
  return tex
}

const meta = (overrides: Partial<ImportMeta> = {}): ImportMeta => ({ title: '', artist: '', writtenBars: 0, hasGradualTempo: false, ...overrides })
const bar = (numerator: number, denominator: number, bpm: number, extra: Partial<PlayedBar> = {}): PlayedBar =>
  ({ numerator, denominator, bpm, isPickup: false, ...extra })

// ── parseScoreFile ──────────────────────────────────────────────────────────
describe('parseScoreFile', () => {
  const fileOf = (content: string | Uint8Array, name: string) => new File([content as BlobPart], name)

  it('parses an AlphaTex file and reports its lowercased extension', async () => {
    const result = await parseScoreFile(fileOf('\\tempo 90\n.\n:4 1.1*4', 'Song.AlphaTex'))
    expect('score' in result && result.ext).toBe('alphatex')
    expect('score' in result && result.score.masterBars.length).toBe(1)
  })

  it('reports an empty extension for a name without a dot', async () => {
    const result = await parseScoreFile(fileOf('\\tempo 90\n.\n:4 1.1*4', 'song'))
    expect('score' in result && result.ext).toBe('')
  })

  it('refuses a file over 3 MB without reading it', async () => {
    let read = false
    const huge = { size: MAX_FILE_BYTES + 1, name: 'big.gp', arrayBuffer: () => { read = true; return Promise.resolve(new ArrayBuffer(0)) } }
    const result = await parseScoreFile(huge as unknown as File)
    expect(result).toEqual({ error: expect.stringContaining('3 MB') })
    expect(read).toBe(false)
  })

  it('turns bytes that are not a score into a plain-language error', async () => {
    const result = await parseScoreFile(fileOf(new Uint8Array([1, 2, 3, 4, 5]), 'junk.gp5'))
    expect(result).toEqual({ error: expect.stringContaining('readable Guitar Pro') })
  })
})

// ── importFromScore: tempo and meter ────────────────────────────────────────
describe('importFromScore tempo and meter', () => {
  it('reads a plain 4/4 song', () => {
    const { bars, meta: m, warnings } = imported('\\title "Plain"\n\\artist "Me"\n\\tempo 120\n\\ts 4 4\n.\n:4 3.3*4 | 3.3*4')
    expect(shape(bars)).toEqual(['4/4@120', '4/4@120'])
    expect(m).toMatchObject({ title: 'Plain', artist: 'Me', writtenBars: 2, hasGradualTempo: false })
    expect(warnings).toEqual([])
  })

  it('follows a tempo change at a bar', () => {
    const { bars } = imported('\\tempo 100\n.\n:4 1.1*4 | 1.1 {tempo 140} 1.1 1.1 1.1')
    expect(shape(bars)).toEqual(['4/4@100', '4/4@140'])
  })

  it('averages a mid-bar tempo change over the bar and warns', () => {
    // a beat effect belongs to the note before it, so the change lands on beat 3 (halfway through the bar)
    const { bars, warnings } = imported('\\tempo 100\n.\n:4 1.1 1.1 1.1 {tempo 140} 1.1')
    // two quarters at 100 and two at 140 take the same time as four quarters at the harmonic mean (~116.7)
    expect(bars[0]!.bpm).toBe(117)
    expect(codes(warnings)).toContain('mid-bar-tempo')
  })

  it('keeps alternating 5/8 and 7/8 bars apart', () => {
    const tex = '\\tempo 109\n.\n\\ts 5 8\n:8 1.1*5 |\n\\ts 7 8 1.1*7 |\n\\ts 5 8 1.1*5 |\n\\ts 7 8 1.1*7'
    expect(shape(imported(tex).bars)).toEqual(['5/8@109', '7/8@109', '5/8@109', '7/8@109'])
  })

  it('limits a tempo outside 20-400 BPM and warns', () => {
    const fast = imported('\\tempo 500\n.\n:4 1.1*4')
    expect(shape(fast.bars)).toEqual(['4/4@400'])
    expect(codes(fast.warnings)).toContain('tempo-clamped')
    const slow = imported('\\tempo 10\n.\n:4 1.1*4')
    expect(shape(slow.bars)).toEqual(['4/4@20'])
  })

  it('reads section names', () => {
    const { bars } = imported('\\tempo 100\n.\n\\section "Verse" :4 1.1*4 | 1.1*4 | \\section "Chorus" 1.1*4')
    expect(bars.map((b) => b.section)).toEqual(['Verse', undefined, 'Chorus'])
  })

  it('still reads the file when tracks have plenty of notes (tracks must stay for pickup lengths)', () => {
    const { bars } = imported('\\tempo 100\n\\ts 4 4\n.\n\\ac 3.3.4 |\n3.3.4*4 | 3.3.1')
    expect(shape(bars)).toEqual(['1/4@100p', '4/4@100', '4/4@100'])
  })

  it('fails a declared signature that cannot be clicked', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    score.masterBars[1]!.timeSignatureNumerator = 33
    expect(importFromScore(score, 'gp5')).toEqual({ error: expect.stringContaining('Bar 2') })
    const odd = load('\\tempo 100\n.\n:4 1.1*4')
    odd.masterBars[0]!.timeSignatureDenominator = 3
    expect(importFromScore(odd, 'gp5')).toEqual({ error: expect.stringContaining('Bar 1') })
  })

  it('treats a missing or unusable tempo as the previous bar tempo', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    score.masterBars[1]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(false, 0, 0, 2))
    const result = importFromScore(score, 'alphatex')
    if ('error' in result) throw new Error(result.error)
    expect(shape(result.bars)).toEqual(['4/4@100', '4/4@100'])
    expect(codes(result.warnings)).toContain('bad-tempo')
  })

  it('normalises a dotted-quarter tempo reference to quarter-note BPM', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4')
    score.masterBars[0]!.tempoAutomations.length = 0
    score.masterBars[0]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(false, 0, 70, 3)) // dotted quarter
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(result.bars[0]!.bpm).toBe(105)
  })

  it('keeps free-time bars at their tempo and says so', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    score.masterBars[1]!.isFreeTime = true
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(result.bars).toHaveLength(2)
    expect(codes(result.warnings)).toContain('free-time')
  })

  it('shows the gradual-tempo note for GP7/AlphaTex ramps but not for GP3-5 files', () => {
    const make = () => {
      const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
      score.masterBars[1]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(true, 0, 140, 2))
      return score
    }
    const modern = importFromScore(make(), 'gp')
    const legacy = importFromScore(make(), 'gp5')
    expect('meta' in modern && modern.meta.hasGradualTempo).toBe(true)
    expect('meta' in legacy && legacy.meta.hasGradualTempo).toBe(false)
  })
})

// ── importFromScore: repeats ────────────────────────────────────────────────
describe('importFromScore repeats', () => {
  it('expands a simple repeat into played order', () => {
    const tex = '\\tempo 100\n.\n\\ro \\section "A" :4 1.1*4 | \\rc 2 \\section "B" 1.1*4 | \\section "C" 1.1*4'
    const { bars, meta: m, warnings } = imported(tex)
    expect(bars.map((b) => b.section)).toEqual(['A', 'B', 'A', 'B', 'C'])
    expect(m.writtenBars).toBe(3)
    expect(warnings[0]).toMatchObject({ code: 'repeats-expanded', message: expect.stringContaining('3 written bars play as 5') })
  })

  it('plays alternate endings in order', () => {
    const tex =
      '\\tempo 100\n.\n\\ro \\section "A" :4 1.1*4 | \\ae (1) \\section "B" 2.1*4 | \\ae (2) \\rc 2 \\section "C" 3.1*4 | \\section "D" 4.1*4'
    expect(sectionsOf(tex)).toEqual(['A', 'B', 'A', 'C', 'D'])
  })

  it('imports a legitimate multi-close repeat structure unchanged', () => {
    const tex = '\\tempo 120\n.\n\\ts 4 4\n\\ro 1.3.1*4 | \\rc 4 1.3.1*4 | \\rc 4 1.3.1*4 | \\rc 4 1.3.1*4 |'
    expect(imported(tex).bars.length).toBeGreaterThan(4)
  })

  it.each([
    ['nested rc 99', '\\ro 1.3.1*4 | \\ro 1.3.1*4 | \\ro 1.3.1*4 | \\rc 99 1.3.1*4 | \\rc 99 1.3.1*4 | \\rc 99 1.3.1*4 |'],
    ['closes with no start', '1.3.1*4 | \\rc 99 1.3.1*4 | \\rc 99 1.3.1*4 | \\rc 99 1.3.1*4 |'],
    ['Da Coda loop', '1.3.1*4 | \\jump Coda 1.3.1*4 | 1.3.1*4 | \\jump DaCapoAlCoda 1.3.1*4 | \\jump DaCoda 1.3.1*4 |'],
  ])('refuses a hostile structure quickly: %s', (_name, body) => {
    const started = performance.now()
    const result = importFromScore(load(`\\tempo 120\n.\n\\ts 4 4\n${body}`), 'alphatex')
    expect(result).toEqual({ error: expect.stringContaining('repeat structure') })
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('expands a legitimate D.C. al Coda', () => {
    const tex = '\\tempo 120\n.\n\\ts 4 4\n1.3.1*4 | \\section "Coda" 1.3.1*4 | 1.3.1*4 | \\jump DaCapoAlCoda 1.3.1*4 | 1.3.1*4 |'
    expect(imported(tex).bars.length).toBeGreaterThan(5)
  })

  it('aborts a dense hostile score on the time budget', () => {
    const started = performance.now()
    const result = importFromScore(load(denseTex(4, 8, 64, true)), 'alphatex', { budgetMs: 300 })
    expect(result).toEqual({ error: expect.stringMatching(/too (complex|large)/) })
    expect(performance.now() - started).toBeLessThan(4000)
  })

  it('aborts ONE very dense repeated bar via the per-beat check', () => {
    const tex = `\\tempo 120\n.\n\\ts 4 4\n\\ro ${Array(40000).fill('3.3.64').join(' ')} |\n\\rc 99 3.3.1 |`
    const started = performance.now()
    const result = importFromScore(load(tex), 'alphatex', { budgetMs: 100 })
    expect(result).toEqual({ error: expect.stringContaining('too') })
    expect(performance.now() - started).toBeLessThan(6000)
  })

  it('imports a legitimate dense score within the budget', () => {
    const result = importFromScore(load(denseTex(2, 10, 16, false)), 'alphatex', { budgetMs: 5000 })
    expect('bars' in result && result.bars).toHaveLength(10)
  })
})

// ── Hostile files that never emit a bar ─────────────────────────────────────
describe('importFromScore hostile alternate endings', () => {
  // Every bar carries an alternate-ending mask that the repeats never reach, so alphaTab's playback
  // controller walks (and skips) bars for ever WITHOUT calling the bar or beat hooks.
  const nestedEndings = (depth: number) =>
    `\\title "x"\n.\n${'\\ro \\ae (8) 1.1 | '.repeat(depth)}${'\\rc 3 \\ae (8) 1.1 | '.repeat(depth)}`

  it.each([14, 30, 40])('stops a depth-%i nest on the time budget instead of hanging', (depth) => {
    const started = performance.now()
    const result = importFromScore(load(nestedEndings(depth)), 'alphatex', { budgetMs: 300 })
    expect(result).toEqual({ error: expect.stringContaining('too complex') })
    expect(performance.now() - started).toBeLessThan(3000)
  })

  it('leaves the score usable afterwards (the guard is removed again)', () => {
    const score = load(nestedEndings(30))
    importFromScore(score, 'alphatex', { budgetMs: 100 })
    const reads = Array.from({ length: 2000 }, () => score.masterBars[0]!.alternateEndings)
    expect(reads.every((value) => value === reads[0])).toBe(true)
    const descriptor = Object.getOwnPropertyDescriptor(score.masterBars[0], 'alternateEndings')!
    expect(descriptor.get).toBeUndefined()
  })
})

// ── Compressed files that claim to unpack to far too much ───────────────────
describe('declaredSizeTooLarge', () => {
  const MB = 1024 * 1024
  const NAME = new TextEncoder().encode('Content/score.gpif')

  /** A zip local file header claiming `claimed` unpacked bytes for a (pretend) `stored` bytes of data. */
  function localHeader(claimed: number, stored = 0, flags = 0): Uint8Array {
    const header = new Uint8Array(30 + NAME.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(6, flags, true)
    view.setUint32(18, stored, true)
    view.setUint32(22, claimed, true)
    view.setUint16(26, NAME.length, true)
    header.set(NAME, 30)
    return header
  }

  /** A minimal zip: one local header, one central-directory entry claiming `claimed` bytes, an end record. */
  function zipClaiming(claimed: number, { centralClaims = claimed, localClaims = claimed } = {}): Uint8Array {
    const local = localHeader(localClaims)
    const central = new Uint8Array(46 + NAME.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint32(24, centralClaims, true)
    centralView.setUint16(28, NAME.length, true)
    central.set(NAME, 46)
    const end = new Uint8Array(22)
    const endView = new DataView(end.buffer)
    endView.setUint32(0, 0x06054b50, true)
    endView.setUint16(10, 1, true)
    endView.setUint32(12, central.length, true)
    endView.setUint32(16, local.length, true)
    return Uint8Array.from([...local, ...central, ...end])
  }

  it('flags a zip whose directory claims a huge unpacked size, and accepts a normal one', () => {
    expect(declaredSizeTooLarge(zipClaiming(65 * MB))).toBe(true)
    expect(declaredSizeTooLarge(zipClaiming(2 * MB))).toBe(false)
  })

  it('flags a zip whose central directory is honest-looking or missing but whose local header claims a huge size', () => {
    // alphaTab reads local headers front to back and ignores the directory, so both must be checked
    expect(declaredSizeTooLarge(zipClaiming(65 * MB, { centralClaims: 1000 }))).toBe(true)
    expect(declaredSizeTooLarge(localHeader(65 * MB))).toBe(true) // directory cut off entirely
  })

  it('adds up several entries', () => {
    const twoEntries = Uint8Array.from([...localHeader(40 * MB), ...localHeader(40 * MB)])
    expect(declaredSizeTooLarge(twoEntries)).toBe(true)
    expect(declaredSizeTooLarge(Uint8Array.from([...localHeader(20 * MB), ...localHeader(20 * MB)]))).toBe(false)
  })

  it('stops walking local headers at a data descriptor, where the sizes come after the data', () => {
    const withDescriptor = Uint8Array.from([...localHeader(0, 0, 0x8), ...localHeader(65 * MB)])
    expect(declaredSizeTooLarge(withDescriptor)).toBe(false) // known residual: cannot tell
  })

  it('leaves everything else to the parser: plain text, a header cut short, tiny inputs', () => {
    expect(declaredSizeTooLarge(new TextEncoder().encode('\\tempo 100\n.\n:4 1.1*4'))).toBe(false)
    expect(declaredSizeTooLarge(zipClaiming(65 * MB).slice(0, 20))).toBe(false)
    expect(declaredSizeTooLarge(new Uint8Array([0x50, 0x4b]))).toBe(false)
    expect(declaredSizeTooLarge(new Uint8Array(0))).toBe(false)
  })

  it('makes parseScoreFile refuse such a file before handing it to the parser', async () => {
    const result = await parseScoreFile(new File([zipClaiming(65 * MB) as BlobPart], 'bomb.gp'))
    expect(result).toEqual({ error: expect.stringContaining('claims to unpack') })
    const stripped = await parseScoreFile(new File([localHeader(65 * MB) as BlobPart], 'bomb2.gp'))
    expect(stripped).toEqual({ error: expect.stringContaining('claims to unpack') })
  })
})

describe('parseScoreFile hostile inputs', () => {
  const header = (magic: string) => Uint8Array.from([...new TextEncoder().encode(magic), 0, 0, 0, 0, 1, 2, 3, 4])

  it.each(['BCFZ', 'BCFS'])('refuses a Guitar Pro 6 (.gpx) container (%s) with a way forward', async (magic) => {
    const result = await parseScoreFile(new File([header(magic) as BlobPart], 'song.gpx'))
    expect(result).toEqual({ error: expect.stringContaining('.gp file') })
  })

  it('refuses a .gpx container whatever the file is called', async () => {
    expect(await parseScoreFile(new File([header('BCFZ') as BlobPart], 'song.gp'))).toEqual({ error: expect.stringContaining('.gpx') })
  })

  it('refuses an AlphaTex file with an absurd number of bar lines before parsing it', async () => {
    const bars = '1.1 |'.repeat(20001)
    const result = await parseScoreFile(new File([`\\tempo 100\n.\n:4 ${bars}`], 'huge.alphatex'))
    expect(result).toEqual({ error: expect.stringContaining('too many bars') })
  })

  it('applies the bar-line cap by content, so renaming the file does not get around it', async () => {
    // alphaTab reads any text as AlphaTex whatever the extension says
    const result = await parseScoreFile(new File([`\\tempo 100\n.\n:4 ${'1.1 |'.repeat(20001)}`], 'sneaky.gp5'))
    expect(result).toEqual({ error: expect.stringContaining('too many bars') })
  })

  it('does not apply the bar-line cap to a real GP3-5 binary, which can contain 0x7c bytes', async () => {
    const binary = Uint8Array.from([24, ...new TextEncoder().encode('FICHIER GUITAR PRO v5.00'), ...new Uint8Array(30000).fill(0x7c)])
    const result = await parseScoreFile(new File([binary as BlobPart], 'real.gp5'))
    // it reaches the parser, which cannot make a song of it
    expect(result).toEqual({ error: expect.stringContaining('readable Guitar Pro') })
  })

  it('still reads a normal AlphaTex song with a bar-line count well under the cap', async () => {
    const result = await parseScoreFile(new File([`\\tempo 100\n.\n:4 ${'1.1 | '.repeat(500)}`], 'long.alphatex'))
    expect('score' in result).toBe(true)
  })
})

describe('importScoreFile', () => {
  it('reads a file straight to bars, with no alphaTab types in the way', async () => {
    const result = await importScoreFile(new File(['\\tempo 100\n.\n\\ts 3 4\n:4 1.1*3 | 1.1*3'], 'waltz.alphatex'))
    if ('error' in result) throw new Error(result.error)
    expect(shape(result.bars)).toEqual(['3/4@100', '3/4@100'])
    expect(result.meta.writtenBars).toBe(2)
  })

  it('passes a file error straight through', async () => {
    expect(await importScoreFile(new File(['junk'], 'x.gp'))).toEqual({ error: expect.stringContaining('readable Guitar Pro') })
  })

  it('passes the time budget on to the expansion', async () => {
    const tex = `\\title "x"\n.\n${'\\ro \\ae (8) 1.1 | '.repeat(30)}${'\\rc 3 \\ae (8) 1.1 | '.repeat(30)}`
    expect(await importScoreFile(new File([tex], 'loop.alphatex'), { budgetMs: 100 })).toEqual({ error: expect.stringContaining('too complex') })
  })
})

// ── importFromScore: structure fuzzing and file formats ─────────────────────
describe('importFromScore robustness', () => {
  /** Small deterministic PRNG so a failing structure can be reproduced. */
  function prng(seed: number) {
    let state = seed >>> 0
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 2 ** 32
    }
  }
  const JUMPS = ['', '', '', '\\jump Coda ', '\\jump DaCapo ', '\\jump DaCapoAlCoda ', '\\jump DaCoda ', '\\jump Segno ', '\\jump DalSegno ', '\\jump DaSegnoAlCoda ']

  it('either imports within the bar cap or refuses, and never hangs, on random repeat and jump structures', () => {
    const random = prng(20261030)
    let refused = 0
    let parsed = 0
    for (let n = 0; n < 150; n++) {
      const bars = Array.from({ length: 2 + Math.floor(random() * 8) }, () => {
        const open = random() < 0.3 ? '\\ro ' : ''
        const close = random() < 0.35 ? `\\rc ${[1, 2, 3, 99][Math.floor(random() * 4)]} ` : ''
        const jump = JUMPS[Math.floor(random() * JUMPS.length)]
        return `${open}${close}${jump}3.3.1*4`
      })
      let score: at.model.Score
      try {
        score = load(`\\tempo 120\n.\n\\ts 4 4\n${bars.join(' |\n')} |`)
      } catch {
        continue // not valid alphaTex (some random jump/repeat combinations are rejected by the parser)
      }
      parsed++
      const started = performance.now()
      const result = importFromScore(score, 'alphatex')
      expect(performance.now() - started).toBeLessThan(2000)
      if ('error' in result) {
        refused++
        expect(result.error).toMatch(/repeat structure|too complex/)
      } else {
        expect(result.bars.length).toBeLessThanOrEqual(5000)
      }
    }
    expect(parsed).toBeGreaterThan(50) // most random structures are valid alphaTex
    expect(refused).toBeGreaterThan(0) // and the generator really does produce hostile ones
  })

  it('reads the same bars after a Guitar Pro 7 round trip, including a pickup', () => {
    const tex = '\\tempo 100\n.\n\\ts 4 4\n\\ac 3.3.4 |\n\\ro \\section "A" 3.3.4*4 | \\rc 2 3.3.4*4 | 3.3.1'
    const original = imported(tex)
    const bytes = new at.exporter.Gp7Exporter().export(load(tex), new at.Settings())
    const reloaded = importFromScore(at.importer.ScoreLoader.loadScoreFromBytes(bytes, new at.Settings()), 'gp')
    if ('error' in reloaded) throw new Error(reloaded.error)
    expect(shape(reloaded.bars)).toEqual(shape(original.bars))
    expect(reloaded.bars.map((b) => b.section)).toEqual(original.bars.map((b) => b.section))
    expect(reloaded.bars[0]!.isPickup).toBe(true)
  })
})

// ── importFromScore: pickups ────────────────────────────────────────────────
describe('importFromScore pickups', () => {
  const head = '\\tempo 100\n.\n\\ts 4 4\n'

  it('derives a short pickup bar from its real length', () => {
    expect(shape(imported(`${head}\\ac 3.3.4 |\n3.3.4*4 | 3.3.1`).bars)).toEqual(['1/4@100p', '4/4@100', '4/4@100'])
    expect(shape(imported(`${head}\\ac 3.3.8 |\n3.3.4*4 | 3.3.1`).bars)[0]).toBe('1/8@100p')
  })

  it('derives a pickup in 6/8 from two eighths', () => {
    const tex = '\\tempo 100\n.\n\\ts 6 8\n\\ac 3.3.8 3.3.8 |\n3.3.8*6 | 3.3.1'
    expect(shape(imported(tex).bars)[0]).toBe('1/4@100p')
  })

  it('keeps a full bar that is flagged as a pickup as a normal bar', () => {
    const { bars, warnings } = imported(`${head}\\ac 3.3.4*4 |\n3.3.4*4 | 3.3.1`)
    expect(bars[0]).toMatchObject({ numerator: 4, denominator: 4, isPickup: false })
    expect(codes(warnings)).toContain('full-pickup-flag')
  })

  it('imports a whole-bar-rest pickup as a full bar, at the start and mid-song', () => {
    const first = imported(`${head}\\ac r.1 |\n3.3.4*4 | 3.3.1`)
    expect(shape(first.bars)).toEqual(['4/4@100', '4/4@100', '4/4@100'])
    expect(codes(first.warnings)).toContain('rest-pickup')
    const mid = imported(`${head}3.3.4*4 | \\ac r.1 | 3.3.4*4`)
    expect(mid.bars).toHaveLength(3)
    expect(mid.bars.every((b) => !b.isPickup)).toBe(true)
  })

  it('gives a flagged bar longer than its signature its real length and does not call it a pickup', () => {
    const { bars, warnings } = imported(`${head}\\ac 3.3.2 3.3.2 3.3.2 |\n3.3.4*4 | 3.3.1`)
    expect(bars[0]).toMatchObject({ numerator: 6, denominator: 4, isPickup: false })
    expect(codes(warnings)).toContain('long-pickup')
  })

  it('skips an unclickable (tuplet) pickup at the start and numbers bars from the next one', () => {
    const { bars, warnings } = imported(`${head}\\ac 3.3.8 {tu 3} |\n3.3.4*4 | 3.3.1`)
    expect(shape(bars)).toEqual(['4/4@100', '4/4@100'])
    expect(codes(warnings)).toContain('skipped-pickup')
  })

  it('fails the import for an unclickable pickup anywhere else (skipping it would shift the click)', () => {
    const result = importFromScore(load(`${head}3.3.4*4 | \\ac 3.3.8 {tu 3} |\n3.3.4*4`), 'alphatex')
    expect(result).toEqual({ error: expect.stringContaining('Bar 2') })
  })

  it('does not treat a short bar without the flag as a pickup (GP3-5 style short bar)', () => {
    const { bars } = imported('\\tempo 100\n.\n\\ts 1 4\n3.3.4 |\n\\ts 4 4 3.3.4*4')
    expect(shape(bars)).toEqual(['1/4@100', '4/4@100'])
  })
})

// ── Total duration is conserved ─────────────────────────────────────────────
describe('duration conservation', () => {
  /** Seconds according to alphaTab's own tick lookup (integer tempos, one tempo per bar). */
  function lookupSeconds(tex: string): number {
    const generator = new at.midi.MidiFileGenerator(load(tex), new at.Settings(), new at.midi.AlphaSynthMidiFileHandler(new at.midi.MidiFile()))
    generator.generate()
    return generator.tickLookup.masterBars.reduce((sum, e) => sum + ((e.end - e.start) / 960) * (60 / e.tempoChanges[e.tempoChanges.length - 1]!.tempo), 0)
  }

  it.each([
    ['plain', '\\tempo 120\n.\n\\ts 4 4\n:4 1.1*4 | 1.1*4 | 1.1*4'],
    ['tempo change', '\\tempo 100\n.\n\\ts 4 4\n:4 1.1*4 | 1.1 {tempo 140} 1.1 1.1 1.1 | 1.1*4'],
    ['mixed meters', '\\tempo 109\n.\n\\ts 5 8\n:8 1.1*5 |\n\\ts 7 8 1.1*7 |\n\\ts 5 8 1.1*5'],
    ['repeat', '\\tempo 90\n.\n\\ro :4 1.1*4 | 1.1*4 \\rc 3 | 1.1*4'],
    ['pickup kept', '\\tempo 100\n.\n\\ts 4 4\n\\ac 3.3.4 |\n3.3.4*4 | 3.3.1'],
  ])('click-track length equals the tick-lookup length: %s', (_name, tex) => {
    const { bars, meta: m } = imported(tex)
    const result = barsToPieces(bars, m, { includePickup: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.stats.seconds).toBeCloseTo(lookupSeconds(tex), 6)
  })
})

// ── barsToPieces ────────────────────────────────────────────────────────────
describe('barsToPieces', () => {
  const run = (bars: PlayedBar[], includePickup = true, m: ImportMeta = meta({ writtenBars: bars.length })) => {
    const result = barsToPieces(bars, m, { includePickup })
    if ('error' in result) throw new Error(result.error)
    return result
  }

  it('groups equal bars into segments with a repeat count and a signature/tempo label', () => {
    const { pieces, stats } = run([bar(4, 4, 120), bar(4, 4, 120), bar(3, 4, 90)])
    expect(pieces.map((p) => [p.label, p.repeats, p.bpm])).toEqual([['4/4 ♩=120', 2, 120], ['3/4 ♩=90', 1, 90]])
    expect(pieces[0]).toMatchObject({ groupId: null, subdivision: 'quarter', timeSignature: { numerator: 4, denominator: 4 } })
    expect(stats).toMatchObject({ playedBars: 3, segments: 2, bpmMin: 90, bpmMax: 120, signatures: ['4/4', '3/4'] })
    expect(stats.seconds).toBeCloseTo(6, 6) // two 4/4 bars at 120 (2 s each) + one 3/4 bar at 90 (2 s)
  })

  it('chunks long runs at 99 bars', () => {
    const { pieces } = run(Array.from({ length: 250 }, () => bar(4, 4, 123)))
    expect(pieces.map((p) => p.repeats)).toEqual([99, 99, 52])
  })

  it('starts a new segment at a section and names it first in the label', () => {
    const { pieces } = run([bar(4, 4, 120, { section: 'Verse' }), bar(4, 4, 120), bar(4, 4, 120, { section: 'Chorus' })])
    expect(pieces.map((p) => [p.label, p.repeats])).toEqual([['Verse (4/4 ♩=120)', 2], ['Chorus (4/4 ♩=120)', 1]])
  })

  it('keeps a pickup as its own segment even when the next bars look the same', () => {
    const { pieces } = run([bar(5, 8, 100, { isPickup: true }), bar(5, 8, 100), bar(5, 8, 100)])
    expect(pieces.map((p) => p.repeats)).toEqual([1, 2])
  })

  it('drops only the first bar when the pickup is skipped', () => {
    const bars = [bar(1, 4, 100, { isPickup: true }), bar(4, 4, 100), bar(4, 4, 300000 / 1000)]
    const included = run(bars, true)
    const skipped = run(bars, false)
    expect(included.stats.playedBars).toBe(3)
    expect(skipped.stats.playedBars).toBe(2)
    expect(skipped.pieces[0]!.timeSignature).toEqual({ numerator: 4, denominator: 4 })
  })

  it('numbers warnings from the full sequence even when the pickup is skipped', () => {
    const bars = [bar(1, 4, 100, { isPickup: true }), bar(4, 4, 100), bar(32, 32, 400)]
    const skipped = run(bars, false)
    const fast = skipped.warnings.find((w) => w.code === 'fast-clicks')!
    expect(fast.firstBar).toBe(3)
  })

  it('does not drop the first bar when it is not a pickup', () => {
    expect(run([bar(4, 4, 100), bar(4, 4, 100)], false).stats.playedBars).toBe(2)
  })

  it('warns above 60 segments and refuses above 400', () => {
    const alternating = (n: number) => Array.from({ length: n }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109))
    const many = run(alternating(WARN_PIECES + 1))
    expect(codes(many.warnings)).toContain('many-segments')
    expect(run(alternating(WARN_PIECES)).warnings).toEqual([])
    expect(barsToPieces(alternating(MAX_PIECES + 1), meta(), { includePickup: true })).toEqual({ error: expect.stringContaining('400') })
    expect('pieces' in barsToPieces(alternating(MAX_PIECES), meta(), { includePickup: true })).toBe(true)
  })

  it('warns when the click rate gets very fast, naming the peak and its bar', () => {
    const { warnings, stats } = run([bar(4, 4, 120), bar(4, 4, 120), bar(12, 8, 207), bar(6, 8, 150)])
    const fast = warnings.find((w) => w.code === 'fast-clicks')!
    expect(stats.peakClicksPerMin).toBe(414) // 12/8 at quarter 207 clicks every eighth
    expect(fast.firstBar).toBe(3)
    expect(fast.message).toContain('414')
  })

  it('does not warn at a normal click rate', () => {
    expect(run([bar(4, 4, 200), bar(6, 8, 150)]).warnings).toEqual([])
  })

  it('returns an error when nothing is left', () => {
    expect(barsToPieces([], meta(), { includePickup: true })).toEqual({ error: expect.any(String) })
    expect(barsToPieces([bar(1, 4, 100, { isPickup: true })], meta(), { includePickup: false })).toEqual({ error: expect.any(String) })
  })

  it('gives each segment a unique id and cycles the palette', () => {
    const { pieces } = run(Array.from({ length: 10 }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109)))
    expect(new Set(pieces.map((p) => p.id)).size).toBe(10)
    expect(pieces[8]!.color).toBe(pieces[0]!.color)
  })
})

// ── Gaps: guards, sanitising, warnings text ─────────────────────────────────
describe('importFromScore tempo-change and expansion rules', () => {
  it('refuses a bar with an absurd number of tempo changes before expanding anything', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    for (let i = 0; i < 501; i++) score.masterBars[1]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(false, i / 600, 100 + (i % 50), 2))
    expect(importFromScore(score, 'alphatex')).toEqual({ error: expect.stringContaining('Bar 2 has more than 500 tempo changes') })
  })

  it('accepts a bar with many, but not absurdly many, tempo changes', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    for (let i = 0; i < 100; i++) score.masterBars[1]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(false, i / 150, 100 + (i % 50), 2))
    expect('bars' in importFromScore(score, 'alphatex')).toBe(true)
  })

  it('does not call a skipped opening pickup a repeat expansion', () => {
    const { warnings } = imported('\\tempo 100\n.\n\\ts 4 4\n\\ac 3.3.8 {tu 3} |\n3.3.4*4 | 3.3.1')
    expect(codes(warnings)).toContain('skipped-pickup')
    expect(codes(warnings)).not.toContain('repeats-expanded')
  })

  it('does call a real repeat an expansion, with the played count', () => {
    const { warnings } = imported('\\tempo 100\n.\n\\ro :4 1.1*4 | \\rc 2 1.1*4 | 1.1*4')
    expect(warnings.find((w) => w.code === 'repeats-expanded')).toMatchObject({ count: 5 })
  })

  it('names how many unclickable opening bars were left out', () => {
    const { warnings } = imported('\\tempo 100\n.\n\\ts 4 4\n\\ac 3.3.8 {tu 3} |\n\\ac 3.3.8 {tu 3} |\n3.3.4*4')
    expect(warnings.find((w) => w.code === 'skipped-pickup')!.message).toBe('2 opening bars with a length that cannot be clicked (a tuplet) were left out.')
  })
})

describe('importFromScore guards', () => {
  it('reports a score without bars', () => {
    expect(importFromScore({ masterBars: [] } as unknown as at.model.Score, 'gp')).toEqual({ error: 'This file has no bars to import.' })
  })

  it('refuses a song with more than 2000 written bars before expanding anything', () => {
    const result = importFromScore({ masterBars: { length: 2001 } } as unknown as at.model.Score, 'gp')
    expect(result).toEqual({ error: expect.stringContaining('2001 bars') })
    expect('error' in result && result.error).toContain('2000')
  })

  it('turns an unexpected failure while expanding into a plain-language error instead of throwing', () => {
    const broken = { masterBars: [{ tempoAutomations: [] }] } as unknown as at.model.Score
    expect(importFromScore(broken, 'gp')).toEqual({ error: 'Could not work out how this song repeats.' })
  })

  it('accepts a 2000-bar song (the cap is on the written bar count, inclusive)', () => {
    const tex = `\\tempo 120\n.\n\\ts 4 4\n${Array(2000).fill('3.3.1').join(' |\n')}`
    const result = importFromScore(load(tex), 'alphatex', { budgetMs: 20000 })
    expect('bars' in result && result.bars).toHaveLength(2000)
  })
})

describe('importFromScore text and warnings', () => {
  it('strips zero-width characters from the title and artist and caps them at 100 characters', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4')
    score.title = `Ti\u200btle ${'x'.repeat(200)}`
    score.artist = `\u202eArtist  \n name`
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(result.meta.title.startsWith('Title ')).toBe(true)
    expect(Array.from(result.meta.title)).toHaveLength(100)
    expect(result.meta.artist).toBe('Artist name')
  })

  it('treats a missing title and artist as empty', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4')
    score.title = undefined as unknown as string
    score.artist = undefined as unknown as string
    const result = importFromScore(score, 'gp')
    expect('meta' in result && [result.meta.title, result.meta.artist]).toEqual(['', ''])
  })

  it('cleans section names and caps them at 40 characters', () => {
    const { bars } = imported(`\\tempo 100\n.\n\\section "A\u200bB${'z'.repeat(60)}" :4 1.1*4`)
    expect(bars[0]!.section!.startsWith('AB')).toBe(true)
    expect(Array.from(bars[0]!.section!)).toHaveLength(40)
  })

  it('leaves out the section key for a blank section name', () => {
    const score = load('\\tempo 100\n.\n\\section "Verse" :4 1.1*4')
    score.masterBars[0]!.section!.text = ' \u200b '
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect('section' in result.bars[0]!).toBe(false)
  })

  it('warns about a fermata without making the bar longer or shorter', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    score.masterBars[1]!.addFermata(0, new at.model.Fermata())
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(shape(result.bars)).toEqual(['4/4@100', '4/4@100'])
    const fermata = result.warnings.find((w) => w.code === 'fermata')!
    expect(fermata).toMatchObject({ count: 1, firstBar: 2 })
    expect(fermata.message).toContain('A fermata in 1 bar (first: bar 2)')
  })

  it('counts repeated warnings once and points at the first bar, with plural wording', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4 | 1.1*4')
    score.masterBars[1]!.isFreeTime = true
    score.masterBars[2]!.isFreeTime = true
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    const free = result.warnings.filter((w) => w.code === 'free-time')
    expect(free).toHaveLength(1)
    expect(free[0]).toMatchObject({ count: 2, firstBar: 2 })
    expect(free[0]!.message).toContain('Free-time in 2 bars (first: bar 2)')
    expect(free[0]!.message).toContain('first: bar 2')
  })

  it('numbers warnings by played bar, not written bar, after a repeat', () => {
    const tex = '\\tempo 100\n.\n\\ro :4 1.1*4 | \\rc 2 1.1*4 | 1.1*4'
    const score = load(tex)
    score.masterBars[2]!.isFreeTime = true
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(result.warnings.find((w) => w.code === 'free-time')!.firstBar).toBe(5)
  })

  it('puts the repeats-expanded note first', () => {
    const score = load('\\tempo 100\n.\n\\ro :4 1.1*4 | \\rc 2 1.1*4 | 1.1*4')
    score.masterBars[1]!.isFreeTime = true
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(codes(result.warnings)).toEqual(['repeats-expanded', 'free-time'])
  })

  it('does not warn about expansion when nothing repeats', () => {
    expect(codes(imported('\\tempo 100\n.\n:4 1.1*4 | 1.1*4').warnings)).not.toContain('repeats-expanded')
  })

  it('does not flag a tempo exactly at the limits as clamped', () => {
    const low = imported('\\tempo 20\n.\n:4 1.1*4')
    const high = imported('\\tempo 400\n.\n:4 1.1*4')
    expect(shape(low.bars)).toEqual(['4/4@20'])
    expect(shape(high.bars)).toEqual(['4/4@400'])
    expect(codes(low.warnings)).not.toContain('tempo-clamped')
    expect(codes(high.warnings)).not.toContain('tempo-clamped')
  })

  it('names the allowed range in the tempo-clamped message', () => {
    const { warnings } = imported('\\tempo 500\n.\n:4 1.1*4 | 1.1*4')
    const clamped = warnings.find((w) => w.code === 'tempo-clamped')!
    expect(clamped.count).toBe(2)
    expect(clamped.message).toContain('2 bars')
    expect(clamped.message).toContain('20-400')
  })

  it('counts several mid-bar tempo changes in one warning', () => {
    const tex = '\\tempo 100\n.\n:4 1.1 1.1 1.1 {tempo 140} 1.1 | 1.1 1.1 1.1 {tempo 100} 1.1'
    const warning = imported(tex).warnings.find((w) => w.code === 'mid-bar-tempo')!
    expect(warning.count).toBe(2)
    expect(warning.message).toContain('Tempo changes partway through 2 bars')
  })

  it('does not call a bar-start tempo change a mid-bar change', () => {
    const { warnings } = imported('\\tempo 100\n.\n:4 1.1*4 | 1.1 {tempo 140} 1.1 1.1 1.1')
    expect(codes(warnings)).not.toContain('mid-bar-tempo')
  })

  it('shows the gradual-tempo note for an AlphaTex/GP7 ramp but never when no tempo is linear', () => {
    const ramp = (isLinear: boolean) => {
      const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
      score.masterBars[1]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(isLinear, 0, 140, 2))
      return importFromScore(score, 'alphatex')
    }
    expect('meta' in ramp(true) && (ramp(true) as { meta: ImportMeta }).meta.hasGradualTempo).toBe(true)
    expect('meta' in ramp(false) && (ramp(false) as { meta: ImportMeta }).meta.hasGradualTempo).toBe(false)
  })

  it.each(['gp3', 'gp4', 'gp5'])('ignores isLinear on a legacy %s file', (ext) => {
    const score = load('\\tempo 100\n.\n:4 1.1*4 | 1.1*4')
    score.masterBars[1]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(true, 0, 140, 2))
    const result = importFromScore(score, ext)
    expect('meta' in result && result.meta.hasGradualTempo).toBe(false)
  })

  it('falls back to 120 BPM when neither the score nor the bar has a usable tempo', () => {
    const score = load('\\tempo 100\n.\n:4 1.1*4')
    score.masterBars[0]!.tempoAutomations.length = 0
    score.masterBars[0]!.tempoAutomations.push(at.model.Automation.buildTempoAutomation(false, 0, 0, 2))
    const result = importFromScore(score, 'gp')
    if ('error' in result) throw new Error(result.error)
    expect(result.bars[0]!.bpm).toBe(120)
    expect(codes(result.warnings)).toContain('bad-tempo')
  })
})

describe('parseScoreFile names', () => {
  const fileOf = (content: string, name: string) => new File([content], name)

  it('uses only the text after the last dot as the extension', async () => {
    const result = await parseScoreFile(fileOf('\\tempo 90\n.\n:4 1.1*4', 'my.song.v2.ALPHATEX'))
    expect('ext' in result && result.ext).toBe('alphatex')
  })

  it('does not refuse a file of exactly the size cap for its size (the cap is exclusive)', async () => {
    const atLimit = { size: MAX_FILE_BYTES, name: 'x.gp', arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }
    const result = await parseScoreFile(atLimit as unknown as File)
    // Not refused for size: it goes on to parse the bytes.
    expect('error' in result && result.error).not.toContain('larger than')
  })

  it('returns the unreadable error when reading the bytes itself fails', async () => {
    const failing = { size: 10, name: 'x.gp', arrayBuffer: () => Promise.reject(new Error('disk')) }
    expect(await parseScoreFile(failing as unknown as File)).toEqual({ error: expect.stringContaining('readable Guitar Pro') })
  })
})

describe('barsToPieces length cap', () => {
  const SECONDS_PER_BAR = 6 // 4/4 at 40 BPM
  const barsFor = (seconds: number) => Array.from({ length: seconds / SECONDS_PER_BAR }, () => bar(4, 4, 40))

  it('refuses a song longer than the cap at 100% speed, naming the limit', () => {
    const result = barsToPieces(barsFor(MAX_SECONDS + SECONDS_PER_BAR), meta(), { includePickup: true })
    expect(result).toEqual({ error: expect.stringContaining(`${MAX_SECONDS / 60} minutes`) })
  })

  it('accepts a song of exactly the cap', () => {
    const result = barsToPieces(barsFor(MAX_SECONDS), meta(), { includePickup: true })
    expect('pieces' in result).toBe(true)
  })
})

describe('barsToPieces gaps', () => {
  const run = (bars: PlayedBar[], includePickup = true, m: ImportMeta = meta({ writtenBars: bars.length })) => {
    const result = barsToPieces(bars, m, { includePickup })
    if ('error' in result) throw new Error(result.error)
    return result
  }

  it('does not warn at exactly 300 clicks per minute, and warns just above', () => {
    expect(run([bar(4, 4, 300)]).warnings).toEqual([])
    expect(codes(run([bar(8, 8, 151)]).warnings)).toContain('fast-clicks') // 151 * 8 / 4 = 302
  })

  it('names the earliest bar when two segments tie for the peak rate', () => {
    const { warnings } = run([bar(4, 4, 100), bar(8, 8, 160), bar(4, 4, 100), bar(8, 8, 160)])
    expect(warnings.find((w) => w.code === 'fast-clicks')!.firstBar).toBe(2)
  })

  it('reports the peak rate in stats even when it is below the warning threshold', () => {
    expect(run([bar(4, 4, 100), bar(6, 8, 120)]).stats.peakClicksPerMin).toBe(240)
  })

  it('starts a new segment right after a pickup and right before one', () => {
    const { pieces } = run([bar(4, 4, 100), bar(4, 4, 100, { isPickup: true }), bar(4, 4, 100), bar(4, 4, 100)])
    expect(pieces.map((p) => p.repeats)).toEqual([1, 1, 2])
  })

  it('keeps the section name at the front of a long label and caps the label at 60 characters', () => {
    const section = 'S'.repeat(40)
    const { pieces } = run([bar(4, 4, 120, { section })])
    expect(pieces[0]!.label.startsWith(section)).toBe(true)
    expect(Array.from(pieces[0]!.label).length).toBeLessThanOrEqual(60)
  })

  it('carries a mid-run section only on the bar that starts it', () => {
    const { pieces } = run([bar(4, 4, 120), bar(4, 4, 120, { section: 'Bridge' }), bar(4, 4, 120)])
    expect(pieces.map((p) => [p.label, p.repeats])).toEqual([['4/4 ♩=120', 1], ['Bridge (4/4 ♩=120)', 2]])
  })

  it('reports a single tempo as equal min and max and lists each signature once in order of appearance', () => {
    const { stats } = run([bar(3, 4, 90), bar(4, 4, 90), bar(3, 4, 90)])
    expect([stats.bpmMin, stats.bpmMax]).toEqual([90, 90])
    expect(stats.signatures).toEqual(['3/4', '4/4'])
  })

  it('takes writtenBars from the import meta, not from the played bars', () => {
    expect(run([bar(4, 4, 100), bar(4, 4, 100)], true, meta({ writtenBars: 1 })).stats.writtenBars).toBe(1)
  })

  it('computes seconds from the bars that are kept (skipping a pickup removes its time)', () => {
    const bars = [bar(1, 4, 60, { isPickup: true }), bar(4, 4, 60)]
    expect(run(bars, true).stats.seconds).toBeCloseTo(5, 6)
    expect(run(bars, false).stats.seconds).toBeCloseTo(4, 6)
  })

  it('numbers the many-segments warning from the first kept bar when the pickup is skipped', () => {
    const bars = [bar(1, 4, 100, { isPickup: true }), ...Array.from({ length: WARN_PIECES + 1 }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109))]
    const warning = run(bars, false).warnings.find((w) => w.code === 'many-segments')!
    expect(warning.firstBar).toBe(2)
    expect(warning.count).toBe(WARN_PIECES + 1)
  })

  it('does not mutate the bars it is given', () => {
    const bars = Object.freeze([Object.freeze(bar(4, 4, 120)), Object.freeze(bar(4, 4, 120))]) as PlayedBar[]
    expect(() => barsToPieces(bars, meta({ writtenBars: 2 }), { includePickup: false })).not.toThrow()
  })

  it('always builds quarter-subdivision, ungrouped segments', () => {
    const { pieces } = run([bar(7, 8, 109), bar(5, 8, 109)])
    expect(pieces.every((p) => p.subdivision === 'quarter' && p.groupId === null)).toBe(true)
  })
})
