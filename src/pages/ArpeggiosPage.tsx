import { useState, useMemo, useRef, useCallback, useEffect, memo } from 'react';
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
import { FretboardDiagram } from '../components/FretboardDiagram/FretboardDiagram';
import { useFlashHighlight } from '../hooks/useFlashHighlight';
import { cn } from '@/lib/utils';

// ── ArpeggioCard ─────────────────────────────────────────────────────────────
const CAGED_LABEL: Record<CagedShape, string> = {
  C: 'C shape', A: 'A shape', G: 'G shape', E: 'E shape', D: 'D shape',
};

const ArpeggioCard = memo(function ArpeggioCard({
  root, quality, shape, onPlay,
}: {
  root: RootNote;
  quality: ArpeggioQuality;
  shape: ArpeggioShape;
  onPlay: (frets: number[]) => void;
}) {
  const [lit, triggerLit] = useFlashHighlight();

  function handleClick() {
    onPlay(shape.frets);
    triggerLit();
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
      <FretboardDiagram voicing={shape} color="#7c3aed" />
    </div>
  );
});

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
