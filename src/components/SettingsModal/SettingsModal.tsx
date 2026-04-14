import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { NOTE_NAMES } from '@/data/noteColors';
import { useNoteColors } from '@/context/noteColorsContextDef';
import './SettingsModal.css';

export function SettingsModal() {
  const { noteFill, setNoteColor, resetToDefaults } = useNoteColors();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#888] hover:text-[#eee] hover:bg-[#1a1a1a]"
          aria-label="Settings"
        >
          <Settings size={18} />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0f0f0f] border-[#222] text-[#f0f0f0] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#f0f0f0]">Settings</DialogTitle>
        </DialogHeader>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#666] mb-3">
            Note Colors
          </p>
          <div className="settings-note-grid">
            {NOTE_NAMES.map(note => (
              <div key={note} className="settings-note-row">
                <span className="settings-note-label">{note}</span>
                <input
                  type="color"
                  className="settings-color-input"
                  value={noteFill[note] ?? '#888888'}
                  onChange={e => setNoteColor(note, e.target.value)}
                  aria-label={`Color for ${note}`}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="border-[#333] text-[#888] hover:text-[#eee] hover:bg-[#1a1a1a] hover:border-[#444]"
              onClick={resetToDefaults}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
