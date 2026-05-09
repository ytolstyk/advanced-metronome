import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type VibratoType = 1 | 2

interface VibratoOption {
  type: VibratoType
  name: string
  description: string
  path: string
  viewBox: string
}

const OPTIONS: VibratoOption[] = [
  {
    type: 1,
    name: 'Slight',
    description: 'Subtle, gentle pitch fluctuation — common in classical and clean styles.',
    path: 'M0,10 C5,5 10,5 15,10 C20,15 25,15 30,10 C35,5 40,5 45,10 C50,15 55,15 60,10 C65,5 70,5 75,10 C80,15 85,15 90,10',
    viewBox: '0 0 90 20',
  },
  {
    type: 2,
    name: 'Wide',
    description: 'Pronounced, expressive pitch swing — typical in rock and blues leads.',
    path: 'M0,10 C4,0 8,0 12,10 C16,20 20,20 24,10 C28,0 32,0 36,10 C40,20 44,20 48,10 C52,0 56,0 60,10 C64,20 68,20 72,10 C76,0 80,0 84,10',
    viewBox: '0 0 84 20',
  },
]

interface VibratoDialogProps {
  open: boolean
  current?: VibratoType
  onSelect: (type: VibratoType) => void
  onRemove: () => void
  onClose: () => void
}

export function VibratoDialog({ open, current, onSelect, onRemove, onClose }: VibratoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Vibrato Type</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          {OPTIONS.map((opt) => {
            const isActive = current === opt.type
            return (
              <button
                key={opt.type}
                onClick={() => {
                  if (isActive) {
                    onRemove()
                  } else {
                    onSelect(opt.type)
                  }
                }}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                  isActive && 'border-primary bg-accent',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{opt.name}</span>
                  {isActive && <span className="text-xs text-muted-foreground">active — click to remove</span>}
                </div>
                <svg
                  viewBox={opt.viewBox}
                  className="w-full"
                  style={{ height: 28 }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d={opt.path} />
                </svg>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
