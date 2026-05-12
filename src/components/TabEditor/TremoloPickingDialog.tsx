import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DurationValue } from '../../tabEditorTypes'
import { Duration } from '../../tabEditorTypes'

const SPEED_OPTIONS: { value: DurationValue; label: string; description: string }[] = [
  { value: Duration.Eighth,       label: '1/8',  description: '8th note' },
  { value: Duration.Sixteenth,    label: '1/16', description: '16th note' },
  { value: Duration.ThirtySecond, label: '1/32', description: '32nd note' },
  { value: Duration.SixtyFourth,  label: '1/64', description: '64th note' },
]

interface TremoloPickingDialogProps {
  open: boolean
  current?: DurationValue
  onSelect: (speed: DurationValue) => void
  onRemove: () => void
  onClose: () => void
}

export function TremoloPickingDialog({ open, current, onSelect, onRemove, onClose }: TremoloPickingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Tremolo Picking</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Select the subdivision to repeat for each beat.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent',
                  current === opt.value && 'border-primary bg-accent',
                )}
              >
                <span className="font-mono text-lg font-bold">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter className="flex gap-2 pt-2">
          {current !== undefined && (
            <Button variant="destructive" size="sm" onClick={onRemove}>
              Remove
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
