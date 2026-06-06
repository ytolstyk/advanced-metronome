import { useReducer, useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import {
  loadChordProgression,
  saveChordProgression,
  CHORD_PROGRESSION_LS_KEY,
} from '@/api/chordProgressionApi';
import type { RootNote, ChordType } from '../data/chords';
import {
  CHORD_DATABASE,
  CHORD_TYPE_LABELS,
  CHORD_TYPES,
  ROOT_NOTES,
  chordName,
} from '../data/chords';
import { playGuitarChord, playPianoChord, playPadChord } from '../audio/chordSynths';
import type { ChordSlot, DetectedKey } from '../utils/chordTheory';
import {
  detectKey,
  toRomanNumeral,
  suggestScales,
  parseRomanNumeralInput,
} from '../utils/chordTheory';
import { useFavorites } from '../hooks/useFavorites';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import './ChordProgressionPage.css';

// ── Types ────────────────────────────────────────────────────────────────────

type InstrumentType = 'guitar' | 'piano' | 'pad';
type BeatsPerChord = 1 | 2 | 4;

interface ProgressionState {
  slots: (ChordSlot | null)[];
  bpm: number;
  beatsPerChord: BeatsPerChord;
  instrument: InstrumentType;
  isPlaying: boolean;
  currentSlotIndex: number;
  pickerOpenAt: number | null;
}

type ProgressionAction =
  | { type: 'SET_SLOT'; index: number; chord: ChordSlot | null }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_BEATS_PER_CHORD'; beats: BeatsPerChord }
  | { type: 'SET_INSTRUMENT'; instrument: InstrumentType }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CURRENT_SLOT'; index: number }
  | { type: 'OPEN_PICKER'; index: number }
  | { type: 'CLOSE_PICKER' }
  | { type: 'APPLY_SLOTS'; slots: (ChordSlot | null)[] };

const SLOT_COUNT = 8;
const LOOKAHEAD = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

const initialState: ProgressionState = {
  slots: new Array<ChordSlot | null>(SLOT_COUNT).fill(null),
  bpm: 120,
  beatsPerChord: 4,
  instrument: 'guitar',
  isPlaying: false,
  currentSlotIndex: -1,
  pickerOpenAt: null,
};

function loadSavedState(): ProgressionState {
  try {
    const raw = localStorage.getItem(CHORD_PROGRESSION_LS_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<ProgressionState>;
    return {
      ...initialState,
      slots: Array.isArray(saved.slots) ? saved.slots : initialState.slots,
      bpm: typeof saved.bpm === 'number' ? saved.bpm : initialState.bpm,
      beatsPerChord:
        saved.beatsPerChord === 1 || saved.beatsPerChord === 2 || saved.beatsPerChord === 4
          ? saved.beatsPerChord
          : initialState.beatsPerChord,
      instrument:
        saved.instrument === 'guitar' || saved.instrument === 'piano' || saved.instrument === 'pad'
          ? saved.instrument
          : initialState.instrument,
    };
  } catch {
    return initialState;
  }
}

function progressionReducer(state: ProgressionState, action: ProgressionAction): ProgressionState {
  switch (action.type) {
    case 'SET_SLOT': {
      const slots = [...state.slots];
      slots[action.index] = action.chord;
      return { ...state, slots };
    }
    case 'SET_BPM':
      return { ...state, bpm: action.bpm };
    case 'SET_BEATS_PER_CHORD':
      return { ...state, beatsPerChord: action.beats };
    case 'SET_INSTRUMENT':
      return { ...state, instrument: action.instrument };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying };
    case 'SET_CURRENT_SLOT':
      return { ...state, currentSlotIndex: action.index };
    case 'OPEN_PICKER':
      return { ...state, pickerOpenAt: action.index };
    case 'CLOSE_PICKER':
      return { ...state, pickerOpenAt: null };
    case 'APPLY_SLOTS':
      return { ...state, slots: action.slots };
    default:
      return state;
  }
}

// ── Audio helper ─────────────────────────────────────────────────────────────

function playChordInstrument(
  ctx: AudioContext,
  dest: AudioNode,
  root: RootNote,
  type: ChordType,
  time: number,
  instrument: InstrumentType,
) {
  if (instrument === 'guitar') playGuitarChord(ctx, dest, root, type, time);
  else if (instrument === 'piano') playPianoChord(ctx, dest, root, type, time);
  else playPadChord(ctx, dest, root, type, time);
}

// ── Toggle class constants ───────────────────────────────────────────────────

const TOGGLE_BASE =
  'h-auto px-2 py-1 text-[0.78rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ';

const FILTER_CLS = TOGGLE_BASE +
  'data-[state=on]:border-[#4fc3c3] data-[state=on]:bg-[#1a2a2a] data-[state=on]:text-[#4fc3c3]';

const FAV_CLS = TOGGLE_BASE +
  'data-[state=on]:border-[#ffca28] data-[state=on]:bg-[#252018] data-[state=on]:text-[#ffca28]';

const ACCENT_CLS = TOGGLE_BASE + 'px-3 ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#1a2050] data-[state=on]:text-[#8eaaff]';

// ── InlineChordPicker ────────────────────────────────────────────────────────

interface PickerProps {
  open: boolean;
  currentChord: ChordSlot | null;
  onConfirm: (chord: ChordSlot) => void;
  onClear: () => void;
  onClose: () => void;
  onPreview: (root: RootNote, type: ChordType) => void;
}

function InlineChordPicker({ open, currentChord, onConfirm, onClear, onClose, onPreview }: PickerProps) {
  const [rootFilter, setRootFilter] = useState<RootNote | 'all'>(currentChord?.root ?? 'all');
  const [typeFilter, setTypeFilter] = useState<ChordType | 'all'>(currentChord?.type ?? 'all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // State is reset by key prop on parent when slot changes
  const [selected, setSelected] = useState<ChordSlot | null>(currentChord ?? null);
  const { isFavorite } = useFavorites();

  const filtered = CHORD_DATABASE.filter(
    (e) =>
      (rootFilter === 'all' || e.root === rootFilter) &&
      (typeFilter === 'all' || e.type === typeFilter) &&
      (!favoritesOnly || isFavorite(e.root, e.type)),
  );

  const handleSelect = (root: RootNote, type: ChordType) => {
    setSelected({ root, type });
    onPreview(root, type);
  };

  const handleApply = () => {
    if (selected) onConfirm(selected);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="cp-picker-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="cp-picker-title">
            {currentChord ? 'Edit Chord' : 'Pick a Chord'}
          </DialogTitle>
        </DialogHeader>

        <div className="cp-picker-section">
          <ToggleGroup
            type="single"
            value={favoritesOnly ? 'fav' : ''}
            onValueChange={(v) => setFavoritesOnly(v === 'fav')}
            className="flex flex-wrap gap-1"
          >
            <ToggleGroupItem value="fav" className={FAV_CLS}>★ Favorites</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="cp-picker-section">
          <div className="cp-picker-label">Root</div>
          <ToggleGroup
            type="single"
            value={rootFilter}
            onValueChange={(v) => setRootFilter((v as RootNote | 'all') || 'all')}
            className="flex flex-wrap gap-1"
          >
            <ToggleGroupItem value="all" className={FILTER_CLS}>All</ToggleGroupItem>
            {ROOT_NOTES.map((r) => (
              <ToggleGroupItem key={r} value={r} className={FILTER_CLS}>{r}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="cp-picker-section">
          <div className="cp-picker-label">Type</div>
          <ToggleGroup
            type="single"
            value={typeFilter}
            onValueChange={(v) => setTypeFilter((v as ChordType | 'all') || 'all')}
            className="flex flex-wrap gap-1"
          >
            <ToggleGroupItem value="all" className={FILTER_CLS}>All</ToggleGroupItem>
            {CHORD_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t} className={FILTER_CLS}>
                {CHORD_TYPE_LABELS[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="cp-picker-grid">
          {filtered.map((entry) => {
            const isSel = selected?.root === entry.root && selected?.type === entry.type;
            return (
              <button
                key={`${entry.root}-${entry.type}`}
                className={cn('cp-picker-card', isSel && 'cp-picker-card--selected')}
                onClick={() => handleSelect(entry.root, entry.type)}
              >
                {chordName(entry.root, entry.type)}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="cp-picker-empty">No chords match filters</div>
          )}
        </div>

        <div className="cp-picker-footer">
          {currentChord && (
            <button className="cp-picker-btn cp-picker-btn--clear" onClick={onClear}>
              Clear
            </button>
          )}
          <button className="cp-picker-btn cp-picker-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="cp-picker-btn cp-picker-btn--apply"
            onClick={handleApply}
            disabled={!selected}
          >
            Apply
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ScaleSuggestions ─────────────────────────────────────────────────────────

function ScaleSuggestions({ slots }: { slots: (ChordSlot | null)[] }) {
  const [showAll, setShowAll] = useState(false);
  const suggestions = useMemo(() => suggestScales(slots), [slots]);
  const MAX = 15;
  const displayed = showAll ? suggestions : suggestions.slice(0, MAX);

  if (suggestions.length === 0) {
    return (
      <div className="cp-scales">
        <p className="cp-scales-title">Compatible Scales</p>
        <span className="cp-scales-empty">Add chords to see scale suggestions</span>
      </div>
    );
  }

  return (
    <div className="cp-scales">
      <p className="cp-scales-title">Compatible Scales ({suggestions.length})</p>
      <div className="cp-scales-list">
        {displayed.map((s) => (
          <span key={`${s.root}-${s.mode}`} className="cp-scale-chip">{s.label}</span>
        ))}
        {suggestions.length > MAX && (
          <button className="cp-scales-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'show less' : `+${suggestions.length - MAX} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── ChordSlotCard ────────────────────────────────────────────────────────────

interface SlotCardProps {
  index: number;
  chord: ChordSlot | null;
  romanNumeral: string;
  isActive: boolean;
  onEdit: (index: number) => void;
  onClear: (index: number) => void;
}

function ChordSlotCard({ index, chord, romanNumeral, isActive, onEdit, onClear }: SlotCardProps) {
  return (
    <div
      className={cn(
        'cp-slot-card',
        !chord && 'cp-slot-card--empty',
        chord && 'cp-slot-card--filled',
        chord && isActive && 'cp-slot-card--active',
      )}
      onClick={() => onEdit(index)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onEdit(index)}
    >
      <span className="cp-slot-num">{index + 1}</span>
      {chord ? (
        <>
          <span className="cp-slot-rn">{romanNumeral || ' '}</span>
          <span className="cp-slot-name">{chordName(chord.root, chord.type)}</span>
          <button
            className="cp-slot-clear"
            onClick={(e) => { e.stopPropagation(); onClear(index); }}
            aria-label="Remove chord"
          >
            ✕
          </button>
        </>
      ) : (
        <span className="cp-slot-plus">+</span>
      )}
    </div>
  );
}

// ── TheoryBar ────────────────────────────────────────────────────────────────

interface TheoryBarProps {
  detectedKey: DetectedKey | null;
  onApplyRomanInput: (value: string) => void;
}

function TheoryBar({ detectedKey, onApplyRomanInput }: TheoryBarProps) {
  const [inputValue, setInputValue] = useState('');
  const disabled = detectedKey === null;

  const handleApply = useCallback(() => {
    if (inputValue.trim()) onApplyRomanInput(inputValue);
  }, [inputValue, onApplyRomanInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleApply();
  };

  const keyLabel = detectedKey
    ? `${detectedKey.root} ${detectedKey.mode === 'major' ? 'Major' : 'Minor'}`
    : null;

  return (
    <div className="cp-theory-bar">
      <div className="cp-key-badge">
        <span className="cp-label">Detected Key</span>
        {keyLabel
          ? <span className="cp-key-value">{keyLabel}</span>
          : <span className="cp-key-empty">Add chords to detect</span>
        }
      </div>

      <div className="cp-rn-input-group">
        <span className="cp-label">Roman Numeral Input</span>
        <div className="cp-rn-input-row">
          <input
            className="cp-rn-input"
            type="text"
            placeholder={disabled ? 'Add chords to detect a key first' : 'e.g. I IV V I or ii V I vi'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
          <button
            className="cp-rn-apply-btn"
            onClick={handleApply}
            disabled={disabled || !inputValue.trim()}
          >
            Apply
          </button>
        </div>
        <span className="cp-rn-hint">
          Supports I–VII (uppercase=major, lowercase=minor), suffixes: 7, maj7, dim, sus2, sus4
        </span>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function ChordProgressionPage() {
  const [state, dispatch] = useReducer(progressionReducer, undefined, loadSavedState);
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio refs — never trigger re-renders
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextChordTimeRef = useRef(0);
  const nextSlotIndexRef = useRef(0);
  const filledSlotsRef = useRef<ChordSlot[]>([]);
  const slotsRef = useRef(state.slots);
  const bpmRef = useRef(state.bpm);
  const beatsPerChordRef = useRef(state.beatsPerChord);
  const instrumentRef = useRef(state.instrument);
  const isPlayingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { bpmRef.current = state.bpm; }, [state.bpm]);
  useEffect(() => { beatsPerChordRef.current = state.beatsPerChord; }, [state.beatsPerChord]);
  useEffect(() => { instrumentRef.current = state.instrument; }, [state.instrument]);
  useEffect(() => { slotsRef.current = state.slots; }, [state.slots]);

  // Update filledSlots ref and clamp index when slots change
  useEffect(() => {
    const filled = state.slots.filter((s): s is ChordSlot => s !== null);
    filledSlotsRef.current = filled;
    if (filled.length > 0) {
      nextSlotIndexRef.current = nextSlotIndexRef.current % filled.length;
    }
  }, [state.slots]);

  // Load from cloud when auth changes (overrides localStorage-initialized state)
  useEffect(() => {
    void loadChordProgression().then(loaded => {
      if (!loaded) return;
      dispatch({ type: 'APPLY_SLOTS', slots: loaded.slots as (import('../utils/chordTheory').ChordSlot | null)[] });
      dispatch({ type: 'SET_BPM', bpm: loaded.bpm });
      if (loaded.beatsPerChord === 1 || loaded.beatsPerChord === 2 || loaded.beatsPerChord === 4) {
        dispatch({ type: 'SET_BEATS_PER_CHORD', beats: loaded.beatsPerChord as BeatsPerChord });
      }
      if (loaded.instrument === 'guitar' || loaded.instrument === 'piano' || loaded.instrument === 'pad') {
        dispatch({ type: 'SET_INSTRUMENT', instrument: loaded.instrument as InstrumentType });
      }
    });
  }, [authStatus]);

  // Persist to localStorage + cloud (debounced)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveChordProgression({
        slots: state.slots,
        bpm: state.bpm,
        beatsPerChord: state.beatsPerChord,
        instrument: state.instrument,
      });
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.slots, state.bpm, state.beatsPerChord, state.instrument]);

  // Derived values
  const detectedKey = useMemo(() => detectKey(state.slots), [state.slots]);

  const romanNumerals = useMemo(
    () => state.slots.map((s) => (s && detectedKey ? toRomanNumeral(s.root, s.type, detectedKey) : '')),
    [state.slots, detectedKey],
  );

  // Audio context + master gain (always created together)
  const getAudio = useCallback((): { ctx: AudioContext; dest: GainNode } => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, dest: masterGainRef.current! };
  }, []);

  // Scheduler — all reads via refs, so no deps needed
  const scheduleNextChord = useCallback(() => {
    const ctx = audioCtxRef.current;
    const dest = masterGainRef.current;
    if (!ctx || !dest) return;
    const filled = filledSlotsRef.current;
    if (filled.length === 0) return;

    const chordDuration = (60 / bpmRef.current) * beatsPerChordRef.current;

    while (nextChordTimeRef.current < ctx.currentTime + LOOKAHEAD) {
      const slotIdx = nextSlotIndexRef.current;
      const slot = filled[slotIdx];
      const scheduledTime = nextChordTimeRef.current;
      const currentFilled = slotIdx;

      // Find the card index for highlighting — read from slotsRef to avoid stale closure
      let realIdx = -1;
      let count = 0;
      for (let i = 0; i < slotsRef.current.length; i++) {
        if (slotsRef.current[i] !== null) {
          if (count === currentFilled) { realIdx = i; break; }
          count++;
        }
      }

      playChordInstrument(ctx, dest, slot.root, slot.type, scheduledTime, instrumentRef.current);

      setTimeout(() => {
        if (isPlayingRef.current) {
          dispatch({ type: 'SET_CURRENT_SLOT', index: realIdx });
        }
      }, Math.max(0, (scheduledTime - ctx.currentTime) * 1000));

      nextChordTimeRef.current += chordDuration;
      nextSlotIndexRef.current = (slotIdx + 1) % filled.length;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (schedulerTimerRef.current !== null) {
      clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    isPlayingRef.current = false;
    dispatch({ type: 'SET_PLAYING', isPlaying: false });
    dispatch({ type: 'SET_CURRENT_SLOT', index: -1 });
  }, []);

  const handlePlayStop = useCallback(() => {
    if (state.isPlaying) {
      stopPlayback();
      return;
    }

    const filled = state.slots.filter((s): s is ChordSlot => s !== null);
    if (filled.length === 0) return;

    const { ctx } = getAudio();
    filledSlotsRef.current = filled;
    nextSlotIndexRef.current = 0;
    nextChordTimeRef.current = ctx.currentTime;
    isPlayingRef.current = true;

    dispatch({ type: 'SET_PLAYING', isPlaying: true });
    scheduleNextChord();
    schedulerTimerRef.current = setInterval(scheduleNextChord, SCHEDULER_INTERVAL_MS);
  }, [state.isPlaying, state.slots, getAudio, scheduleNextChord, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (schedulerTimerRef.current !== null) clearInterval(schedulerTimerRef.current);
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  // Chord preview in picker
  const handlePreview = useCallback((root: RootNote, type: ChordType) => {
    const { ctx, dest } = getAudio();
    playChordInstrument(ctx, dest, root, type, ctx.currentTime, instrumentRef.current);
  }, [getAudio]);

  // Slot edit handlers
  const handleOpenPicker = useCallback((index: number) => {
    dispatch({ type: 'OPEN_PICKER', index });
  }, []);

  const handleConfirm = useCallback((chord: ChordSlot) => {
    const idx = state.pickerOpenAt;
    if (idx === null) return;
    dispatch({ type: 'SET_SLOT', index: idx, chord });
    dispatch({ type: 'CLOSE_PICKER' });
  }, [state.pickerOpenAt]);

  const handleClearFromPicker = useCallback(() => {
    const idx = state.pickerOpenAt;
    if (idx === null) return;
    dispatch({ type: 'SET_SLOT', index: idx, chord: null });
    dispatch({ type: 'CLOSE_PICKER' });
  }, [state.pickerOpenAt]);

  const handleClearSlot = useCallback((index: number) => {
    if (state.isPlaying) stopPlayback();
    dispatch({ type: 'SET_SLOT', index, chord: null });
  }, [state.isPlaying, stopPlayback]);

  const handleApplyRomanInput = useCallback((value: string) => {
    if (!detectedKey) return;
    const newSlots = parseRomanNumeralInput(value, detectedKey);
    dispatch({ type: 'APPLY_SLOTS', slots: newSlots });
    if (state.isPlaying) stopPlayback();
  }, [detectedKey, state.isPlaying, stopPlayback]);

  const currentSlot = state.pickerOpenAt !== null ? state.slots[state.pickerOpenAt] : null;
  const hasSlots = state.slots.some(Boolean);

  return (
    <div className="cp-page">
      <div className="cp-inner">
        <h1 className="cp-title">Chord Progression Builder</h1>

        {/* Playback Controls */}
        <div className="cp-controls">
          <div className="cp-bpm-group">
            <span className="cp-label">BPM</span>
            <div className="cp-bpm-row">
              <span className="cp-bpm-val">{state.bpm}</span>
              <Slider
                min={40} max={300} step={1}
                value={[state.bpm]}
                onValueChange={([v]) => dispatch({ type: 'SET_BPM', bpm: v })}
                className="flex-1"
              />
            </div>
          </div>

          <div className="cp-control-group">
            <span className="cp-label">Beats / Chord</span>
            <ToggleGroup
              type="single"
              value={String(state.beatsPerChord)}
              onValueChange={(v) => {
                const n = Number(v);
                if (n === 1 || n === 2 || n === 4) dispatch({ type: 'SET_BEATS_PER_CHORD', beats: n as BeatsPerChord });
              }}
              className="flex gap-1"
            >
              {([1, 2, 4] as BeatsPerChord[]).map((n) => (
                <ToggleGroupItem key={n} value={String(n)} className={ACCENT_CLS}>{n}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="cp-control-group">
            <span className="cp-label">Instrument</span>
            <ToggleGroup
              type="single"
              value={state.instrument}
              onValueChange={(v) => {
                if (v === 'guitar' || v === 'piano' || v === 'pad')
                  dispatch({ type: 'SET_INSTRUMENT', instrument: v });
              }}
              className="flex gap-1"
            >
              <ToggleGroupItem value="guitar" className={ACCENT_CLS}>Guitar</ToggleGroupItem>
              <ToggleGroupItem value="piano" className={ACCENT_CLS}>Piano</ToggleGroupItem>
              <ToggleGroupItem value="pad" className={ACCENT_CLS}>Pad</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <button
            className={cn('cp-play-btn', state.isPlaying && 'cp-play-btn--playing')}
            onClick={handlePlayStop}
            disabled={!hasSlots}
            aria-label={state.isPlaying ? 'Stop' : 'Play'}
          >
            {state.isPlaying ? '■' : '▶'}
          </button>
        </div>

        {/* Slot Grid */}
        <div className="cp-slot-grid">
          {state.slots.map((chord, i) => (
            <ChordSlotCard
              key={i}
              index={i}
              chord={chord}
              romanNumeral={romanNumerals[i]}
              isActive={state.currentSlotIndex === i}
              onEdit={handleOpenPicker}
              onClear={handleClearSlot}
            />
          ))}
        </div>

        {/* Theory Bar */}
        <TheoryBar detectedKey={detectedKey} onApplyRomanInput={handleApplyRomanInput} />

        {/* Scale Suggestions */}
        <ScaleSuggestions slots={state.slots} />
      </div>

      {/* Chord Picker Dialog — key forces remount per slot so local state resets */}
      <InlineChordPicker
        key={state.pickerOpenAt}
        open={state.pickerOpenAt !== null}
        currentChord={currentSlot}
        onConfirm={handleConfirm}
        onClear={handleClearFromPicker}
        onClose={() => dispatch({ type: 'CLOSE_PICKER' })}
        onPreview={handlePreview}
      />
    </div>
  );
}
