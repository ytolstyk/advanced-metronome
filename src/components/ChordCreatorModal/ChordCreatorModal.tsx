import { useState } from 'react';
import type { RootNote } from '../../data/chords';
import { ROOT_NOTES, CHORD_TYPES, CHORD_TYPE_LABELS, detectBarre } from '../../data/chords';
import type { CreateCustomChordParams } from '../../api/customChordsApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { InteractiveFretboardEditor } from './InteractiveFretboardEditor';

interface Props {
  open: boolean;
  stringCount: 6 | 7 | 8;
  tuningId: string;
  stringNames: string[];
  isAuthenticated: boolean;
  onSave: (params: CreateCustomChordParams) => void;
  onPlay?: (frets: number[]) => void;
  onClose: () => void;
}

export function ChordCreatorModal({
  open,
  stringCount,
  tuningId,
  stringNames,
  isAuthenticated,
  onSave,
  onPlay,
  onClose,
}: Props) {
  const [root, setRoot] = useState<RootNote>('C');
  const [type, setType] = useState('Major');
  const [frets, setFrets] = useState<number[]>(() => new Array(stringCount).fill(0));
  const [editorStartFret, setEditorStartFret] = useState(1);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    setFrets(new Array(stringCount).fill(0));
    setEditorStartFret(1);
    setName('');
    setError(null);
  }

  function handleSave() {
    const hasSounding = frets.some(f => f >= 0);
    if (!hasSounding) {
      setError('At least one string must be open or fretted.');
      return;
    }

    const positives = frets.filter(f => f > 0);
    const minFret = positives.length > 0 ? Math.min(...positives) : 0;
    const startFret = minFret > 1 ? minFret : undefined;
    const barre = detectBarre(frets);

    onSave({
      root,
      type,
      name: name.trim() || undefined,
      voicing: { frets, barre, startFret },
      isPublic: isAuthenticated ? isPublic : false,
      stringCount,
      tuningId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#1a1b2e] border-[#505270] text-[#ccd6ff] max-w-[440px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#8eaaff] text-xl">Create Custom Chord</DialogTitle>
          <DialogDescription className="sr-only">
            Design a custom chord voicing and add it to your chord library
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-1">
          {/* Root note */}
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mb-2">Root</div>
            <div className="flex flex-wrap gap-1">
              {ROOT_NOTES.map(note => (
                <button
                  key={note}
                  type="button"
                  className={cn(
                    'px-2.5 py-1.5 text-[0.82rem] font-semibold rounded-md border transition-colors',
                    root === note
                      ? 'border-[#5b7fff] bg-[#252850] text-[#8eaaff]'
                      : 'border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]',
                  )}
                  onClick={() => setRoot(note)}
                >
                  {note}
                </button>
              ))}
            </div>
          </div>

          {/* Chord type */}
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mb-2">Type</div>
            <datalist id="chord-type-suggestions">
              {CHORD_TYPES.map(t => (
                <option key={t} value={CHORD_TYPE_LABELS[t]} />
              ))}
            </datalist>
            <Input
              list="chord-type-suggestions"
              value={type}
              onChange={e => setType(e.target.value)}
              placeholder="e.g. Major, Sus4, Open G…"
              className="w-full sm:w-[200px] bg-[#1e1f2c] border-[#505270] text-[#ccd6ff] placeholder:text-[#505270] text-[0.82rem]"
              maxLength={40}
            />
          </div>

          {/* Interactive fretboard */}
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mb-2">Voicing</div>
            <InteractiveFretboardEditor
              frets={frets}
              editorStartFret={editorStartFret}
              stringNames={stringNames}
              onFretsChange={updated => { setFrets(updated); setError(null); }}
              onEditorStartFretChange={setEditorStartFret}
            />
          </div>

          {/* Optional name */}
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mb-2">Name (optional)</div>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My blues voicing"
              className="bg-[#1e1f2c] border-[#505270] text-[#ccd6ff] placeholder:text-[#505270] text-[0.82rem]"
              maxLength={60}
            />
          </div>

          {/* Share with community (auth only) */}
          {isAuthenticated && (
            <div className="flex items-center gap-3">
              <span className="text-[0.82rem] text-[#9898c8]">Share with community</span>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                onClick={() => setIsPublic(v => !v)}
                className={cn(
                  'w-11 h-6 rounded-full relative transition-colors flex-shrink-0',
                  isPublic ? 'bg-[#5b7fff]' : 'bg-[#505270]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                    isPublic ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          )}

          {error && (
            <p className="text-[0.82rem] text-[#ef5350]">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-[0.82rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:bg-[#23243a] transition-colors"
                onClick={handleReset}
              >
                Reset
              </button>
              {onPlay && (
                <button
                  type="button"
                  className="px-3 py-1.5 text-[0.82rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:bg-[#23243a] transition-colors"
                  onClick={() => onPlay(frets)}
                >
                  ▶ Play
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-[0.82rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:bg-[#23243a] transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              {isAuthenticated ? (
                <button
                  type="button"
                  className="px-3 py-1.5 text-[0.82rem] font-semibold rounded-md border border-[#5b7fff] bg-[#252850] text-[#8eaaff] hover:bg-[#2e3060] transition-colors"
                  onClick={handleSave}
                >
                  Save Chord
                </button>
              ) : (
                <span className="text-[0.78rem] text-[#9898c8] italic">Sign in to save</span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
