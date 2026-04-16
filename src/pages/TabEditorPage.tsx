import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import './TabEditorPage.css'
import type { TabSelection } from '../tabEditorTypes'
import {
  tabEditorReducer,
  createInitialTabState,
  saveTabTrack,
  fretToFreq,
} from '../tabEditorState'
import { TabPlaybackEngine } from '../audio/TabPlaybackEngine'
import { pluckString } from '../audio/pluckString'
import {
  TabEditorHeader,
  TabEditorToolbar,
  TabEditorPlayback,
  TabSvgCanvas,
} from '../components/TabEditor'

// Module-level playback engine singleton
const playbackEngine = new TabPlaybackEngine()

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

  // Sync playback engine when playing
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

  const handleDigit = useCallback(
    (d: number) => {
      if (digitTimerRef.current !== null) clearTimeout(digitTimerRef.current)
      if (digitBufRef.current !== null) {
        const combined = digitBufRef.current * 10 + d
        digitBufRef.current = null
        commitFret(combined)
      } else if (d >= 1) {
        digitBufRef.current = d
        digitTimerRef.current = setTimeout(() => {
          const val = digitBufRef.current
          digitBufRef.current = null
          if (val !== null) commitFret(val)
        }, 700)
      } else {
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
      playbackEngine.start(
        state.track,
        state.playheadMeasure,
        state.playheadBeat,
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

  // Drag selection
  function onBeatMouseDown(mi: number, bi: number, si: number) {
    dragRef.current = { measureIndex: mi, beatIndex: bi }
    dispatch({ type: 'SET_SELECTION', selection: null })
    dispatch({ type: 'SET_CURSOR', cursor: { measureIndex: mi, beatIndex: bi, stringIndex: si } })
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
        onBeatMouseDown={onBeatMouseDown}
        onBeatMouseEnter={onBeatMouseEnter}
      />
    </div>
  )
}
