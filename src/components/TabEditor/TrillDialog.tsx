import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DurationValue } from '../../tabEditorTypes'
import { Duration } from '../../tabEditorTypes'
import { fretToFreq } from '../../tabEditorState'

const SPEED_OPTIONS: { value: DurationValue; label: string; description: string }[] = [
  { value: Duration.Sixteenth, label: '1/16', description: 'Fast' },
  { value: Duration.ThirtySecond, label: '1/32', description: 'Very fast' },
]

interface TrillDialogProps {
  open: boolean
  current?: { trillFret: number; trillSpeed: DurationValue }
  baseFret?: number
  openMidi?: number
  onSelect: (trillFret: number, trillSpeed: DurationValue) => void
  onRemove: () => void
  onClose: () => void
}

export function TrillDialog({ open, current, baseFret, openMidi, onSelect, onRemove, onClose }: TrillDialogProps) {
  const defaultFret = current?.trillFret ?? (baseFret != null ? Math.min(24, baseFret + 1) : 12)
  const [localFret, setLocalFret] = useState(defaultFret)
  const [localSpeed, setLocalSpeed] = useState<DurationValue>(current?.trillSpeed ?? Duration.Sixteenth)
  const previewCtxRef = useRef<AudioContext | null>(null)

  function previewTrill() {
    if (openMidi == null || baseFret == null) return
    previewCtxRef.current?.close()

    const ctx = new AudioContext()
    previewCtxRef.current = ctx

    const baseFreq = fretToFreq(openMidi, baseFret)
    const trillFreq = fretToFreq(openMidi, localFret)
    const midFreq = (baseFreq + trillFreq) / 2
    const freqDiff = (trillFreq - baseFreq) / 2

    // At 120BPM: 1/16 → 4Hz LFO, 1/32 → 8Hz LFO
    const lfoRate = localSpeed === Duration.ThirtySecond ? 8 : 4
    const previewDuration = 1.5

    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.6, ctx.currentTime)
    masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + previewDuration)
    masterGain.connect(ctx.destination)

    const harmonicGains = [1.0, 0.5, 0.25, 0.12, 0.06, 0.03]
    for (let h = 1; h <= 6; h++) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = midFreq * h

      const hGain = ctx.createGain()
      hGain.gain.value = (harmonicGains[h - 1] ?? 0.01) * 0.35
      osc.connect(hGain)
      hGain.connect(masterGain)

      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = lfoRate

      const lfoGain = ctx.createGain()
      lfoGain.gain.value = freqDiff * h
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + previewDuration)
      lfo.start(ctx.currentTime)
      lfo.stop(ctx.currentTime + previewDuration)
    }
  }

  const canPreview = baseFret != null && openMidi != null

  function handleClose() {
    previewCtxRef.current?.close()
    previewCtxRef.current = null
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Trill</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-1">
          {/* Visual summary: base note ↔ trill note */}
          <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-muted-foreground">Base</span>
              <span className="font-mono text-2xl font-bold leading-none">
                {baseFret != null ? baseFret : '–'}
              </span>
            </div>
            <span className="text-lg text-muted-foreground select-none">↔</span>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-muted-foreground">Trill to</span>
              <span className="font-mono text-2xl font-bold leading-none text-primary">
                {localFret}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Auxiliary fret</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={24}
                value={localFret}
                onChange={(e) => setLocalFret(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-20 rounded border border-input bg-background px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-muted-foreground">fret (1–24)</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Speed</label>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLocalSpeed(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-accent',
                    localSpeed === opt.value && 'border-primary bg-accent',
                  )}
                >
                  <span className="font-mono font-bold">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {canPreview && (
            <Button variant="outline" size="sm" onClick={previewTrill} className="self-start">
              ▶ Preview trill
            </Button>
          )}
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          {current && (
            <Button variant="destructive" size="sm" onClick={onRemove}>
              Remove
            </Button>
          )}
          <Button size="sm" onClick={() => onSelect(localFret, localSpeed)}>
            {current ? 'Update' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
