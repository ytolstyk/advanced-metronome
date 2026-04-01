import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DRUM_STYLES } from '../../drumPatterns';
import type { DrumStyle } from '../../drumPatterns';
import './GenerateDrumsModal.css';

interface GenerateDrumsModalProps {
  open: boolean;
  hasExistingPattern: boolean;
  onClose: () => void;
  onGenerate: (style: DrumStyle) => void;
}

export function GenerateDrumsModal({
  open,
  hasExistingPattern,
  onClose,
  onGenerate,
}: GenerateDrumsModalProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleGenerate = () => {
    const style = DRUM_STYLES.find(s => s.name === selected);
    if (!style) return;
    onGenerate(style);
    setSelected(null);
  };

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="generate-drums-dialog">
        <DialogHeader>
          <DialogTitle>Generate Drum Pattern</DialogTitle>
        </DialogHeader>

        {hasExistingPattern && (
          <div className="generate-drums-warning">
            This will replace your current drum pattern.
          </div>
        )}

        <p className="generate-drums-hint">
          Choose a style — the pattern will be adapted to your existing time signatures.
        </p>

        <div className="generate-drums-grid">
          {DRUM_STYLES.map(style => (
            <button
              key={style.name}
              className={`generate-drums-style${selected === style.name ? ' selected' : ''}`}
              onClick={() => setSelected(style.name)}
            >
              <span className="generate-drums-style-name">{style.name}</span>
              <span className="generate-drums-style-desc">{style.description}</span>
            </button>
          ))}
        </div>

        <div className="generate-drums-actions">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={selected === null}
          >
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
