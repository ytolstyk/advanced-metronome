import { useState, useCallback, useRef, memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { detectChordProgression } from '@/api/chordDetectionApi';
import type { ChordDetectionResult } from '@/api/chordDetectionApi';
import { YOUTUBE_VIDEO_ID_RE, getYoutubeUrlError } from '@/utils/youtubeUrl';
import { parseMmSs } from '@/utils/timeUtils';
import { chordName } from '@/data/chords';
import type { RootNote, ChordType } from '@/data/chords';
import './ChordProgressionImportModal.css';

const BPM_DIFF_THRESHOLD = 0.05;

function bpmDiffIsMaterial(detected: number, current: number): boolean {
  return detected > 0 && Math.abs(detected - current) / current > BPM_DIFF_THRESHOLD;
}

interface ChordProgressionImportModalProps {
  open: boolean;
  currentBpm: number;
  /** Maximum slots to preview; controls the .slice(0, N) and truncation note. Defaults to 8. */
  maxSlots?: number;
  onClose: () => void;
  onApply: (chords: Array<{ root: RootNote; type: ChordType }>, newBpm?: number) => void;
}

type ModalState = 'idle' | 'loading' | 'preview' | 'error';

export const ChordProgressionImportModal = memo(function ChordProgressionImportModal({
  open,
  currentBpm,
  maxSlots = 8,
  onClose,
  onApply,
}: ChordProgressionImportModalProps) {
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [url, setUrl] = useState('');
  const [startInput, setStartInput] = useState('0:00');
  const [endInput, setEndInput] = useState('0:20');
  const [urlError, setUrlError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<ChordDetectionResult | null>(null);
  const [adoptBpm, setAdoptBpm] = useState(false);
  // Prevents stale in-flight requests from overwriting state after the modal is closed/reset
  const cancelledRef = useRef(false);
  // Aborts the timeout promise when the user cancels (Amplify itself doesn't support AbortSignal)
  const abortControllerRef = useRef<AbortController | null>(null);

  const validateUrl = useCallback((v: string) => {
    setUrlError(getYoutubeUrlError(v));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!YOUTUBE_VIDEO_ID_RE.test(url)) {
      setUrlError('Enter a valid YouTube URL');
      return;
    }
    const startSec = Math.max(0, parseMmSs(startInput));
    const endSec = Math.max(0, parseMmSs(endInput));
    if (endSec <= startSec) {
      setErrorMsg('End time must be after start time.');
      setModalState('error');
      return;
    }

    cancelledRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setModalState('loading');
    try {
      const res = await detectChordProgression(url, startSec, endSec, controller.signal);
      if (cancelledRef.current) return;
      setResult(res);
      setAdoptBpm(bpmDiffIsMaterial(res.detectedBpm, currentBpm));
      setModalState('preview');
    } catch (err) {
      if (cancelledRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed — please try again.');
      setModalState('error');
    }
  }, [url, startInput, endInput, currentBpm]);

  const handleClose = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelledRef.current = true;
    setModalState('idle');
    setUrl('');
    setStartInput('0:00');
    setEndInput('0:20');
    setUrlError('');
    setErrorMsg('');
    setResult(null);
    setAdoptBpm(false);
    onClose();
  }, [onClose]);

  const handleApply = useCallback(() => {
    if (!result) return;
    onApply(
      result.chords,
      adoptBpm && bpmDiffIsMaterial(result.detectedBpm, currentBpm)
        ? result.detectedBpm
        : undefined,
    );
  }, [result, adoptBpm, currentBpm, onApply]);

  const previewChords = result ? result.chords.slice(0, maxSlots) : [];
  const isTruncated = result ? result.chords.length > maxSlots : false;
  const detectedKey =
    result?.detectedKeyRoot && result?.detectedKeyMode
      ? `${result.detectedKeyRoot} ${result.detectedKeyMode}`
      : '';

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="chord-import-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Detect Chords from YouTube</DialogTitle>
        </DialogHeader>

        {/* ── IDLE ──────────────────────────────────────────────────── */}
        {modalState === 'idle' && (
          <div className="chord-import-form">
            <div className="chord-import-field">
              <Label htmlFor="yt-chord-url">YouTube URL</Label>
              <Input
                id="yt-chord-url"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={e => { setUrl(e.target.value); validateUrl(e.target.value); }}
                onBlur={() => validateUrl(url)}
                className={urlError ? 'input-error' : ''}
              />
              {urlError
                ? <p className="chord-import-field-error">{urlError}</p>
                : <p className="chord-import-hint-small">Timestamped share links (e.g., ?t=60) work too. Shorts are not supported.</p>
              }
            </div>

            <div className="chord-import-time-row">
              <div className="chord-import-field chord-import-field--half">
                <Label htmlFor="yt-chord-start">Start (mm:ss)</Label>
                <Input
                  id="yt-chord-start"
                  placeholder="0:00"
                  value={startInput}
                  onChange={e => setStartInput(e.target.value)}
                />
              </div>
              <div className="chord-import-field chord-import-field--half">
                <Label htmlFor="yt-chord-end">End (mm:ss)</Label>
                <Input
                  id="yt-chord-end"
                  placeholder="0:20"
                  value={endInput}
                  onChange={e => setEndInput(e.target.value)}
                />
              </div>
            </div>
            <p className="chord-import-hint-small">
              Select up to 20 seconds. Shorter sections with clear harmony give the best results.
            </p>

            <div className="chord-import-actions">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleAnalyze} disabled={!url || !!urlError}>
                Detect Chords
              </Button>
            </div>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────── */}
        {modalState === 'loading' && (
          <div className="chord-import-loading">
            <div className="chord-import-spinner" />
            <p>Analyzing… typically 5–15 seconds</p>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────── */}
        {modalState === 'error' && (
          <div className="chord-import-error">
            <AlertTriangle size={20} />
            <p>{errorMsg}</p>
            <div className="chord-import-actions">
              <Button variant="outline" onClick={() => setModalState('idle')}>Try Again</Button>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ───────────────────────────────────────────────── */}
        {modalState === 'preview' && result && (
          <div className="chord-import-preview">
            <p className="chord-import-overwrite-note">
              This will replace your current progression.
            </p>

            {/* Detected metadata chips */}
            <div className="chord-import-meta">
              {detectedKey && (
                <span className="chord-import-chip">Key: {detectedKey}</span>
              )}
              {result.detectedBpm > 0 && (
                <span className="chord-import-chip">
                  {Math.round(result.detectedBpm)} BPM
                </span>
              )}
            </div>

            {isTruncated && (
              <p className="chord-import-truncation-note">
                Showing first {maxSlots} of {result.chords.length} detected chords.
              </p>
            )}

            {/* Chord pills */}
            <div className="chord-import-pills">
              {previewChords.map((chord, i) => (
                <span key={i} className="chord-import-pill chord-import-pill--filled">
                  {chordName(chord.root, chord.type)}
                </span>
              ))}
            </div>

            {/* BPM adoption */}
            {bpmDiffIsMaterial(result.detectedBpm, currentBpm) && (
              <label className="chord-import-bpm-label">
                <input
                  type="checkbox"
                  checked={adoptBpm}
                  onChange={e => setAdoptBpm(e.target.checked)}
                  className="chord-import-checkbox"
                />
                <span>
                  Also set BPM to <strong>{Math.round(result.detectedBpm)}</strong>
                  {' '}(current: {currentBpm} BPM)
                </span>
              </label>
            )}

            <div className="chord-import-actions">
              <Button variant="outline" onClick={() => setModalState('idle')}>Back</Button>
              <Button onClick={handleApply} disabled={result.chords.length === 0}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
