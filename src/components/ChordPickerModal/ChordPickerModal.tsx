import { useState } from 'react';
import type { RootNote, ChordType } from '../../data/chords';
import {
  CHORD_DATABASE,
  CHORD_TYPE_LABELS,
  CHORD_TYPES,
  ROOT_NOTES,
  chordName,
} from '../../data/chords';
import type { ChordBeat } from '../../types';
import { useFavorites } from '../../hooks/useFavorites';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import './ChordPickerModal.css';

interface ChordPickerModalProps {
  open: boolean;
  existingChord: ChordBeat | null;
  onConfirm: (chord: ChordBeat) => void;
  onClear: () => void;
  onClose: () => void;
  onPreviewChord: (root: RootNote, type: ChordType) => void;
}

const FILTER_ITEM_CLS =
  'h-auto px-2 py-1 text-[0.78rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ' +
  'data-[state=on]:border-[#4fc3c3] data-[state=on]:bg-[#1a2a2a] data-[state=on]:text-[#4fc3c3]';

const FAV_FILTER_CLS =
  'h-auto px-2 py-1 text-[0.78rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#ffca28] hover:text-[#ffca28] ' +
  'data-[state=on]:border-[#ffca28] data-[state=on]:bg-[#252018] data-[state=on]:text-[#ffca28]';

export function ChordPickerModal({
  open,
  existingChord,
  onConfirm,
  onClose,
  onClear,
  onPreviewChord,
}: ChordPickerModalProps) {
  const [rootFilter, setRootFilter] = useState<RootNote | 'all'>(existingChord?.root ?? 'all');
  const [typeFilter, setTypeFilter] = useState<ChordType | 'all'>(existingChord?.type ?? 'all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedRoot, setSelectedRoot] = useState<RootNote>(existingChord?.root ?? 'C');
  const [selectedType, setSelectedType] = useState<ChordType>(existingChord?.type ?? 'major');
  const [selected, setSelected] = useState<{ root: RootNote; type: ChordType } | null>(
    existingChord ? { root: existingChord.root, type: existingChord.type } : null,
  );
  const { isFavorite } = useFavorites();

  const filtered = CHORD_DATABASE.filter(
    (e) =>
      (rootFilter === 'all' || e.root === rootFilter) &&
      (typeFilter === 'all' || e.type === typeFilter) &&
      (!favoritesOnly || isFavorite(e.root, e.type)),
  );

  const handleApply = () => {
    const root = selected?.root ?? selectedRoot;
    const type = selected?.type ?? selectedType;
    onConfirm({ root, type, fadeDuration: 100, fadeCurve: 'linear' });
  };

  const handleSelect = (root: RootNote, type: ChordType) => {
    setSelected({ root, type });
    setSelectedRoot(root);
    setSelectedType(type);
    onPreviewChord(root, type);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="chord-picker-dialog">
        <DialogHeader>
          <DialogTitle className="chord-picker-title">
            {existingChord ? 'Edit Chord' : 'Pick a Chord'}
          </DialogTitle>
        </DialogHeader>

        {/* Favorites filter */}
        <div className="chord-picker-section">
          <ToggleGroup
            type="single"
            value={favoritesOnly ? 'favorites' : ''}
            onValueChange={v => setFavoritesOnly(v === 'favorites')}
            className="flex flex-wrap gap-1"
          >
            <ToggleGroupItem value="favorites" className={FAV_FILTER_CLS}>★ Favorites</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Root filter */}
        <div className="chord-picker-section">
          <div className="chord-picker-label">Key</div>
          <ToggleGroup
            type="single"
            value={rootFilter}
            onValueChange={(v) => setRootFilter((v as RootNote | 'all') || 'all')}
            className="flex flex-wrap gap-1"
          >
            <ToggleGroupItem value="all" className={FILTER_ITEM_CLS}>All</ToggleGroupItem>
            {ROOT_NOTES.map((r) => (
              <ToggleGroupItem key={r} value={r} className={FILTER_ITEM_CLS}>{r}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Type filter */}
        <div className="chord-picker-section">
          <div className="chord-picker-label">Type</div>
          <ToggleGroup
            type="single"
            value={typeFilter}
            onValueChange={(v) => setTypeFilter((v as ChordType | 'all') || 'all')}
            className="flex flex-wrap gap-1"
          >
            <ToggleGroupItem value="all" className={FILTER_ITEM_CLS}>All</ToggleGroupItem>
            {CHORD_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t} className={FILTER_ITEM_CLS}>
                {CHORD_TYPE_LABELS[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Chord grid */}
        <div className="chord-picker-grid">
          {filtered.map((entry) => {
            const isSelected = selected?.root === entry.root && selected?.type === entry.type;
            return (
              <button
                key={`${entry.root}-${entry.type}`}
                className={`chord-picker-card ${isSelected ? 'chord-picker-card--selected' : ''}`}
                onClick={() => handleSelect(entry.root, entry.type)}
              >
                {chordName(entry.root, entry.type)}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="chord-picker-empty">
              {favoritesOnly
                ? 'No favorites yet. Add some from the Chords page.'
                : 'No chords match filters'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="chord-picker-footer">
          {existingChord && (
            <button className="chord-picker-btn chord-picker-btn--clear" onClick={onClear}>
              Clear
            </button>
          )}
          <div className="chord-picker-footer-right">
            <button className="chord-picker-btn chord-picker-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="chord-picker-btn chord-picker-btn--apply"
              onClick={handleApply}
              disabled={!selected}
            >
              Apply
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
