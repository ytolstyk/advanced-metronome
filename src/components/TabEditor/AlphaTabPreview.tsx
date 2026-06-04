import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as at from '@coderline/alphatab'
import type { TabTrack } from '../../tabEditorTypes'
import { toAlphaTabScore } from '../../tabEditor/toAlphaTabScore'
import { base64ToUint8Array } from '../../lib/utils'
import './AlphaTabPreview.css'

type NotationMode = 'tab' | 'staff' | 'both'

function staveProfileFor(mode: NotationMode): at.StaveProfile {
  if (mode === 'tab') return at.StaveProfile.Tab
  if (mode === 'staff') return at.StaveProfile.Score
  return at.StaveProfile.ScoreTab
}

type AtColor = at.RenderingResources['mainGlyphColor']
type ColorCtor = new (r: number, g: number, b: number) => AtColor

function applyDarkResources(resources: at.RenderingResources) {
  // Color is not exported; grab the constructor from an existing instance
  const ColorCtor = (resources.mainGlyphColor as unknown as { constructor: ColorCtor }).constructor
  const c = (r: number, g: number, b: number) => new ColorCtor(r, g, b)
  resources.mainGlyphColor = c(220, 220, 230)
  resources.scoreInfoColor = c(200, 200, 215)
  resources.staffLineColor = c(90, 90, 110)
  resources.barSeparatorColor = c(100, 100, 120)
}

interface OriginalColors {
  mainGlyphColor: AtColor
  scoreInfoColor: AtColor
  staffLineColor: AtColor
  barSeparatorColor: AtColor
}

function saveOriginalColors(resources: at.RenderingResources): OriginalColors {
  return {
    mainGlyphColor: resources.mainGlyphColor,
    scoreInfoColor: resources.scoreInfoColor,
    staffLineColor: resources.staffLineColor,
    barSeparatorColor: resources.barSeparatorColor,
  }
}

function restoreOriginalColors(resources: at.RenderingResources, orig: OriginalColors) {
  resources.mainGlyphColor = orig.mainGlyphColor
  resources.scoreInfoColor = orig.scoreInfoColor
  resources.staffLineColor = orig.staffLineColor
  resources.barSeparatorColor = orig.barSeparatorColor
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
  darkMode?: boolean
  onPlayerStateChange?: (playing: boolean) => void
}

export const AlphaTabPreview = forwardRef<AlphaTabPreviewHandle, AlphaTabPreviewProps>(
  function AlphaTabPreview({ track, mode, darkMode = false, onPlayerStateChange }, ref) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const apiRef = useRef<at.AlphaTabApi | null>(null)
    const mountedRef = useRef(false)
    const originalColorsRef = useRef<OriginalColors | null>(null)
    const parsedImportedScoreRef = useRef<{ b64: string; score: at.model.Score } | null>(null)
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

      originalColorsRef.current = saveOriginalColors(api.settings.display.resources)
      if (darkMode) applyDarkResources(api.settings.display.resources)

      api.playerStateChanged.on((args) => {
        // PlayerState.Playing = 1, PlayerState.Paused = 0
        onPlayerStateChangeRef.current?.(args.state === 1)
      })

      // useMemo already populated parsedImportedScoreRef during render — use it
      const initialScore = (track.importedFileBase64 && parsedImportedScoreRef.current?.b64 === track.importedFileBase64)
        ? parsedImportedScoreRef.current.score
        : toAlphaTabScore(track)
      api.renderScore(initialScore)
      return () => {
        mountedRef.current = false
        api.destroy()
        apiRef.current = null
        originalColorsRef.current = null
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
      if (!api || !mountedRef.current || !originalColorsRef.current) return
      if (darkMode) {
        applyDarkResources(api.settings.display.resources)
      } else {
        restoreOriginalColors(api.settings.display.resources, originalColorsRef.current)
      }
      api.updateSettings()
      api.render()
    }, [darkMode])

    // Render-phase lazy cache: parse imported bytes once per unique b64 string.
    // Mutating a ref during render is safe here because the output (alphaScore) is
    // fully determined by track.importedFileBase64 — concurrent re-renders produce the same result.
    const b64 = track.importedFileBase64
    if (b64 && parsedImportedScoreRef.current?.b64 !== b64) {
      try {
        const bytes = base64ToUint8Array(b64)
        const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, new at.Settings())
        parsedImportedScoreRef.current = { b64, score }
      } catch {
        parsedImportedScoreRef.current = null
      }
    } else if (!b64) {
      parsedImportedScoreRef.current = null
    }
    const alphaScore = (b64 && parsedImportedScoreRef.current?.b64 === b64)
      ? parsedImportedScoreRef.current!.score
      : toAlphaTabScore(track)

    useEffect(() => {
      const api = apiRef.current
      if (!api || !mountedRef.current) return
      api.renderScore(alphaScore)
    }, [alphaScore])

    return (
      <div className={`alphatab-preview${darkMode ? ' alphatab-preview--dark' : ''}`}>
        <div className="alphatab-preview-canvas" ref={scrollRef}>
          <div ref={containerRef} />
        </div>
      </div>
    )
  }
)
