import { useState, useMemo, useRef, useCallback } from 'react';
import type { RootNote, ChordType, ChordVoicing } from '../data/chords';
import type { Frets } from '../data/chords';
import {
  CHORD_DATABASE,
  CHORD_TYPE_LABELS,
  CHORD_TYPES,
  ROOT_NOTES,
  chordName,
} from '../data/chords';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// ── SVG constants ───────────────────────────────────────────────────────────
const SVG_H = 120;
const SVG_TOTAL_W = 118;
const STRING_X_START = 14;
const STRING_SPACING = 14.4;
const FRET_Y_START = 18;
const FRET_SPACING = 21;
const FRETS_SHOWN = 5;
const NUT_Y = FRET_Y_START;

function stringX(idx: number): number {
  return STRING_X_START + idx * STRING_SPACING;
}

function dotY(fretNum: number, visibleStart: number): number {
  return FRET_Y_START + (fretNum - visibleStart) * FRET_SPACING + FRET_SPACING / 2;
}

// ── Audio ────────────────────────────────────────────────────────────────────
// Standard tuning open-string MIDI notes: low E → high e
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

function pluckString(ctx: AudioContext, freq: number, startTime: number, vol: number) {
  const env = ctx.createGain();
  env.connect(ctx.destination);
  env.gain.setValueAtTime(0.001, startTime);
  env.gain.linearRampToValueAtTime(vol, startTime + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + 2.2);

  // Harmonic series — gives a guitar-like plucked timbre
  for (let h = 1; h <= 6; h++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * h;
    const hg = ctx.createGain();
    hg.gain.value = 0.5 / (h * h);
    osc.connect(hg);
    hg.connect(env);
    osc.start(startTime);
    osc.stop(startTime + 2.5);
  }
}

function strumChord(ctx: AudioContext, frets: Frets) {
  const now = ctx.currentTime;
  frets.forEach((fret, i) => {
    if (fret < 0) return;
    const freq = 440 * Math.pow(2, (OPEN_MIDI[i] + fret - 69) / 12);
    pluckString(ctx, freq, now + i * 0.025, 0.22);
  });
}

// ── Shared ToggleGroupItem className ────────────────────────────────────────
const FILTER_ITEM_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#353650] bg-[#1e1f2c] text-[#777] ' +
  'hover:bg-[#1e1f2c] hover:border-[#555] hover:text-[#bbb] ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]';

// ── FretboardDiagram ────────────────────────────────────────────────────────
function FretboardDiagram({ voicing }: { voicing: ChordVoicing }) {
  const { frets, barre, startFret = 1 } = voicing;
  const visibleStart = startFret;
  const isOpenPosition = startFret <= 1;

  const stringLines = frets.map((_, i) => (
    <line
      key={`s${i}`}
      x1={stringX(i)} y1={FRET_Y_START}
      x2={stringX(i)} y2={FRET_Y_START + FRET_SPACING * FRETS_SHOWN}
      stroke="#555" strokeWidth="1"
    />
  ));

  const fretLines = Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => {
    const y = FRET_Y_START + f * FRET_SPACING;
    const isNut = f === 0 && isOpenPosition;
    return (
      <line
        key={`f${f}`}
        x1={stringX(0)} y1={y}
        x2={stringX(5)} y2={y}
        stroke={isNut ? '#ccc' : '#555'}
        strokeWidth={isNut ? 3 : 1}
      />
    );
  });

  const markers = frets.map((fret, i) => {
    if (fret === 0) {
      return (
        <text key={`m${i}`} x={stringX(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#888">○</text>
      );
    }
    if (fret === -1) {
      return (
        <text key={`m${i}`} x={stringX(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#666">×</text>
      );
    }
    return null;
  });

  const barreEl = barre ? (() => {
    const x1 = stringX(barre.fromString - 1);
    const x2 = stringX(barre.toString - 1);
    const y = dotY(barre.fret, visibleStart);
    return (
      <rect
        key="barre"
        x={Math.min(x1, x2) - 5.5} y={y - 5.5}
        width={Math.abs(x2 - x1) + 11} height={11}
        rx="5.5" fill="#5b7fff" opacity="0.9"
      />
    );
  })() : null;

  const dots = frets.map((fret, i) => {
    if (fret <= 0) return null;
    if (barre && fret === barre.fret && i >= barre.fromString - 1 && i <= barre.toString - 1) {
      return null;
    }
    return <circle key={`d${i}`} cx={stringX(i)} cy={dotY(fret, visibleStart)} r={5.5} fill="#5b7fff" />;
  });

  const fretLabel = !isOpenPosition ? (
    <text x={SVG_TOTAL_W - 2} y={FRET_Y_START + FRET_SPACING / 2}
      textAnchor="end" fontSize="14" fill="#888" dominantBaseline="middle">
      {startFret}fr
    </text>
  ) : null;

  return (
    <svg viewBox={`0 0 ${SVG_TOTAL_W} ${SVG_H}`} className="w-full max-w-[140px]" aria-hidden="true">
      {stringLines}
      {fretLines}
      {markers}
      {barreEl}
      {dots}
      {fretLabel}
    </svg>
  );
}

// ── TabView ─────────────────────────────────────────────────────────────────
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];

function TabView({ voicing }: { voicing: ChordVoicing }) {
  const { frets } = voicing;
  return (
    <div className="font-mono text-[0.9rem] leading-relaxed bg-[#14141e] rounded-md px-2.5 py-2 w-full">
      {STRING_NAMES.map((name, i) => {
        const fret = frets[5 - i];
        const label = fret === -1 ? 'x' : String(fret);
        return (
          <div key={name} className="flex whitespace-pre">
            <span className="text-[#7070a0] font-bold">{name}</span>
            <span className="text-[#c8d8ff]">{`|--${label.padEnd(2, '-')}|`}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── ChordCard ────────────────────────────────────────────────────────────────
function ChordCard({
  root, type, voicing, viewMode, onPlay,
}: {
  root: RootNote;
  type: ChordType;
  voicing: ChordVoicing;
  viewMode: 'fretboard' | 'tab';
  onPlay: (frets: Frets) => void;
}) {
  const [lit, setLit] = useState(false);

  function handleClick() {
    onPlay(voicing.frets);
    setLit(true);
    setTimeout(() => setLit(false), 400);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      className={[
        'bg-[#1e1f2c] border rounded-xl p-3.5 flex flex-col items-center gap-2.5',
        'cursor-pointer select-none transition-colors duration-150',
        lit
          ? 'border-[#5b7fff] bg-[#252850]'
          : 'border-[#353650] hover:border-[#4a4d70] hover:bg-[#23243a]',
      ].join(' ')}
    >
      <div className="text-[1.05rem] font-bold text-[#8eaaff] text-center">
        {chordName(root, type)}
      </div>
      {viewMode === 'fretboard'
        ? <FretboardDiagram voicing={voicing} />
        : <TabView voicing={voicing} />
      }
    </div>
  );
}

// ── ChordsPage ───────────────────────────────────────────────────────────────
export function ChordsPage() {
  const [selectedKey, setSelectedKey] = useState<RootNote | 'all'>('all');
  const [selectedType, setSelectedType] = useState<ChordType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'fretboard' | 'tab'>('fretboard');
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playChord = useCallback((frets: Frets) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    strumChord(ctx, frets);
  }, []);

  const filtered = useMemo(() =>
    CHORD_DATABASE.filter(e =>
      (selectedKey === 'all' || e.root === selectedKey) &&
      (selectedType === 'all' || e.type === selectedType)
    ),
    [selectedKey, selectedType]
  );

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1100px] mx-auto">

      {/* Key filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#7070a0] mr-1">Key</span>
        <ToggleGroup
          type="single"
          value={selectedKey}
          onValueChange={v => { if (v) setSelectedKey(v as RootNote | 'all'); }}
          className="flex flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="all" className={FILTER_ITEM_CLS}>All</ToggleGroupItem>
          {ROOT_NOTES.map(note => (
            <ToggleGroupItem key={note} value={note} className={FILTER_ITEM_CLS}>{note}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#7070a0] mr-1">Type</span>
        <ToggleGroup
          type="single"
          value={selectedType}
          onValueChange={v => { if (v) setSelectedType(v as ChordType | 'all'); }}
          className="flex flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="all" className={FILTER_ITEM_CLS}>All</ToggleGroupItem>
          {CHORD_TYPES.map(t => (
            <ToggleGroupItem key={t} value={t} className={FILTER_ITEM_CLS}>{CHORD_TYPE_LABELS[t]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* View toggle */}
      <div>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={v => { if (v) setViewMode(v as 'fretboard' | 'tab'); }}
          className="justify-start gap-0.5"
        >
          <ToggleGroupItem value="fretboard" className={FILTER_ITEM_CLS}>Diagram</ToggleGroupItem>
          <ToggleGroupItem value="tab" className={FILTER_ITEM_CLS}>Tab</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Grid */}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-[#555] py-10">No chords found.</div>
        )}
        {filtered.map(entry => (
          <ChordCard
            key={`${entry.root}-${entry.type}`}
            root={entry.root}
            type={entry.type}
            voicing={entry.voicings[0]}
            viewMode={viewMode}
            onPlay={playChord}
          />
        ))}
      </div>
    </div>
  );
}
