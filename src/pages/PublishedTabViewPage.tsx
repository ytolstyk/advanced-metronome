import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { Play, Pause, Square, Link, ExternalLink, Printer, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabEditorErrorBoundary, AlphaTabPreview, type AlphaTabPreviewHandle } from '../components/TabEditor'
import { loadPublishedTab, getCurrentUsername, type PublishedTabRecord } from '../api/publishedTabApi'
import type { TabTrack } from '../tabEditorTypes'
import { migrateTrackIfNeeded } from '../tabEditorState'
import './PublishedTabViewPage.css'

type NotationMode = 'tab' | 'staff' | 'both'

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
  const [viewMode, setViewMode] = useState<NotationMode>('tab')
  const [darkMode, setDarkMode] = useState(true)
  const [copySuccess, setCopySuccess] = useState(false)

  const alphaTabRef = useRef<AlphaTabPreviewHandle>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const result = await loadPublishedTab(id!)
      if (cancelled) return
      if (!result) { setNotFound(true); setIsLoading(false); return }
      try {
        const parsed = JSON.parse(result.trackJson)
        setTab(result)
        setTrack(migrateTrackIfNeeded(parsed))
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

  function handlePlay() {
    if (isPlaying) {
      alphaTabRef.current?.pause()
    } else {
      alphaTabRef.current?.play()
    }
  }

  function handleStop() {
    alphaTabRef.current?.stop()
    setIsPlaying(false)
  }

  const handleCopyLink = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 1500)
    })
  }, [])

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

  const handlePrint = useCallback(() => {
    alphaTabRef.current?.print()
  }, [])

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
          <Button variant="ghost" size="sm" onClick={handlePrint} title="Print / PDF">
            <Printer size={13} /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="pub-tab-playback-bar">
        <Button variant="ghost" size="icon" onClick={handlePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleStop} title="Stop">
          <Square size={16} />
        </Button>
        <div className="pub-tab-view-toggle">
          {(['tab', 'staff', 'both'] as NotationMode[]).map((m) => (
            <Button
              key={m}
              variant="ghost"
              size="sm"
              className={viewMode === m ? 'pub-tab-mode-active' : ''}
              onClick={() => setViewMode(m)}
            >
              {m === 'tab' ? 'Tab' : m === 'staff' ? 'Staff' : 'Both'}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className={darkMode ? 'pub-tab-mode-active' : ''}
          >
            {darkMode ? <Moon size={15} /> : <Sun size={15} />}
          </Button>
        </div>
      </div>

      <div className="pub-tab-canvas">
        <TabEditorErrorBoundary>
          <AlphaTabPreview
            ref={alphaTabRef}
            track={track}
            mode={viewMode}
            darkMode={darkMode}
            onPlayerStateChange={setIsPlaying}
          />
        </TabEditorErrorBoundary>
      </div>
    </div>
  )
}
