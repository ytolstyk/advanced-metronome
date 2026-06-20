import { useReducer, useMemo, useRef, useEffect, useCallback, useState, forwardRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  getTuningById,
  DEFAULT_TUNING_ID,
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { exportChordProgression } from '../audio/exportChordProgression';
import { chordProgressionToTabTrack } from '../utils/chordProgressionToTab';
import { saveTabTrack } from '../tabEditorState';
import { FretboardDiagram } from '../components/FretboardDiagram/FretboardDiagram';
import { suggestChordProgressions, SUGGESTION_COUNT } from '../api/aiApi';
import type { SuggestedProgression } from '../api/aiApi';
import { loadFromStorage, saveToStorage } from '../api/storageUtils';
import './ChordProgressionPage.css';

// O(1) chord lookup used by the fretboard preview — avoids an O(n) scan on every render
const CHORD_DATABASE_INDEX = new Map(CHORD_DATABASE.map((e) => [`${e.root}|${e.type}`, e]));

// ── Types ────────────────────────────────────────────────────────────────────

type InstrumentType = 'guitar' | 'piano' | 'pad';

interface ProgressionSlot extends ChordSlot {
  beats: number;
}

interface ProgressionState {
  slots: (ProgressionSlot | null)[];
  bpm: number;
  instrument: InstrumentType;
  isPlaying: boolean;
  currentSlotIndex: number;
  activeSlotIndex: number | null;
  selectedKey: DetectedKey | null;
}

type ProgressionAction =
  | { type: 'SET_SLOT'; index: number; chord: ProgressionSlot | null }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_INSTRUMENT'; instrument: InstrumentType }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CURRENT_SLOT'; index: number }
  | { type: 'SET_ACTIVE_SLOT'; index: number | null }
  | { type: 'SET_SLOT_BEATS'; index: number; beats: number }
  | { type: 'SET_SELECTED_KEY'; key: DetectedKey | null }
  | { type: 'APPLY_SLOTS'; slots: (ProgressionSlot | null)[] }
  | { type: 'REORDER_SLOTS'; from: number; to: number }
  | { type: 'ASSIGN_CHORD_TO_ACTIVE_SLOT'; root: RootNote; chordType: ChordType }
  | { type: 'CLEAR_ALL' };

const SLOT_COUNT = 8;
const LOOKAHEAD = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
// Short gain ramp between chords prevents click/pop while sounding instantaneous
const CHORD_FADE = 0.015;
const STANDARD_TUNING_STRING_NAMES = getTuningById(DEFAULT_TUNING_ID).stringNames;

const initialState: ProgressionState = {
  slots: new Array<ProgressionSlot | null>(SLOT_COUNT).fill(null),
  bpm: 120,
  instrument: 'guitar',
  isPlaying: false,
  currentSlotIndex: -1,
  activeSlotIndex: null,
  selectedKey: null,
};

function parseSavedSlots(rawSlots: unknown[], fallbackBeats: number): (ProgressionSlot | null)[] {
  const slots: (ProgressionSlot | null)[] = rawSlots.map((s) => {
    if (!s || typeof s !== 'object') return null;
    const slot = s as Record<string, unknown>;
    if (typeof slot.root !== 'string' || typeof slot.type !== 'string') return null;
    return {
      root: slot.root as RootNote,
      type: slot.type as ChordType,
      beats: typeof slot.beats === 'number' ? Math.max(1, slot.beats) : fallbackBeats,
    };
  });
  while (slots.length < SLOT_COUNT) slots.push(null);
  return slots.slice(0, SLOT_COUNT);
}

function loadSavedState(): ProgressionState {
  try {
    const raw = localStorage.getItem(CHORD_PROGRESSION_LS_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Record<string, unknown>;

    const oldBeats = typeof saved.beatsPerChord === 'number' ? saved.beatsPerChord : 4;
    const slots = parseSavedSlots(Array.isArray(saved.slots) ? saved.slots : [], oldBeats);

    let selectedKey: DetectedKey | null = null;
    if (saved.selectedKey && typeof saved.selectedKey === 'object') {
      const k = saved.selectedKey as Record<string, unknown>;
      if (typeof k.root === 'string' && (k.mode === 'major' || k.mode === 'minor')) {
        selectedKey = { root: k.root as RootNote, mode: k.mode };
      }
    }

    return {
      ...initialState,
      slots,
      bpm: typeof saved.bpm === 'number' ? saved.bpm : initialState.bpm,
      instrument:
        saved.instrument === 'guitar' || saved.instrument === 'piano' || saved.instrument === 'pad'
          ? (saved.instrument as InstrumentType)
          : initialState.instrument,
      selectedKey,
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
    case 'SET_INSTRUMENT':
      return { ...state, instrument: action.instrument };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying };
    case 'SET_CURRENT_SLOT':
      return { ...state, currentSlotIndex: action.index };
    case 'SET_ACTIVE_SLOT':
      return { ...state, activeSlotIndex: action.index };
    case 'SET_SLOT_BEATS': {
      const slots = [...state.slots];
      const slot = slots[action.index];
      if (slot) slots[action.index] = { ...slot, beats: Math.max(1, action.beats) };
      return { ...state, slots };
    }
    case 'SET_SELECTED_KEY':
      return { ...state, selectedKey: action.key };
    case 'APPLY_SLOTS':
      return { ...state, slots: action.slots };
    case 'REORDER_SLOTS': {
      const slots = [...state.slots];
      const [item] = slots.splice(action.from, 1);
      slots.splice(action.to, 0, item);
      return { ...state, slots };
    }
    case 'ASSIGN_CHORD_TO_ACTIVE_SLOT': {
      if (state.activeSlotIndex === null) return state;
      const slots = [...state.slots];
      const beats = slots[state.activeSlotIndex]?.beats ?? 4;
      slots[state.activeSlotIndex] = { root: action.root, type: action.chordType, beats };
      const nextEmpty = findNextEmptySlot(slots, state.activeSlotIndex);
      return { ...state, slots, activeSlotIndex: nextEmpty };
    }
    case 'CLEAR_ALL':
      return {
        ...state,
        slots: new Array<ProgressionSlot | null>(SLOT_COUNT).fill(null),
        activeSlotIndex: 0,
        currentSlotIndex: -1,
      };
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

function findNextEmptySlot(slots: (ProgressionSlot | null)[], afterIndex: number): number | null {
  for (let i = 1; i < slots.length; i++) {
    const idx = (afterIndex + i) % slots.length;
    if (slots[idx] === null) return idx;
  }
  return null;
}

// What the fretboard preview panel shows when not playing: either a live index into
// `slots` (hover/click — follows edits to that slot) or a frozen chord snapshot (the
// last chord that actually sounded, captured right before playback stopped).
export type PreviewSource =
  | { kind: 'viewedSlot'; index: number }
  | { kind: 'lastPlayed'; chord: ProgressionSlot }
  | null;

// eslint-disable-next-line react-refresh/only-export-components
export function resolveDisplayedSlot(
  isPlaying: boolean,
  currentSlotIndex: number,
  slots: (ProgressionSlot | null)[],
  previewSource: PreviewSource,
): ProgressionSlot | null {
  if (isPlaying) return currentSlotIndex >= 0 ? slots[currentSlotIndex] : null;
  if (previewSource?.kind === 'viewedSlot') return slots[previewSource.index] ?? null;
  if (previewSource?.kind === 'lastPlayed') return previewSource.chord;
  return null;
}

// ── Toggle class constants ───────────────────────────────────────────────────

const TOGGLE_BASE =
  'h-auto px-2 py-1 text-[0.78rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ';

const FILTER_CLS =
  TOGGLE_BASE +
  'data-[state=on]:border-[#4fc3c3] data-[state=on]:bg-[#1a2a2a] data-[state=on]:text-[#4fc3c3]';

const FAV_CLS =
  TOGGLE_BASE +
  'data-[state=on]:border-[#ffca28] data-[state=on]:bg-[#252018] data-[state=on]:text-[#ffca28]';

const ACCENT_CLS =
  TOGGLE_BASE +
  'px-3 data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#1a2050] data-[state=on]:text-[#8eaaff]';

// ── ChordBankPanel ───────────────────────────────────────────────────────────

interface BankPanelProps {
  activeSlotIndex: number | null;
  onChordClick: (root: RootNote, type: ChordType) => void;
}

function ChordBankPanel({ activeSlotIndex, onChordClick }: BankPanelProps) {
  const [rootFilter, setRootFilter] = useState<RootNote | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ChordType | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isFavorite } = useFavorites();

  const filtered = useMemo(
    () =>
      CHORD_DATABASE.filter(
        (e) =>
          (rootFilter === 'all' || e.root === rootFilter) &&
          (typeFilter === 'all' || e.type === typeFilter) &&
          (!favoritesOnly || isFavorite(e.root, e.type)),
      ),
    [rootFilter, typeFilter, favoritesOnly, isFavorite],
  );

  return (
    <div className="cp-bank">
      <div className="cp-bank-header">
        <span className="cp-label">Chord Bank</span>
        {activeSlotIndex !== null && (
          <span className="cp-bank-hint">→ click a chord to fill slot {activeSlotIndex + 1}</span>
        )}
        <button
          className="cp-bank-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand chord bank' : 'Collapse chord bank'}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="cp-bank-filters">
            <ToggleGroup
              type="single"
              value={favoritesOnly ? 'fav' : ''}
              onValueChange={(v) => setFavoritesOnly(v === 'fav')}
              className="flex flex-wrap gap-1"
            >
              <ToggleGroupItem value="fav" className={FAV_CLS}>
                ★ Fav
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={rootFilter}
              onValueChange={(v) => setRootFilter((v as RootNote | 'all') || 'all')}
              className="flex flex-wrap gap-1"
            >
              <ToggleGroupItem value="all" className={FILTER_CLS}>
                All
              </ToggleGroupItem>
              {ROOT_NOTES.map((r) => (
                <ToggleGroupItem key={r} value={r} className={FILTER_CLS}>
                  {r}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={typeFilter}
              onValueChange={(v) => setTypeFilter((v as ChordType | 'all') || 'all')}
              className="flex flex-wrap gap-1"
            >
              <ToggleGroupItem value="all" className={FILTER_CLS}>
                All
              </ToggleGroupItem>
              {CHORD_TYPES.map((t) => (
                <ToggleGroupItem key={t} value={t} className={FILTER_CLS}>
                  {CHORD_TYPE_LABELS[t]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="cp-bank-grid">
            {filtered.map((entry) => (
              <button
                key={`${entry.root}-${entry.type}`}
                className={cn(
                  'cp-bank-chord',
                  activeSlotIndex !== null && 'cp-bank-chord--assignable',
                )}
                onClick={() => onChordClick(entry.root, entry.type)}
              >
                {chordName(entry.root, entry.type)}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="cp-bank-empty">No chords match</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── ScaleSuggestions ─────────────────────────────────────────────────────────

function ScaleSuggestions({ slots }: { slots: (ProgressionSlot | null)[] }) {
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
          <span key={`${s.root}-${s.mode}`} className="cp-scale-chip">
            {s.label}
          </span>
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
  chord: ProgressionSlot | null;
  romanNumeral: string;
  isPlaying: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  onSelect: (index: number) => void;
  onClear: (index: number) => void;
  onBeatsChange: (index: number, beats: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onHoverChord: (index: number) => void;
}

const ChordSlotCard = memo(forwardRef<HTMLDivElement, SlotCardProps>(function ChordSlotCard({
  index,
  chord,
  romanNumeral,
  isPlaying,
  isSelected,
  isDragOver,
  onSelect,
  onClear,
  onBeatsChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHoverChord,
}, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'cp-slot-card',
        !chord && 'cp-slot-card--empty',
        chord && 'cp-slot-card--filled',
        chord && isPlaying && 'cp-slot-card--active',
        isSelected && 'cp-slot-card--selected',
        isDragOver && 'cp-slot-card--drag-over',
      )}
      onClick={() => onSelect(index)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(index)}
      onMouseEnter={() => { if (chord) onHoverChord(index); }}
      onFocus={() => { if (chord) onHoverChord(index); }}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="cp-slot-num">{index + 1}</span>
      {chord ? (
        <>
          <span className="cp-slot-rn">{romanNumeral || ' '}</span>
          <span className="cp-slot-name">{chordName(chord.root, chord.type)}</span>
          <div className="cp-slot-beats" onClick={(e) => e.stopPropagation()}>
            <button
              className="cp-slot-beats-btn"
              onClick={() => onBeatsChange(index, chord.beats - 1)}
              disabled={chord.beats <= 1}
              aria-label="Decrease beats"
            >
              −
            </button>
            <span className="cp-slot-beats-num">{chord.beats}b</span>
            <button
              className="cp-slot-beats-btn"
              onClick={() => onBeatsChange(index, chord.beats + 1)}
              aria-label="Increase beats"
            >
              +
            </button>
          </div>
          <button
            className="cp-slot-clear"
            onClick={(e) => {
              e.stopPropagation();
              onClear(index);
            }}
            aria-label="Remove chord"
          >
            ✕
          </button>
        </>
      ) : (
        <span className="cp-slot-plus">{isSelected ? '…' : '+'}</span>
      )}
    </div>
  );
}));

// ── TheoryBar ────────────────────────────────────────────────────────────────

interface TheoryBarProps {
  selectedKey: DetectedKey | null;
  onSetKey: (key: DetectedKey | null) => void;
  onDetectKey: () => void;
  onApplyRomanInput: (value: string, overwriteAll: boolean) => void;
  hasSlots: boolean;
  onClearAllClick: () => void;
}

function TheoryBar({
  selectedKey, onSetKey, onDetectKey, onApplyRomanInput, hasSlots, onClearAllClick,
}: TheoryBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [overwriteAll, setOverwriteAll] = useState(false);

  const handleApply = useCallback(() => {
    if (inputValue.trim()) onApplyRomanInput(inputValue, overwriteAll);
  }, [inputValue, overwriteAll, onApplyRomanInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleApply();
  };

  const keyLabel = selectedKey
    ? `${selectedKey.root} ${selectedKey.mode === 'major' ? 'Major' : 'Minor'}`
    : null;

  return (
    <div className="cp-theory-bar">
      <div className="cp-key-selector">
        <div className="cp-key-selector-header">
          <span className="cp-label">Key</span>
          <Button
            variant="destructive"
            size="sm"
            className="h-auto px-2 py-0.5 text-[0.72rem]"
            onClick={onClearAllClick}
            disabled={!hasSlots}
          >
            Clear All
          </Button>
        </div>
        <div className="cp-key-row">
          <select
            className="cp-key-root-select"
            value={selectedKey?.root ?? ''}
            onChange={(e) => {
              const root = e.target.value as RootNote;
              if (!root) { onSetKey(null); return; }
              onSetKey({ root, mode: selectedKey?.mode ?? 'major' });
            }}
          >
            <option value="">—</option>
            {ROOT_NOTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ToggleGroup
            type="single"
            value={selectedKey?.mode ?? ''}
            onValueChange={(v) => {
              if ((v === 'major' || v === 'minor') && selectedKey) {
                onSetKey({ ...selectedKey, mode: v });
              }
            }}
            className="flex gap-1"
          >
            <ToggleGroupItem value="major" className={ACCENT_CLS} disabled={!selectedKey}>
              Maj
            </ToggleGroupItem>
            <ToggleGroupItem value="minor" className={ACCENT_CLS} disabled={!selectedKey}>
              Min
            </ToggleGroupItem>
          </ToggleGroup>
          <button className="cp-key-detect-btn" onClick={onDetectKey} title="Detect key from chords">
            Detect
          </button>
          {keyLabel && <span className="cp-key-label">{keyLabel}</span>}
          {selectedKey && (
            <button className="cp-key-clear-btn" onClick={() => onSetKey(null)} aria-label="Clear key">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="cp-rn-input-group">
        <span className="cp-label">Roman Numeral Input</span>
        <div className="cp-rn-input-row">
          <input
            className="cp-rn-input"
            type="text"
            placeholder={!selectedKey ? 'Set a key first' : 'e.g. I IV V I or ii V I vi'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!selectedKey}
          />
          <button
            className="cp-rn-apply-btn"
            onClick={handleApply}
            disabled={!selectedKey || !inputValue.trim()}
          >
            Apply
          </button>
        </div>
        <div className="cp-rn-options">
          <label className="cp-rn-overwrite-label">
            <input
              type="checkbox"
              checked={overwriteAll}
              onChange={(e) => setOverwriteAll(e.target.checked)}
            />
            <span>Overwrite all slots</span>
          </label>
          <span className="cp-rn-hint">
            I–VII (maj) / i–vii (min); suffixes: 7, maj7, dim, sus2, sus4
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AI Suggestion Dialog ─────────────────────────────────────────────────────

const SUGGEST_CACHE_KEY = 'cp-ai-suggestion-cache';
const SUGGEST_CACHE_MAX = 5;
const SUGGEST_DESC_MAX_LEN = 200;

interface SuggestionCacheEntry {
  prompt: string;
  progressions: SuggestedProgression[];
  generatedAt: number;
}

function validateCacheEntry(raw: unknown): SuggestionCacheEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.prompt !== 'string' || typeof e.generatedAt !== 'number' || !Array.isArray(e.progressions)) return null;
  const progressions = (e.progressions as unknown[]).map((p): SuggestedProgression | null => {
    if (!p || typeof p !== 'object') return null;
    const prog = p as Record<string, unknown>;
    if (!Array.isArray(prog.chords) || typeof prog.description !== 'string') return null;
    const chords = (prog.chords as unknown[]).map((c): ChordSlot | null => {
      if (!c || typeof c !== 'object') return null;
      const chord = c as Record<string, unknown>;
      const root = typeof chord.root === 'string' ? ROOT_NOTES.find((r) => r === chord.root) : undefined;
      const type = typeof chord.type === 'string' ? CHORD_TYPES.find((t) => t === chord.type) : undefined;
      if (!root || !type) return null;
      return { root, type };
    }).filter((c): c is ChordSlot => c !== null);
    if (chords.length === 0) return null;
    return { chords, description: String(prog.description).slice(0, SUGGEST_DESC_MAX_LEN) };
  }).filter((p): p is SuggestedProgression => p !== null);
  if (progressions.length === 0) return null;
  return { prompt: String(e.prompt).slice(0, 500), progressions, generatedAt: e.generatedAt };
}

interface SuggestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (chords: ChordSlot[]) => void;
}

function SuggestProgressionDialog({ open, onOpenChange, onApply }: SuggestDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressions, setProgressions] = useState<SuggestedProgression[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [cache, setCache] = useState<SuggestionCacheEntry[]>([]);

  useEffect(() => {
    if (open) {
      const raw = loadFromStorage<unknown[]>(SUGGEST_CACHE_KEY, []);
      setCache(raw.map(validateCacheEntry).filter((e): e is SuggestionCacheEntry => e !== null));
    }
  }, [open]);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    // Serve from cache if available — no network call needed
    const hit = cache.find((e) => e.prompt === trimmed);
    if (hit) {
      setProgressions(hit.progressions);
      setSelectedIdx(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setProgressions(null);
    try {
      const results = await suggestChordProgressions(trimmed);
      setProgressions(results);
      setSelectedIdx(0);
      const entry: SuggestionCacheEntry = { prompt: trimmed, progressions: results, generatedAt: Date.now() };
      setCache((prev) => {
        const updated = [entry, ...prev.filter((e) => e.prompt !== trimmed)].slice(0, SUGGEST_CACHE_MAX);
        saveToStorage(SUGGEST_CACHE_KEY, updated);
        return updated;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Only show messages from our own code; Gemini client errors may contain internal metadata
      const safeMsg = msg.startsWith('Prompt must be') || msg === 'AI suggestions are unavailable.'
        ? msg
        : 'AI suggestions are unavailable. Please try again.';
      setError(safeMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!progressions) return;
    onApply(progressions[selectedIdx].chords);
    onOpenChange(false);
  };

  const loadCacheEntry = (entry: SuggestionCacheEntry) => {
    setPrompt(entry.prompt);
    setProgressions(entry.progressions);
    setSelectedIdx(0);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#1a1b2e] border-[#505270] text-[#ccd6ff] max-w-lg"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#8eaaff]">Suggest a Progression</DialogTitle>
          <DialogDescription className="text-[#aab0d0]">
            Describe a mood, genre, or starting point and get {SUGGESTION_COUNT} progression ideas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              className="cp-rn-input flex-1"
              placeholder="e.g. dark jazz, uplifting pop, Radiohead-style"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void handleGenerate(); }}
              disabled={loading}
              autoFocus
            />
            <button
              className="cp-rn-apply-btn"
              onClick={() => void handleGenerate()}
              disabled={loading || !prompt.trim()}
            >
              {loading ? '…' : 'Generate'}
            </button>
          </div>

          {!progressions && cache.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="cp-label">Recent</span>
              <div className="flex flex-wrap gap-2">
                {cache.map((entry) => (
                  <button
                    key={entry.generatedAt}
                    className="cp-ai-cache-chip"
                    onClick={() => loadCacheEntry(entry)}
                  >
                    {entry.prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-[#ff8080] text-sm bg-[#2a1a1a] border border-[#5a2020] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: SUGGESTION_COUNT }, (_, i) => (
                <div key={i} className="cp-ai-card cp-ai-card--skeleton" />
              ))}
            </div>
          )}

          {progressions && (
            <div className="flex flex-col gap-2">
              {progressions.map((prog, progIdx) => (
                <button
                  key={prog.description}
                  className={cn('cp-ai-card', selectedIdx === progIdx && 'cp-ai-card--selected')}
                  onClick={() => setSelectedIdx(progIdx)}
                >
                  <div className="cp-ai-card-chords">
                    {prog.chords.map((c, chordIdx) => (
                      <span key={`${c.root}-${c.type}-${chordIdx}`} className="cp-ai-chord-chip">
                        {chordName(c.root, c.type)}
                      </span>
                    ))}
                  </div>
                  <div className="cp-ai-card-desc">{prog.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[#505270] text-[#aab0d0] hover:bg-[#252540] hover:text-[#ccd6ff]"
          >
            Cancel
          </Button>
          {progressions && (
            <Button
              onClick={handleApply}
              className="bg-[#5b7fff] hover:bg-[#7090ff] text-white border-0"
            >
              Use this
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function ChordProgressionPage() {
  const [state, dispatch] = useReducer(progressionReducer, undefined, loadSavedState);
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const navigate = useNavigate();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeChordGainRef = useRef<GainNode | null>(null);
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextChordTimeRef = useRef(0);
  const nextSlotIndexRef = useRef(0);
  const filledSlotsRef = useRef<ProgressionSlot[]>([]);
  // Pre-computed mapping from filled-slot position → real slot index; avoids O(n) scan in scheduler
  const filledSlotRealIndexRef = useRef<number[]>([]);
  // Tracks pending SET_CURRENT_SLOT timeouts so they can be cancelled on stop
  const pendingTimerIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const slotsRef = useRef(state.slots);
  const bpmRef = useRef(state.bpm);
  const instrumentRef = useRef(state.instrument);
  const isPlayingRef = useRef(false);
  const lastPlayedChordRef = useRef<ProgressionSlot | null>(null);

  // Drag-drop refs
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Fretboard preview tracking
  const [previewSource, setPreviewSource] = useState<PreviewSource>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const firstSlotRef = useRef<HTMLDivElement>(null);

  // Sync refs with state so callbacks stay stable (empty dep arrays)
  const activeSlotIndexRef = useRef(state.activeSlotIndex);
  useEffect(() => { bpmRef.current = state.bpm; }, [state.bpm]);
  useEffect(() => { instrumentRef.current = state.instrument; }, [state.instrument]);
  useEffect(() => { slotsRef.current = state.slots; }, [state.slots]);
  useEffect(() => { activeSlotIndexRef.current = state.activeSlotIndex; }, [state.activeSlotIndex]);

  useEffect(() => {
    const filled: ProgressionSlot[] = [];
    const realIndices: number[] = [];
    state.slots.forEach((s, i) => { if (s !== null) { filled.push(s); realIndices.push(i); } });
    filledSlotsRef.current = filled;
    filledSlotRealIndexRef.current = realIndices;
    if (filled.length > 0) {
      nextSlotIndexRef.current = nextSlotIndexRef.current % filled.length;
    }
  }, [state.slots]);

  const stopPlayback = useCallback(() => {
    if (schedulerTimerRef.current !== null) {
      clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    // Cancel all pending SET_CURRENT_SLOT timers to prevent stale dispatches after stop
    pendingTimerIdsRef.current.forEach(clearTimeout);
    pendingTimerIdsRef.current.clear();
    isPlayingRef.current = false;
    activeChordGainRef.current = null;
    // Close the context to kill all oscillators immediately (piano/pad can sustain 4–6s)
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    masterGainRef.current = null;
    if (lastPlayedChordRef.current) {
      setPreviewSource({ kind: 'lastPlayed', chord: lastPlayedChordRef.current });
    }
    dispatch({ type: 'SET_PLAYING', isPlaying: false });
    dispatch({ type: 'SET_CURRENT_SLOT', index: -1 });
  }, []);

  // Load from cloud on auth change
  useEffect(() => {
    void loadChordProgression().then((loaded) => {
      if (!loaded) return;
      stopPlayback();
      const raw = loaded as unknown as Record<string, unknown>;
      const fallbackBeats = typeof raw.beatsPerChord === 'number' ? raw.beatsPerChord : 4;
      const slots = parseSavedSlots(Array.isArray(loaded.slots) ? loaded.slots : [], fallbackBeats);
      dispatch({ type: 'APPLY_SLOTS', slots });
      dispatch({ type: 'SET_BPM', bpm: loaded.bpm });
      if (loaded.instrument === 'guitar' || loaded.instrument === 'piano' || loaded.instrument === 'pad') {
        dispatch({ type: 'SET_INSTRUMENT', instrument: loaded.instrument as InstrumentType });
      }
      if (loaded.selectedKey && typeof loaded.selectedKey === 'object') {
        const k = loaded.selectedKey as Record<string, unknown>;
        if (typeof k.root === 'string' && (k.mode === 'major' || k.mode === 'minor')) {
          dispatch({ type: 'SET_SELECTED_KEY', key: { root: k.root as RootNote, mode: k.mode } });
        }
      }
    });
  }, [authStatus, stopPlayback]);

  // Persist (debounced)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveChordProgression({
        slots: state.slots,
        bpm: state.bpm,
        instrument: state.instrument,
        selectedKey: state.selectedKey,
      });
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.slots, state.bpm, state.instrument, state.selectedKey]);

  // Roman numerals — relative to selectedKey if set, otherwise auto-detect
  const displayKey = useMemo(
    () => state.selectedKey ?? detectKey(state.slots),
    [state.selectedKey, state.slots],
  );

  const romanNumerals = useMemo(
    () => state.slots.map((s) => (s && displayKey ? toRomanNumeral(s.root, s.type, displayKey) : '')),
    [state.slots, displayKey],
  );

  // Audio context + master gain
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

  // Scheduler — reads via refs so no stale closures
  const scheduleNextChord = useCallback(() => {
    const ctx = audioCtxRef.current;
    const dest = masterGainRef.current;
    if (!ctx || !dest) return;
    const filled = filledSlotsRef.current;
    if (filled.length === 0) return;

    while (nextChordTimeRef.current < ctx.currentTime + LOOKAHEAD) {
      const slotIdx = nextSlotIndexRef.current;
      const slot = filled[slotIdx];
      const scheduledTime = nextChordTimeRef.current;
      const chordDuration = (60 / bpmRef.current) * slot.beats;

      const realIdx = filledSlotRealIndexRef.current[slotIdx] ?? -1;

      // Fade out the previous chord's gain bus and disconnect it so it can be GC'd
      if (activeChordGainRef.current) {
        const prev = activeChordGainRef.current;
        prev.gain.setValueAtTime(1, scheduledTime);
        prev.gain.linearRampToValueAtTime(0, scheduledTime + CHORD_FADE);
        const disconnectMs = Math.max(0, (scheduledTime + CHORD_FADE + 0.05 - ctx.currentTime) * 1000);
        setTimeout(() => { try { prev.disconnect(); } catch { /* context already closed */ } }, disconnectMs);
      }

      // Each chord routes through its own gain node so previous chords can be cut cleanly
      const chordGain = ctx.createGain();
      chordGain.gain.setValueAtTime(0, scheduledTime);
      chordGain.gain.linearRampToValueAtTime(1, scheduledTime + CHORD_FADE);
      chordGain.connect(dest);
      playChordInstrument(ctx, chordGain, slot.root, slot.type, scheduledTime, instrumentRef.current);
      activeChordGainRef.current = chordGain;

      const tid = setTimeout(() => {
        pendingTimerIdsRef.current.delete(tid);
        if (isPlayingRef.current) {
          dispatch({ type: 'SET_CURRENT_SLOT', index: realIdx });
          lastPlayedChordRef.current = slot;
        }
      }, Math.max(0, (scheduledTime - ctx.currentTime) * 1000));
      pendingTimerIdsRef.current.add(tid);

      nextChordTimeRef.current += chordDuration;
      nextSlotIndexRef.current = (slotIdx + 1) % filled.length;
    }
  }, []);

  const handlePlayStop = useCallback(() => {
    if (isPlayingRef.current) {
      stopPlayback();
      return;
    }
    const filled = slotsRef.current.filter((s): s is ProgressionSlot => s !== null);
    if (filled.length === 0) return;

    const { ctx } = getAudio();
    filledSlotsRef.current = filled;
    nextSlotIndexRef.current = 0;
    nextChordTimeRef.current = ctx.currentTime;
    isPlayingRef.current = true;
    activeChordGainRef.current = null;

    setPreviewSource(null);
    dispatch({ type: 'SET_PLAYING', isPlaying: true });
    dispatch({ type: 'SET_ACTIVE_SLOT', index: null });
    scheduleNextChord();
    schedulerTimerRef.current = setInterval(scheduleNextChord, SCHEDULER_INTERVAL_MS);
  }, [getAudio, scheduleNextChord, stopPlayback]);

  useEffect(() => {
    return () => {
      if (schedulerTimerRef.current !== null) clearInterval(schedulerTimerRef.current);
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  // Chord preview
  const handlePreview = useCallback(
    (root: RootNote, type: ChordType) => {
      const { ctx, dest } = getAudio();
      playChordInstrument(ctx, dest, root, type, ctx.currentTime, instrumentRef.current);
    },
    [getAudio],
  );

  // Slot interaction — reads active slot and playing state through refs so these callbacks
  // have empty dep arrays and don't cause ChordSlotCard memo to break on every playback tick
  const handleSlotSelect = useCallback((index: number) => {
    dispatch({ type: 'SET_ACTIVE_SLOT', index: activeSlotIndexRef.current === index ? null : index });
    if (slotsRef.current[index]) setPreviewSource({ kind: 'viewedSlot', index });
  }, []);

  const handleSlotHover = useCallback((index: number) => {
    if (dragIndex.current === null) setPreviewSource({ kind: 'viewedSlot', index });
  }, []);

  const handleClearSlot = useCallback((index: number) => {
    if (isPlayingRef.current) stopPlayback();
    dispatch({ type: 'SET_SLOT', index, chord: null });
    if (activeSlotIndexRef.current === index) dispatch({ type: 'SET_ACTIVE_SLOT', index: null });
    setPreviewSource((prev) => {
      const isViewingClearedSlot = prev?.kind === 'viewedSlot' && prev.index === index;
      return isViewingClearedSlot ? null : prev;
    });
  }, [stopPlayback]);

  const handleBeatsChange = useCallback((index: number, beats: number) => {
    dispatch({ type: 'SET_SLOT_BEATS', index, beats });
  }, []);

  // Chord bank: assign to active slot then advance to next empty
  const handleBankChordClick = useCallback(
    (root: RootNote, type: ChordType) => {
      handlePreview(root, type);
      dispatch({ type: 'ASSIGN_CHORD_TO_ACTIVE_SLOT', root, chordType: type });
    },
    [handlePreview],
  );

  // Roman numeral apply
  const handleApplyRomanInput = useCallback(
    (value: string, overwriteAll: boolean) => {
      if (!state.selectedKey) return;
      const parsed = parseRomanNumeralInput(value, state.selectedKey);

      if (overwriteAll) {
        dispatch({
          type: 'APPLY_SLOTS',
          slots: parsed.map((s) => (s ? { ...s, beats: 4 } : null)),
        });
      } else {
        const result: (ProgressionSlot | null)[] = [...state.slots];
        let chordIdx = 0;
        for (let i = 0; i < result.length && chordIdx < parsed.length; i++) {
          if (result[i] === null) {
            const chord = parsed[chordIdx++];
            result[i] = chord ? { ...chord, beats: 4 } : null;
          }
        }
        dispatch({ type: 'APPLY_SLOTS', slots: result });
      }
      if (state.isPlaying) stopPlayback();
    },
    [state.selectedKey, state.slots, state.isPlaying, stopPlayback],
  );

  const handleDetectKey = useCallback(() => {
    const detected = detectKey(state.slots);
    dispatch({ type: 'SET_SELECTED_KEY', key: detected });
  }, [state.slots]);

  // Drag-drop
  const handleDragStart = useCallback((i: number) => {
    dragIndex.current = i;
    dispatch({ type: 'SET_ACTIVE_SLOT', index: null });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, i: number) => {
    e.preventDefault();
    dragOverIndex.current = i;
    setDragOverIdx(i);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from !== null && to !== null && from !== to) {
      dispatch({ type: 'REORDER_SLOTS', from, to });
      setPreviewSource(null);
    }
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDragOverIdx(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDragOverIdx(null);
  }, []);

  // WAV export
  const handleExportWav = useCallback(async () => {
    const filled = state.slots.filter((s): s is ProgressionSlot => s !== null);
    if (filled.length === 0) return;
    setIsExporting(true);
    try {
      await exportChordProgression(filled, state.bpm, state.instrument);
    } finally {
      setIsExporting(false);
    }
  }, [state.slots, state.bpm, state.instrument]);

  // Open in Tab Editor
  const handleOpenInTabEditor = useCallback(() => {
    const filled = state.slots.filter((s): s is ProgressionSlot => s !== null);
    if (filled.length === 0) return;
    const track = chordProgressionToTabTrack(filled, state.bpm);
    saveTabTrack(track);
    navigate('/tab-editor');
  }, [state.slots, state.bpm, navigate]);

  const handleConfirmClearAll = useCallback(() => {
    if (state.isPlaying) stopPlayback();
    dispatch({ type: 'CLEAR_ALL' });
    setPreviewSource(null);
    setIsClearAllOpen(false);
    requestAnimationFrame(() => firstSlotRef.current?.focus());
  }, [state.isPlaying, stopPlayback]);

  const handleApplySuggestion = useCallback((chords: ChordSlot[]) => {
    if (state.isPlaying) stopPlayback();
    const filled = chords.slice(0, SLOT_COUNT).map(
      (c): ProgressionSlot => ({ root: c.root, type: c.type, beats: 4 }),
    );
    const slots: (ProgressionSlot | null)[] = [
      ...filled,
      ...Array<null>(SLOT_COUNT - filled.length).fill(null),
    ];
    dispatch({ type: 'APPLY_SLOTS', slots });
    const detected = detectKey(slots);
    if (detected) dispatch({ type: 'SET_SELECTED_KEY', key: detected });
    setPreviewSource(null);
  }, [state.isPlaying, stopPlayback]);

  const hasSlots = useMemo(() => state.slots.some(Boolean), [state.slots]);

  const displayedSlot = useMemo(
    () => resolveDisplayedSlot(state.isPlaying, state.currentSlotIndex, state.slots, previewSource),
    [state.isPlaying, state.currentSlotIndex, state.slots, previewSource],
  );

  const displayedVoicing = useMemo(() => {
    if (!displayedSlot) return null;
    const entry = CHORD_DATABASE_INDEX.get(`${displayedSlot.root}|${displayedSlot.type}`);
    const voicing = entry?.voicings[0];
    return voicing ? { voicing, root: displayedSlot.root, type: displayedSlot.type } : null;
  }, [displayedSlot]);

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
                min={40}
                max={300}
                step={1}
                value={[state.bpm]}
                onValueChange={([v]) => dispatch({ type: 'SET_BPM', bpm: v })}
                className="flex-1"
              />
            </div>
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
              <ToggleGroupItem value="guitar" className={ACCENT_CLS}>
                Guitar
              </ToggleGroupItem>
              <ToggleGroupItem value="piano" className={ACCENT_CLS}>
                Piano
              </ToggleGroupItem>
              <ToggleGroupItem value="pad" className={ACCENT_CLS}>
                Pad
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="cp-controls-actions">
            <button
              className="cp-ai-suggest-btn"
              onClick={() => setIsSuggestOpen(true)}
              disabled={authStatus !== 'authenticated'}
              title={authStatus !== 'authenticated' ? 'Sign in to use AI suggestions' : 'Suggest a chord progression using AI'}
            >
              ✦ Suggest
            </button>
            <button
              className={cn('cp-play-btn', state.isPlaying && 'cp-play-btn--playing')}
              onClick={handlePlayStop}
              disabled={!hasSlots}
              aria-label={state.isPlaying ? 'Stop' : 'Play'}
            >
              {state.isPlaying ? '■' : '▶'}
            </button>
            <button
              className="cp-action-btn"
              onClick={() => void handleExportWav()}
              disabled={!hasSlots || isExporting}
              aria-label="Export WAV"
              title="Export as WAV"
            >
              {isExporting ? '…' : '⬇'}
            </button>
            <button
              className="cp-action-btn"
              onClick={handleOpenInTabEditor}
              disabled={!hasSlots}
              aria-label="Open in Tab Editor"
              title="Open in Tab Editor"
            >
              ♪
            </button>
          </div>
        </div>

        {/* Fretboard Preview */}
        <div className="cp-fretboard-preview">
          <span className="sr-only" aria-live="polite">
            {displayedVoicing ? `Previewing ${chordName(displayedVoicing.root, displayedVoicing.type)}` : ''}
          </span>
          {displayedVoicing ? (
            <div className="cp-fretboard-preview-diagram">
              <FretboardDiagram
                voicing={displayedVoicing.voicing}
                stringNames={STANDARD_TUNING_STRING_NAMES}
              />
            </div>
          ) : (
            <span className="cp-fretboard-preview-empty">
              {state.isPlaying ? 'Playing…' : 'Click or hover a chord to preview it here'}
            </span>
          )}
        </div>

        {/* Slot Grid */}
        <div className="cp-slot-grid">
          {state.slots.map((chord, i) => (
            <ChordSlotCard
              key={i}
              index={i}
              chord={chord}
              romanNumeral={romanNumerals[i]}
              isPlaying={state.currentSlotIndex === i}
              isSelected={state.activeSlotIndex === i}
              isDragOver={dragOverIdx === i}
              onSelect={handleSlotSelect}
              onClear={handleClearSlot}
              onBeatsChange={handleBeatsChange}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onHoverChord={handleSlotHover}
              ref={i === 0 ? firstSlotRef : undefined}
            />
          ))}
        </div>

        {/* Chord Bank */}
        <ChordBankPanel activeSlotIndex={state.activeSlotIndex} onChordClick={handleBankChordClick} />

        {/* Theory Bar */}
        <TheoryBar
          selectedKey={state.selectedKey}
          onSetKey={(key) => dispatch({ type: 'SET_SELECTED_KEY', key })}
          onDetectKey={handleDetectKey}
          onApplyRomanInput={handleApplyRomanInput}
          hasSlots={hasSlots}
          onClearAllClick={() => setIsClearAllOpen(true)}
        />

        {/* Scale Suggestions */}
        <ScaleSuggestions slots={state.slots} />
      </div>

      <SuggestProgressionDialog
        open={isSuggestOpen}
        onOpenChange={setIsSuggestOpen}
        onApply={handleApplySuggestion}
      />

      <Dialog open={isClearAllOpen} onOpenChange={setIsClearAllOpen}>
        <DialogContent
          className="bg-[#1a1b2e] border-[#505270] text-[#ccd6ff]"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-[#8eaaff]">Clear all chords?</DialogTitle>
            <DialogDescription className="text-[#aab0d0]">
              This removes all 8 chords from the progression. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClearAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmClearAll}>
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
