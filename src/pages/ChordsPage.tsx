import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { RootNote, ChordType, ChordVoicing } from '../data/chords';
import type { Frets } from '../data/chords';
import { useFavorites } from '../hooks/useFavorites';
import {
  CHORD_TYPE_LABELS,
  CHORD_TYPES,
  ROOT_NOTES,
  chordName,
  GUITAR_TUNINGS,
  DEFAULT_TUNING_ID,
  getTuningById,
  getChordDatabase,
  computeVoicingDifficulty,
} from '../data/chords';
import { suggestScales, suggestProgressionsForChord } from '../utils/chordTheory';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pluckString } from '@/audio/pluckString';

// ── SVG constants ───────────────────────────────────────────────────────────
const SVG_H = 140;
const STRING_X_START = 14;
const STRING_SPACING = 14.4;
const FRET_Y_START = 18;
const FRET_SPACING = 21;
const FRETS_SHOWN = 5;
const NUT_Y = FRET_Y_START;

function dotY(fretNum: number, visibleStart: number): number {
  return FRET_Y_START + (fretNum - visibleStart) * FRET_SPACING + FRET_SPACING / 2;
}

function strumChord(ctx: AudioContext, frets: Frets, openMidi: number[]) {
  const now = ctx.currentTime;
  frets.forEach((fret, i) => {
    if (fret < 0) return;
    const freq = 440 * Math.pow(2, (openMidi[i] + fret - 69) / 12);
    pluckString(ctx, freq, now + i * 0.025, 0.22);
  });
}

// ── Shared ToggleGroupItem className ────────────────────────────────────────
const FILTER_ITEM_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]';

// ── FretboardDiagram ────────────────────────────────────────────────────────
function FretboardDiagram({
  voicing, stringNames, leftHanded,
}: {
  voicing: ChordVoicing;
  stringNames: string[];
  leftHanded?: boolean;
}) {
  const { frets, barre, startFret = 1 } = voicing;
  const visibleStart = startFret;
  const isOpenPosition = startFret <= 1;
  const numStrings = frets.length;
  const svgWidth = STRING_X_START + (numStrings - 1) * STRING_SPACING + 18 + STRING_X_START;

  const sx = (i: number) => leftHanded
    ? STRING_X_START + (numStrings - 1 - i) * STRING_SPACING
    : STRING_X_START + i * STRING_SPACING;

  const stringLines = frets.map((_, i) => (
    <line
      key={`s${i}`}
      x1={sx(i)} y1={FRET_Y_START}
      x2={sx(i)} y2={FRET_Y_START + FRET_SPACING * FRETS_SHOWN}
      stroke="#888" strokeWidth="1"
    />
  ));

  const fretLines = Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => {
    const y = FRET_Y_START + f * FRET_SPACING;
    const isNut = f === 0 && isOpenPosition;
    return (
      <line
        key={`f${f}`}
        x1={sx(0)} y1={y}
        x2={sx(numStrings - 1)} y2={y}
        stroke={isNut ? '#eee' : '#888'}
        strokeWidth={isNut ? 3 : 1}
      />
    );
  });

  const markers = frets.map((fret, i) => {
    if (fret === 0) {
      return (
        <text key={`m${i}`} x={sx(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#bbb">○</text>
      );
    }
    if (fret === -1) {
      return (
        <text key={`m${i}`} x={sx(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#999">×</text>
      );
    }
    return null;
  });

  const barreEl = barre ? (() => {
    const x1 = sx(barre.fromString - 1);
    const x2 = sx(barre.toString - 1);
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
    return <circle key={`d${i}`} cx={sx(i)} cy={dotY(fret, visibleStart)} r={5.5} fill="#5b7fff" />;
  });

  const fretLabel = !isOpenPosition ? (
    <text
      x={leftHanded ? 2 : svgWidth - 2}
      y={FRET_Y_START + FRET_SPACING / 2}
      textAnchor={leftHanded ? 'start' : 'end'}
      fontSize="14" fill="#bbb" dominantBaseline="middle"
    >
      {startFret}fr
    </text>
  ) : null;

  const STRING_LABEL_Y = FRET_Y_START + FRET_SPACING * FRETS_SHOWN + 12;
  const stringLabels = frets.map((_, i) => (
    <text key={`n${i}`} x={sx(i)} y={STRING_LABEL_Y}
      textAnchor="middle" fontSize="9" fill="#666">
      {stringNames[i]}
    </text>
  ));

  return (
    <svg viewBox={`0 0 ${svgWidth} ${SVG_H}`} className="w-full max-w-[180px]" aria-hidden="true">
      {stringLines}
      {fretLines}
      {markers}
      {barreEl}
      {dots}
      {fretLabel}
      {stringLabels}
    </svg>
  );
}

// ── TabView ─────────────────────────────────────────────────────────────────
function TabView({ voicing, stringNames }: { voicing: ChordVoicing; stringNames: string[] }) {
  const { frets } = voicing;
  return (
    <div className="font-mono text-[0.9rem] leading-relaxed bg-[#14141e] rounded-md px-2.5 py-2 w-full">
      {stringNames.map((_, i) => {
        const name = stringNames[stringNames.length - 1 - i]; // high→low
        const fret = frets[frets.length - 1 - i];
        const label = fret === -1 ? 'x' : String(fret);
        return (
          <div key={i} className="flex whitespace-pre">
            <span className="text-[#9898c8] font-bold">{name.padStart(2)}</span>
            <span className="text-[#c8d8ff]">{`|--${label.padEnd(2, '-')}|`}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── ChordCard ────────────────────────────────────────────────────────────────
function ChordCard({
  root, type, voicing, viewMode, stringNames, leftHanded, onPlay, onDetail,
}: {
  root: RootNote;
  type: ChordType;
  voicing: ChordVoicing;
  viewMode: 'fretboard' | 'tab';
  stringNames: string[];
  leftHanded: boolean;
  onPlay: (frets: Frets) => void;
  onDetail: () => void;
}) {
  const [lit, setLit] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(root, type);

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
        'relative bg-[#1e1f2c] border rounded-xl p-3.5 flex flex-col items-center gap-2.5',
        'cursor-pointer select-none transition-colors duration-150',
        lit
          ? 'border-[#5b7fff] bg-[#252850]'
          : 'border-[#505270] hover:border-[#7070a0] hover:bg-[#23243a]',
      ].join(' ')}
    >
      <button
        className={[
          'absolute top-1 right-1 leading-none p-1.5 transition-colors duration-150',
          fav ? 'text-[#ffca28]' : 'text-[#505270] hover:text-[#ffca28]',
        ].join(' ')}
        style={{ fontSize: '1.5rem' }}
        onClick={e => { e.stopPropagation(); toggleFavorite(root, type); }}
        aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
        tabIndex={0}
      >
        {fav ? '★' : '☆'}
      </button>
      <button
        className="absolute bottom-1 right-1.5 text-[#7070a0] hover:text-[#8eaaff] transition-colors duration-150 leading-none"
        style={{ fontSize: '1.1rem' }}
        onClick={e => { e.stopPropagation(); onDetail(); }}
        aria-label="View chord details"
        tabIndex={0}
      >
        ⓘ
      </button>
      <div className="text-[1.05rem] font-bold text-[#8eaaff] text-center">
        {chordName(root, type)}
      </div>
      {viewMode === 'fretboard'
        ? <FretboardDiagram voicing={voicing} stringNames={stringNames} leftHanded={leftHanded} />
        : <TabView voicing={voicing} stringNames={stringNames} />
      }
    </div>
  );
}

const FAV_FILTER_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#ffca28] hover:text-[#ffca28] ' +
  'data-[state=on]:border-[#ffca28] data-[state=on]:bg-[#252018] data-[state=on]:text-[#ffca28]';

// ── ChordDetailDialog ────────────────────────────────────────────────────────

const COMMON_SCALE_MODES = new Set([
  'major', 'minor', 'pentatonic_major', 'pentatonic_minor',
  'blues', 'harmonic_minor', 'melodic_minor',
]);

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner:     'bg-[#1a3a1a] text-[#4caf50] border-[#2a5a2a]',
  intermediate: 'bg-[#3a2e0a] text-[#ffc107] border-[#5a4a10]',
  advanced:     'bg-[#3a1010] text-[#ef5350] border-[#5a2020]',
};

function ChordDetailDialog({
  root, type, voicing, stringNames, leftHanded, open, onClose, onPlay,
}: {
  root: RootNote;
  type: ChordType;
  voicing: ChordVoicing;
  stringNames: string[];
  leftHanded: boolean;
  open: boolean;
  onClose: () => void;
  onPlay: (frets: Frets) => void;
}) {
  const difficulty = useMemo(() => computeVoicingDifficulty(voicing), [voicing]);

  const scales = useMemo(() => {
    const all = suggestScales([{ root, type }]);
    return {
      common: all.filter((s) => COMMON_SCALE_MODES.has(s.mode)).slice(0, 8),
      modes:  all.filter((s) => !COMMON_SCALE_MODES.has(s.mode)).slice(0, 8),
    };
  }, [root, type]);

  const progressions = useMemo(() => suggestProgressionsForChord(root, type), [root, type]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#1a1b2e] border-[#505270] text-[#ccd6ff] max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#8eaaff] text-xl">{chordName(root, type)}</DialogTitle>
          <DialogDescription className="sr-only">
            Chord details: diagram, difficulty, scales, and common progressions
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-1">
          {/* Diagram + play + difficulty */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-[160px]">
              <FretboardDiagram voicing={voicing} stringNames={stringNames} leftHanded={leftHanded} />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                className="px-3 py-1.5 text-[0.82rem] font-semibold rounded-md border border-[#5b7fff] bg-[#252850] text-[#8eaaff] hover:bg-[#2e3060] transition-colors"
                onClick={() => onPlay(voicing.frets)}
              >
                Play
              </button>
              <span className={[
                'px-2 py-0.5 text-[0.72rem] font-bold rounded border text-center',
                DIFFICULTY_STYLES[difficulty] ?? '',
              ].join(' ')}>
                {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </span>
            </div>
          </div>

          {/* Scale suggestions */}
          {(scales.common.length > 0 || scales.modes.length > 0) && (
            <div className="flex flex-col gap-2">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8]">Fits these scales</div>
              {scales.common.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {scales.common.map((s) => (
                    <span key={s.label} className="px-2 py-0.5 text-[0.75rem] rounded bg-[#1e1f2c] border border-[#505270] text-[#aab0d0]">
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
              {scales.modes.length > 0 && (
                <details>
                  <summary className="text-[0.75rem] text-[#7070a0] cursor-pointer hover:text-[#aaa] select-none">
                    + {scales.modes.length} modal scale{scales.modes.length > 1 ? 's' : ''}
                  </summary>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {scales.modes.map((s) => (
                      <span key={s.label} className="px-2 py-0.5 text-[0.75rem] rounded bg-[#1e1f2c] border border-[#505270] text-[#aab0d0]">
                        {s.label}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Progression suggestions */}
          {progressions.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8]">Common progressions</div>
              <div className="flex flex-col gap-2">
                {progressions.map((p, idx) => (
                  <div key={idx} className="flex flex-col gap-0.5">
                    <div className="text-[0.7rem] text-[#7070a0]">{p.name}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {p.chords.map((c, ci) => (
                        <span key={ci} className="px-2 py-0.5 text-[0.78rem] font-semibold rounded bg-[#1e1f2c] border border-[#505270] text-[#8eaaff]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ChordsPage ───────────────────────────────────────────────────────────────
export function ChordsPage() {
  const [selectedKey, setSelectedKey] = useState<RootNote | 'all'>(() => {
    const saved = localStorage.getItem('chords-selectedKey');
    return (saved as RootNote | 'all') || 'all';
  });
  const [selectedType, setSelectedType] = useState<ChordType | 'all'>(() => {
    const saved = localStorage.getItem('chords-selectedType');
    return (saved as ChordType | 'all') || 'all';
  });
  const [viewMode, setViewMode] = useState<'fretboard' | 'tab'>(() => {
    return localStorage.getItem('chords-viewMode') === 'tab' ? 'tab' : 'fretboard';
  });
  const [stringCount, setStringCount] = useState<6 | 7 | 8>(() => {
    const n = Number(localStorage.getItem('chords-stringCount'));
    return ([6, 7, 8] as const).includes(n as 6 | 7 | 8) ? (n as 6 | 7 | 8) : 6;
  });
  const [tuningId, setTuningId] = useState<string>(() =>
    localStorage.getItem('chords-tuningId') ?? DEFAULT_TUNING_ID
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [leftHanded, setLeftHanded] = useState(() =>
    localStorage.getItem('chords-leftHanded') === 'true'
  );
  const [detailChord, setDetailChord] = useState<{
    root: RootNote; type: ChordType; voicing: ChordVoicing;
  } | null>(null);
  const { isFavorite } = useFavorites();
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => { localStorage.setItem('chords-selectedKey', selectedKey); }, [selectedKey]);
  useEffect(() => { localStorage.setItem('chords-selectedType', selectedType); }, [selectedType]);
  useEffect(() => { localStorage.setItem('chords-viewMode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('chords-stringCount', String(stringCount)); }, [stringCount]);
  useEffect(() => { localStorage.setItem('chords-tuningId', tuningId); }, [tuningId]);
  useEffect(() => { localStorage.setItem('chords-leftHanded', String(leftHanded)); }, [leftHanded]);

  const activeTuning = useMemo(() => {
    const t = getTuningById(tuningId);
    if (t.stringCount === stringCount) return t;
    return GUITAR_TUNINGS.find(tu => tu.stringCount === stringCount) ?? GUITAR_TUNINGS[0];
  }, [stringCount, tuningId]);

  const activeChordDb = useMemo(() => getChordDatabase(activeTuning), [activeTuning]);

  function handleStringCountChange(count: 6 | 7 | 8) {
    setStringCount(count);
    const first = GUITAR_TUNINGS.find(t => t.stringCount === count);
    if (first) setTuningId(first.id);
  }

  const playChord = useCallback((frets: Frets) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    strumChord(ctx, frets, activeTuning.openMidi);
  }, [activeTuning]);

  const filtered = useMemo(() =>
    activeChordDb.filter(e =>
      (selectedKey === 'all' || e.root === selectedKey) &&
      (selectedType === 'all' || e.type === selectedType) &&
      (!showFavoritesOnly || isFavorite(e.root, e.type))
    ),
    [activeChordDb, selectedKey, selectedType, showFavoritesOnly, isFavorite]
  );

  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1100px] mx-auto" aria-label="Chord library">

      {/* Strings toggle */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">Strings</span>
        <ToggleGroup type="single" value={String(stringCount)}
          onValueChange={v => { if (v) handleStringCountChange(Number(v) as 6 | 7 | 8); }}
          className="flex flex-wrap justify-start gap-1">
          {([6, 7, 8] as const).map(n => (
            <ToggleGroupItem key={n} value={String(n)} className={FILTER_ITEM_CLS}>{n}-string</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Tuning selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8]">Tuning</span>
        <Select value={tuningId} onValueChange={setTuningId}>
          <SelectTrigger className="w-[220px] bg-[#1e1f2c] border-[#505270] text-[#aaa] text-[0.82rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1e1f2c] border-[#505270]">
            {GUITAR_TUNINGS.filter(t => t.stringCount === stringCount).map(t => (
              <SelectItem key={t.id} value={t.id} className="text-[0.82rem] text-[#aaa]">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Key filter */}
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

      {/* Type filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">Type</span>
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

      {/* Show options */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">Show</span>
        <ToggleGroup
          type="single"
          value={showFavoritesOnly ? 'favorites' : ''}
          onValueChange={v => setShowFavoritesOnly(v === 'favorites')}
          className="flex flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="favorites" className={FAV_FILTER_CLS}>★ Favorites</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          value={leftHanded ? 'lh' : ''}
          onValueChange={v => setLeftHanded(v === 'lh')}
          className="flex flex-wrap justify-start gap-1"
        >
          <ToggleGroupItem value="lh" className={FILTER_ITEM_CLS}>Left-handed</ToggleGroupItem>
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
          <div className="col-span-full text-center text-[#999] py-10">
            {showFavoritesOnly
              ? 'No favorites yet. Click ☆ on any chord to save it.'
              : 'No chords found.'}
          </div>
        )}
        {filtered.map(entry => (
          <ChordCard
            key={`${entry.root}-${entry.type}`}
            root={entry.root}
            type={entry.type}
            voicing={entry.voicings[0]}
            viewMode={viewMode}
            stringNames={activeTuning.stringNames}
            leftHanded={leftHanded}
            onPlay={playChord}
            onDetail={() => setDetailChord({ root: entry.root, type: entry.type, voicing: entry.voicings[0] })}
          />
        ))}
      </div>

      {detailChord && (
        <ChordDetailDialog
          root={detailChord.root}
          type={detailChord.type}
          voicing={detailChord.voicing}
          stringNames={activeTuning.stringNames}
          leftHanded={leftHanded}
          open={!!detailChord}
          onClose={() => setDetailChord(null)}
          onPlay={playChord}
        />
      )}
    </main>
  );
}
