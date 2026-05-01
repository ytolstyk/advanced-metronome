import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { Play, Pause, Square, Link, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabSvgCanvas, TabEditorErrorBoundary } from '../components/TabEditor'
import { TabPlaybackEngine } from '../audio/TabPlaybackEngine'
import { loadPublishedTab, getCurrentUsername, type PublishedTabRecord } from '../api/publishedTabApi'
import type { TabTrack, TabEditorState } from '../tabEditorTypes'
import type { TabEditorAction } from '../tabEditorState'
import './PublishedTabViewPage.css'

const playbackEngine = new TabPlaybackEngine()

const NOOP_DISPATCH: React.Dispatch<TabEditorAction> = () => {}

export function PublishedTabViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus])

  const [tab, setTab] = useState<PublishedTabRecord | null>(null)
  const [track, setTrack] = useState<TabTrack | null>(null)
  const [isLoading, setIsLoading] = useState(!!id)
  const [notFound, setNotFound] = useState(!id)
  const [isOwner, setIsOwner] = useState(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadMeasure, setPlayheadMeasure] = useState(0)
  const [playheadBeat, setPlayheadBeat] = useState(0)
  const [highlightColumn, setHighlightColumn] = useState<{ measureIndex: number; beatIndex: number } | null>(null)
  const [startMeasure, setStartMeasure] = useState(0)
  const [startBeat, setStartBeat] = useState(0)
  const [containerWidth, setContainerWidth] = useState(800)
  const [copySuccess, setCopySuccess] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const directBeatHandlerRef = useRef<((mi: number, bi: number, intendedTime: number) => void) | null>(null)
const onRegisterBeatHandler = useCallback((handler: (mi: number, bi: number, intendedTime: number) => void) => {
    directBeatHandlerRef.current = handler
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const result = await loadPublishedTab(id!)
      if (cancelled) return
      if (!result) { setNotFound(true); setIsLoading(false); return }
      try {
        const parsed = JSON.parse(result.trackJson) as TabTrack
        setTab(result)
        setTrack(parsed)
      } catch {
        setNotFound(true)
      }
      setIsLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!tab?.owner || authStatus !== 'authenticated') return
    let cancelled = false
    void getCurrentUsername().then((username) => {
      if (cancelled) return
      if (!username) return
      setIsOwner(!!(tab.owner === username || tab.owner?.startsWith(username + '::')))
    })
    return () => { cancelled = true }
  }, [tab, authStatus])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => { setContainerWidth(entries[0].contentRect.width) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => { playbackEngine.stop() }
  }, [])

  const handleBeat = useCallback((mi: number, bi: number, intendedTime: number) => {
    directBeatHandlerRef.current?.(mi, bi, intendedTime)
    setPlayheadMeasure(mi)
    setPlayheadBeat(bi)
  }, [])

  const handleStop = useCallback(() => {
    setIsPlaying(false)
    setPlayheadMeasure(0)
    setPlayheadBeat(0)
  }, [])

  function handlePlay() {
    if (!track) return
    if (isPlaying) {
      playbackEngine.pause()
      setIsPlaying(false)
    } else {
      playbackEngine.start(track, startMeasure, startBeat, handleBeat, handleStop)
      setIsPlaying(true)
    }
  }

  function handleStopClick() {
    playbackEngine.stop()
    setIsPlaying(false)
    setPlayheadMeasure(0)
    setPlayheadBeat(0)
  }

  const handleBeatMouseDown = useCallback((mi: number, bi: number) => {
    setHighlightColumn({ measureIndex: mi, beatIndex: bi })
    setStartMeasure(mi)
    setStartBeat(bi)
    if (isPlaying && track) {
      playbackEngine.stop()
      playbackEngine.start(track, mi, bi, handleBeat, handleStop)
    }
  }, [isPlaying, track, handleBeat, handleStop])

  const handleOpenInEditor = useCallback(() => {
    if (!track) return
    navigate('/tab-editor', {
      state: {
        importedTrack: track,
        sourcePublishedTabId: tab?.id,
        isOwner,
      },
    })
  }, [track, tab, isOwner, navigate])

  const handleCopyLink = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 1500)
    })
  }, [])

  const displayState = useMemo((): TabEditorState => ({
    track: track ?? {
      title: '', globalBpm: 120,
      globalTimeSig: { numerator: 4, denominator: 4 },
      stringCount: 6, tuningName: 'Standard', openMidi: [], measures: [],
    },
    cursor: { measureIndex: -1, beatIndex: -1, stringIndex: -1 },
    selection: null,
    selectionAnchor: null,
    noteSelection: [],
    clipboard: null,
    activeDuration: 'quarter',
    activeDot: { dotted: false, doubleDotted: false, triplet: false },
    activeModifiers: {},
    isPlaying,
    playheadMeasure,
    playheadBeat,
    pendingOverflow: null,
    undoStack: [],
    redoStack: [],
  }), [track, isPlaying, playheadMeasure, playheadBeat])

  if (!isLoading && authStatus !== 'authenticated') {
    return (
      <div className="pub-tab-not-found">
        <p>Sign in to view published tabs.</p>
        <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
      </div>
    )
  }

  if (isLoading) {
    return <div className="pub-tab-loading">Loading…</div>
  }

  if (notFound || !track) {
    return (
      <div className="pub-tab-not-found">
        <p>Tab not found.</p>
        <Button variant="outline" onClick={() => navigate('/tabs')}>Tab Library</Button>
      </div>
    )
  }

  const subtitle = [tab?.artist, tab?.year].filter(Boolean).join(' · ')
  const authorLine = tab?.tabAuthor ? `Tab by ${tab.tabAuthor}` : ''

  return (
    <div className="pub-tab-page">
      <div className="pub-tab-meta">
        <div className="pub-tab-meta-info">
          <div className="pub-tab-title">{track.title || 'Untitled'}</div>
          {(subtitle || authorLine) && (
            <div className="pub-tab-subtitle">
              {[subtitle, authorLine].filter(Boolean).join(' — ')}
            </div>
          )}
        </div>
        <div className="pub-tab-actions">
          <Button variant="ghost" size="sm" onClick={handleCopyLink}>
            <Link size={13} /> {copySuccess ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenInEditor}>
            <ExternalLink size={13} /> {isOwner ? 'Edit' : 'Open in Editor'}
          </Button>
        </div>
      </div>

      <div className="pub-tab-playback-bar">
        <Button variant="ghost" size="icon" onClick={handlePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleStopClick} title="Stop">
          <Square size={16} />
        </Button>
        <span className="pub-tab-hint">Click a beat to set playback start</span>
      </div>

      <div className="pub-tab-canvas" ref={canvasRef}>
        <TabEditorErrorBoundary>
          <TabSvgCanvas
            state={displayState}
            containerWidth={containerWidth}
            canvasRef={canvasRef}
            dispatch={NOOP_DISPATCH}
            onBeatMouseDown={handleBeatMouseDown}
            onBeatMouseEnter={() => {}}
            onRegisterBeatHandler={onRegisterBeatHandler}
            readOnly
            highlightColumn={highlightColumn}
          />
        </TabEditorErrorBoundary>
      </div>
    </div>
  )
}
