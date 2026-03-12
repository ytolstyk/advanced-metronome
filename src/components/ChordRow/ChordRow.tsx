import { useState } from 'react';
import type React from 'react';
import type { ChordBeat, ChordPattern, Measure } from '../../types';
import { getTotalBeats } from '../../state';
import { chordName } from '../../data/chords';
import type { RootNote, ChordType } from '../../data/chords';
import { ChordPickerModal } from '../ChordPickerModal/ChordPickerModal';
import './ChordRow.css';

interface ChordRowProps {
  chordPattern: ChordPattern;
  measures: Measure[];
  currentBeat: number;
  isPlaying: boolean;
  onSetChord: (beat: number, chord: ChordBeat | null) => void;
  onPreviewChord: (root: RootNote, type: ChordType) => void;
}

export function ChordRow({
  chordPattern,
  measures,
  currentBeat,
  isPlaying,
  onSetChord,
  onPreviewChord,
}: ChordRowProps) {
  const totalBeats = getTotalBeats(measures);
  const [modalOpen, setModalOpen] = useState(false);
  const [editBeat, setEditBeat] = useState(0);
  const [copiedChord, setCopiedChord] = useState<ChordBeat | null>(null);

  const openModal = (beat: number) => {
    setCopiedChord(null);
    setEditBeat(beat);
    setModalOpen(true);
  };

  const cells: React.ReactElement[] = [];
  for (let beat = 0; beat < totalBeats; beat++) {
    const chord = chordPattern[beat];
    const isActive = isPlaying && currentBeat === beat && chord !== null;

    if (chord) {
      const b = beat;
      const isPasteTarget = copiedChord !== null;
      cells.push(
        <div
          key={b}
          className={`chord-cell ${isActive ? 'chord-cell--active' : ''} ${isPasteTarget ? 'chord-cell--paste-target' : ''}`}
          onClick={() => {
            if (copiedChord) {
              onSetChord(b, copiedChord);
              setCopiedChord(null);
            } else {
              openModal(b);
            }
          }}
          role="button"
          aria-label={isPasteTarget ? `Paste chord at beat ${b + 1}` : `Chord: ${chordName(chord.root, chord.type)}. Click to edit.`}
        >
          <span className="chord-cell-name">{chordName(chord.root, chord.type)}</span>
          <div className="chord-cell-actions">
            <button
              className="chord-cell-action-btn chord-cell-action-btn--delete"
              onClick={(e) => { e.stopPropagation(); onSetChord(b, null); }}
              aria-label="Remove chord"
              title="Remove"
            >
              ×
            </button>
            <button
              className="chord-cell-action-btn chord-cell-action-btn--copy"
              onClick={(e) => { e.stopPropagation(); setCopiedChord(chord); }}
              aria-label="Copy chord"
              title="Copy"
            >
              ⧉
            </button>
          </div>
        </div>,
      );
    } else {
      const b = beat;
      const isPasteTarget = copiedChord !== null;
      cells.push(
        <div
          key={b}
          className={`chord-cell chord-cell--empty ${isPasteTarget ? 'chord-cell--paste-target' : ''}`}
          onClick={() => {
            if (copiedChord) {
              onSetChord(b, copiedChord);
              setCopiedChord(null);
            } else {
              openModal(b);
            }
          }}
          role="button"
          aria-label={isPasteTarget ? `Paste chord at beat ${b + 1}` : `Empty chord slot at beat ${b + 1}. Click to add chord.`}
        />,
      );
    }
  }

  return (
    <>
      <div className="chord-row-separator" style={{ gridColumn: '1 / -1' }} />
      <div className="chord-row-label">Chords</div>
      {cells}
      <ChordPickerModal
        key={editBeat}
        open={modalOpen}
        existingChord={chordPattern[editBeat] ?? null}
        onConfirm={(chord) => { onSetChord(editBeat, chord); setModalOpen(false); }}
        onClear={() => { onSetChord(editBeat, null); setModalOpen(false); }}
        onClose={() => setModalOpen(false)}
        onPreviewChord={(root, type) => onPreviewChord(root, type)}
      />
    </>
  );
}
