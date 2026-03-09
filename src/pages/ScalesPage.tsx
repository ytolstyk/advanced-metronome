import { useState, useRef, useEffect } from "react";
import type { ScaleMode } from "../data/scales";
import {
  SCALE_INTERVALS,
  SCALE_LABELS,
  SCALE_MODES,
  NOTE_NAMES,
} from "../data/scales";
import { ROOT_NOTES } from "../data/chords";
import type { RootNote } from "../data/chords";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

// ── Audio ────────────────────────────────────────────────────────────────────
function pluckString(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  vol: number,
) {
  const env = ctx.createGain();
  env.connect(ctx.destination);
  env.gain.setValueAtTime(0.001, startTime);
  env.gain.linearRampToValueAtTime(vol, startTime + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + 2.2);

  for (let h = 1; h <= 6; h++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h;
    const hg = ctx.createGain();
    hg.gain.value = 0.5 / (h * h);
    osc.connect(hg);
    hg.connect(env);
    osc.start(startTime);
    osc.stop(startTime + 2.5);
  }
}

// ── Shared toggle style ──────────────────────────────────────────────────────
const FILTER_ITEM_CLS =
  "h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md " +
  "border border-[#505270] bg-[#1e1f2c] text-[#aaa] " +
  "hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] " +
  "data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]";

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
}

function Fretboard({ rootPc, intervals, onNoteClick, highlightedDotKey, practiceMode }: FretboardProps) {
  // Build note dots
  const noteDots: React.ReactNode[] = [];

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

      noteDots.push(
        <g
          key={dotKey}
          onClick={() => onNoteClick(midiNote, noteName, dotKey)}
          style={{ cursor: practiceMode ? "crosshair" : "pointer" }}
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
            {noteName}
          </text>
        </g>,
      );
    }
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

      {fretLabels}
      {markers}
      {noteDots}
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(() => {
    const n = Number(localStorage.getItem('scales-bpm'));
    return n >= 40 && n <= 240 ? n : 80;
  });
  const [activeNoteIdx, setActiveNoteIdx] = useState<number | null>(null);

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

  // Cleanup on unmount
  useEffect(() => () => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  const rootPc = ROOT_NOTES.indexOf(selectedKey);
  const intervals = new Set(SCALE_INTERVALS[selectedMode]);

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
        />
      </div>

      {/* Practice Mode toggle */}
      <div>
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
      </div>

      {/* Practice mode controls */}
      {practiceMode && (
        <div className="flex flex-col gap-3">
          {/* Note chips */}
          <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
            {practiceNotes.length === 0 ? (
              <span className="text-[0.78rem] text-[#555577] italic">
                Click notes above to build a sequence
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
                        ? "bg-[#1a3a2a] border-[#22dd88] text-[#22dd88]"
                        : "bg-[#1e1f2c] border-[#505270] text-[#aaa]")
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
                      className="opacity-50 hover:opacity-100 leading-none"
                      aria-label={`Remove ${note.label}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })
            )}
          </div>

          {/* Playback controls */}
          <div className="flex flex-wrap items-center gap-3">
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
                "px-4 py-1.5 text-[0.82rem] font-semibold rounded-md border transition-colors " +
                (isPlaying
                  ? "border-[#dd4444] bg-[#1f0d0d] text-[#ff8888] hover:border-[#ff6666]"
                  : practiceNotes.length === 0
                    ? "border-[#333355] bg-[#1a1a2c] text-[#555577] cursor-not-allowed"
                    : "border-[#22dd88] bg-[#0d1f17] text-[#22dd88] hover:border-[#66ffbb]")
              }
            >
              {isPlaying ? "■ Stop" : "▶ Play"}
            </button>

            <label className="flex items-center gap-2 text-[0.82rem] text-[#aaa]">
              <span className="text-[#777799] font-semibold">BPM</span>
              <input
                type="range"
                min={40}
                max={240}
                step={1}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-28 accent-[#22dd88]"
              />
              <span className="w-8 text-right tabular-nums">{bpm}</span>
            </label>

            <button
              onClick={() => {
                stopPlayback();
                setPracticeNotes([]);
              }}
              className="px-3 py-1.5 text-[0.82rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd] transition-colors"
            >
              Clear ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
