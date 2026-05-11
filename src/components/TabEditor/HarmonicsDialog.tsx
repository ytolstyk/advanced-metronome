import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { HarmonicType } from '../../tabEditorTypes'
import type { HarmonicTypeValue } from '../../tabEditorTypes'

interface HarmonicOption {
  type: HarmonicTypeValue
  name: string
  symbol: string
  description: string
  needsValue: boolean
}

const OPTIONS: HarmonicOption[] = [
  {
    type: HarmonicType.Natural,
    name: 'Natural',
    symbol: '◇',
    description: 'Lightly touch the string at a node point (5th, 7th, 12th fret) without fretting.',
    needsValue: false,
  },
  {
    type: HarmonicType.Artificial,
    name: 'Artificial',
    symbol: 'A.H.',
    description: 'Fret a note and lightly touch the string at the node point above it.',
    needsValue: true,
  },
  {
    type: HarmonicType.Pinch,
    name: 'Pinch',
    symbol: 'P.H.',
    description: 'Pick and immediately touch the string with the thumb edge to produce a harmonic squeal.',
    needsValue: false,
  },
  {
    type: HarmonicType.Tap,
    name: 'Tap',
    symbol: 'T.H.',
    description: 'Tap the string at a node point with the right hand.',
    needsValue: false,
  },
  {
    type: HarmonicType.Semi,
    name: 'Semi',
    symbol: 'S.H.',
    description: 'Partially damped harmonic, producing a glassy tone.',
    needsValue: false,
  },
  {
    type: HarmonicType.Feedback,
    name: 'Feedback',
    symbol: 'Fdbk.',
    description: 'Amplifier feedback harmonic sustained by proximity to the speaker.',
    needsValue: false,
  },
]

// eslint-disable-next-line react-refresh/only-export-components
export const HARMONIC_LABELS: Record<HarmonicTypeValue, string> = {
  [HarmonicType.Natural]: 'Natural harmonic',
  [HarmonicType.Artificial]: 'Artificial harmonic',
  [HarmonicType.Pinch]: 'Pinch harmonic',
  [HarmonicType.Tap]: 'Tap harmonic',
  [HarmonicType.Semi]: 'Semi harmonic',
  [HarmonicType.Feedback]: 'Feedback harmonic',
}

// eslint-disable-next-line react-refresh/only-export-components
export const HARMONIC_SYMBOLS: Record<HarmonicTypeValue, string> = {
  [HarmonicType.Natural]: '◇',
  [HarmonicType.Artificial]: 'A.H.',
  [HarmonicType.Pinch]: 'P.H.',
  [HarmonicType.Tap]: 'T.H.',
  [HarmonicType.Semi]: 'S.H.',
  [HarmonicType.Feedback]: 'Fdbk.',
}

interface HarmonicsDialogProps {
  open: boolean
  current?: HarmonicTypeValue
  harmonicValue?: number
  onSelect: (type: HarmonicTypeValue, value?: number) => void
  onRemove: () => void
  onClose: () => void
}

export function HarmonicsDialog({ open, current, harmonicValue, onSelect, onRemove, onClose }: HarmonicsDialogProps) {
  const [artificialFret, setArtificialFret] = useState<number>(harmonicValue ?? 12)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Harmonic Type</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          {OPTIONS.map((opt) => {
            const isActive = current === opt.type
            return (
              <button
                key={opt.type}
                onClick={() => {
                  if (isActive) {
                    onRemove()
                  } else {
                    onSelect(opt.type, opt.needsValue ? artificialFret : undefined)
                  }
                }}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                  isActive && 'border-primary bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold w-10 shrink-0">{opt.symbol}</span>
                    <span className="font-medium text-sm">{opt.name}</span>
                  </div>
                  {isActive && <span className="text-xs text-muted-foreground shrink-0">active — click to remove</span>}
                </div>
                {opt.needsValue && (
                  <div
                    className="flex items-center gap-2 mt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Node fret:</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={isActive ? (harmonicValue ?? artificialFret) : artificialFret}
                      onChange={(e) => {
                        const v = Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1))
                        setArtificialFret(v)
                        if (isActive) onSelect(opt.type, v)
                      }}
                      className="w-16 rounded border border-input bg-background px-2 py-0.5 text-sm"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
