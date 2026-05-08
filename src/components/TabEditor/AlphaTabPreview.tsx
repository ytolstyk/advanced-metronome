import { useEffect, useRef, useState } from 'react'
import * as at from '@coderline/alphatab'
import type { TabTrack } from '../../tabEditorTypes'
import { toAlphaTabScore } from '../../tabEditor/toAlphaTabScore'
import { Button } from '@/components/ui/button'
import './AlphaTabPreview.css'

type NotationMode = 'tab' | 'staff' | 'both'

function staveProfileFor(mode: NotationMode): at.StaveProfile {
  if (mode === 'tab') return at.StaveProfile.Tab
  if (mode === 'staff') return at.StaveProfile.Score
  return at.StaveProfile.ScoreTab
}

interface AlphaTabPreviewProps {
  track: TabTrack
}

export function AlphaTabPreview({ track }: AlphaTabPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<at.AlphaTabApi | null>(null)
  const [mode, setMode] = useState<NotationMode>('both')
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const settings = new at.Settings()
    settings.core.fontDirectory = '/font/'
    settings.display.staveProfile = staveProfileFor(mode)
    const api = new at.AlphaTabApi(containerRef.current, settings)
    apiRef.current = api
    mountedRef.current = true
    api.renderScore(toAlphaTabScore(track))
    return () => {
      mountedRef.current = false
      api.destroy()
      apiRef.current = null
    }
    // Only run on mount — track and mode changes handled by separate effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const api = apiRef.current
    if (!api || !mountedRef.current) return
    api.settings.display.staveProfile = staveProfileFor(mode)
    api.updateSettings()
    api.render()
  }, [mode])

  useEffect(() => {
    const api = apiRef.current
    if (!api || !mountedRef.current) return
    api.renderScore(toAlphaTabScore(track))
  }, [track])

  return (
    <div className="alphatab-preview">
      <div className="alphatab-preview-toolbar">
        <Button
          variant="ghost"
          size="sm"
          className={mode === 'tab' ? 'alphatab-mode-active' : ''}
          onClick={() => setMode('tab')}
        >
          Tab
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={mode === 'staff' ? 'alphatab-mode-active' : ''}
          onClick={() => setMode('staff')}
        >
          Staff
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={mode === 'both' ? 'alphatab-mode-active' : ''}
          onClick={() => setMode('both')}
        >
          Both
        </Button>
      </div>
      <div className="alphatab-preview-canvas" ref={containerRef} />
    </div>
  )
}
