import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { DRUM_STYLES } from '../../drumPatterns';
import type { DrumStyle } from '../../drumPatterns';
import './GenerateDrumsModal.css';

interface GenerateDrumsModalProps {
  open: boolean;
  hasExistingPattern: boolean;
  onClose: () => void;
  onGenerate: (style: DrumStyle, randomness: number) => void;
}

export function GenerateDrumsModal({
  open,
  hasExistingPattern,
  onClose,
  onGenerate,
}: GenerateDrumsModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [randomness, setRandomness] = useState(0);

  const handleGenerate = () => {
    const style = DRUM_STYLES.find(s => s.name === selected);
    if (!style) return;
    onGenerate(style, randomness / 100);
    setSelected(null);
    setRandomness(0);
  };

  const handleClose = () => {
    setSelected(null);
    setRandomness(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="generate-drums-dialog" aria-describedby={undefined}>
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

        <div className="generate-drums-randomness">
          <div className="generate-drums-randomness-label">
            <span>Randomness</span>
            <span className="generate-drums-randomness-value">{randomness}%</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[randomness]}
            onValueChange={([v]) => setRandomness(v)}
          />
          <p className="generate-drums-randomness-hint">
            {randomness === 0
              ? 'Clean — exact genre template'
              : randomness < 40
              ? 'Subtle — small variations on the template'
              : randomness < 70
              ? 'Moderate — noticeably different each time'
              : 'Wild — heavily randomized'}
          </p>
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
