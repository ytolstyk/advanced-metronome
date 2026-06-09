import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { loadMetronomePrefs, saveMetronomePrefs } from '@/api/metronomeApi';
import {
  loadMetronomePresets,
  saveMetronomePreset,
  deleteMetronomePreset,
  type MetronomePreset,
} from '@/api/metronomePresetsApi';
import { ClickTrackEngine } from '@/audio/ClickTrackEngine';
import type { AccentLevel, SubdivisionLabel, TrackPiece } from '@/audio/ClickTrackEngine';
import { subsPerBeat } from '@/audio/clickMath';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
const POLY_DIVISIONS = [2, 3, 4, 5, 6, 7, 8, 9];

const COLORS = ['#6ee7b7', '#93c5fd', '#fca5a5', '#fcd34d', '#c4b5fd', '#fb923c', '#34d399', '#60a5fa'];
const ACCENT_CYCLE: AccentLevel[] = ['accent', 'normal', 'ghost'];

type Mode = 'simple' | 'advanced' | 'polyrhythm';
type Denominator = 2 | 4 | 8;

interface MeasureConfig {
  id: string;
  bpm: number;
  numerator: number;
  denominator: Denominator;
  subdivision: SubdivisionLabel;
  repeats: number;
  accentPattern: AccentLevel[];
}

interface BeatState {
  beat: number;
  accentLevel: AccentLevel;
  pieceIndex: number;
}

const RESET_BEAT_STATE: BeatState = { beat: 0, accentLevel: 'normal', pieceIndex: 0 };

// ── Helpers ────────────────────────────────────────────────────────────────

function clampBpm(v: number) {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, v));
}

function makeDefaultAccentPattern(numerator: number): AccentLevel[] {
  return Array.from({ length: numerator }, (_, i): AccentLevel => i === 0 ? 'accent' : 'normal');
}

function makeMeasure(bpm = DEFAULT_BPM): MeasureConfig {
  return {
    id: crypto.randomUUID(),
    bpm,
    numerator: 4,
    denominator: 4,
    subdivision: 'quarter',
    repeats: 1,
    accentPattern: makeDefaultAccentPattern(4),
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
    accentPattern: m.accentPattern,
  }));
}

function subTickToBeat(subTick: number, sub: SubdivisionLabel, numerator: number): number {
  if (sub === 'whole') return 0;
  const sps = subsPerBeat(sub, numerator);
  if (sps <= 0) return 0;
  return Math.min(numerator - 1, Math.floor(subTick / sps));
}

function cycleAccent(current: AccentLevel): AccentLevel {
  const idx = ACCENT_CYCLE.indexOf(current);
  return ACCENT_CYCLE[(idx + 1) % ACCENT_CYCLE.length];
}

function formatPresetDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function resizeAccentPattern(existing: AccentLevel[], newLen: number): AccentLevel[] {
  if (existing.length === newLen) return existing;
  if (existing.length < newLen) {
    const extra = Array.from<AccentLevel>({ length: newLen - existing.length }).fill('normal');
    return [...existing, ...extra];
  }
  return existing.slice(0, newLen);
}

// ── AccentStrip ────────────────────────────────────────────────────────────

interface AccentStripProps {
  pattern: AccentLevel[];
  onChange: (newPattern: AccentLevel[]) => void;
}

const AccentStrip = memo(function AccentStrip({ pattern, onChange }: AccentStripProps) {
  return (
    <div className="accent-strip">
      <span className="accent-strip-label">Accents</span>
      <div className="accent-strip-beats">
        {pattern.map((level, i) => (
          <button
            key={i}
            className={`accent-btn accent-btn-${level}`}
            onClick={() => {
              const next = [...pattern];
              next[i] = cycleAccent(level);
              onChange(next);
            }}
            aria-label={`Beat ${i + 1}: ${level}`}
            title={`Beat ${i + 1}: ${level} — click to cycle`}
          >
            {level === 'accent' ? 'A' : level === 'ghost' ? 'G' : '·'}
          </button>
        ))}
      </div>
    </div>
  );
});

// ── PolyrhythmRings ────────────────────────────────────────────────────────

interface PolyrhythmRingsProps {
  div1: number;
  div2: number;
  beat1: number;
  beat2: number;
  isPlaying: boolean;
}

const PolyrhythmRings = memo(function PolyrhythmRings({
  div1, div2, beat1, beat2, isPlaying,
}: PolyrhythmRingsProps) {
  const cx = 110, cy = 110;
  const r1 = 50, r2 = 84;

  const makeDots = (n: number, r: number, activeBeat: number) =>
    Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), active: isPlaying && i === activeBeat };
    });

  const dots1 = makeDots(div1, r1, beat1);
  const dots2 = makeDots(div2, r2, beat2);

  return (
    <svg viewBox="0 0 220 220" width="100%" style={{ maxWidth: '220px', display: 'block' }} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke="#1e1e1e" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="#1e1e1e" strokeWidth="1.5" />
      {dots2.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={8}
          fill={d.active ? '#f0f0f0' : '#2a2a2a'}
          stroke={d.active ? '#f0f0f0' : '#333'}
          strokeWidth="1"
        />
      ))}
      {dots1.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={7}
          fill={d.active ? '#6ee7b7' : '#2a2a2a'}
          stroke={d.active ? '#6ee7b7' : '#3a3a3a'}
          strokeWidth="1"
        />
      ))}
      <circle cx={cx} cy={cy} r={6} fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="1" />
    </svg>
  );
});

// ── Pendulum ───────────────────────────────────────────────────────────────

interface PendulumProps {
  bpm: number;
  isPlaying: boolean;
  isPaused: boolean;
  animKey: number;
  currentBeat: number;
  numerator: number;
  accentLevel: AccentLevel;
  color?: string;
}

const Pendulum = memo(function Pendulum({
  bpm, isPlaying, isPaused, animKey, currentBeat, numerator, accentLevel, color = '#6ee7b7',
}: PendulumProps) {
  const swingPeriod = `${(60 / bpm).toFixed(3)}s`;
  const swingState = (isPlaying && !isPaused) ? 'running' : 'paused';
  const dots = Array.from({ length: numerator }, (_, i) => i);

  return (
    <div className="metronome-viz-card">
      <div className="pendulum-wrap">
        <svg viewBox="0 0 220 260" width="100%" aria-hidden="true" style={{ display: 'block' }}>
          <polygon points="110,240 55,240 110,80 165,240" fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="1.5" />
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
              className={`pendulum-weight${accentLevel === 'accent' ? ' accent' : ''}`}
              opacity="0.92"
            />
            <circle cx="110" cy="215" r="7" fill="#0a0a0a" opacity="0.5" />
          </g>
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
        {dots.map((i) => {
          const isCurrent = i === currentBeat && isPlaying;
          let cls = 'beat-dot';
          if (isCurrent) {
            cls += accentLevel === 'accent' ? ' accent' : accentLevel === 'ghost' ? ' ghost' : ' active';
          }
          return <div key={i} className={cls} />;
        })}
      </div>
    </div>
  );
});

// ── SimpleControls ─────────────────────────────────────────────────────────

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

// ── PolyrhythmControls ─────────────────────────────────────────────────────

interface PolyrhythmControlsProps {
  div1: number;
  div2: number;
  bpm: number;
  onDiv1Change: (v: number) => void;
  onDiv2Change: (v: number) => void;
  onBpmDrag: (v: number) => void;
  onBpmCommit: (v: number) => void;
}

const PolyrhythmControls = memo(function PolyrhythmControls({
  div1, div2, bpm, onDiv1Change, onDiv2Change, onBpmDrag, onBpmCommit,
}: PolyrhythmControlsProps) {
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
      <div className="metronome-row">
        <span className="metronome-label">Division</span>
        <div className="metronome-poly-pair">
          <Select value={String(div1)} onValueChange={(v) => onDiv1Change(Number(v))}>
            <SelectTrigger aria-label="Division 1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {POLY_DIVISIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="metronome-poly-over">over</span>
          <Select value={String(div2)} onValueChange={(v) => onDiv2Change(Number(v))}>
            <SelectTrigger aria-label="Division 2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {POLY_DIVISIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
});

// ── MeasureCard ────────────────────────────────────────────────────────────

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

  const handleAccentChange = useCallback(
    (newPattern: AccentLevel[]) => onChange(measure.id, { accentPattern: newPattern }),
    [onChange, measure.id],
  );

  return (
    <div className={`metronome-measure-card${isActive ? ' playing' : ''}`}>
      <div className="metronome-measure-card-header">
        <span className="metronome-measure-num">Measure {index + 1}</span>
        {canDelete && (
          <button className="metronome-measure-delete" onClick={() => onDelete(measure.id)} aria-label={`Delete measure ${index + 1}`}>
            ✕
          </button>
        )}
      </div>
      <div className="metronome-measure-fields">
        <div className="metronome-field-group">
          <span className="metronome-field-label">BPM</span>
          <input type="number" className="metronome-number-input" value={bpmDraft} min={MIN_BPM} max={MAX_BPM}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </div>
        <div className="metronome-field-group">
          <span className="metronome-field-label">Beats</span>
          <Select value={String(measure.numerator)} onValueChange={(v) => onChange(measure.id, { numerator: Number(v) })}>
            <SelectTrigger style={{ height: '2rem', fontSize: '0.82rem' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6, 7, 9, 12].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="metronome-field-group">
          <span className="metronome-field-label">Note</span>
          <Select value={String(measure.denominator)} onValueChange={(v) => onChange(measure.id, { denominator: Number(v) as Denominator })}>
            <SelectTrigger style={{ height: '2rem', fontSize: '0.82rem' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {([2, 4, 8] as Denominator[]).map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="metronome-field-group">
          <span className="metronome-field-label">Repeats</span>
          <input type="number" className="metronome-number-input" value={repeatsDraft} min={1} max={32}
            onChange={(e) => setRepeatsDraft(e.target.value)}
            onBlur={commitRepeats}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </div>
      </div>
      <div className="metronome-sub-group">
        {SUB_OPTIONS.map(({ label, value }) => (
          <button key={value} className={`metronome-sub-btn${measure.subdivision === value ? ' active' : ''}`}
            onClick={() => onChange(measure.id, { subdivision: value })}>
            {label}
          </button>
        ))}
      </div>
      <AccentStrip
        pattern={measure.accentPattern}
        onChange={handleAccentChange}
      />
    </div>
  );
});

// ── MetronomePage ──────────────────────────────────────────────────────────

export function MetronomePage() {
  const [mode, setMode] = useState<Mode>('simple');
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatState, setBeatState] = useState<BeatState>(RESET_BEAT_STATE);

  // Simple mode
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [numerator, setNumerator] = useState(4);
  const [denominator, setDenominator] = useState<Denominator>(4);
  const [subdivision, setSubdivision] = useState<SubdivisionLabel>('quarter');
  const [accentPattern, setAccentPattern] = useState<AccentLevel[]>(makeDefaultAccentPattern(4));

  // Advanced mode
  const [measures, setMeasures] = useState<MeasureConfig[]>([makeMeasure()]);

  // Polyrhythm mode
  const [polyDiv1, setPolyDiv1] = useState(3);
  const [polyDiv2, setPolyDiv2] = useState(4);
  const [polyBpm, setPolyBpm] = useState(DEFAULT_BPM);
  const [poly1Beat, setPoly1Beat] = useState(-1);
  const [poly2Beat, setPoly2Beat] = useState(-1);

  const [bpmDragging, setBpmDragging] = useState(false);
  const [pendulumKey, setPendulumKey] = useState(0);

  // Presets
  const [presets, setPresets] = useState<MetronomePreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Practice BPM from URL — initialized once from ?bpm= query param
  const [practiceGoalBpm, setPracticeGoalBpm] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = parseInt(params.get('bpm') ?? '', 10);
    return (!isNaN(v) && v >= MIN_BPM && v <= MAX_BPM) ? v : null;
  });

  const engineRef = useRef<ClickTrackEngine | null>(null);
  const polyEngine1Ref = useRef<ClickTrackEngine | null>(null);
  const polyEngine2Ref = useRef<ClickTrackEngine | null>(null);
  const tapTimestamps = useRef<number[]>([]);
  const bpmDragRef = useRef({ dragging: false, wasPlaying: false });
  const polyBpmDragRef = useRef({ dragging: false, wasPlaying: false });
  const prevPieceIndexRef = useRef(-1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  useEffect(() => {
    void loadMetronomePrefs().then(prefs => {
      // Re-read URL BPM here (async, so no sync-setState-in-effect violation)
      const params = new URLSearchParams(window.location.search);
      const urlBpm = parseInt(params.get('bpm') ?? '', 10);
      const hasUrlBpm = !isNaN(urlBpm) && urlBpm >= MIN_BPM && urlBpm <= MAX_BPM;

      if (!prefs) {
        if (hasUrlBpm) setBpm(urlBpm);
        return;
      }
      if (prefs.mode === 'simple' || prefs.mode === 'advanced' || prefs.mode === 'polyrhythm') {
        setMode(prefs.mode as Mode);
      }
      setBpm(clampBpm(prefs.bpm));
      setNumerator(prefs.numerator);
      if (prefs.denominator === 2 || prefs.denominator === 4 || prefs.denominator === 8) {
        setDenominator(prefs.denominator as Denominator);
      }
      setSubdivision(prefs.subdivision as SubdivisionLabel);
      if (Array.isArray(prefs.accentPattern) && prefs.accentPattern.length > 0) {
        setAccentPattern(prefs.accentPattern as AccentLevel[]);
      }
      if (Array.isArray(prefs.measures) && prefs.measures.length > 0) {
        setMeasures((prefs.measures as MeasureConfig[]).map(m => ({
          ...m,
          accentPattern: Array.isArray(m.accentPattern) && m.accentPattern.length > 0
            ? m.accentPattern as AccentLevel[]
            : makeDefaultAccentPattern(m.numerator),
        })));
      }
      if (typeof prefs.polyDiv1 === 'number') setPolyDiv1(prefs.polyDiv1);
      if (typeof prefs.polyDiv2 === 'number') setPolyDiv2(prefs.polyDiv2);
      if (typeof prefs.polyBpm === 'number') setPolyBpm(clampBpm(prefs.polyBpm));
      // URL BPM always overrides persisted BPM
      if (hasUrlBpm) setBpm(urlBpm);
    });
  }, [authStatus]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveMetronomePrefs({ mode, bpm, numerator, denominator, subdivision, measures, accentPattern, polyDiv1, polyDiv2, polyBpm });
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [mode, bpm, numerator, denominator, subdivision, measures, accentPattern, polyDiv1, polyDiv2, polyBpm]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      polyEngine1Ref.current?.destroy();
      polyEngine2Ref.current?.destroy();
    };
  }, []);

  const activeMeasure = useMemo((): MeasureConfig => {
    if (mode === 'advanced') return measures[beatState.pieceIndex] ?? measures[0];
    if (mode === 'polyrhythm') {
      return { id: 'poly', bpm: polyBpm, numerator: polyDiv2, denominator: 4, subdivision: 'quarter', repeats: 1, accentPattern: makeDefaultAccentPattern(polyDiv2) };
    }
    return { id: 'simple', bpm, numerator, denominator, subdivision, repeats: 1, accentPattern };
  }, [mode, measures, beatState.pieceIndex, bpm, numerator, denominator, subdivision, accentPattern, polyBpm, polyDiv2]);

  const stopPlayback = useCallback(() => {
    engineRef.current?.stop();
    setIsPlaying(false);
    setBeatState(RESET_BEAT_STATE);
  }, []);

  const stopPolyrhythm = useCallback(() => {
    polyEngine1Ref.current?.stop();
    polyEngine2Ref.current?.stop();
    setIsPlaying(false);
    setPoly1Beat(-1);
    setPoly2Beat(-1);
  }, []);

  const startPlayback = useCallback((piecesOverride?: TrackPiece[]) => {
    if (!engineRef.current) engineRef.current = new ClickTrackEngine();
    engineRef.current.stop();

    const pieces = piecesOverride ?? (
      mode === 'simple'
        ? toTrackPieces([{ id: 'simple', bpm, numerator, denominator, subdivision, repeats: 1, accentPattern }])
        : toTrackPieces(measures)
    );

    prevPieceIndexRef.current = -1;
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
        const accentLvl: AccentLevel = (piece.accentPattern?.[beat]) ?? (subTick === 0 ? 'accent' : 'normal');
        setBeatState({ beat, accentLevel: accentLvl, pieceIndex });
        if (mode === 'advanced' && subTick === 0 && pieceIndex !== prevPieceIndexRef.current) {
          prevPieceIndexRef.current = pieceIndex;
          setPendulumKey((k) => k + 1);
        }
      },
      0,
      true,
    );
  }, [mode, bpm, numerator, denominator, subdivision, accentPattern, measures]);

  const startPolyrhythm = useCallback((n1: number, n2: number, bpmValue: number) => {
    if (!polyEngine1Ref.current) polyEngine1Ref.current = new ClickTrackEngine();
    if (!polyEngine2Ref.current) polyEngine2Ref.current = new ClickTrackEngine();
    polyEngine1Ref.current.stop();
    polyEngine2Ref.current.stop();

    const makePiece = (id: string, n: number, b: number): TrackPiece => ({
      id, label: `${n}`, color: '#6ee7b7', groupId: null,
      timeSignature: { numerator: n, denominator: 4 },
      subdivision: 'quarter', bpm: b, repeats: 1,
    });

    const piece1 = makePiece('poly1', n1, bpmValue * n1 / n2);
    const piece2 = makePiece('poly2', n2, bpmValue);

    setPoly1Beat(-1);
    setPoly2Beat(-1);
    setIsPlaying(true);

    const doStart = (engine: ClickTrackEngine, piece: TrackPiece, onBt: (b: number) => void) => {
      engine.start([piece], 0, 1, false, () => {}, () => {}, () => {}, (_pi, _rep, subTick) => { onBt(subTick); }, 0, true);
    };
    doStart(polyEngine1Ref.current, piece1, setPoly1Beat);
    doStart(polyEngine2Ref.current, piece2, setPoly2Beat);
  }, []);

  const handlePlayStop = useCallback(() => {
    if (isPlaying) {
      if (mode === 'polyrhythm') stopPolyrhythm();
      else stopPlayback();
    } else {
      if (mode === 'polyrhythm') {
        startPolyrhythm(polyDiv1, polyDiv2, polyBpm);
      } else {
        if (mode === 'simple') setPendulumKey((k) => k + 1);
        startPlayback();
      }
    }
  }, [isPlaying, mode, stopPlayback, stopPolyrhythm, startPlayback, startPolyrhythm, polyDiv1, polyDiv2, polyBpm]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const prev = tapTimestamps.current;
    const taps = (prev.length > 0 && now - prev[prev.length - 1] > TAP_RESET_MS)
      ? [now] : [...prev, now].slice(-MAX_TAP_HISTORY);
    tapTimestamps.current = taps;
    if (taps.length < 2) return;
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const newBpm = clampBpm(Math.round(60000 / avg));
    setBpm(newBpm);
    setPendulumKey((k) => k + 1);
    if (isPlaying) {
      startPlayback(toTrackPieces([{ id: 'simple', bpm: newBpm, numerator, denominator, subdivision, repeats: 1, accentPattern }]));
    }
  }, [isPlaying, numerator, denominator, subdivision, accentPattern, startPlayback]);

  const handleModeSwitch = useCallback((newMode: Mode) => {
    if (isPlaying) {
      if (mode === 'polyrhythm') stopPolyrhythm();
      else stopPlayback();
    }
    setMode(newMode);
  }, [isPlaying, mode, stopPlayback, stopPolyrhythm]);

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
      startPlayback(toTrackPieces([{ id: 'simple', bpm: v, numerator, denominator, subdivision, repeats: 1, accentPattern }]));
    }
  }, [numerator, denominator, subdivision, accentPattern, startPlayback]);

  const handlePolyBpmDrag = useCallback((v: number) => {
    setPolyBpm(v);
    if (!polyBpmDragRef.current.dragging) {
      polyBpmDragRef.current.dragging = true;
      polyBpmDragRef.current.wasPlaying = isPlaying;
      if (isPlaying) {
        polyEngine1Ref.current?.stop();
        polyEngine2Ref.current?.stop();
        setIsPlaying(false);
      }
    }
  }, [isPlaying]);

  const handlePolyBpmCommit = useCallback((v: number) => {
    setPolyBpm(v);
    polyBpmDragRef.current.dragging = false;
    if (polyBpmDragRef.current.wasPlaying) startPolyrhythm(polyDiv1, polyDiv2, v);
  }, [polyDiv1, polyDiv2, startPolyrhythm]);

  const handleSimpleTimeSigChange = useCallback((field: 'numerator' | 'denominator', value: number) => {
    if (field === 'numerator') {
      setNumerator(value);
      setAccentPattern(prev => resizeAccentPattern(prev, value));
    } else {
      setDenominator(value as Denominator);
    }
    if (isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  const handleSimpleSubChange = useCallback((v: SubdivisionLabel) => {
    setSubdivision(v);
    if (isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  const handleAccentPatternChange = useCallback((newPattern: AccentLevel[]) => {
    setAccentPattern(newPattern);
    if (isPlaying) stopPlayback();
  }, [isPlaying, stopPlayback]);

  const handleMeasureChange = useCallback((id: string, patch: Partial<MeasureConfig>) => {
    if (isPlaying) stopPlayback();
    setMeasures(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updated = { ...m, ...patch };
      const newNumerator = patch.numerator;
      if (newNumerator !== undefined && newNumerator !== m.numerator) {
        updated.accentPattern = resizeAccentPattern(m.accentPattern, newNumerator);
      }
      return updated;
    }));
  }, [isPlaying, stopPlayback]);

  const handleMeasureDelete = useCallback((id: string) => {
    if (isPlaying) stopPlayback();
    setMeasures(prev => prev.filter(m => m.id !== id));
  }, [isPlaying, stopPlayback]);

  const handleAddMeasure = useCallback(() => {
    setMeasures(prev => [...prev, makeMeasure(prev[prev.length - 1]?.bpm ?? DEFAULT_BPM)]);
  }, []);

  const handlePolyDiv1Change = useCallback((v: number) => {
    if (isPlaying) stopPolyrhythm();
    setPolyDiv1(v);
  }, [isPlaying, stopPolyrhythm]);

  const handlePolyDiv2Change = useCallback((v: number) => {
    if (isPlaying) stopPolyrhythm();
    setPolyDiv2(v);
  }, [isPlaying, stopPolyrhythm]);

  const handleSavePreset = useCallback(() => {
    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
    const bpmLabel = mode === 'polyrhythm' ? polyBpm : bpm;
    setPresetName(`${modeLabel} ${bpmLabel} BPM`);
    setPresetDialogOpen(true);
  }, [mode, bpm, polyBpm]);

  const handleOpenLibrary = useCallback(async () => {
    setLibraryDialogOpen(true);
    setPresetsLoading(true);
    const loaded = await loadMetronomePresets();
    setPresets(loaded);
    setPresetsLoading(false);
  }, []);

  const handleConfirmSavePreset = useCallback(async () => {
    setSaveError(null);
    const result = await saveMetronomePreset(
      presetName.trim() || 'Untitled',
      { mode, bpm, numerator, denominator, subdivision, measures, accentPattern, polyDiv1, polyDiv2, polyBpm },
    );
    if (!result) {
      setSaveError('Failed to save. Please try again.');
      return;
    }
    setPresets(prev => [result, ...prev]);
    setPresetDialogOpen(false);
  }, [presetName, mode, bpm, numerator, denominator, subdivision, measures, accentPattern, polyDiv1, polyDiv2, polyBpm]);

  const handleLoadPreset = useCallback((preset: MetronomePreset) => {
    const s = preset.state;
    if (s.mode === 'simple' || s.mode === 'advanced' || s.mode === 'polyrhythm') setMode(s.mode as Mode);
    setBpm(clampBpm(s.bpm));
    setNumerator(s.numerator);
    if (s.denominator === 2 || s.denominator === 4 || s.denominator === 8) setDenominator(s.denominator as Denominator);
    setSubdivision(s.subdivision as SubdivisionLabel);
    if (Array.isArray(s.accentPattern) && s.accentPattern.length > 0) setAccentPattern(s.accentPattern as AccentLevel[]);
    if (Array.isArray(s.measures) && s.measures.length > 0) {
      setMeasures((s.measures as MeasureConfig[]).map(m => ({
        ...m,
        accentPattern: Array.isArray(m.accentPattern) && m.accentPattern.length > 0
          ? m.accentPattern as AccentLevel[]
          : makeDefaultAccentPattern(m.numerator),
      })));
    }
    if (typeof s.polyDiv1 === 'number') setPolyDiv1(s.polyDiv1);
    if (typeof s.polyDiv2 === 'number') setPolyDiv2(s.polyDiv2);
    if (typeof s.polyBpm === 'number') setPolyBpm(clampBpm(s.polyBpm));
    if (isPlaying) {
      if (mode === 'polyrhythm') stopPolyrhythm();
      else stopPlayback();
    }
    setLibraryDialogOpen(false);
  }, [isPlaying, mode, stopPlayback, stopPolyrhythm]);

  const handleDeletePreset = useCallback(async (id: string) => {
    await deleteMetronomePreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  return (
    <main className="metronome-page">
      <div className="metronome-inner">

        {practiceGoalBpm !== null && (
          <div className="metronome-practice-banner">
            <span>Starting at {practiceGoalBpm} BPM from your practice goal</span>
            <button onClick={() => setPracticeGoalBpm(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {authStatus === 'authenticated' && (
          <div className="metronome-header-actions">
            <button className="metronome-preset-btn" onClick={handleSavePreset}>Save preset</button>
            <button className="metronome-preset-btn" onClick={() => void handleOpenLibrary()}>Library</button>
          </div>
        )}

        <div className="metronome-mode-toggle" role="group" aria-label="Metronome mode">
          {(['simple', 'advanced', 'polyrhythm'] as Mode[]).map((m) => (
            <button
              key={m}
              className={`metronome-mode-btn${mode === m ? ' active' : ''}`}
              onClick={() => handleModeSwitch(m)}
            >
              {m === 'simple' ? 'Simple' : m === 'advanced' ? 'Advanced' : 'Polyrhythm'}
            </button>
          ))}
        </div>

        {mode === 'polyrhythm' ? (
          <>
            <div className="metronome-viz-card">
              <PolyrhythmRings div1={polyDiv1} div2={polyDiv2} beat1={poly1Beat} beat2={poly2Beat} isPlaying={isPlaying} />
              <p className="metronome-poly-label">
                <span className="metronome-poly-div1">{polyDiv1}</span>
                <span className="metronome-poly-over"> over </span>
                <span className="metronome-poly-div2">{polyDiv2}</span>
              </p>
            </div>
            <PolyrhythmControls
              div1={polyDiv1} div2={polyDiv2} bpm={polyBpm}
              onDiv1Change={handlePolyDiv1Change}
              onDiv2Change={handlePolyDiv2Change}
              onBpmDrag={handlePolyBpmDrag}
              onBpmCommit={handlePolyBpmCommit}
            />
          </>
        ) : (
          <>
            <Pendulum
              bpm={activeMeasure.bpm}
              isPlaying={isPlaying}
              isPaused={bpmDragging}
              animKey={pendulumKey}
              currentBeat={beatState.beat}
              numerator={activeMeasure.numerator}
              accentLevel={beatState.accentLevel}
              color={mode === 'advanced' ? COLORS[beatState.pieceIndex % COLORS.length] : '#6ee7b7'}
            />
            {mode === 'simple' && (
              <>
                <AccentStrip pattern={accentPattern} onChange={handleAccentPatternChange} />
                <SimpleControls
                  bpm={bpm} onBpmDrag={handleBpmDrag} onBpmCommit={handleBpmCommit} onTap={handleTap}
                  numerator={numerator} onNumeratorChange={(v) => handleSimpleTimeSigChange('numerator', v)}
                  denominator={denominator} onDenominatorChange={(v) => handleSimpleTimeSigChange('denominator', v)}
                  subdivision={subdivision} onSubdivisionChange={handleSimpleSubChange}
                />
              </>
            )}
            {mode === 'advanced' && (
              <div className="metronome-measures">
                {measures.map((m, i) => (
                  <MeasureCard
                    key={m.id} measure={m} index={i}
                    isActive={isPlaying && i === beatState.pieceIndex}
                    canDelete={measures.length > 1}
                    onChange={handleMeasureChange}
                    onDelete={handleMeasureDelete}
                  />
                ))}
                {measures.length < 16 && (
                  <button className="add-measure-btn" onClick={handleAddMeasure}>+ Add Measure</button>
                )}
              </div>
            )}
          </>
        )}

        <button
          className={`metronome-play-btn ${isPlaying ? 'stop' : 'play'}`}
          onClick={handlePlayStop}
          aria-label={isPlaying ? 'Stop metronome' : 'Start metronome'}
        >
          {isPlaying ? '⬛  Stop' : '▶  Play'}
        </button>

        <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Preset</DialogTitle>
            </DialogHeader>
            <Input
              value={presetName}
              onChange={(e) => { setPresetName(e.target.value); setSaveError(null); }}
              placeholder="Preset name"
              onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) void handleConfirmSavePreset(); }}
              autoFocus
            />
            {saveError && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '0' }}>{saveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPresetDialogOpen(false); setSaveError(null); }}>Cancel</Button>
              <Button onClick={() => void handleConfirmSavePreset()} disabled={!presetName.trim()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={libraryDialogOpen} onOpenChange={setLibraryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Preset Library</DialogTitle>
            </DialogHeader>
            <div className="metronome-preset-list">
              {presetsLoading ? (
                <p className="metronome-preset-empty">Loading…</p>
              ) : presets.length === 0 ? (
                <p className="metronome-preset-empty">No saved presets yet</p>
              ) : presets.map(preset => (
                <div key={preset.id} className="metronome-preset-item">
                  <div className="metronome-preset-info">
                    <span className="metronome-preset-name">{preset.name}</span>
                    <span className="metronome-preset-meta">{preset.state.mode} · {formatPresetDate(preset.savedAt)}</span>
                  </div>
                  <div className="metronome-preset-item-actions">
                    <Button size="sm" variant="ghost" onClick={() => handleLoadPreset(preset)}>Load</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDeletePreset(preset.id)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
