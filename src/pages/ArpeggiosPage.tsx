import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { RootNote } from '../data/chords';
import { ROOT_NOTES } from '../data/chords';
import type { ArpeggioQuality, ArpeggioShape, CagedShape } from '../data/arpeggios';
import {
  ARPEGGIO_DATABASE,
  ARPEGGIO_QUALITIES,
  ARPEGGIO_QUALITY_LABELS,
  STANDARD_OPEN_MIDI,
  arpeggioName,
} from '../data/arpeggios';
import type { SweepDirection } from '../audio/arpeggioSynths';
import { playArpeggio } from '../audio/arpeggioSynths';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// ── SVG constants (same as ChordsPage) ──────────────────────────────────────
const SVG_H = 140;
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

// ── FretboardDiagram ─────────────────────────────────────────────────────────
function FretboardDiagram({ shape }: { shape: ArpeggioShape }) {
  const { frets, barre, startFret = 1 } = shape;
  const visibleStart = startFret;
  const isOpenPosition = startFret <= 1;
  const numStrings = frets.length;
  const svgWidth = STRING_X_START + (numStrings - 1) * STRING_SPACING + 18 + STRING_X_START;

  const stringLines = frets.map((_, i) => (
    <line
      key={`s${i}`}
      x1={stringX(i)} y1={FRET_Y_START}
      x2={stringX(i)} y2={FRET_Y_START + FRET_SPACING * FRETS_SHOWN}
      stroke="#888" strokeWidth="1"
    />
  ));

  const fretLines = Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => {
    const y = FRET_Y_START + f * FRET_SPACING;
    const isNut = f === 0 && isOpenPosition;
    return (
      <line
        key={`f${f}`}
        x1={stringX(0)} y1={y}
        x2={stringX(numStrings - 1)} y2={y}
        stroke={isNut ? '#eee' : '#888'}
        strokeWidth={isNut ? 3 : 1}
      />
    );
  });

  const markers = frets.map((fret, i) => {
    if (fret === 0) {
      return (
        <text key={`m${i}`} x={stringX(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#bbb">○</text>
      );
    }
    if (fret === -1) {
      return (
        <text key={`m${i}`} x={stringX(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#999">×</text>
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
        rx="5.5" fill="#7c3aed" opacity="0.9"
      />
    );
  })() : null;

  const dots = frets.map((fret, i) => {
    if (fret <= 0) return null;
    if (barre && fret === barre.fret && i >= barre.fromString - 1 && i <= barre.toString - 1) {
      return null;
    }
    return <circle key={`d${i}`} cx={stringX(i)} cy={dotY(fret, visibleStart)} r={5.5} fill="#7c3aed" />;
  });

  const fretLabel = !isOpenPosition ? (
    <text x={svgWidth - 2} y={FRET_Y_START + FRET_SPACING / 2}
      textAnchor="end" fontSize="14" fill="#bbb" dominantBaseline="middle">
      {startFret}fr
    </text>
  ) : null;

  return (
    <svg viewBox={`0 0 ${svgWidth} ${SVG_H}`} className="w-full max-w-[180px]" aria-hidden="true">
      {stringLines}
      {fretLines}
      {markers}
      {barreEl}
      {dots}
      {fretLabel}
    </svg>
  );
}

// ── ArpeggioCard ─────────────────────────────────────────────────────────────
const CAGED_LABEL: Record<CagedShape, string> = {
  C: 'C shape', A: 'A shape', G: 'G shape', E: 'E shape', D: 'D shape',
};

function ArpeggioCard({
  root, quality, shape, onPlay,
}: {
  root: RootNote;
  quality: ArpeggioQuality;
  shape: ArpeggioShape;
  onPlay: (frets: number[]) => void;
}) {
  const [lit, setLit] = useState(false);
  const litTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (litTimerRef.current) clearTimeout(litTimerRef.current); }, []);

  function handleClick() {
    onPlay(shape.frets);
    setLit(true);
    litTimerRef.current = setTimeout(() => setLit(false), 400);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      className={cn(
        'bg-[#1e1f2c] border rounded-xl p-3.5 flex flex-col items-center gap-2',
        'cursor-pointer select-none transition-colors duration-150',
        lit
          ? 'border-[#7c3aed] bg-[#221a3a]'
          : 'border-[#505270] hover:border-[#7070a0] hover:bg-[#23243a]',
      )}
    >
      <div className="text-[1rem] font-bold text-[#c4b5fd] text-center leading-tight">
        {arpeggioName(root, quality)}
      </div>
      <div className="text-[0.72rem] font-semibold text-[#7070a0] uppercase tracking-wide">
        {CAGED_LABEL[shape.caged]}
      </div>
      <FretboardDiagram shape={shape} />
    </div>
  );
}

// ── Shared toggle class ───────────────────────────────────────────────────────
const FILTER_ITEM_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ' +
  'data-[state=on]:border-[#7c3aed] data-[state=on]:bg-[#221a3a] data-[state=on]:text-[#c4b5fd]';

// ── ArpeggiosPage ─────────────────────────────────────────────────────────────
export function ArpeggiosPage() {
  // Default to 'C' so the page opens with 24 cards instead of 288
  const [selectedKey, setSelectedKey] = useState<RootNote | 'all'>(() =>
    (localStorage.getItem('arpeggios-selectedKey') as RootNote | 'all') || 'C'
  );
  const [selectedQuality, setSelectedQuality] = useState<ArpeggioQuality | 'all'>(() =>
    (localStorage.getItem('arpeggios-selectedQuality') as ArpeggioQuality | 'all') || 'all'
  );
  const [direction, setDirection] = useState<SweepDirection>(() =>
    (localStorage.getItem('arpeggios-direction') as SweepDirection) || 'up'
  );
  // Store the slider position (0–100) as canonical; derive ms only for display + audio
  const [speedSlider, setSpeedSlider] = useState<number>(() => {
    const saved = Number(localStorage.getItem('arpeggios-speed'));
    return saved >= 0 && saved <= 100 ? saved : 50;
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  useEffect(() => { localStorage.setItem('arpeggios-selectedKey', selectedKey); }, [selectedKey]);
  useEffect(() => { localStorage.setItem('arpeggios-selectedQuality', selectedQuality); }, [selectedQuality]);
  useEffect(() => { localStorage.setItem('arpeggios-direction', direction); }, [direction]);
  useEffect(() => { localStorage.setItem('arpeggios-speed', String(speedSlider)); }, [speedSlider]);

  useEffect(() => () => { void audioCtxRef.current?.close(); }, []);

  // slider 0 = slowest (200ms), slider 100 = fastest (80ms)
  const noteDelayMs = Math.round(200 - (speedSlider / 100) * 120);

  const filtered = useMemo(() =>
    ARPEGGIO_DATABASE.filter(e =>
      (selectedKey === 'all' || e.root === selectedKey) &&
      (selectedQuality === 'all' || e.quality === selectedQuality)
    ),
    [selectedKey, selectedQuality]
  );

  const play = useCallback((frets: number[]) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = 0.8;
      gain.connect(audioCtxRef.current.destination);
      masterGainRef.current = gain;
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    playArpeggio(ctx, masterGainRef.current!, frets, STANDARD_OPEN_MIDI, ctx.currentTime, noteDelayMs / 1000, direction);
  }, [noteDelayMs, direction]);

  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1100px] mx-auto" aria-label="Arpeggio library">

      {/* Root filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">Key</span>
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

      {/* Quality filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">Quality</span>
        <ToggleGroup
          type="single"
          value={selectedQuality}
          onValueChange={v => { if (v) setSelectedQuality(v as ArpeggioQuality | 'all'); }}
          className="flex flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="all" className={FILTER_ITEM_CLS}>All</ToggleGroupItem>
          {ARPEGGIO_QUALITIES.map(q => (
            <ToggleGroupItem key={q} value={q} className={FILTER_ITEM_CLS}>{ARPEGGIO_QUALITY_LABELS[q]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Playback controls row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Direction */}
        <div className="flex items-center gap-1">
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">Sweep</span>
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={v => { if (v) setDirection(v as SweepDirection); }}
            className="gap-0.5"
          >
            <ToggleGroupItem value="up" className={FILTER_ITEM_CLS}>↑ Up</ToggleGroupItem>
            <ToggleGroupItem value="down" className={FILTER_ITEM_CLS}>↓ Down</ToggleGroupItem>
            <ToggleGroupItem value="up-down" className={FILTER_ITEM_CLS}>↕ Both</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Speed slider */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] whitespace-nowrap">Speed</span>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[speedSlider]}
            onValueChange={([v]) => setSpeedSlider(v)}
            className="w-28"
          />
          <span className="text-[0.72rem] text-[#666] tabular-nums w-10">{noteDelayMs}ms</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-[#999] py-10">No arpeggios found.</div>
        )}
        {filtered.map(entry =>
          entry.shapes.map(shape => (
            <ArpeggioCard
              key={`${entry.root}-${entry.quality}-${shape.caged}`}
              root={entry.root}
              quality={entry.quality}
              shape={shape}
              onPlay={play}
            />
          ))
        )}
      </div>
    </main>
  );
}
