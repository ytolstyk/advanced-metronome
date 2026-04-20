import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import './TabEditorPage.css'
import type { TabCursor } from '../tabEditorTypes'
import {
  tabEditorReducer,
  createInitialTabState,
  saveTabTrack,
  fretToFreq,
  quarterBeatsToNearestDuration,
  measureCapacityBeats,
  measureUsedBeats,
} from '../tabEditorState'
import { TabPlaybackEngine } from '../audio/TabPlaybackEngine'
import { pluckString } from '../audio/pluckString'
import {
  TabEditorHeader,
  TabEditorToolbar,
  TabEditorPlayback,
  TabSvgCanvas,
} from '../components/TabEditor'

const playbackEngine = new TabPlaybackEngine()

export function TabEditorPage() {
  const [state, dispatch] = useReducer(tabEditorReducer, undefined, createInitialTabState)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const digitBufRef = useRef<number | null>(null)
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCursorRef = useRef<TabCursor | null>(null)
  const dragRef = useRef<{ measureIndex: number; beatIndex: number } | null>(null)

  useEffect(() => {
    saveTabTrack(state.track)
  }, [state.track])

  useEffect(() => {
    if (state.isPlaying) playbackEngine.updateTrack(state.track)
  }, [state.track, state.isPlaying])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function ensureCtx(): AudioContext {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume()
    return audioCtxRef.current
  }

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

  const commitFretAt = useCallback(
    (fret: number, at: TabCursor) => {
      if (fret > 24) return
      dispatch({ type: 'ADD_NOTE', measureIndex: at.measureIndex, beatIndex: at.beatIndex, stringIndex: at.stringIndex, fret })
      previewNote(at.stringIndex, fret)
    },
    [previewNote],
  )

  const handleDigit = useCallback(
    (d: number) => {
      // Don't buffer digits while overflow dialog is open
      if (state.pendingOverflow) return

      if (digitTimerRef.current !== null) clearTimeout(digitTimerRef.current)
      if (digitBufRef.current !== null && prevCursorRef.current !== null) {
        const combined = digitBufRef.current * 10 + d
        const prevAt = prevCursorRef.current
        digitBufRef.current = null
        prevCursorRef.current = null
        if (combined <= 24) {
          dispatch({ type: 'UNDO' })
          commitFretAt(combined, prevAt)
        }
      } else if (d === 0) {
        digitBufRef.current = null
        prevCursorRef.current = null
        commitFretAt(0, state.cursor)
      } else {
        prevCursorRef.current = { ...state.cursor }
        digitBufRef.current = d
        commitFretAt(d, state.cursor)
        digitTimerRef.current = setTimeout(() => {
          digitBufRef.current = null
          prevCursorRef.current = null
        }, 400)
      }
    },
    [commitFretAt, state.cursor, state.pendingOverflow],
  )

  const flushDigitBuf = useCallback(() => {
    if (digitTimerRef.current !== null) clearTimeout(digitTimerRef.current)
    digitBufRef.current = null
    prevCursorRef.current = null
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      // Block keyboard input while overflow dialog is open
      if (state.pendingOverflow) {
        if (e.key === 'Escape') {
          e.preventDefault()
          dispatch({ type: 'DISMISS_OVERFLOW' })
        }
        return
      }

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

  function handlePlay() {
    const ctx = ensureCtx()
    if (state.isPlaying) {
      playbackEngine.pause()
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
    } else {
      playbackEngine.start(
        state.track,
        state.cursor.measureIndex,
        state.cursor.beatIndex,
        (mi, bi) => dispatch({ type: 'SET_PLAYHEAD', measureIndex: mi, beatIndex: bi }),
        () => {
          dispatch({ type: 'SET_PLAYING', isPlaying: false })
          dispatch({ type: 'SET_PLAYHEAD', measureIndex: 0, beatIndex: 0 })
        },
      )
      if (ctx.state === 'suspended') void ctx.resume()
      dispatch({ type: 'SET_PLAYING', isPlaying: true })
    }
  }

  function handleStop() {
    playbackEngine.stop()
    dispatch({ type: 'SET_PLAYING', isPlaying: false })
    dispatch({ type: 'SET_PLAYHEAD', measureIndex: 0, beatIndex: 0 })
  }

  function onBeatMouseDown(mi: number, bi: number, si: number, shiftKey: boolean) {
    if (shiftKey) {
      dispatch({ type: 'ENSURE_NOTE_IN_SELECTION', cursor: state.cursor })
      dispatch({ type: 'TOGGLE_NOTE_IN_SELECTION', cursor: { measureIndex: mi, beatIndex: bi, stringIndex: si } })
      dispatch({ type: 'SET_CURSOR', cursor: { measureIndex: mi, beatIndex: bi, stringIndex: si } })
      canvasRef.current?.focus()
      return
    }
    dragRef.current = { measureIndex: mi, beatIndex: bi }
    dispatch({ type: 'SET_SELECTION', selection: null })
    dispatch({ type: 'CLEAR_NOTE_SELECTION' })
    dispatch({ type: 'SET_CURSOR', cursor: { measureIndex: mi, beatIndex: bi, stringIndex: si } })
    canvasRef.current?.focus()
  }

  function onBeatMouseEnter(mi: number, bi: number) {
    if (!dragRef.current) return
    const start = dragRef.current
    dispatch({
      type: 'SET_SELECTION',
      selection: {
        startMeasure: start.measureIndex,
        startBeat: start.beatIndex,
        endMeasure: mi,
        endBeat: bi,
      },
    })
  }

  function onMouseUp() {
    dragRef.current = null
  }

  // Overflow dialog helpers
  const overflow = state.pendingOverflow
  let trimLabel = ''
  let bleedLabel = ''
  if (overflow) {
    const measure = state.track.measures[overflow.measureIndex]
    if (measure) {
      const timeSig = measure.timeSignature ?? state.track.globalTimeSig
      const capacity = measureCapacityBeats(timeSig)
      const used = measureUsedBeats(
        overflow.beatIndex === measure.beats.length
          ? measure.beats
          : measure.beats.filter((_, i) => i !== overflow.beatIndex),
      )
      const remaining = Math.max(0, capacity - used)
      const { duration: trimDur } = quarterBeatsToNearestDuration(remaining)
      trimLabel = trimDur.replace('thirtysecond', '1/32').replace('sixtyfourth', '1/64')
        .replace('sixteenth', '1/16').replace('eighth', '1/8').replace('quarter', '1/4')
        .replace('half', '1/2').replace('whole', 'whole')

      const overshootStr = overflow.overshootBeats === Math.round(overflow.overshootBeats)
        ? `${overflow.overshootBeats} beat${overflow.overshootBeats !== 1 ? 's' : ''}`
        : `${overflow.overshootBeats.toFixed(2)} beats`
      bleedLabel = `Bleed ${overshootStr} into next measure`
    }
  }

  return (
    <div className="tab-editor-page" onMouseUp={onMouseUp}>
      <TabEditorHeader track={state.track} dispatch={dispatch} />
      <TabEditorToolbar state={state} dispatch={dispatch} />
      <TabEditorPlayback
        isPlaying={state.isPlaying}
        bpm={state.track.globalBpm}
        viewMode={state.viewMode}
        onPlay={handlePlay}
        onStop={handleStop}
        dispatch={dispatch}
      />
      <TabSvgCanvas
        state={state}
        containerWidth={containerWidth}
        canvasRef={canvasRef}
        dispatch={dispatch}
        onBeatMouseDown={onBeatMouseDown}
        onBeatMouseEnter={onBeatMouseEnter}
      />

      {/* Overflow dialog */}
      {overflow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) dispatch({ type: 'DISMISS_OVERFLOW' }) }}
        >
          <div
            style={{
              background: '#1c1c1c',
              border: '1px solid #444',
              borderRadius: 10,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              minWidth: 300,
              maxWidth: 400,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span style={{ color: '#e0a040', fontWeight: 600, fontSize: '0.95rem' }}>
                Note doesn't fit in this measure
              </span>
            </div>
            <div style={{ color: '#999', fontSize: '0.82rem', lineHeight: 1.5 }}>
              A <strong style={{ color: '#ccc' }}>{overflow.newDuration}</strong> note at this position
              exceeds the measure's remaining capacity.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => dispatch({ type: 'RESOLVE_OVERFLOW_TRIM' })}
                style={{
                  padding: '8px 14px',
                  background: '#1a3a5c',
                  border: '1px solid #2a5a8c',
                  borderRadius: 6,
                  color: '#7ac0ff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                }}
              >
                Trim to <strong>{trimLabel}</strong> (fits the measure)
              </button>
              <button
                onClick={() => dispatch({ type: 'RESOLVE_OVERFLOW_BLEED' })}
                style={{
                  padding: '8px 14px',
                  background: '#1a2a1c',
                  border: '1px solid #2a5c2e',
                  borderRadius: 6,
                  color: '#7adb8c',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                }}
              >
                {bleedLabel}
              </button>
              <button
                onClick={() => dispatch({ type: 'DISMISS_OVERFLOW' })}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: 6,
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                Cancel (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
