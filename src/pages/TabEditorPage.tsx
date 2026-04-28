import { useReducer, useEffect, useRef, useCallback, useState, useMemo } from 'react'
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
  TabEditorErrorBoundary,
  TabEditorHeader,
  TabEditorToolbar,
  TabEditorPlayback,
  TabSvgCanvas,
} from '../components/TabEditor'
import { useAuthenticator } from '@aws-amplify/ui-react'
import {
  loadCloudTabTracks,
  saveCloudTabTrack,
  updateCloudTabTrack,
  deleteCloudTabTrack,
  type CloudTabTrack,
} from '../api/tabEditorApi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2 } from 'lucide-react'

const playbackEngine = new TabPlaybackEngine()

interface SaveMetadataDialogProps {
  open: boolean
  initialValues: { title: string; artist: string; tabAuthor: string; year: string }
  onClose: () => void
  onSave: (values: { title: string; artist: string; tabAuthor: string; year: string }) => Promise<void>
}

function SaveMetadataDialog({ open, initialValues, onClose, onSave }: SaveMetadataDialogProps) {
  const [title, setTitle] = useState(initialValues.title)
  const [artist, setArtist] = useState(initialValues.artist)
  const [tabAuthor, setTabAuthor] = useState(initialValues.tabAuthor)
  const [year, setYear] = useState(initialValues.year)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [validated, setValidated] = useState(false)

  async function handleSave() {
    setValidated(true)
    if (!title.trim() || !artist.trim() || !tabAuthor.trim() || !year.trim()) return
    setStatus('saving')
    try {
      await onSave({ title: title.trim(), artist: artist.trim(), tabAuthor: tabAuthor.trim(), year: year.trim() })
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 1500)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 1500)
    }
  }

  const fields = [
    { id: 'dlg-title', label: 'Song title', value: title, set: setTitle },
    { id: 'dlg-artist', label: 'Artist / band', value: artist, set: setArtist },
    { id: 'dlg-tabauthor', label: 'Tab author', value: tabAuthor, set: setTabAuthor },
    { id: 'dlg-year', label: 'Year', value: year, set: setYear },
  ] as const

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Complete tab info to save</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-[#888] -mt-1">Fill in the missing fields below, then save.</p>
        <div className="flex flex-col gap-3 pt-1">
          {fields.map(({ id, label, value, set }) => {
            const isMissing = validated && !value.trim()
            return (
              <div key={id} className="flex flex-col gap-1">
                <Label htmlFor={id} className={isMissing ? 'text-red-400' : ''}>{label}</Label>
                <Input
                  id={id}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
                  className={isMissing ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  autoFocus={id === 'dlg-title'}
                />
                {isMissing && <span className="text-xs text-red-400">Required</span>}
              </div>
            )
          })}
          <Button onClick={() => void handleSave()} disabled={status === 'saving'} className="mt-1">
            {status === 'saving' ? 'Saving…' : status === 'ok' ? 'Saved!' : status === 'error' ? 'Error — try again' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface SaveCopyDialogProps {
  open: boolean
  initialValues: { title: string; artist: string; tabAuthor: string; year: string }
  nextVersion: number
  onClose: () => void
  onSave: (values: { title: string; artist: string; tabAuthor: string; year: string }) => Promise<void>
}

function SaveCopyDialog({ open, initialValues, nextVersion, onClose, onSave }: SaveCopyDialogProps) {
  const [title, setTitle] = useState(initialValues.title)
  const [artist, setArtist] = useState(initialValues.artist)
  const [tabAuthor, setTabAuthor] = useState(initialValues.tabAuthor)
  const [year, setYear] = useState(initialValues.year)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [validated, setValidated] = useState(false)

  async function handleSave() {
    setValidated(true)
    if (!title.trim() || !artist.trim() || !tabAuthor.trim() || !year.trim()) return
    setStatus('saving')
    try {
      await onSave({ title: title.trim(), artist: artist.trim(), tabAuthor: tabAuthor.trim(), year: year.trim() })
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 1500)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 1500)
    }
  }

  const fields = [
    { id: 'cp-title', label: 'Song title', value: title, set: setTitle },
    { id: 'cp-artist', label: 'Artist / band', value: artist, set: setArtist },
    { id: 'cp-tabauthor', label: 'Tab author', value: tabAuthor, set: setTabAuthor },
    { id: 'cp-year', label: 'Year', value: year, set: setYear },
  ] as const

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Save as New Copy</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          {fields.map(({ id, label, value, set }) => {
            const isMissing = validated && !value.trim()
            return (
              <div key={id} className="flex flex-col gap-1">
                <Label htmlFor={id} className={isMissing ? 'text-red-400' : ''}>{label}</Label>
                <Input
                  id={id}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
                  className={isMissing ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  autoFocus={id === 'cp-title'}
                />
                {isMissing && <span className="text-xs text-red-400">Required</span>}
              </div>
            )
          })}
          <div className="flex flex-col gap-1">
            <Label className="text-[#888]">Version</Label>
            <Input value={`v${nextVersion}`} readOnly className="opacity-50 cursor-default" tabIndex={-1} />
          </div>
          <Button onClick={() => void handleSave()} disabled={status === 'saving'} className="mt-1">
            {status === 'saving' ? 'Saving…' : status === 'ok' ? 'Saved!' : status === 'error' ? 'Error — try again' : 'Save Copy'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TabEditorPage() {
  const [state, dispatch] = useReducer(tabEditorReducer, undefined, createInitialTabState)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [menuOpen, setMenuOpen] = useState(true)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const digitBufRef = useRef<number | null>(null)
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCursorRef = useRef<TabCursor | null>(null)
  const dragRef = useRef<{ measureIndex: number; beatIndex: number } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handlePlayRef = useRef<() => void>(() => {})

  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus])

  const [loadedCloudId, setLoadedCloudId] = useState<string | null>(null)

  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const [metadataDialogKey, setMetadataDialogKey] = useState(0)
  const [metadataDialogInitial, setMetadataDialogInitial] = useState({ title: '', artist: '', tabAuthor: '', year: '' })

  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [copyDialogKey, setCopyDialogKey] = useState(0)

  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [savedTabs, setSavedTabs] = useState<CloudTabTrack[]>([])
  const [loadingTabs, setLoadingTabs] = useState(false)

  const [cleanSnapshot, setCleanSnapshot] = useState(() => JSON.stringify(state.track))
  const currentTrackString = useMemo(() => JSON.stringify(state.track), [state.track])
  const isDirty = currentTrackString !== cleanSnapshot

  useEffect(() => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveTabTrack(state.track), 1000)
    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    }
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

  const previewBeat = useCallback(
    (at: TabCursor, overrideFret?: { stringIndex: number; fret: number }) => {
      const beat = state.track.measures[at.measureIndex]?.beats[at.beatIndex]
      const ctx = ensureCtx()
      const openMidi = state.track.openMidi
      const played = new Set<number>()
      if (overrideFret) {
        const { stringIndex, fret } = overrideFret
        if (fret >= 0 && openMidi[stringIndex] !== undefined) {
          pluckString(ctx, fretToFreq(openMidi[stringIndex]!, fret), ctx.currentTime, 0.7)
          played.add(stringIndex)
        }
      }
      if (beat) {
        beat.notes.forEach((note, si) => {
          if (played.has(si)) return
          if (note.fret < 0) return
          const open = openMidi[si]
          if (open === undefined) return
          pluckString(ctx, fretToFreq(open, note.fret), ctx.currentTime, 0.7)
        })
      }
    },
    [state.track.measures, state.track.openMidi],
  )

  const commitFretAt = useCallback(
    (fret: number, at: TabCursor) => {
      if (fret > 24) return
      dispatch({ type: 'ADD_NOTE', measureIndex: at.measureIndex, beatIndex: at.beatIndex, stringIndex: at.stringIndex, fret })
      previewBeat(at, { stringIndex: at.stringIndex, fret })
    },
    [previewBeat],
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

      if (e.key === ' ' && !state.pendingOverflow) {
        e.preventDefault()
        handlePlayRef.current()
        return
      }

      if (state.isPlaying) return

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
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          flushDigitBuf()
          setIsNavigating(true)
          if (navTimerRef.current !== null) clearTimeout(navTimerRef.current)
          navTimerRef.current = setTimeout(() => setIsNavigating(false), 150)
          if (e.key === 'ArrowLeft') {
            if (e.shiftKey) dispatch({ type: 'SHIFT_MOVE_CURSOR', direction: 'left' })
            else dispatch({ type: 'MOVE_CURSOR', direction: 'left' })
          } else if (e.key === 'ArrowRight') {
            if (e.shiftKey) dispatch({ type: 'SHIFT_MOVE_CURSOR', direction: 'right' })
            else dispatch({ type: 'MOVE_CURSOR', direction: 'right' })
          } else if (e.key === 'ArrowUp') {
            dispatch({ type: 'MOVE_CURSOR', direction: 'up' })
          } else {
            dispatch({ type: 'MOVE_CURSOR', direction: 'down' })
          }
          return
        }
        case 'Backspace':
        case 'Delete': {
          e.preventDefault()
          const beat = state.track.measures[cursor.measureIndex]?.beats[cursor.beatIndex]
          if (!beat) return
          const currentNote = beat.notes[cursor.stringIndex]
          if (currentNote && currentNote.fret >= 0) {
            dispatch({
              type: 'DELETE_NOTE',
              measureIndex: cursor.measureIndex,
              beatIndex: cursor.beatIndex,
              stringIndex: cursor.stringIndex,
            })
            return
          }
          // Current string is empty — delete the beat only if all notes are empty
          // or all non-empty notes are highlighted
          const hasUnhighlightedNote = beat.notes.some((n, si) => {
            if (n.fret < 0) return false
            return !state.noteSelection.some(
              (sel) =>
                sel.measureIndex === cursor.measureIndex &&
                sel.beatIndex === cursor.beatIndex &&
                sel.stringIndex === si,
            )
          })
          if (!hasUnhighlightedNote) {
            dispatch({
              type: 'DELETE_BEAT',
              measureIndex: cursor.measureIndex,
              beatIndex: cursor.beatIndex,
            })
          }
          return
        }
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

  function getMissingMetadataFields() {
    const missing: { key: 'title' | 'artist' | 'tabAuthor' | 'year'; label: string }[] = []
    if (!state.track.title?.trim()) missing.push({ key: 'title', label: 'Song title' })
    if (!state.track.artist?.trim()) missing.push({ key: 'artist', label: 'Artist / band' })
    if (!state.track.tabAuthor?.trim()) missing.push({ key: 'tabAuthor', label: 'Tab author' })
    if (!state.track.year?.trim()) missing.push({ key: 'year', label: 'Year' })
    return missing
  }

  async function saveCloud(trackOverride?: typeof state.track) {
    const track = trackOverride ?? state.track
    const name = track.title || 'Tab'
    let result: CloudTabTrack | null
    if (loadedCloudId) {
      result = await updateCloudTabTrack(loadedCloudId, name, track)
    } else {
      result = await saveCloudTabTrack(name, track)
    }
    if (result) {
      setLoadedCloudId(result.id)
      setCleanSnapshot(JSON.stringify(track))
      setMetadataDialogOpen(false)
    } else {
      throw new Error('save failed')
    }
  }

  function handleSaveClick() {
    const missing = getMissingMetadataFields()
    if (missing.length === 0) {
      void saveCloud()
      return
    }
    setMetadataDialogInitial({
      title: state.track.title,
      artist: state.track.artist ?? '',
      tabAuthor: state.track.tabAuthor ?? '',
      year: state.track.year ?? '',
    })
    setMetadataDialogKey((k) => k + 1)
    setMetadataDialogOpen(true)
  }

  async function saveFromDialog(values: { title: string; artist: string; tabAuthor: string; year: string }) {
    dispatch({ type: 'SET_METADATA', patch: values })
    await saveCloud({ ...state.track, ...values })
  }

  function handleSaveCopyClick() {
    setCopyDialogKey((k) => k + 1)
    setCopyDialogOpen(true)
  }

  async function saveCopy(values: { title: string; artist: string; tabAuthor: string; year: string }) {
    const nextVersion = (state.track.version ?? 1) + 1
    const newTrack = { ...state.track, ...values, version: nextVersion }
    const result = await saveCloudTabTrack(newTrack.title || 'Tab', newTrack)
    if (!result) throw new Error('save failed')
    dispatch({ type: 'SET_METADATA', patch: { ...values, version: nextVersion } })
    setLoadedCloudId(result.id)
    setCleanSnapshot(JSON.stringify(newTrack))
    setCopyDialogOpen(false)
  }

  async function openLoadDialog() {
    setLoadDialogOpen(true)
    setLoadingTabs(true)
    setSavedTabs(await loadCloudTabTracks())
    setLoadingTabs(false)
  }

  function loadTab(saved: CloudTabTrack) {
    setCleanSnapshot(JSON.stringify(saved.track))
    setLoadedCloudId(saved.id)
    dispatch({ type: 'LOAD_TRACK', track: saved.track })
    setLoadDialogOpen(false)
  }

  async function deleteTab(id: string) {
    await deleteCloudTabTrack(id)
    setSavedTabs((prev) => prev.filter((t) => t.id !== id))
  }

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
  useEffect(() => { handlePlayRef.current = handlePlay })

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
      <div className="tab-sticky-top">
        {menuOpen && (
          <>
            <TabEditorHeader
              track={state.track}
              dispatch={dispatch}
              isDirty={isDirty}
              onSave={authStatus === 'authenticated' ? handleSaveClick : undefined}
              onSaveCopy={authStatus === 'authenticated' ? handleSaveCopyClick : undefined}
              onLoad={authStatus === 'authenticated' ? () => void openLoadDialog() : undefined}
            />
            <TabEditorToolbar state={state} dispatch={dispatch} isNavigating={isNavigating} />
          </>
        )}
        <TabEditorPlayback
          isPlaying={state.isPlaying}
          viewMode={state.viewMode}
          onPlay={handlePlay}
          onStop={handleStop}
          dispatch={dispatch}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((m) => !m)}
        />
      </div>
      <TabEditorErrorBoundary>
        <TabSvgCanvas
          state={state}
          containerWidth={containerWidth}
          canvasRef={canvasRef}
          dispatch={dispatch}
          onBeatMouseDown={onBeatMouseDown}
          onBeatMouseEnter={onBeatMouseEnter}
        />
      </TabEditorErrorBoundary>

      {/* Missing metadata dialog */}
      <SaveMetadataDialog
        key={`meta-${metadataDialogKey}`}
        open={metadataDialogOpen}
        initialValues={metadataDialogInitial}
        onClose={() => setMetadataDialogOpen(false)}
        onSave={saveFromDialog}
      />

      {/* Save copy dialog */}
      <SaveCopyDialog
        key={`copy-${copyDialogKey}`}
        open={copyDialogOpen}
        initialValues={{
          title: state.track.title,
          artist: state.track.artist ?? '',
          tabAuthor: state.track.tabAuthor ?? '',
          year: state.track.year ?? '',
        }}
        nextVersion={(state.track.version ?? 1) + 1}
        onClose={() => setCopyDialogOpen(false)}
        onSave={saveCopy}
      />

      {/* Load dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Load Saved Tab</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 pt-2 max-h-[480px] overflow-y-auto">
            {loadingTabs && <p className="text-xs text-[#888]">Loading…</p>}
            {!loadingTabs && savedTabs.length === 0 && (
              <p className="text-xs text-[#888]">No saved tabs yet.</p>
            )}
            {savedTabs.map((saved) => (
              <div key={saved.id} className="flex items-center gap-2">
                <button
                  className="flex-1 text-left text-sm px-3 py-2 rounded hover:bg-white/[0.06] transition-colors"
                  onClick={() => loadTab(saved)}
                >
                  <span className="font-medium">{saved.name}</span>
                  <span className="text-xs text-[#888] ml-2">{saved.track.stringCount}-string · {saved.track.tuningName}</span>
                  {saved.track.artist && <span className="text-xs text-[#666] ml-1">· {saved.track.artist}</span>}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  title="Delete"
                  onClick={() => void deleteTab(saved.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
