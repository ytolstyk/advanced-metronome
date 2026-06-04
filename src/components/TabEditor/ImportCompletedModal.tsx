import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ImportedTrackInfo } from '../../tabEditorTypes'

interface ImportCompletedModalProps {
  open: boolean
  trackInfos: ImportedTrackInfo[]
  unsupportedFeatures: string[]
  onConfirm: (selectedTrackIndex: number) => void
  onCancel: () => void
}

export function ImportCompletedModal({
  open,
  trackInfos,
  unsupportedFeatures,
  onConfirm,
  onCancel,
}: ImportCompletedModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(trackInfos[0]?.index ?? 0)
  const [showUnsupported, setShowUnsupported] = useState(false)

  const multiTrack = trackInfos.length > 1

  function handleConfirm() {
    onConfirm(selectedIndex)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Import complete</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {multiTrack && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[#ccc]">
                This file contains {trackInfos.length} tracks. Select which track to open in the editor:
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {trackInfos.map((info) => (
                  <label
                    key={info.index}
                    className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-white/5"
                  >
                    <input
                      type="radio"
                      name="track-select"
                      value={info.index}
                      checked={selectedIndex === info.index}
                      onChange={() => setSelectedIndex(info.index)}
                      className="accent-blue-400"
                    />
                    <span className="text-sm">
                      {info.name || `Track ${info.index + 1}`}
                      <span className="text-[#888] ml-1">({info.stringCount}-string)</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-[#888]">
                Other tracks are preserved and visible in the AlphaTab preview.
              </p>
            </div>
          )}

          {unsupportedFeatures.length > 0 && (
            <div className="flex flex-col gap-1">
              <button
                className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 text-left"
                onClick={() => setShowUnsupported((v) => !v)}
              >
                <span>{showUnsupported ? '▾' : '▸'}</span>
                {unsupportedFeatures.length} feature{unsupportedFeatures.length !== 1 ? 's' : ''} not editable in the editor
              </button>
              {showUnsupported && (
                <ul className="text-xs text-[#aaa] pl-4 list-disc flex flex-col gap-0.5 mt-1">
                  {unsupportedFeatures.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[#888]">
                These are still visible in the AlphaTab preview pane.
              </p>
            </div>
          )}

          {unsupportedFeatures.length === 0 && !multiTrack && (
            <p className="text-sm text-[#aaa]">All features in this file are supported by the editor.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            Open tab
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
