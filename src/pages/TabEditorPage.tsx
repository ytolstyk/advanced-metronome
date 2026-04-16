import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import './TabEditorPage.css'
import type {
  Beat,
  DotModifier,
  DurationValue,
  Measure,
  NoteModifierKey,
  TabCursor,
  TabSelection,
  TabTrack,
} from '../tabEditorTypes'
import {
  tabEditorReducer,
  createInitialTabState,
  saveTabTrack,
  BEAT_WIDTHS,
  buildOpenMidi,
  fretToFreq,
  isInSelection,
} from '../tabEditorState'
import { TabPlaybackEngine } from '../audio/TabPlaybackEngine'
import { pluckString } from '../audio/pluckString'
import { TUNINGS } from '../data/tunings'
import type { StringCount } from '../data/tunings'

// ── Constants ──────────────────────────────────────────────────────────────

const MEASURE_LABEL_W = 24
const STRING_LABEL_W = 22

function measureDisplayWidth(m: Measure): number {
  return MEASURE_LABEL_W + m.beats.reduce((s, b) => s + BEAT_WIDTHS[b.duration], 0)
}

function computeRows(measures: Measure[], containerWidth: number): Measure[][] {
  const usable = containerWidth - STRING_LABEL_W - 32
  const rows: Measure[][] = []
  let row: Measure[] = []
  let rowW = 0
  for (const m of measures) {
    const mw = measureDisplayWidth(m)
    if (rowW + mw > usable && row.length > 0) {
      rows.push(row)
      row = []
      rowW = 0
    }
    row.push(m)
    rowW += mw
  }
  if (row.length > 0) rows.push(row)
  return rows
}

// ── Staff notation helpers ─────────────────────────────────────────────────

const CHROMATIC_TO_DIA = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const STEP = 5 // px per diatonic step
const E4Y = 110 // y position of E4 (bottom staff line reference)
const STAFF_TOP_Y = E4Y - 4 * 2 * STEP // F5 top line
const STAFF_BOT_Y = E4Y

function midiToDia(midi: number): number {
  return Math.floor(midi / 12) * 7 + CHROMATIC_TO_DIA[midi % 12]
}

function midiToStaffY(midi: number): number {
  const display = midi + 12
  const dia = midiToDia(display)
  const e4Dia = midiToDia(64) // E4
  return E4Y - (dia - e4Dia) * STEP
}

const STAFF_LINES_Y = [E4Y, E4Y - 2 * STEP, E4Y - 4 * STEP, E4Y - 6 * STEP, E4Y - 8 * STEP]

function needsLedgerLines(y: number): number[] {
  const lines: number[] = []
  // Below staff (below E4Y)
  for (let ly = E4Y + 2 * STEP; ly <= y + 1; ly += 2 * STEP) lines.push(ly)
  // Above staff (above STAFF_TOP_Y)
  for (let ly = STAFF_TOP_Y - 2 * STEP; ly >= y - 1; ly -= 2 * STEP) lines.push(ly)
  return lines
}

function getAccidental(midi: number): string {
  const pc = (midi + 12) % 12
  if ([1, 3, 6, 8, 10].includes(pc)) return '♯'
  return ''
}

type StemDir = 'up' | 'down'

function stemDir(noteY: number): StemDir {
  const midY = E4Y - 4 * STEP // B4 = middle line
  return noteY > midY ? 'up' : 'down'
}

const STEM_LEN = 30

function stemTipY(noteY: number, dir: StemDir): number {
  return dir === 'up' ? noteY - STEM_LEN : noteY + STEM_LEN
}

// ── Playback engine (module-level singleton) ───────────────────────────────

const playbackEngine = new TabPlaybackEngine()

// ── Main component ─────────────────────────────────────────────────────────

export function TabEditorPage() {
  const [state, dispatch] = useReducer(tabEditorReducer, undefined, createInitialTabState)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const digitBufRef = useRef<number | null>(null)
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef<{ measureIndex: number; beatIndex: number } | null>(null)

  // Persist track on every change
  useEffect(() => {
    saveTabTrack(state.track)
  }, [state.track])

  // Sync playback engine track
  useEffect(() => {
    if (state.isPlaying) playbackEngine.updateTrack(state.track)
  }, [state.track, state.isPlaying])

  // ResizeObserver for canvas
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Lazy AudioContext
  function ensureCtx(): AudioContext {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  // Preview a fret note
  const previewNote = useCallback(
    (stringIndex: number, fret: number) => {
      if (fret < 0) return
      const ctx = ensureCtx()
      const openMidi = state.track.openMidi[stringIndex]
      if (openMidi === undefined) return
      const freq = fretToFreq(openMidi, fret)
      pluckString(ctx, freq, ctx.currentTime, 0.7)
    },
    [state.track.openMidi],
  )

  // Commit a fret digit (or two-digit) entry
  const commitFret = useCallback(
    (fret: number) => {
      if (fret > 24) return
      const { measureIndex, beatIndex, stringIndex } = state.cursor
      dispatch({ type: 'ADD_NOTE', measureIndex, beatIndex, stringIndex, fret })
      previewNote(stringIndex, fret)
      dispatch({ type: 'MOVE_CURSOR', direction: 'right' })
    },
    [state.cursor, previewNote],
  )

  // Handle single digit press (with two-digit buffering)
  const handleDigit = useCallback(
    (d: number) => {
      if (digitTimerRef.current !== null) clearTimeout(digitTimerRef.current)

      if (digitBufRef.current !== null) {
        // Second digit: combine
        const combined = digitBufRef.current * 10 + d
        digitBufRef.current = null
        commitFret(combined)
      } else if (d >= 1) {
        // Could be start of 2-digit (10-24), buffer it
        digitBufRef.current = d
        digitTimerRef.current = setTimeout(() => {
          const val = digitBufRef.current
          digitBufRef.current = null
          if (val !== null) commitFret(val)
        }, 700)
      } else {
        // 0 = open string, commit immediately
        commitFret(0)
      }
    },
    [commitFret],
  )

  const flushDigitBuf = useCallback(() => {
    if (digitTimerRef.current !== null) clearTimeout(digitTimerRef.current)
    if (digitBufRef.current !== null) {
      const val = digitBufRef.current
      digitBufRef.current = null
      commitFret(val)
    }
  }, [commitFret])

  // Keyboard handler
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const { cursor } = state

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          flushDigitBuf()
          dispatch({ type: 'MOVE_CURSOR', direction: 'left' })
          return
        case 'ArrowRight':
          e.preventDefault()
          flushDigitBuf()
          dispatch({ type: 'MOVE_CURSOR', direction: 'right' })
          return
        case 'ArrowUp':
          e.preventDefault()
          flushDigitBuf()
          dispatch({ type: 'MOVE_CURSOR', direction: 'up' })
          return
        case 'ArrowDown':
          e.preventDefault()
          flushDigitBuf()
          dispatch({ type: 'MOVE_CURSOR', direction: 'down' })
          return
        case ' ':
          e.preventDefault()
          // rest: set fret=-1
          dispatch({
            type: 'ADD_NOTE',
            measureIndex: cursor.measureIndex,
            beatIndex: cursor.beatIndex,
            stringIndex: cursor.stringIndex,
            fret: -1,
          })
          dispatch({ type: 'MOVE_CURSOR', direction: 'right' })
          return
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          dispatch({
            type: 'DELETE_NOTE',
            measureIndex: cursor.measureIndex,
            beatIndex: cursor.beatIndex,
            stringIndex: cursor.stringIndex,
          })
          return
      }

      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'c':
            e.preventDefault()
            dispatch({ type: 'COPY' })
            return
          case 'x':
            e.preventDefault()
            dispatch({ type: 'CUT' })
            return
          case 'v':
            e.preventDefault()
            dispatch({ type: 'PASTE', measureIndex: cursor.measureIndex, beatIndex: cursor.beatIndex })
            return
          case 'z':
            e.preventDefault()
            if (e.shiftKey) dispatch({ type: 'REDO' })
            else dispatch({ type: 'UNDO' })
            return
        }
      }

      if (/^\d$/.test(e.key)) {
        e.preventDefault()
        handleDigit(parseInt(e.key, 10))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, flushDigitBuf, handleDigit])

  // Playback controls
  function handlePlay() {
    const ctx = ensureCtx()
    if (state.isPlaying) {
      playbackEngine.pause()
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
    } else {
      const fromMeasure = state.playheadMeasure
      const fromBeat = state.playheadBeat
      playbackEngine.start(
        state.track,
        fromMeasure,
        fromBeat,
        (mi, bi) => dispatch({ type: 'SET_PLAYHEAD', measureIndex: mi, beatIndex: bi }),
        () => {
          dispatch({ type: 'SET_PLAYING', isPlaying: false })
          dispatch({ type: 'SET_PLAYHEAD', measureIndex: 0, beatIndex: 0 })
        },
      )
      // AudioContext must be resumed after user interaction
      if (ctx.state === 'suspended') void ctx.resume()
      dispatch({ type: 'SET_PLAYING', isPlaying: true })
    }
  }

  function handleStop() {
    playbackEngine.stop()
    dispatch({ type: 'SET_PLAYING', isPlaying: false })
    dispatch({ type: 'SET_PLAYHEAD', measureIndex: 0, beatIndex: 0 })
  }

  // Drag selection mouse handlers
  function onBeatMouseDown(mi: number, bi: number, si: number) {
    dragRef.current = { measureIndex: mi, beatIndex: bi }
    dispatch({ type: 'SET_SELECTION', selection: null })
    dispatch({
      type: 'SET_CURSOR',
      cursor: { measureIndex: mi, beatIndex: bi, stringIndex: si },
    })
    canvasRef.current?.focus()
  }

  function onBeatMouseEnter(mi: number, bi: number) {
    if (!dragRef.current) return
    const start = dragRef.current
    const sel: TabSelection = {
      startMeasure: start.measureIndex,
      startBeat: start.beatIndex,
      endMeasure: mi,
      endBeat: bi,
    }
    dispatch({ type: 'SET_SELECTION', selection: sel })
  }

  function onMouseUp() {
    dragRef.current = null
  }

  const rows = computeRows(state.track.measures, containerWidth)

  const globalMeasureMap = new Map<string, number>()
  state.track.measures.forEach((m, i) => globalMeasureMap.set(m.id, i))

  return (
    <div className="tab-editor-page" onMouseUp={onMouseUp}>
      {/* Header */}
      <div className="tab-editor-header">
        <input
          className="tab-editor-title-input"
          value={state.track.title}
          onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
          placeholder="Track title"
        />
        <div className="tab-header-sep" />
        <TuningSelector track={state.track} dispatch={dispatch} />
        <div className="tab-header-sep" />
        <BpmControl bpm={state.track.globalBpm} dispatch={dispatch} />
      </div>

      {/* Toolbar */}
      <TabToolbar state={state} dispatch={dispatch} />

      {/* Playback bar */}
      <div className="tab-playback-bar">
        <button
          className="tab-tool-btn"
          style={{ width: 'auto', padding: '0 10px' }}
          onClick={handlePlay}
        >
          {state.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="tab-tool-btn"
          style={{ width: 'auto', padding: '0 10px' }}
          onClick={handleStop}
        >
          ⏹
        </button>
        <span className="tab-bpm-display">{state.track.globalBpm} BPM</span>
        <div className="tab-view-toggle">
          <button
            className={`tab-view-btn${state.viewMode === 'tab' ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'tab' })}
          >
            Tab
          </button>
          <button
            className={`tab-view-btn${state.viewMode === 'staff' ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'staff' })}
          >
            Staff
          </button>
        </div>
      </div>

      {/* Canvas */}
      {state.viewMode === 'tab' ? (
        <div className="tab-canvas" ref={canvasRef} tabIndex={0}>
          {rows.map((rowMeasures, rowIdx) => (
            <div key={rowIdx} className="tab-staff-row">
              <TabStringLabels track={state.track} />
              {rowMeasures.map((measure) => {
                const mi = globalMeasureMap.get(measure.id) ?? 0
                return (
                  <TabMeasureEl
                    key={measure.id}
                    measure={measure}
                    measureIndex={mi}
                    cursor={state.cursor}
                    selection={state.selection}
                    playheadMeasure={state.playheadMeasure}
                    playheadBeat={state.playheadBeat}
                    track={state.track}
                    onBeatMouseDown={onBeatMouseDown}
                    onBeatMouseEnter={onBeatMouseEnter}
                  />
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="tab-canvas" ref={canvasRef} tabIndex={0}>
          <StaffView
            rows={rows}
            globalMeasureMap={globalMeasureMap}
            track={state.track}
            cursor={state.cursor}
            playheadMeasure={state.playheadMeasure}
            playheadBeat={state.playheadBeat}
          />
        </div>
      )}
    </div>
  )
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

type DispatchFn = React.Dispatch<import('../tabEditorState').TabEditorAction>

interface TabToolbarProps {
  state: ReturnType<typeof createInitialTabState>
  dispatch: DispatchFn
}

const DURATIONS: { label: string; value: DurationValue }[] = [
  { label: '1/1', value: 'whole' },
  { label: '1/2', value: 'half' },
  { label: '1/4', value: 'quarter' },
  { label: '1/8', value: 'eighth' },
  { label: '1/16', value: 'sixteenth' },
  { label: '1/32', value: 'thirtysecond' },
  { label: '1/64', value: 'sixtyfourth' },
]

const MODIFIERS: { label: string; key: NoteModifierKey; title: string }[] = [
  { label: '( )', key: 'ghost', title: 'Ghost note' },
  { label: '>', key: 'accent', title: 'Accent' },
  { label: '·', key: 'staccato', title: 'Staccato' },
  { label: '∞', key: 'letRing', title: 'Let ring' },
  { label: 'PM', key: 'palmMute', title: 'Palm mute' },
  { label: 'X', key: 'dead', title: 'Dead note' },
  { label: '◇', key: 'naturalHarmonic', title: 'Natural harmonic' },
]

const CONNECTIONS: { label: string; key: NoteModifierKey; title: string }[] = [
  { label: 'h', key: 'hammerOn', title: 'Hammer-on' },
  { label: 'p', key: 'pullOff', title: 'Pull-off' },
  { label: '/', key: 'legatoSlide', title: 'Legato slide' },
  { label: '⇗', key: 'shiftSlide', title: 'Shift slide' },
  { label: '↗', key: 'slideInBelow', title: 'Slide in from below' },
  { label: '↘', key: 'slideInAbove', title: 'Slide in from above' },
  { label: '↙', key: 'slideOutDown', title: 'Slide out downward' },
  { label: '↖', key: 'slideOutUp', title: 'Slide out upward' },
  { label: '⌒', key: 'bend', title: 'Bend' },
  { label: '~', key: 'vibrato', title: 'Vibrato' },
  { label: 'tr', key: 'trill', title: 'Trill' },
  { label: '⬇', key: 'pickDown', title: 'Pickstroke down' },
  { label: '⬆', key: 'pickUp', title: 'Pickstroke up' },
]

function TabToolbar({ state, dispatch }: TabToolbarProps) {
  const { activeDuration, activeDot, activeModifiers, cursor } = state
  const mi = cursor.measureIndex
  const bi = cursor.beatIndex

  function toggleDot(key: keyof DotModifier) {
    const next: DotModifier = { ...activeDot, [key]: !activeDot[key] }
    // Mutual exclusion
    if (key === 'dotted' && next.dotted) next.doubleDotted = false
    if (key === 'doubleDotted' && next.doubleDotted) next.dotted = false
    dispatch({ type: 'SET_ACTIVE_DOT', dot: next })
  }

  return (
    <div className="tab-toolbar">
      {/* Duration group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Duration</span>
        {DURATIONS.map((d) => (
          <button
            key={d.value}
            title={d.label}
            className={`tab-tool-btn${activeDuration === d.value ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_DURATION', duration: d.value })}
          >
            {d.label}
          </button>
        ))}
        <button
          title="Dotted"
          className={`tab-tool-btn${activeDot.dotted ? ' active' : ''}`}
          onClick={() => toggleDot('dotted')}
        >
          ·
        </button>
        <button
          title="Double dotted"
          className={`tab-tool-btn${activeDot.doubleDotted ? ' active' : ''}`}
          onClick={() => toggleDot('doubleDotted')}
        >
          ··
        </button>
        <button
          title="Triplet"
          className={`tab-tool-btn${activeDot.triplet ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_DOT', dot: { ...activeDot, triplet: !activeDot.triplet } })}
        >
          3
        </button>
        <button
          title="Apply duration to current beat"
          className="tab-tool-btn"
          style={{ fontSize: '0.6rem' }}
          onClick={() => dispatch({ type: 'SET_BEAT_DURATION', measureIndex: mi, beatIndex: bi, duration: activeDuration })}
        >
          ✓dur
        </button>
      </div>

      {/* Effects group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Effects</span>
        {MODIFIERS.map((mod) => (
          <button
            key={mod.key}
            title={mod.title}
            className={`tab-tool-btn${activeModifiers[mod.key] ? ' active-effect' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_MODIFIER', modifier: mod.key })}
          >
            {mod.label}
          </button>
        ))}
      </div>

      {/* Connections group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Techniques</span>
        {CONNECTIONS.map((c) => (
          <button
            key={c.key}
            title={c.title}
            className={`tab-tool-btn${activeModifiers[c.key] ? ' active-effect' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_MODIFIER', modifier: c.key })}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Structure group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Structure</span>
        <button title="Insert beat before" className="tab-tool-btn" onClick={() => dispatch({ type: 'INSERT_BEAT_BEFORE', measureIndex: mi, beatIndex: bi })}>←+</button>
        <button title="Insert beat after" className="tab-tool-btn" onClick={() => dispatch({ type: 'INSERT_BEAT_AFTER', measureIndex: mi, beatIndex: bi })}>+→</button>
        <button title="Delete beat" className="tab-tool-btn" onClick={() => dispatch({ type: 'DELETE_BEAT', measureIndex: mi, beatIndex: bi })}>-♩</button>
        <button title="Insert measure before" className="tab-tool-btn" onClick={() => dispatch({ type: 'INSERT_MEASURE_BEFORE', measureIndex: mi })}>←𝄀</button>
        <button title="Insert measure after" className="tab-tool-btn" onClick={() => dispatch({ type: 'INSERT_MEASURE_AFTER', measureIndex: mi })}>𝄀→</button>
        <button title="Delete measure" className="tab-tool-btn" onClick={() => dispatch({ type: 'DELETE_MEASURE', measureIndex: mi })}>-𝄀</button>
      </div>

      {/* Edit group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Edit</span>
        <button title="Undo (Cmd+Z)" className="tab-tool-btn" onClick={() => dispatch({ type: 'UNDO' })}>↩</button>
        <button title="Redo (Cmd+Shift+Z)" className="tab-tool-btn" onClick={() => dispatch({ type: 'REDO' })}>↪</button>
        <button title="Copy (Cmd+C)" className="tab-tool-btn" onClick={() => dispatch({ type: 'COPY' })}>⧉</button>
        <button title="Cut (Cmd+X)" className="tab-tool-btn" onClick={() => dispatch({ type: 'CUT' })}>✂</button>
        <button
          title="Paste (Cmd+V)"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'PASTE', measureIndex: mi, beatIndex: bi })}
        >
          ⧫
        </button>
      </div>

      {/* Move group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Move</span>
        <button title="String up" className="tab-tool-btn" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'up' })}>▲str</button>
        <button title="String down" className="tab-tool-btn" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'down' })}>▼str</button>
        <button title="Beat left" className="tab-tool-btn" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'left' })}>◀</button>
        <button title="Beat right" className="tab-tool-btn" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'right' })}>▶</button>
      </div>
    </div>
  )
}

// ── Tuning Selector ─────────────────────────────────────────────────────────

interface TuningSelectorProps {
  track: TabTrack
  dispatch: DispatchFn
}

function TuningSelector({ track, dispatch }: TuningSelectorProps) {
  const counts: StringCount[] = [6, 7, 8]
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        value={track.stringCount}
        style={{ background: '#1a1a1a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem' }}
        onChange={(e) => {
          const sc = parseInt(e.target.value, 10) as StringCount
          const presets = TUNINGS[sc]
          const name = presets[0].name
          const openMidi = buildOpenMidi(name, sc)
          dispatch({ type: 'SET_TUNING', tuningName: name, stringCount: sc, openMidi })
        }}
      >
        {counts.map((c) => (
          <option key={c} value={c}>{c} strings</option>
        ))}
      </select>
      <select
        value={track.tuningName}
        style={{ background: '#1a1a1a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem' }}
        onChange={(e) => {
          const name = e.target.value
          const openMidi = buildOpenMidi(name, track.stringCount)
          dispatch({ type: 'SET_TUNING', tuningName: name, stringCount: track.stringCount, openMidi })
        }}
      >
        {TUNINGS[track.stringCount].map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}

// ── BPM Control ─────────────────────────────────────────────────────────────

interface BpmControlProps {
  bpm: number
  dispatch: DispatchFn
}

function BpmControl({ bpm, dispatch }: BpmControlProps) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: '0.8rem', color: '#888' }}>BPM</span>
      <input
        type="number"
        min={20}
        max={300}
        value={bpm}
        style={{ width: 60, background: '#1a1a1a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem' }}
        onChange={(e) => dispatch({ type: 'SET_BPM', bpm: parseInt(e.target.value, 10) || 120 })}
      />
    </div>
  )
}

// ── String labels ───────────────────────────────────────────────────────────

function TabStringLabels({ track }: { track: TabTrack }) {
  const tuning = TUNINGS[track.stringCount]
  const preset = tuning.find((p) => p.name === track.tuningName) ?? tuning[0]
  // Strings in preset are low→high; display high→low (top of tab = high E)
  const labels = [...preset.strings].reverse()
  return (
    <div className="tab-string-labels" style={{ marginTop: 14 }}>
      {labels.map((s, i) => (
        <div key={i} className="tab-string-label">{s.note}</div>
      ))}
    </div>
  )
}

// ── Measure element ──────────────────────────────────────────────────────────

interface TabMeasureElProps {
  measure: Measure
  measureIndex: number
  cursor: TabCursor
  selection: TabSelection | null
  playheadMeasure: number
  playheadBeat: number
  track: TabTrack
  onBeatMouseDown: (mi: number, bi: number, si: number) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
}

function TabMeasureEl({
  measure,
  measureIndex,
  cursor,
  selection,
  playheadMeasure,
  playheadBeat,
  track,
  onBeatMouseDown,
  onBeatMouseEnter,
}: TabMeasureElProps) {
  return (
    <div className="tab-measure">
      <div className="tab-measure-number">{measureIndex + 1}</div>
      <div className="tab-strings-container">
        {measure.beats.map((beat, bi) => {
          const isCursorCol =
            cursor.measureIndex === measureIndex && cursor.beatIndex === bi
          const isSelected = isInSelection(selection, measureIndex, bi)
          const isPlayhead = playheadMeasure === measureIndex && playheadBeat === bi
          return (
            <TabBeatColEl
              key={beat.id}
              beat={beat}
              beatIndex={bi}
              measureIndex={measureIndex}
              cursor={cursor}
              isCursorCol={isCursorCol}
              isSelected={isSelected}
              isPlayhead={isPlayhead}
              track={track}
              onBeatMouseDown={onBeatMouseDown}
              onBeatMouseEnter={onBeatMouseEnter}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Beat column element ──────────────────────────────────────────────────────

interface TabBeatColElProps {
  beat: Beat
  beatIndex: number
  measureIndex: number
  cursor: TabCursor
  isCursorCol: boolean
  isSelected: boolean
  isPlayhead: boolean
  track: TabTrack
  onBeatMouseDown: (mi: number, bi: number, si: number) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
}

function TabBeatColEl({
  beat,
  beatIndex,
  measureIndex,
  cursor,
  isCursorCol,
  isSelected,
  isPlayhead,
  track,
  onBeatMouseDown,
  onBeatMouseEnter,
}: TabBeatColElProps) {
  const w = BEAT_WIDTHS[beat.duration]
  let colClass = 'tab-beat-col'
  if (isPlayhead) colClass += ' playhead-col'
  else if (isCursorCol) colClass += ' cursor-col'
  else if (isSelected) colClass += ' selected-col'

  const colStyle: CSSProperties = { width: w, minWidth: w }

  // Display strings high→low (top = high E = last in openMidi)
  const stringCount = track.stringCount
  const stringOrder = Array.from({ length: stringCount }, (_, i) => stringCount - 1 - i)

  return (
    <div
      className={colClass}
      style={colStyle}
      onMouseDown={() => onBeatMouseDown(measureIndex, beatIndex, cursor.stringIndex)}
      onMouseEnter={() => onBeatMouseEnter(measureIndex, beatIndex)}
    >
      {/* Duration mark at top */}
      <div className="tab-duration-mark" style={{ display: 'flex', justifyContent: 'center' }}>
        {beat.duration === 'whole' ? '𝅝' :
          beat.duration === 'half' ? '𝅗' :
          beat.duration === 'quarter' ? '♩' :
          beat.duration === 'eighth' ? '♪' :
          beat.duration === 'sixteenth' ? '♬' :
          beat.duration === 'thirtysecond' ? '⋮' : '⋱'}
        {beat.dot.dotted ? '·' : beat.dot.doubleDotted ? '··' : beat.dot.triplet ? '³' : ''}
      </div>
      {/* String rows */}
      {stringOrder.map((si) => {
        const note = beat.notes[si]
        const isCursorNote =
          isCursorCol &&
          cursor.measureIndex === measureIndex &&
          cursor.beatIndex === beatIndex &&
          cursor.stringIndex === si

        let fretLabel = '—'
        let fretClass = 'tab-fret-num'
        if (note && note.fret >= 0) {
          if (note.modifiers.dead) {
            fretLabel = 'X'
            fretClass += ' dead'
          } else if (note.modifiers.naturalHarmonic) {
            fretLabel = `<${note.fret}>`
            fretClass += ' harmonic'
          } else if (note.modifiers.ghost) {
            fretLabel = `(${note.fret})`
            fretClass += ' ghost'
          } else {
            fretLabel = String(note.fret)
          }
        }

        return (
          <div
            key={si}
            className={`tab-string-row`}
            onMouseDown={(e) => {
              e.stopPropagation()
              onBeatMouseDown(measureIndex, beatIndex, si)
            }}
          >
            <div className={`tab-note-cell${isCursorNote ? ' cursor-note' : ''}`}>
              <span className={fretClass}>{fretLabel}</span>
              {note && note.fret >= 0 && note.modifiers.accent && (
                <span style={{ fontSize: '0.55rem', position: 'absolute', top: 0, right: 1, color: '#ffdd88' }}>{'>'}</span>
              )}
              {note && note.fret >= 0 && note.modifiers.palmMute && (
                <span className="tab-pm-text">PM</span>
              )}
              {note && note.fret >= 0 && note.modifiers.hammerOn && (
                <span style={{ fontSize: '0.5rem', position: 'absolute', top: -8, color: '#88ffaa' }}>h</span>
              )}
              {note && note.fret >= 0 && note.modifiers.pullOff && (
                <span style={{ fontSize: '0.5rem', position: 'absolute', top: -8, color: '#88ffaa' }}>p</span>
              )}
              {note && note.fret >= 0 && note.modifiers.legatoSlide && (
                <span style={{ fontSize: '0.55rem', position: 'absolute', top: -8, color: '#aaddff' }}>/</span>
              )}
              {note && note.fret >= 0 && note.modifiers.bend && (
                <span style={{ fontSize: '0.55rem', position: 'absolute', top: -8, color: '#ffaadd' }}>⌒</span>
              )}
              {note && note.fret >= 0 && note.modifiers.vibrato && (
                <span style={{ fontSize: '0.55rem', position: 'absolute', top: -8, color: '#ddaaff' }}>~</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Staff view ───────────────────────────────────────────────────────────────

interface StaffViewProps {
  rows: Measure[][]
  globalMeasureMap: Map<string, number>
  track: TabTrack
  cursor: TabCursor
  playheadMeasure: number
  playheadBeat: number
}

interface NoteRender {
  x: number
  y: number
  midi: number
  dir: StemDir
  tipY: number
  beatIndex: number
  measureIndex: number
  stringIndex: number
  isBeamable: boolean
}

interface BeatRenderInfo {
  x: number
  width: number
  duration: DurationValue
  notes: NoteRender[]
  isRest: boolean
  isBeamable: boolean
  measureIndex: number
  beatIndex: number
}

function StaffView({
  rows,
  globalMeasureMap,
  track,
  cursor,
  playheadMeasure,
  playheadBeat,
}: StaffViewProps) {
  const SVG_H = 200
  const CLEF_W = 30
  const TIME_SIG_W = 20

  return (
    <div className="tab-staff-view">
      {rows.map((rowMeasures, rowIdx) => {
        // Compute total width of this row
        const totalBeatsW = rowMeasures.reduce(
          (s, m) => s + m.beats.reduce((sb, b) => sb + BEAT_WIDTHS[b.duration], 0),
          0,
        )
        const svgW = CLEF_W + TIME_SIG_W + totalBeatsW + rowMeasures.length * MEASURE_LABEL_W + 16

        // Collect beat render info
        const beatInfos: BeatRenderInfo[] = []
        let xCursor = CLEF_W + TIME_SIG_W

        for (const measure of rowMeasures) {
          const mi = globalMeasureMap.get(measure.id) ?? 0
          xCursor += MEASURE_LABEL_W

          for (let bi = 0; bi < measure.beats.length; bi++) {
            const beat = measure.beats[bi]
            const bw = BEAT_WIDTHS[beat.duration]
            const xMid = xCursor + bw / 2

            const noteRenders: NoteRender[] = []
            const isBeamable = ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'].includes(beat.duration)

            for (let si = 0; si < beat.notes.length; si++) {
              const note = beat.notes[si]
              if (note.fret < 0) continue
              const openMidi = track.openMidi[si]
              if (openMidi === undefined) continue
              const midi = openMidi + note.fret
              const y = midiToStaffY(midi)
              const dir = stemDir(y)
              noteRenders.push({
                x: xMid,
                y,
                midi,
                dir,
                tipY: stemTipY(y, dir),
                beatIndex: bi,
                measureIndex: mi,
                stringIndex: si,
                isBeamable,
              })
            }

            const isRest = noteRenders.length === 0

            beatInfos.push({
              x: xMid,
              width: bw,
              duration: beat.duration,
              notes: noteRenders,
              isRest,
              isBeamable,
              measureIndex: mi,
              beatIndex: bi,
            })

            xCursor += bw
          }
        }

        // Compute beam groups: consecutive beamable beats with notes
        const beamGroups: NoteRender[][] = []
        let curGroup: NoteRender[] = []
        for (const bi of beatInfos) {
          if (bi.isBeamable && bi.notes.length > 0) {
            curGroup.push(...bi.notes)
          } else {
            if (curGroup.length >= 2) beamGroups.push(curGroup)
            curGroup = []
          }
        }
        if (curGroup.length >= 2) beamGroups.push(curGroup)

        return (
          <svg
            key={rowIdx}
            className="tab-staff-row-svg"
            width={svgW}
            height={SVG_H}
            viewBox={`0 0 ${svgW} ${SVG_H}`}
            style={{ marginBottom: 24, display: 'block' }}
          >
            {/* Staff lines */}
            {STAFF_LINES_Y.map((ly, i) => (
              <line key={i} x1={0} y1={ly} x2={svgW} y2={ly} stroke="#3a3a3a" strokeWidth={1} />
            ))}

            {/* Treble clef */}
            <text x={4} y={E4Y + 10} fontSize={60} fill="#555" fontFamily="serif" dominantBaseline="auto">𝄞</text>

            {/* Time signature */}
            <text x={CLEF_W + 2} y={E4Y - 8 * STEP + 4} fontSize={14} fill="#888" textAnchor="middle" dominantBaseline="middle">
              {track.globalTimeSig.numerator}
            </text>
            <text x={CLEF_W + 2} y={E4Y - 4 * STEP + 4} fontSize={14} fill="#888" textAnchor="middle" dominantBaseline="middle">
              {track.globalTimeSig.denominator}
            </text>

            {/* Measure barlines */}
            {(() => {
              let xBar = CLEF_W + TIME_SIG_W
              return rowMeasures.map((m, i) => {
                const mi = globalMeasureMap.get(m.id) ?? 0
                xBar += MEASURE_LABEL_W
                const xMeasureStart = xBar
                const mw = m.beats.reduce((s, b) => s + BEAT_WIDTHS[b.duration], 0)
                xBar += mw
                return (
                  <g key={i}>
                    {/* Measure number */}
                    <text x={xMeasureStart - MEASURE_LABEL_W / 2} y={STAFF_TOP_Y - 6} fontSize={10} fill="#555" textAnchor="middle">{mi + 1}</text>
                    {/* Barline */}
                    <line x1={xBar} y1={STAFF_TOP_Y} x2={xBar} y2={STAFF_BOT_Y} stroke="#555" strokeWidth={1} />
                  </g>
                )
              })
            })()}

            {/* Notes */}
            {beatInfos.map((bi, bIdx) => {
              const isCursor = cursor.measureIndex === bi.measureIndex && cursor.beatIndex === bi.beatIndex
              const isPlayhead = playheadMeasure === bi.measureIndex && playheadBeat === bi.beatIndex

              if (bi.isRest) {
                return (
                  <RestSymbol key={bIdx} x={bi.x} duration={bi.duration} />
                )
              }

              return (
                <g key={bIdx}>
                  {/* Cursor/playhead highlight */}
                  {(isCursor || isPlayhead) && (
                    <rect
                      x={bi.x - bi.width / 2}
                      y={STAFF_TOP_Y - 4}
                      width={bi.width}
                      height={STAFF_BOT_Y - STAFF_TOP_Y + 8}
                      fill={isPlayhead ? 'rgba(30,100,50,0.25)' : 'rgba(42,90,180,0.2)'}
                      rx={2}
                    />
                  )}

                  {bi.notes.map((nr, ni) => {
                    const ledgers = needsLedgerLines(nr.y)
                    const acc = getAccidental(nr.midi)
                    const isWhole = bi.duration === 'whole'
                    const isHalf = bi.duration === 'half'

                    return (
                      <g key={ni}>
                        {/* Ledger lines */}
                        {ledgers.map((ly, li) => (
                          <line key={li} x1={nr.x - 10} y1={ly} x2={nr.x + 10} y2={ly} stroke="#444" strokeWidth={1} />
                        ))}
                        {/* Accidental */}
                        {acc && (
                          <text x={nr.x - 10} y={nr.y + 4} fontSize={11} fill="#aaa" textAnchor="end">{acc}</text>
                        )}
                        {/* Note head */}
                        {isWhole ? (
                          <ellipse cx={nr.x} cy={nr.y} rx={6} ry={4.5} stroke="#e0e0e0" strokeWidth={1.5} fill="none" />
                        ) : isHalf ? (
                          <ellipse cx={nr.x} cy={nr.y} rx={5.5} ry={4} stroke="#e0e0e0" strokeWidth={1.5} fill="none" transform={`rotate(-15,${nr.x},${nr.y})`} />
                        ) : (
                          <ellipse cx={nr.x} cy={nr.y} rx={5.5} ry={4} fill="#e0e0e0" transform={`rotate(-15,${nr.x},${nr.y})`} />
                        )}
                        {/* Stem */}
                        {!isWhole && (
                          <line
                            x1={nr.dir === 'up' ? nr.x + 5 : nr.x - 5}
                            y1={nr.y}
                            x2={nr.dir === 'up' ? nr.x + 5 : nr.x - 5}
                            y2={nr.tipY}
                            stroke="#e0e0e0"
                            strokeWidth={1.5}
                          />
                        )}
                        {/* Flag for 8th note (if not beamed) */}
                        {bi.duration === 'eighth' && !isInBeamGroup(nr, beamGroups) && (
                          <path
                            d={nr.dir === 'up'
                              ? `M ${nr.x + 5} ${nr.tipY} Q ${nr.x + 18} ${nr.tipY + 10} ${nr.x + 12} ${nr.tipY + 20}`
                              : `M ${nr.x - 5} ${nr.tipY} Q ${nr.x - 18} ${nr.tipY - 10} ${nr.x - 12} ${nr.tipY - 20}`}
                            stroke="#e0e0e0" strokeWidth={1.5} fill="none"
                          />
                        )}
                        {/* Flags for 16th note */}
                        {bi.duration === 'sixteenth' && !isInBeamGroup(nr, beamGroups) && (
                          <>
                            <path
                              d={nr.dir === 'up'
                                ? `M ${nr.x + 5} ${nr.tipY} Q ${nr.x + 18} ${nr.tipY + 10} ${nr.x + 12} ${nr.tipY + 20}`
                                : `M ${nr.x - 5} ${nr.tipY} Q ${nr.x - 18} ${nr.tipY - 10} ${nr.x - 12} ${nr.tipY - 20}`}
                              stroke="#e0e0e0" strokeWidth={1.5} fill="none"
                            />
                            <path
                              d={nr.dir === 'up'
                                ? `M ${nr.x + 5} ${nr.tipY + 8} Q ${nr.x + 18} ${nr.tipY + 18} ${nr.x + 12} ${nr.tipY + 28}`
                                : `M ${nr.x - 5} ${nr.tipY - 8} Q ${nr.x - 18} ${nr.tipY - 18} ${nr.x - 12} ${nr.tipY - 28}`}
                              stroke="#e0e0e0" strokeWidth={1.5} fill="none"
                            />
                          </>
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* Beams */}
            {beamGroups.map((group, gi) => {
              const first = group[0]
              const last = group[group.length - 1]
              if (!first || !last) return null
              // Dominant direction: use first note's direction
              const dir = first.dir
              const stemX = (nr: NoteRender) => nr.dir === 'up' ? nr.x + 5 : nr.x - 5

              return (
                <g key={gi}>
                  {/* Primary beam */}
                  <line
                    x1={stemX(first)} y1={first.tipY}
                    x2={stemX(last)} y2={last.tipY}
                    stroke="#e0e0e0" strokeWidth={4}
                  />
                  {/* Secondary beam for 16th notes */}
                  {group.some((nr) => beatInfos.find((bi) =>
                    bi.notes.includes(nr) && ['sixteenth', 'thirtysecond', 'sixtyfourth'].includes(bi.duration)
                  )) && (
                    <line
                      x1={stemX(first)} y1={first.tipY + (dir === 'up' ? 6 : -6)}
                      x2={stemX(last)} y2={last.tipY + (dir === 'up' ? 6 : -6)}
                      stroke="#e0e0e0" strokeWidth={4}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        )
      })}
    </div>
  )
}

function isInBeamGroup(nr: NoteRender, groups: NoteRender[][]): boolean {
  return groups.some((g) => g.includes(nr))
}

// ── Rest symbols ─────────────────────────────────────────────────────────────

function RestSymbol({ x, duration }: { x: number; duration: DurationValue }) {
  const midY = E4Y - 4 * STEP // B4
  switch (duration) {
    case 'whole':
      return <rect x={x - 8} y={midY - 10} width={16} height={5} fill="#888" />
    case 'half':
      return <rect x={x - 8} y={midY - 5} width={16} height={5} fill="#888" />
    case 'quarter':
      return (
        <path
          d={`M ${x} ${midY - 14} L ${x + 5} ${midY - 8} L ${x - 3} ${midY - 4} L ${x + 4} ${midY + 2} L ${x} ${midY + 8}`}
          stroke="#888" strokeWidth={2} fill="none"
        />
      )
    case 'eighth':
      return (
        <g>
          <circle cx={x} cy={midY + 4} r={3} fill="#888" />
          <line x1={x + 3} y1={midY + 4} x2={x + 3} y2={midY - 8} stroke="#888" strokeWidth={1.5} />
          <path d={`M ${x + 3} ${midY - 8} Q ${x + 12} ${midY - 4} ${x + 8} ${midY + 2}`} stroke="#888" strokeWidth={1.5} fill="none" />
        </g>
      )
    default:
      return <text x={x} y={midY} fontSize={12} fill="#888" textAnchor="middle">𝄾</text>
  }
}

