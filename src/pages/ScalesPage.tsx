import { useState, useRef } from "react";
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

const FRET_W = 54;
const STRING_H = 32;
const NUT_X = 36;
const LEFT_PAD = 8;
const RIGHT_PAD = 24;
const TOP_PAD = 24;
const BOTTOM_PAD = 36;
const CIRCLE_R = 12;

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
  onNoteClick: (midiNote: number) => void;
}

function Fretboard({ rootPc, intervals, onNoteClick }: FretboardProps) {
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
      const cx =
        fret === 0
          ? LEFT_PAD + NUT_X / 2 // open string: center in nut area
          : fretX(fret) - FRET_W / 2; // fretted: center between fret lines

      const fill = isRoot ? "#5b7fff" : "#2a2a4c";
      const stroke = isRoot ? "#8eaaff" : "#6060a0";
      const noteName = NOTE_NAMES[pc];

      noteDots.push(
        <g
          key={`${svgStr}-${fret}`}
          onClick={() => onNoteClick(midiNote)}
          style={{ cursor: "pointer" }}
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
            fontSize="9"
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
        y={TOP_PAD - 18}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
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
          fontSize="10"
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

// ── ScalesPage ───────────────────────────────────────────────────────────────
export function ScalesPage() {
  const [selectedKey, setSelectedKey] = useState<RootNote>("C");
  const [selectedMode, setSelectedMode] = useState<ScaleMode>("major");
  const audioCtxRef = useRef<AudioContext | null>(null);

  const rootPc = ROOT_NOTES.indexOf(selectedKey);
  const intervals = new Set(SCALE_INTERVALS[selectedMode]);

  function handleNoteClick(midiNote: number) {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    pluckString(ctx, freq, ctx.currentTime, 0.3);
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
          onValueChange={(v) => {
            if (v) setSelectedKey(v as RootNote);
          }}
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
          onValueChange={(v) => {
            if (v) setSelectedMode(v as ScaleMode);
          }}
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
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto rounded-xl border border-[#333355] bg-[#0d0d18] p-3">
        <Fretboard
          rootPc={rootPc}
          intervals={intervals}
          onNoteClick={handleNoteClick}
        />
      </div>
    </main>
  );
}
