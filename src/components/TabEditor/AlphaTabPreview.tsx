import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as at from '@coderline/alphatab'
import type { TabTrack } from '../../tabEditorTypes'
import { toAlphaTabScore } from '../../tabEditor/toAlphaTabScore'
import './AlphaTabPreview.css'

type NotationMode = 'tab' | 'staff' | 'both'

function staveProfileFor(mode: NotationMode): at.StaveProfile {
  if (mode === 'tab') return at.StaveProfile.Tab
  if (mode === 'staff') return at.StaveProfile.Score
  return at.StaveProfile.ScoreTab
}

export interface AlphaTabPreviewHandle {
  play: () => void
  pause: () => void
  stop: () => void
  print: (width?: string) => void
  getContainer: () => HTMLElement | null
}

interface AlphaTabPreviewProps {
  track: TabTrack
  mode: NotationMode
  onPlayerStateChange?: (playing: boolean) => void
}

export const AlphaTabPreview = forwardRef<AlphaTabPreviewHandle, AlphaTabPreviewProps>(
  function AlphaTabPreview({ track, mode, onPlayerStateChange }, ref) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const apiRef = useRef<at.AlphaTabApi | null>(null)
    const mountedRef = useRef(false)
    const onPlayerStateChangeRef = useRef(onPlayerStateChange)
    onPlayerStateChangeRef.current = onPlayerStateChange

    useImperativeHandle(ref, () => ({
      play() {
        apiRef.current?.play()
      },
      pause() {
        apiRef.current?.pause()
      },
      stop() {
        apiRef.current?.stop()
      },
      print(width?: string) {
        apiRef.current?.print(width)
      },
      getContainer() {
        return containerRef.current
      },
    }))

    useEffect(() => {
      if (!containerRef.current || !scrollRef.current) return
      const settings = new at.Settings()
      settings.core.fontDirectory = '/font/'
      settings.display.staveProfile = staveProfileFor(mode)
      settings.player.enablePlayer = true
      settings.player.soundFont = '/soundfont/sonivox.sf2'
      settings.player.scrollMode = at.ScrollMode.Continuous
      settings.player.scrollElement = scrollRef.current

      const api = new at.AlphaTabApi(containerRef.current, settings)
      apiRef.current = api
      mountedRef.current = true

      api.playerStateChanged.on((args) => {
        // PlayerState.Playing = 1, PlayerState.Paused = 0
        onPlayerStateChangeRef.current?.(args.state === 1)
      })

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
        <div className="alphatab-preview-canvas" ref={scrollRef}>
          <div ref={containerRef} />
        </div>
      </div>
    )
  }
)
