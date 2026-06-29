import { useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { extractDrumPattern } from '@/api/aiApi';
import type { DrumExtractionResult } from '@/api/aiApi';
import { quantizeHits } from '@/utils/drumPatternQuantize';
import { INSTRUMENTS, INSTRUMENT_IDS } from '@/constants';
import type { InstrumentId, Measure, Pattern } from '@/types';
import { ProposedBeatCell } from './ProposedBeatCell';
import './DrumPatternImportModal.css';

interface DrumPatternImportModalProps {
  open: boolean;
  currentPattern: Pattern;
  measures: Measure[];
  currentBpm: number;
  onClose: () => void;
  onApply: (mergedPattern: Pattern, newBpm?: number) => void;
}

type ModalState = 'idle' | 'loading' | 'preview' | 'error';

function parseMmSs(value: string): number {
  const parts = value.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const s = parseFloat(value);
  return isNaN(s) ? 0 : s;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 75 ? 'confidence-badge--high'
    : pct >= 50 ? 'confidence-badge--mid'
    : 'confidence-badge--low';
  return <span className={`confidence-badge ${cls}`}>{pct}%</span>;
}

export function DrumPatternImportModal({
  open,
  currentPattern,
  measures,
  currentBpm,
  onClose,
  onApply,
}: DrumPatternImportModalProps) {
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [url, setUrl] = useState('');
  const [startInput, setStartInput] = useState('0:00');
  const [endInput, setEndInput] = useState('0:15');
  const [urlError, setUrlError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [result, setResult] = useState<DrumExtractionResult | null>(null);
  const [accepted, setAccepted] = useState<Set<InstrumentId>>(new Set());
  const [adoptBpm, setAdoptBpm] = useState(true);

  // Store measures snapshot at extraction time for re-quantization on Apply
  const measuresAtExtraction = useRef<Measure[]>(measures);

  const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+$/;

  const validateUrl = useCallback((v: string) => {
    if (!v) { setUrlError(''); return; }
    if (!YOUTUBE_URL_RE.test(v)) {
      setUrlError('Enter a valid YouTube URL (e.g. https://youtube.com/watch?v=...)');
    } else {
      setUrlError('');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExtract = useCallback(async () => {
    if (!YOUTUBE_URL_RE.test(url)) {
      setUrlError('Enter a valid YouTube URL');
      return;
    }
    const startSec = parseMmSs(startInput);
    const endSec = parseMmSs(endInput);
    if (endSec <= startSec) {
      setErrorMsg('End time must be after start time.');
      setModalState('error');
      return;
    }

    setModalState('loading');
    measuresAtExtraction.current = measures;

    try {
      const res = await extractDrumPattern(url, startSec, endSec, measures);
      setResult(res);

      // Default-accept rows with confidence ≥ 0.5
      const initialAccepted = new Set(
        INSTRUMENT_IDS.filter(id => res.confidence[id] >= 0.5),
      );
      setAccepted(initialAccepted);

      // Default to adopting BPM if it differs significantly
      const bpmDiff = Math.abs(res.detectedBpm - currentBpm) / currentBpm;
      setAdoptBpm(bpmDiff > 0.05);

      setModalState('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed — please try again.');
      setModalState('error');
    }
  }, [url, startInput, endInput, measures, currentBpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    setModalState('idle');
    setUrl('');
    setStartInput('0:00');
    setEndInput('0:15');
    setUrlError('');
    setErrorMsg('');
    setResult(null);
    setAccepted(new Set());
    onClose();
  }, [onClose]);

  const handleApply = useCallback(() => {
    if (!result) return;

    // Re-quantize from raw hits against the live measures (not snapshot),
    // so any grid changes between extraction and Apply are handled correctly
    const freshPattern = quantizeHits(result.hits, measures, result.detectedBpm);

    const mergedPattern = {} as Pattern;
    for (const id of INSTRUMENT_IDS) {
      mergedPattern[id] = accepted.has(id) ? freshPattern[id] : [...currentPattern[id]];
    }

    const bpmDiff = Math.abs(result.detectedBpm - currentBpm) / currentBpm;
    onApply(mergedPattern, adoptBpm && bpmDiff > 0.05 ? result.detectedBpm : undefined);
    handleClose();
  }, [result, accepted, adoptBpm, measures, currentPattern, currentBpm, onApply, handleClose]);

  const totalSteps = result
    ? result.pattern[INSTRUMENT_IDS[0]].length
    : 0;

  const bpmDiff = result
    ? Math.abs(result.detectedBpm - currentBpm) / currentBpm
    : 0;

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="drum-import-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Import from YouTube</DialogTitle>
        </DialogHeader>

        {/* ── IDLE ──────────────────────────────────────────────────── */}
        {modalState === 'idle' && (
          <div className="drum-import-form">
            <div className="drum-import-field">
              <Label htmlFor="yt-url">YouTube URL</Label>
              <Input
                id="yt-url"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={e => { setUrl(e.target.value); validateUrl(e.target.value); }}
                onBlur={() => validateUrl(url)}
                className={urlError ? 'input-error' : ''}
              />
              {urlError && <p className="drum-import-field-error">{urlError}</p>}
            </div>

            <div className="drum-import-time-row">
              <div className="drum-import-field drum-import-field--half">
                <Label htmlFor="yt-start">Start (mm:ss)</Label>
                <Input
                  id="yt-start"
                  placeholder="0:00"
                  value={startInput}
                  onChange={e => setStartInput(e.target.value)}
                />
              </div>
              <div className="drum-import-field drum-import-field--half">
                <Label htmlFor="yt-end">End (mm:ss)</Label>
                <Input
                  id="yt-end"
                  placeholder="0:15"
                  value={endInput}
                  onChange={e => setEndInput(e.target.value)}
                />
              </div>
            </div>

            <p className="drum-import-hint">
              For best results, select an 8–16 second section with clear drums. Max 30 s.
            </p>

            <div className="drum-import-actions">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleExtract}
                disabled={!url || !!urlError}
              >
                Extract Pattern
              </Button>
            </div>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────── */}
        {modalState === 'loading' && (
          <div className="drum-import-loading">
            <div className="drum-import-spinner" />
            <p>Analyzing… typically 5–15 seconds</p>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────── */}
        {modalState === 'error' && (
          <div className="drum-import-error">
            <AlertTriangle size={20} />
            <p>{errorMsg}</p>
            <div className="drum-import-actions">
              <Button variant="outline" onClick={() => setModalState('idle')}>Try Again</Button>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ───────────────────────────────────────────────── */}
        {modalState === 'preview' && result && (
          <div className="drum-import-preview">
            <p className="drum-import-preview-hint">
              Teal cells show proposed hits. Check rows to accept them into your pattern.
            </p>

            <div className="drum-import-grid-wrapper">
              {/* Sticky left column */}
              <div className="drum-import-labels">
                {INSTRUMENTS.map(inst => (
                  <div key={inst.id} className="drum-import-label-row">
                    <input
                      type="checkbox"
                      id={`accept-${inst.id}`}
                      checked={accepted.has(inst.id)}
                      onChange={e => {
                        const next = new Set(accepted);
                        if (e.target.checked) next.add(inst.id);
                        else next.delete(inst.id);
                        setAccepted(next);
                      }}
                      className="drum-import-checkbox"
                    />
                    <label htmlFor={`accept-${inst.id}`} className="drum-import-inst-label">
                      {inst.label}
                    </label>
                    <ConfidenceBadge value={result.confidence[inst.id]} />
                    {result.confidence[inst.id] < 0.5 && (
                      <AlertTriangle size={12} className="drum-import-warn-icon" />
                    )}
                  </div>
                ))}
              </div>

              {/* Scrollable cell grid */}
              <div className="drum-import-cells-scroll">
                <div className="drum-import-cells-inner" style={{ '--total-steps': totalSteps } as React.CSSProperties}>
                  {INSTRUMENTS.map(inst => (
                    <div key={inst.id} className="drum-import-cell-row">
                      {Array.from({ length: totalSteps }, (_, i) => (
                        <ProposedBeatCell
                          key={i}
                          currentActive={currentPattern[inst.id][i] ?? false}
                          proposedActive={accepted.has(inst.id) && (result.pattern[inst.id][i] ?? false)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* BPM mismatch */}
            {bpmDiff > 0.05 && (
              <div className="drum-import-bpm-notice">
                <label className="drum-import-bpm-label">
                  <input
                    type="checkbox"
                    checked={adoptBpm}
                    onChange={e => setAdoptBpm(e.target.checked)}
                    className="drum-import-checkbox"
                  />
                  <span>
                    Detected tempo: <strong>{Math.round(result.detectedBpm)} BPM</strong>
                    {' '}(your current: {currentBpm} BPM) — update drum machine tempo?
                  </span>
                </label>
              </div>
            )}

            <div className="drum-import-actions">
              <Button variant="outline" onClick={() => setModalState('idle')}>Back</Button>
              <Button onClick={handleApply} disabled={accepted.size === 0}>
                Apply{accepted.size > 0 ? ` (${accepted.size} rows)` : ''}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

