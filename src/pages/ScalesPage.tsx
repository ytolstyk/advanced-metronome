import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTapTempo } from "../hooks/useTapTempo";
import { useSearchParams } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { decodeScaleShare, buildScaleShareUrl } from "../shareUtils";
import type { ScaleMode } from "../data/scales";
import {
  SCALE_INTERVALS,
  SCALE_LABELS,
  SCALE_MODES,
  NOTE_NAMES,
  SCALE_PENTATONIC_SUBSET,
} from "../data/scales";
import { computeCAGEDShapes } from "../data/caged";
import { INTERVAL_NAMES } from "../data/intervals";
import { ROOT_NOTES } from "../data/chords";
import type { RootNote } from "../data/chords";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  loadCloudScaleTracks,
  createCloudScaleTrack,
  updateCloudScaleTrack,
  deleteCloudScaleTrack,
} from "../api/scaleApi";
import type { CloudScaleTrack } from "../api/scaleApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pluckString } from "@/audio/pluckString";
import { cn } from "@/lib/utils";

// ── Fretboard constants ──────────────────────────────────────────────────────
// Standard tuning: low E → high e (index 0 = low E)
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
// Display order top→bottom: high e on top (as viewed from player)
const STRING_NAMES_TOP = ["e", "B", "G", "D", "A", "E"];
const NUM_FRETS = 24;
const NUM_STRINGS = 6;

const FRET_W = 64;
const STRING_H = 40;
const NUT_X = 40;
const LEFT_PAD = 8;
const RIGHT_PAD = 24;
const TOP_PAD = 40;
const BOTTOM_PAD = 40;
const CIRCLE_R = 14;

const SVG_W = LEFT_PAD + NUT_X + NUM_FRETS * FRET_W + RIGHT_PAD;
const SVG_H = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + BOTTOM_PAD;

// Fret position marker frets
const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_DOT_FRETS = new Set([12, 24]);

// ── Shared toggle styles ─────────────────────────────────────────────────────
const BASE_TOGGLE = "px-3 py-1 text-[0.82rem] font-semibold rounded-md border";
const ACTIVE_CLS  = "border-[#5b7fff] bg-[#252850] text-[#8eaaff]";
const INACTIVE_CLS = "border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]";
const DISABLED_CLS = "border-[#333350] bg-[#161622] text-[#555570] cursor-not-allowed";

const FILTER_ITEM_CLS = cn(
  "h-auto", BASE_TOGGLE, INACTIVE_CLS,
  "hover:bg-[#1e1f2c]",
  "data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]",
);

function toggleCls(active: boolean, disabled = false): string {
  return cn(BASE_TOGGLE, disabled ? DISABLED_CLS : cn("transition-colors", active ? ACTIVE_CLS : INACTIVE_CLS));
}

const DEGREE_LABELS: Record<number, string> = {
  0: 'R', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
  6: '♭5', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7',
};

// ── Fretboard SVG ────────────────────────────────────────────────────────────
function fretX(fret: number): number {
  // fret 0 = nut position; fret n = n frets right of nut
  return LEFT_PAD + NUT_X + fret * FRET_W;
}

function stringY(svgStringIdx: number): number {
  // svgStringIdx 0 = top string (high e), 5 = bottom (low E)
  return TOP_PAD + svgStringIdx * STRING_H;
}

interface FretboardProps {
  rootPc: number;
  intervals: Set<number>;
  onNoteClick: (midiNote: number, label: string, dotKey: string) => void;
  highlightedDotKey?: string | null;
  practiceMode?: boolean;
  showDegrees?: boolean;
  showCaged?: boolean;
  pentatonicSet?: Set<number> | null;
}

function Fretboard({ rootPc, intervals, onNoteClick, highlightedDotKey, practiceMode, showDegrees, showCaged, pentatonicSet }: FretboardProps) {
  const [hoveredDotKey, setHoveredDotKey] = useState<string | null>(null);

  // Build CAGED bands
  const cagedBands: React.ReactNode[] = [];
  if (showCaged) {
    const shapes = computeCAGEDShapes(rootPc);
    const bandY1 = TOP_PAD - STRING_H / 2;
    const bandH = (NUM_STRINGS - 1) * STRING_H + STRING_H;
    for (const shape of shapes) {
      const frets = shape.notes.map((n) => n.fret);
      const minFret = Math.min(...frets);
      const maxFret = Math.max(...frets);
      const x1 = minFret === 0 ? LEFT_PAD : fretX(minFret) - FRET_W / 2;
      const x2 = fretX(maxFret) + FRET_W / 2;
      const midX = (x1 + x2) / 2;
      cagedBands.push(
        <g key={`caged-${shape.name}`}>
          <rect
            x={x1} y={bandY1} width={x2 - x1} height={bandH}
            fill={shape.color} opacity={0.09} rx="4"
          />
          <text
            x={midX} y={TOP_PAD - 8} textAnchor="middle"
            fontSize="9" fontWeight="700" fill={shape.color} opacity={0.65}
          >
            {shape.name}
          </text>
        </g>,
      );
    }
  }

  // Build note dots — also derive tooltip data for the hovered dot during this same pass
  // (stale tooltip disappears automatically when the hovered key leaves the current scale)
  const noteDots: React.ReactNode[] = [];
  let hoveredDot: { cx: number; cy: number; interval: number; noteName: string } | null = null;

  for (let svgStr = 0; svgStr < NUM_STRINGS; svgStr++) {
    // svgStr 0 = high e (string index 5 in OPEN_MIDI), 5 = low E (string index 0)
    const midiStringIdx = NUM_STRINGS - 1 - svgStr;
    const cy = stringY(svgStr);

    for (let fret = 0; fret <= NUM_FRETS; fret++) {
      const midiNote = OPEN_MIDI[midiStringIdx] + fret;
      const pc = midiNote % 12;
      const interval = (pc - rootPc + 12) % 12;
      if (!intervals.has(interval)) continue;

      const isRoot = interval === 0;
      const dotKey = `${svgStr}-${fret}`;
      const isHighlighted = dotKey === highlightedDotKey;
      const cx =
        fret === 0
          ? LEFT_PAD + NUT_X / 2 // open string: center in nut area
          : fretX(fret) - FRET_W / 2; // fretted: center between fret lines

      const fill = isHighlighted ? "#22dd88" : isRoot ? "#5b7fff" : "#2a2a4c";
      const stroke = isHighlighted ? "#66ffbb" : isRoot ? "#8eaaff" : "#6060a0";
      const noteName = NOTE_NAMES[pc];
      const isPentatonicDimmed = pentatonicSet != null && !pentatonicSet.has(interval);
      const dotOpacity = isPentatonicDimmed ? 0.28 : 1;
      const displayLabel = showDegrees ? DEGREE_LABELS[interval] : noteName;

      if (dotKey === hoveredDotKey) hoveredDot = { cx, cy, interval, noteName };

      noteDots.push(
        <g
          key={dotKey}
          onClick={() => onNoteClick(midiNote, noteName, dotKey)}
          onMouseEnter={() => setHoveredDotKey(dotKey)}
          onMouseLeave={() => setHoveredDotKey(null)}
          style={{ cursor: practiceMode ? "crosshair" : "pointer", opacity: dotOpacity }}
          role="button"
          aria-label={`${noteName} on ${STRING_NAMES_TOP[svgStr]} string fret ${fret}`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_R}
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11"
            fontWeight="700"
            fill="white"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {displayLabel}
          </text>
        </g>,
      );
    }
  }

  // Hover tooltip
  let tooltipEl: React.ReactNode = null;
  if (hoveredDot != null) {
    const tooltipLabel = `${hoveredDot.noteName} — ${INTERVAL_NAMES[hoveredDot.interval]}`;
    const tw = Math.max(tooltipLabel.length * 6.5 + 16, 80);
    const th = 20;
    const tx = Math.max(4, Math.min(hoveredDot.cx - tw / 2, SVG_W - tw - 4));
    const tyAbove = hoveredDot.cy - CIRCLE_R - th - 6;
    const ty = tyAbove < 2 ? hoveredDot.cy + CIRCLE_R + 6 : tyAbove;
    tooltipEl = (
      <g pointerEvents="none">
        <rect x={tx} y={ty} width={tw} height={th} rx="4"
          fill="#1a1b2e" stroke="#5b7fff" strokeWidth="1" />
        <text
          x={tx + tw / 2} y={ty + th / 2}
          textAnchor="middle" dominantBaseline="central"
          fontSize="11" fill="#c8ccff"
        >
          {tooltipLabel}
        </text>
      </g>
    );
  }

  // Fret position markers (dots below strings)
  const markerY = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 24;
  const markers: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    const cx = fretX(fret) - FRET_W / 2;
    if (SINGLE_DOT_FRETS.has(fret)) {
      markers.push(
        <circle key={`m${fret}`} cx={cx} cy={markerY} r={4} fill="#6060a0" />,
      );
    } else if (DOUBLE_DOT_FRETS.has(fret)) {
      markers.push(
        <circle
          key={`m${fret}a`}
          cx={cx - 8}
          cy={markerY}
          r={4}
          fill="#6060a0"
        />,
        <circle
          key={`m${fret}b`}
          cx={cx + 8}
          cy={markerY}
          r={4}
          fill="#6060a0"
        />,
      );
    }
  }

  // Fret number labels
  const fretLabels: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    const cx = fretX(fret) - FRET_W / 2;
    fretLabels.push(
      <text
        key={`fl${fret}`}
        x={cx}
        y={TOP_PAD - 24}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="13"
        fill="#8888bb"
      >
        {fret}
      </text>,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      aria-label="Guitar fretboard"
    >
      {/* String lines */}
      {Array.from({ length: NUM_STRINGS }, (_, i) => (
        <line
          key={`str${i}`}
          x1={LEFT_PAD}
          y1={stringY(i)}
          x2={SVG_W - RIGHT_PAD}
          y2={stringY(i)}
          stroke="#444466"
          strokeWidth={
            i === 0 ? 0.8 : i === NUM_STRINGS - 1 ? 1.8 : 1 + i * 0.2
          }
        />
      ))}

      {/* Nut */}
      <line
        x1={LEFT_PAD + NUT_X}
        y1={TOP_PAD - 4}
        x2={LEFT_PAD + NUT_X}
        y2={TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 4}
        stroke="#aaaacc"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Fret lines */}
      {Array.from({ length: NUM_FRETS }, (_, i) => {
        const x = fretX(i + 1);
        return (
          <line
            key={`fret${i}`}
            x1={x}
            y1={TOP_PAD - 2}
            x2={x}
            y2={TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 2}
            stroke="#333355"
            strokeWidth="1"
          />
        );
      })}

      {/* String name labels (left of nut) */}
      {STRING_NAMES_TOP.map((name, i) => (
        <text
          key={`sn${i}`}
          x={LEFT_PAD + NUT_X / 2}
          y={stringY(i)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="12"
          fill="#777799"
          fontWeight="600"
        >
          {name}
        </text>
      ))}

      {cagedBands}
      {fretLabels}
      {markers}
      {noteDots}
      {tooltipEl}
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PracticeNote {
  id: number;
  midiNote: number;
  label: string;
  dotKey: string;
}

// ── ScalesPage ───────────────────────────────────────────────────────────────
export function ScalesPage() {
  const [selectedKey, setSelectedKey] = useState<RootNote>(() => {
    const saved = localStorage.getItem('scales-selectedKey');
    return ROOT_NOTES.includes(saved as RootNote) ? (saved as RootNote) : 'C';
  });
  const [selectedMode, setSelectedMode] = useState<ScaleMode>(() => {
    const saved = localStorage.getItem('scales-selectedMode');
    return SCALE_MODES.includes(saved as ScaleMode) ? (saved as ScaleMode) : 'major';
  });
  const [practiceMode, setPracticeMode] = useState(() =>
    localStorage.getItem('scales-practiceMode') === 'true'
  );
  const [practiceNotes, setPracticeNotes] = useState<PracticeNote[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('scales-practiceNotes') ?? '[]') as PracticeNote[];
    } catch { return []; }
  });
  const [showDegrees, setShowDegrees] = useState(
    () => localStorage.getItem('scales-showDegrees') === 'true'
  );
  const [showCaged, setShowCaged] = useState(
    () => localStorage.getItem('scales-showCaged') === 'true'
  );
  const [showPentatonic, setShowPentatonic] = useState(
    () => localStorage.getItem('scales-showPentatonic') === 'true'
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(() => {
    const n = Number(localStorage.getItem('scales-bpm'));
    return n >= 40 && n <= 240 ? n : 80;
  });
  const [activeNoteIdx, setActiveNoteIdx] = useState<number | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [copiedShare, setCopiedShare] = useState(false);

  const handleTapBpm = useCallback((newBpm: number) => setBpm(newBpm), []);
  const [tapTempo, tapFlashing] = useTapTempo(handleTapBpm, 40, 400);

  // Load shared state from URL on mount
  useEffect(() => {
    const encoded = searchParams.get('scaleshare');
    if (!encoded) return;
    const payload = decodeScaleShare(encoded);
    if (payload) {
      if (ROOT_NOTES.includes(payload.key as RootNote)) setSelectedKey(payload.key as RootNote);
      if (SCALE_MODES.includes(payload.mode as ScaleMode)) setSelectedMode(payload.mode as ScaleMode);
      const bpmVal = payload.bpm;
      if (bpmVal >= 40 && bpmVal <= 400) setBpm(bpmVal);
      if (payload.notes && payload.notes.length > 0) {
        setPracticeNotes(payload.notes);
        setPracticeMode(true);
        noteIdCounter.current = payload.notes.reduce((max, n) => Math.max(max, n.id + 1), 0);
      }
    }
    setSearchParams({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [cloudTracks, setCloudTracks] = useState<CloudScaleTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [trackName, setTrackName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [overrideConfirm, setOverrideConfirm] = useState<{ id: string; name: string } | null>(null);

  // Load cloud tracks when authenticated
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setCloudTracks([]);
      return;
    }
    void loadCloudScaleTracks().then(setCloudTracks);
  }, [authStatus]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentIdxRef = useRef(0);
  const bpmRef = useRef(bpm);
  const practiceNotesRef = useRef(practiceNotes);
  const noteIdCounter = useRef(practiceNotes.reduce((max, n) => Math.max(max, n.id + 1), 0));

  // Keep refs in sync
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { practiceNotesRef.current = practiceNotes; }, [practiceNotes]);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('scales-selectedKey', selectedKey); }, [selectedKey]);
  useEffect(() => { localStorage.setItem('scales-selectedMode', selectedMode); }, [selectedMode]);
  useEffect(() => { localStorage.setItem('scales-bpm', String(bpm)); }, [bpm]);
  useEffect(() => { localStorage.setItem('scales-practiceMode', String(practiceMode)); }, [practiceMode]);
  useEffect(() => { localStorage.setItem('scales-practiceNotes', JSON.stringify(practiceNotes)); }, [practiceNotes]);
  useEffect(() => { localStorage.setItem('scales-showDegrees', String(showDegrees)); }, [showDegrees]);
  useEffect(() => { localStorage.setItem('scales-showCaged', String(showCaged)); }, [showCaged]);
  useEffect(() => { localStorage.setItem('scales-showPentatonic', String(showPentatonic)); }, [showPentatonic]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  const rootPc = ROOT_NOTES.indexOf(selectedKey);
  const intervals = useMemo(() => new Set(SCALE_INTERVALS[selectedMode]), [selectedMode]);
  const pentatonicSubset = SCALE_PENTATONIC_SUBSET[selectedMode];
  const pentatonicSet = useMemo(
    () => showPentatonic && pentatonicSubset ? new Set(pentatonicSubset) : null,
    [showPentatonic, pentatonicSubset],
  );

  function getOrCreateAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  function handleNoteClick(midiNote: number, label: string, dotKey: string) {
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    pluckString(ctx, freq, ctx.currentTime, 0.3);

    if (practiceMode) {
      setPracticeNotes((prev) => [
        ...prev,
        { id: noteIdCounter.current++, midiNote, label, dotKey },
      ]);
    }
  }

  function startPlayback() {
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    nextNoteTimeRef.current = ctx.currentTime;
    currentIdxRef.current = 0;
    setActiveNoteIdx(0);
    setIsPlaying(true);

    schedulerRef.current = setInterval(() => {
      const audioCtx = audioCtxRef.current!;
      const notes = practiceNotesRef.current;
      if (notes.length === 0) return;
      const beatDur = 60 / bpmRef.current;

      while (nextNoteTimeRef.current < audioCtx.currentTime + 0.1) {
        const idx = currentIdxRef.current % notes.length;
        const freq = 440 * Math.pow(2, (notes[idx].midiNote - 69) / 12);
        pluckString(audioCtx, freq, nextNoteTimeRef.current, 0.3);

        const delay = Math.max(
          0,
          (nextNoteTimeRef.current - audioCtx.currentTime) * 1000,
        );
        const capturedIdx = idx;
        setTimeout(() => setActiveNoteIdx(capturedIdx), delay);

        nextNoteTimeRef.current += beatDur;
        currentIdxRef.current++;
      }
    }, 25);
  }

  function stopPlayback() {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    setIsPlaying(false);
    setActiveNoteIdx(null);
  }

  function togglePracticeMode() {
    if (practiceMode) {
      stopPlayback();
      setPracticeMode(false);
    } else {
      setPracticeMode(true);
    }
  }

  function handleKeyChange(v: string) {
    if (!v) return;
    if (isPlaying) stopPlayback();
    setSelectedKey(v as RootNote);
  }

  function handleModeChange(v: string) {
    if (!v) return;
    if (isPlaying) stopPlayback();
    setSelectedMode(v as ScaleMode);
  }

  const highlightedDotKey =
    activeNoteIdx !== null && practiceNotes[activeNoteIdx]
      ? practiceNotes[activeNoteIdx].dotKey
      : null;

  function handleSaveTrackClick() {
    const name = trackName.trim();
    if (!name) return;
    const existing = cloudTracks.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      setOverrideConfirm({ id: existing.id, name: existing.name });
    } else {
      void performSaveTrack();
    }
  }

  async function performSaveTrack() {
    const name = trackName.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (overrideConfirm) {
        const updated = await updateCloudScaleTrack(
          overrideConfirm.id,
          name,
          selectedKey,
          selectedMode,
          practiceNotes,
          bpm,
        );
        if (updated) {
          setCloudTracks((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t)),
          );
          setSelectedTrackId(updated.id);
        }
      } else {
        const created = await createCloudScaleTrack(
          name,
          selectedKey,
          selectedMode,
          practiceNotes,
          bpm,
        );
        if (created) {
          setCloudTracks((prev) => [...prev, created]);
          setSelectedTrackId(created.id);
        }
      }
    } finally {
      setSaving(false);
      setOverrideConfirm(null);
    }
  }

  function handleLoadTrack(trackId: string) {
    const track = cloudTracks.find((t) => t.id === trackId);
    if (!track) return;
    stopPlayback();
    setSelectedTrackId(trackId);
    setTrackName(track.name);
    setSelectedKey(track.selectedKey);
    setSelectedMode(track.selectedMode);
    setPracticeNotes(track.practiceNotes);
    setBpm(track.bpm);
    noteIdCounter.current = track.practiceNotes.reduce(
      (max, n) => Math.max(max, n.id + 1),
      0,
    );
  }

  async function handleDeleteTrack() {
    if (!selectedTrackId) return;
    setDeleting(true);
    try {
      await deleteCloudScaleTrack(selectedTrackId);
      setCloudTracks((prev) => prev.filter((t) => t.id !== selectedTrackId));
      setSelectedTrackId(null);
      setTrackName("");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main
      className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1400px] mx-auto"
      aria-label="Scale explorer"
    >
      {/* Key filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">
          Key
        </span>
        <ToggleGroup
          type="single"
          value={selectedKey}
          onValueChange={handleKeyChange}
          className="flex flex-wrap justify-start gap-1"
        >
          {ROOT_NOTES.map((note) => (
            <ToggleGroupItem
              key={note}
              value={note}
              className={FILTER_ITEM_CLS}
            >
              {note}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Scale/mode filter */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">
          Scale
        </span>
        <ToggleGroup
          type="single"
          value={selectedMode}
          onValueChange={handleModeChange}
          className="flex flex-wrap justify-start gap-1"
        >
          {SCALE_MODES.map((mode) => (
            <ToggleGroupItem
              key={mode}
              value={mode}
              className={FILTER_ITEM_CLS}
            >
              {SCALE_LABELS[mode]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Display options */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1">
          Display
        </span>
        <button onClick={() => setShowDegrees((v) => !v)} className={toggleCls(showDegrees)}>
          Degree Labels
        </button>
        <button onClick={() => setShowCaged((v) => !v)} className={toggleCls(showCaged)}>
          CAGED Overlay
        </button>
        <button
          onClick={() => setShowPentatonic((v) => !v)}
          disabled={!pentatonicSubset}
          className={toggleCls(showPentatonic, !pentatonicSubset)}
        >
          Pentatonic Subset
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[0.75rem] text-[#777799]">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="#5b7fff"
              stroke="#8eaaff"
              strokeWidth="1.5"
            />
          </svg>
          Root note
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="#2a2a4c"
              stroke="#6060a0"
              strokeWidth="1.5"
            />
          </svg>
          Scale note
        </span>
        {practiceMode && (
          <span className="flex items-center gap-1.5">
            <svg width="16" height="16">
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="#22dd88"
                stroke="#66ffbb"
                strokeWidth="1.5"
              />
            </svg>
            Playing
          </span>
        )}
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto rounded-xl border border-[#333355] bg-[#0d0d18] p-3">
        <Fretboard
          rootPc={rootPc}
          intervals={intervals}
          onNoteClick={handleNoteClick}
          highlightedDotKey={highlightedDotKey}
          practiceMode={practiceMode}
          showDegrees={showDegrees}
          showCaged={showCaged}
          pentatonicSet={pentatonicSet}
        />
      </div>

      {/* Practice Mode toggle + Share */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePracticeMode}
          className={
            "px-4 py-1.5 text-[0.82rem] font-semibold rounded-md border transition-colors " +
            (practiceMode
              ? "border-[#22dd88] bg-[#0d1f17] text-[#22dd88]"
              : "border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]")
          }
        >
          {practiceMode ? "✦ Practice Mode" : "Practice Mode"}
        </button>
        <button
          onClick={() => {
            const url = buildScaleShareUrl(
              selectedKey,
              selectedMode,
              bpm,
              practiceNotes.length > 0 ? practiceNotes : undefined,
            );
            void navigator.clipboard.writeText(url).then(() => {
              setCopiedShare(true);
              setTimeout(() => setCopiedShare(false), 2000);
            });
          }}
          className="px-4 py-1.5 text-[0.82rem] font-semibold rounded-md border transition-colors border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]"
        >
          {copiedShare ? "✓ Copied!" : "Share"}
        </button>
      </div>

      {/* Practice mode panel */}
      {practiceMode && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] overflow-hidden">

          {/* ── Sequence ─────────────────────────────────────────────────── */}
          <div className="px-4 pt-3 pb-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-wider text-[#8080b8] mb-2">
              Sequence
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[34px] items-center">
              {practiceNotes.length === 0 ? (
                <span className="text-[0.78rem] text-[#606080] italic">
                  Click notes on the fretboard to build a sequence
                </span>
              ) : (
                practiceNotes.map((note, idx) => {
                  const isActive = idx === activeNoteIdx;
                  return (
                    <span
                      key={note.id}
                      className={
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[0.78rem] font-semibold transition-colors " +
                        (isActive
                          ? "bg-[#0f2a1e] border-[#22dd88] text-[#22dd88]"
                          : "bg-[#13131e] border-[#4a4a70] text-[#aaaacc]")
                      }
                    >
                      {note.label}
                      <button
                        onClick={() => {
                          setPracticeNotes((prev) =>
                            prev.filter((_, i) => i !== idx),
                          );
                          if (isPlaying) stopPlayback();
                        }}
                        className="opacity-40 hover:opacity-80 leading-none ml-0.5"
                        aria-label={`Remove ${note.label}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Transport ─────────────────────────────────────────────────── */}
          <div className="border-t border-[#272744] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
            <button
              onClick={() => {
                if (isPlaying) {
                  stopPlayback();
                } else if (practiceNotes.length > 0) {
                  startPlayback();
                }
              }}
              disabled={practiceNotes.length === 0}
              className={
                "h-8 px-4 text-[0.82rem] font-semibold rounded-md border transition-colors shrink-0 " +
                (isPlaying
                  ? "border-[#dd4444] bg-[#1a0808] text-[#ff8888] hover:border-[#ff6666]"
                  : practiceNotes.length === 0
                    ? "border-[#383858] bg-[#0b0b16] text-[#555578] cursor-not-allowed"
                    : "border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb]")
              }
            >
              {isPlaying ? "■ Stop" : "▶ Play"}
            </button>

            <div className="flex items-center gap-2.5 flex-1 min-w-0 w-full md:w-auto md:max-w-[30rem]">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#8080b8] shrink-0">
                BPM
              </span>
              <input
                type="range"
                min={40}
                max={400}
                step={1}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="flex-1 min-w-0 accent-[#22dd88]"
              />
              <span className="text-[0.82rem] font-semibold text-[#aaaacc] tabular-nums w-7 text-right shrink-0">
                {bpm}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 px-2 text-xs font-bold shrink-0 transition-colors duration-75 ${tapFlashing ? "border-[#22dd88] bg-[#081a10] text-[#22dd88]" : "border-[#3a3a60] bg-[#0b0b16] text-[#8080b8] hover:border-[#5050a0] hover:text-[#aaaacc]"}`}
                onClick={tapTempo}
                title="Tap to set BPM"
              >
                Tap
              </Button>
            </div>

            <button
              onClick={() => {
                stopPlayback();
                setPracticeNotes([]);
              }}
              className="h-8 px-3 text-[0.82rem] font-semibold rounded-md border border-[#3a3a60] bg-[#0b0b16] text-[#7878a8] hover:border-[#5050a0] hover:text-[#aaaacc] transition-colors shrink-0"
            >
              Clear
            </button>
          </div>

          {/* ── Save / Load (authenticated only) ─────────────────────────── */}
          {authStatus === 'authenticated' && (
            <div className="border-t border-[#272744] px-4 py-3 flex flex-wrap items-center gap-2">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#8080b8] shrink-0 mr-1">
                Track
              </span>

              {cloudTracks.length > 0 && (
                <Select
                  value={selectedTrackId ?? ""}
                  onValueChange={handleLoadTrack}
                >
                  <SelectTrigger className="h-8 w-44 text-[0.82rem] bg-[#0f0f1e] border-[#3a3a60] text-[#aaaacc]">
                    <SelectValue placeholder="Load saved…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#13131e] border-[#3a3a60]">
                    {cloudTracks.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        className="text-[0.82rem] text-[#ccc] focus:bg-[#1e1e36] focus:text-white"
                      >
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <input
                type="text"
                placeholder="Name…"
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveTrackClick();
                  }
                }}
                className="h-8 px-2.5 text-[0.82rem] rounded-md border border-[#3a3a60] bg-[#0f0f1e] text-[#ddd] placeholder-[#606080] focus:outline-none focus:border-[#6b7fff] w-32"
              />

              <button
                onClick={handleSaveTrackClick}
                disabled={saving || !trackName.trim() || practiceNotes.length === 0 || overrideConfirm !== null}
                className={
                  "h-8 px-3.5 text-[0.82rem] font-semibold rounded-md border transition-colors " +
                  (saving || !trackName.trim() || practiceNotes.length === 0
                    ? "border-[#383858] bg-[#0b0b16] text-[#555578] cursor-not-allowed"
                    : "border-[#4a5fff] bg-[#10122a] text-[#8eaaff] hover:border-[#8eaaff] hover:text-[#c0d4ff]")
                }
              >
                {saving ? "Saving…" : "Save"}
              </button>

              {selectedTrackId && (
                <button
                  onClick={() => void handleDeleteTrack()}
                  disabled={deleting}
                  className={
                    "h-8 px-3 text-[0.82rem] font-semibold rounded-md border transition-colors " +
                    (deleting
                      ? "border-[#383858] bg-[#0b0b16] text-[#555578] cursor-not-allowed"
                      : "border-[#6a2020] bg-[#0f0808] text-[#dd7777] hover:border-[#dd4444] hover:text-[#ff8888]")
                  }
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!overrideConfirm} onOpenChange={(open) => { if (!open) setOverrideConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Track already exists</DialogTitle>
            <DialogDescription>
              A track named <strong>&ldquo;{overrideConfirm?.name}&rdquo;</strong> already exists.
              Override it with the current scale, or go back and choose a different name.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOverrideConfirm(null)}>
              Choose different name
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void performSaveTrack()}>
              Override
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
