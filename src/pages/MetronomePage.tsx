import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClickTrackEngine } from '@/audio/ClickTrackEngine';
import type { SubdivisionLabel, TrackPiece } from '@/audio/ClickTrackEngine';
import { subsPerBeat } from '@/audio/clickMath';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import './MetronomePage.css';

// ── Constants ──────────────────────────────────────────────────────────────

const MIN_BPM = 40;
const MAX_BPM = 300;
const DEFAULT_BPM = 120;
const MAX_TAP_HISTORY = 6;
const TAP_RESET_MS = 3000;

const COLORS = ['#6ee7b7', '#93c5fd', '#fca5a5', '#fcd34d', '#c4b5fd', '#fb923c', '#34d399', '#60a5fa'];

type Mode = 'simple' | 'advanced';
type Denominator = 2 | 4 | 8;

interface MeasureConfig {
  id: string;
  bpm: number;
  numerator: number;
  denominator: Denominator;
  subdivision: SubdivisionLabel;
  repeats: number;
}

interface BeatState {
  beat: number;
  isAccent: boolean;
  pieceIndex: number;
}

const RESET_BEAT_STATE: BeatState = { beat: 0, isAccent: false, pieceIndex: 0 };

// ── Helpers ────────────────────────────────────────────────────────────────

function clampBpm(v: number) {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, v));
}

function makeMeasure(bpm = DEFAULT_BPM): MeasureConfig {
  return {
    id: crypto.randomUUID(),
    bpm,
    numerator: 4,
    denominator: 4,
    subdivision: 'quarter',
    repeats: 1,
  };
}

function toTrackPieces(measures: MeasureConfig[]): TrackPiece[] {
  return measures.map((m, i) => ({
    id: m.id,
    label: `Measure ${i + 1}`,
    color: COLORS[i % COLORS.length],
    groupId: null,
    timeSignature: { numerator: m.numerator, denominator: m.denominator },
    subdivision: m.subdivision,
    bpm: m.bpm,
    repeats: m.repeats,
  }));
}

// Beat index (0-based) for a given subTick in a measure
function subTickToBeat(subTick: number, sub: SubdivisionLabel, numerator: number): number {
  if (sub === 'whole') return 0;
  const sps = subsPerBeat(sub, numerator);
  if (sps <= 0) return 0;
  return Math.min(numerator - 1, Math.floor(subTick / sps));
}

// ── Sub-component: Pendulum visualization ─────────────────────────────────

interface PendulumProps {
  bpm: number;
  isPlaying: boolean;
  isPaused: boolean;
  animKey: number;
  currentBeat: number;
  numerator: number;
  isAccent: boolean;
  color?: string;
}

const Pendulum = memo(function Pendulum({
  bpm, isPlaying, isPaused, animKey, currentBeat, numerator, isAccent, color = '#6ee7b7',
}: PendulumProps) {
  const swingPeriod = `${(60 / bpm).toFixed(3)}s`;
  const swingState = (isPlaying && !isPaused) ? 'running' : 'paused';
  const dots = Array.from({ length: numerator }, (_, i) => i);

  return (
    <div className="metronome-viz-card">
      <div className="pendulum-wrap">
        <svg viewBox="0 0 220 260" width="100%" aria-hidden="true" style={{ display: 'block' }}>
          {/* Base triangle */}
          <polygon points="110,240 55,240 110,80 165,240" fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="1.5" />

          {/* Pendulum arm — key changes on BPM commit to remount and restart animation from -32deg */}
          <g
            key={animKey}
            className="pendulum-arm"
            style={{ '--swing-period': swingPeriod, '--swing-state': swingState } as React.CSSProperties}
          >
            <line x1="110" y1="80" x2="110" y2="215" stroke="#3a3a3a" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="100" y="135" width="20" height="8" rx="2" fill="#2a2a2a" stroke="#444" strokeWidth="1" />
            <circle cx="110" cy="80" r="5" fill="#444" />
            <circle
              cx="110" cy="215" r="16"
              fill={color}
              className={`pendulum-weight${isAccent ? ' accent' : ''}`}
              opacity="0.92"
            />
            <circle cx="110" cy="215" r="7" fill="#0a0a0a" opacity="0.5" />
          </g>

          {/* Scale markings */}
          {[-24, -16, -8, 0, 8, 16, 24].map((offset) => (
            <line
              key={offset}
              x1={110 + offset * 0.9} y1={238}
              x2={110 + offset * 0.9} y2={offset === 0 ? 230 : 234}
              stroke="#333" strokeWidth="1"
            />
          ))}
        </svg>
      </div>

      <div className="beat-dots" aria-label={`Beat ${currentBeat + 1} of ${numerator}`}>
        {dots.map((i) => (
          <div
            key={i}
            className={`beat-dot${i === currentBeat && isPlaying ? (i === 0 ? ' accent' : ' active') : ''}`}
          />
        ))}
      </div>
    </div>
  );
});

// ── Sub-component: Simple controls ────────────────────────────────────────

interface SimpleControlsProps {
  bpm: number;
  onBpmDrag: (v: number) => void;
  onBpmCommit: (v: number) => void;
  onTap: () => void;
  numerator: number;
  onNumeratorChange: (v: number) => void;
  denominator: Denominator;
  onDenominatorChange: (v: Denominator) => void;
  subdivision: SubdivisionLabel;
  onSubdivisionChange: (v: SubdivisionLabel) => void;
}

const SUB_OPTIONS: { label: string; value: SubdivisionLabel }[] = [
  { label: '♩', value: 'quarter' },
  { label: '♪', value: 'eighth' },
  { label: '♬', value: 'sixteenth' },
  { label: '3', value: 'quarter-triplet' },
];

const SimpleControls = memo(function SimpleControls({
  bpm, onBpmDrag, onBpmCommit, onTap,
  numerator, onNumeratorChange,
  denominator, onDenominatorChange,
  subdivision, onSubdivisionChange,
}: SimpleControlsProps) {
  return (
    <div className="metronome-controls">
      <div className="metronome-bpm-row">
        <div className="metronome-bpm-label">
          <span>BPM</span>
          <span className="metronome-bpm-value">{bpm}</span>
        </div>
        <Slider
          min={MIN_BPM} max={MAX_BPM} step={1}
          value={[bpm]}
          onValueChange={([v]) => onBpmDrag(v)}
          onValueCommit={([v]) => onBpmCommit(v)}
          aria-label="BPM"
        />
      </div>

      <button className="metronome-play-btn stop" onClick={onTap} style={{ height: '2.6rem', fontSize: '0.88rem' }}>
        Tap Tempo
      </button>

      <div className="metronome-row">
        <span className="metronome-label">Time sig</span>
        <div className="metronome-select-pair">
          <Select value={String(numerator)} onValueChange={(v) => onNumeratorChange(Number(v))}>
            <SelectTrigger aria-label="Beats per measure"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6, 7, 9, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>/</span>
          <Select value={String(denominator)} onValueChange={(v) => onDenominatorChange(Number(v) as Denominator)}>
            <SelectTrigger aria-label="Note value"><SelectValue /></SelectTrigger>
            <SelectContent>
              {([2, 4, 8] as Denominator[]).map((d) => (
                <SelectItem key={d} value={String(d)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="metronome-row">
        <span className="metronome-label">Subdivision</span>
        <div className="metronome-sub-group" style={{ flex: 1 }}>
          {SUB_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              className={`metronome-sub-btn${subdivision === value ? ' active' : ''}`}
              onClick={() => onSubdivisionChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Sub-component: Advanced measure card ──────────────────────────────────

interface MeasureCardProps {
  measure: MeasureConfig;
  index: number;
  isActive: boolean;
  canDelete: boolean;
  onChange: (id: string, patch: Partial<MeasureConfig>) => void;
  onDelete: (id: string) => void;
}

const MeasureCard = memo(function MeasureCard({
  measure, index, isActive, canDelete, onChange, onDelete,
}: MeasureCardProps) {
  // Local draft strings let the user type freely; committed on blur.
  // No sync effect needed: bpm/repeats only change via commitBpm/commitRepeats,
  // which update the draft before calling onChange.
  const [bpmDraft, setBpmDraft] = useState(String(measure.bpm));
  const [repeatsDraft, setRepeatsDraft] = useState(String(measure.repeats));

  const commitBpm = () => {
    const v = clampBpm(Number(bpmDraft) || DEFAULT_BPM);
    setBpmDraft(String(v));
    onChange(measure.id, { bpm: v });
  };

  const commitRepeats = () => {
    const v = Math.max(1, Math.min(32, Number(repeatsDraft) || 1));
    setRepeatsDraft(String(v));
    onChange(measure.id, { repeats: v });
  };

  return (
    <div className={`metronome-measure-card${isActive ? ' playing' : ''}`}>
      <div className="metronome-measure-card-header">
        <span className="metronome-measure-num">Measure {index + 1}</span>
        {canDelete && (
          <button
            className="metronome-measure-delete"
            onClick={() => onDelete(measure.id)}
            aria-label={`Delete measure ${index + 1}`}
          >
            ✕
          </button>
        )}
      </div>

      <div className="metronome-measure-fields">
        <div className="metronome-field-group">
          <span className="metronome-field-label">BPM</span>
          <input
            type="number"
            className="metronome-number-input"
            value={bpmDraft}
            min={MIN_BPM} max={MAX_BPM}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          />
        </div>

        <div className="metronome-field-group">
          <span className="metronome-field-label">Beats</span>
          <Select value={String(measure.numerator)} onValueChange={(v) => onChange(measure.id, { numerator: Number(v) })}>
            <SelectTrigger style={{ height: '2rem', fontSize: '0.82rem' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6, 7, 9, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="metronome-field-group">
          <span className="metronome-field-label">Note</span>
          <Select value={String(measure.denominator)} onValueChange={(v) => onChange(measure.id, { denominator: Number(v) as Denominator })}>
            <SelectTrigger style={{ height: '2rem', fontSize: '0.82rem' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {([2, 4, 8] as Denominator[]).map((d) => (
                <SelectItem key={d} value={String(d)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="metronome-field-group">
          <span className="metronome-field-label">Repeats</span>
          <input
            type="number"
            className="metronome-number-input"
            value={repeatsDraft}
            min={1} max={32}
            onChange={(e) => setRepeatsDraft(e.target.value)}
            onBlur={commitRepeats}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          />
        </div>
      </div>

      <div className="metronome-sub-group">
        {SUB_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            className={`metronome-sub-btn${measure.subdivision === value ? ' active' : ''}`}
            onClick={() => onChange(measure.id, { subdivision: value })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
});

// ── Main page ──────────────────────────────────────────────────────────────

export function MetronomePage() {
  const [mode, setMode] = useState<Mode>('simple');
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatState, setBeatState] = useState<BeatState>(RESET_BEAT_STATE);

  // Simple mode state
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [numerator, setNumerator] = useState(4);
  const [denominator, setDenominator] = useState<Denominator>(4);
  const [subdivision, setSubdivision] = useState<SubdivisionLabel>('quarter');

  // Advanced mode state
  const [measures, setMeasures] = useState<MeasureConfig[]>([makeMeasure()]);

  const [bpmDragging, setBpmDragging] = useState(false);
  const [pendulumKey, setPendulumKey] = useState(0);

  const engineRef = useRef<ClickTrackEngine | null>(null);
  const tapTimestamps = useRef<number[]>([]);
  // Tracks drag-start state without stale-closure issues
  const bpmDragRef = useRef({ dragging: false, wasPlaying: false });
  // Tracks last piece index seen by onBeat so we can detect transitions
  const prevPieceIndexRef = useRef(-1);

  useEffect(() => {
    return () => { engineRef.current?.stop(); };
  }, []);

  const activeMeasure = useMemo((): MeasureConfig => {
    if (mode === 'advanced') return measures[beatState.pieceIndex] ?? measures[0];
    return { id: 'simple', bpm, numerator, denominator, subdivision, repeats: 1 };
  }, [mode, measures, beatState.pieceIndex, bpm, numerator, denominator, subdivision]);

  const stopPlayback = useCallback(() => {
    engineRef.current?.stop();
    setIsPlaying(false);
    setBeatState(RESET_BEAT_STATE);
  }, []);

  const startPlayback = useCallback((piecesOverride?: TrackPiece[]) => {
    if (!engineRef.current) engineRef.current = new ClickTrackEngine();
    engineRef.current.stop();

    const pieces = piecesOverride ?? (
      mode === 'simple'
        ? toTrackPieces([{ id: 'simple', bpm, numerator, denominator, subdivision, repeats: 1 }])
        : toTrackPieces(measures)
    );

    prevPieceIndexRef.current = -1; // so the first onBeat always triggers a pendulum reset
    setIsPlaying(true);
    setBeatState(RESET_BEAT_STATE);

    engineRef.current.start(
      pieces, 0, 1, false,
      () => {},
      () => {},
      () => { setIsPlaying(false); setBeatState(RESET_BEAT_STATE); },
      (pieceIndex, _rep, subTick) => {
        const piece = pieces[pieceIndex];
        if (!piece) return;
        const beat = subTickToBeat(subTick, piece.subdivision, piece.timeSignature.numerator);
        setBeatState({ beat, isAccent: subTick === 0, pieceIndex });
        // In advanced mode, remount the pendulum arm on every piece transition so
        // the animation restarts from -32deg in sync with the new measure's tempo.
        if (mode === 'advanced' && subTick === 0 && pieceIndex !== prevPieceIndexRef.current) {
          prevPieceIndexRef.current = pieceIndex;
          setPendulumKey((k) => k + 1);
        }
      },
      0,
      true, // loop
    );
  }, [mode, bpm, numerator, denominator, subdivision, measures]);

  const handlePlayStop = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      // Simple mode: reset animation so it starts at -32deg on play.
      // Advanced mode: onBeat handles the reset on first piece entry.
      if (mode === 'simple') setPendulumKey((k) => k + 1);
      startPlayback();
    }
  }, [isPlaying, mode, stopPlayback, startPlayback]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const prev = tapTimestamps.current;
    // Reset buffer if gap > 3s (user starting a new tap sequence)
    const taps = (prev.length > 0 && now - prev[prev.length - 1] > TAP_RESET_MS)
      ? [now]
      : [...prev, now].slice(-MAX_TAP_HISTORY);
    tapTimestamps.current = taps;
    if (taps.length < 2) return;
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const newBpm = clampBpm(Math.round(60000 / avg));
    setBpm(newBpm);
    setPendulumKey((k) => k + 1);
    if (isPlaying) {
      startPlayback(toTrackPieces([{ id: 'simple', bpm: newBpm, numerator, denominator, subdivision, repeats: 1 }]));
    }
  }, [isPlaying, numerator, denominator, subdivision, startPlayback]);

  const handleModeSwitch = useCallback((newMode: Mode) => {
    if (isPlaying) stopPlayback();
    setMode(newMode);
  }, [isPlaying, stopPlayback]);

  const handleBpmDrag = useCallback((v: number) => {
    setBpm(v);
    if (!bpmDragRef.current.dragging) {
      bpmDragRef.current.dragging = true;
      bpmDragRef.current.wasPlaying = isPlaying;
      setBpmDragging(true);
      engineRef.current?.stop();
    }
  }, [isPlaying]);

  const handleBpmCommit = useCallback((v: number) => {
    setBpm(v);
    bpmDragRef.current.dragging = false;
    setBpmDragging(false);
    setPendulumKey((k) => k + 1);
    if (bpmDragRef.current.wasPlaying) {
      startPlayback(toTrackPieces([{ id: 'simple', bpm: v, numerator, denominator, subdivision, repeats: 1 }]));
    }
  }, [numerator, denominator, subdivision, startPlayback]);

  const handleSimpleTimeSigChange = useCallback((field: 'numerator' | 'denominator', value: number) => {
    if (field === 'numerator') setNumerator(value); else setDenominator(value as Denominator);
    if (isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  const handleSimpleSubChange = useCallback((v: SubdivisionLabel) => {
    setSubdivision(v);
    if (isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  const handleMeasureChange = useCallback((id: string, patch: Partial<MeasureConfig>) => {
    if (isPlaying) stopPlayback();
    setMeasures((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, [isPlaying, stopPlayback]);

  const handleMeasureDelete = useCallback((id: string) => {
    if (isPlaying) stopPlayback();
    setMeasures((prev) => prev.filter((m) => m.id !== id));
  }, [isPlaying, stopPlayback]);

  const handleAddMeasure = useCallback(() => {
    setMeasures((prev) => [...prev, makeMeasure(prev[prev.length - 1]?.bpm ?? DEFAULT_BPM)]);
  }, []);

  return (
    <main className="metronome-page">
      <div className="metronome-inner">
        <div className="metronome-mode-toggle" role="group" aria-label="Metronome mode">
          <button
            className={`metronome-mode-btn${mode === 'simple' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('simple')}
          >
            Simple
          </button>
          <button
            className={`metronome-mode-btn${mode === 'advanced' ? ' active' : ''}`}
            onClick={() => handleModeSwitch('advanced')}
          >
            Advanced
          </button>
        </div>

        <Pendulum
          bpm={activeMeasure.bpm}
          isPlaying={isPlaying}
          isPaused={bpmDragging}
          animKey={pendulumKey}
          currentBeat={beatState.beat}
          numerator={activeMeasure.numerator}
          isAccent={beatState.isAccent}
          color={mode === 'advanced' ? COLORS[beatState.pieceIndex % COLORS.length] : '#6ee7b7'}
        />

        {mode === 'simple' ? (
          <SimpleControls
            bpm={bpm}
            onBpmDrag={handleBpmDrag}
            onBpmCommit={handleBpmCommit}
            onTap={handleTap}
            numerator={numerator}
            onNumeratorChange={(v) => handleSimpleTimeSigChange('numerator', v)}
            denominator={denominator}
            onDenominatorChange={(v) => handleSimpleTimeSigChange('denominator', v)}
            subdivision={subdivision}
            onSubdivisionChange={handleSimpleSubChange}
          />
        ) : (
          <div className="metronome-measures">
            {measures.map((m, i) => (
              <MeasureCard
                key={m.id}
                measure={m}
                index={i}
                isActive={isPlaying && i === beatState.pieceIndex}
                canDelete={measures.length > 1}
                onChange={handleMeasureChange}
                onDelete={handleMeasureDelete}
              />
            ))}
            {measures.length < 16 && (
              <button className="add-measure-btn" onClick={handleAddMeasure}>
                + Add Measure
              </button>
            )}
          </div>
        )}

        <button
          className={`metronome-play-btn ${isPlaying ? 'stop' : 'play'}`}
          onClick={handlePlayStop}
          aria-label={isPlaying ? 'Stop metronome' : 'Start metronome'}
        >
          {isPlaying ? '⬛  Stop' : '▶  Play'}
        </button>
      </div>
    </main>
  );
}
