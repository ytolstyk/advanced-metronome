import { useState, useMemo } from 'react';
import type { RootNote } from '@/data/chords';
import { ROOT_NOTES, ROOT_NOTE_TO_PC } from '@/data/chords';
import { SCALE_INTERVALS } from '@/data/scales';
import {
  computeCAGEDShapes,
  CAGED_SHAPE_ORDER,
  CAGED_COLORS,
} from '@/data/caged';
import type { CagedName } from '@/data/caged';
import './CAGEDPage.css';

// Standard tuning MIDI (low E to high e)
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STRING_DISPLAY_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']; // SVG order (top = high e)

// SVG layout
const DISPLAY_FRETS = 16;
const FRET_W = 56;
const STRING_H = 44;
const NUT_X = 42;
const LEFT_PAD = 12;
const RIGHT_PAD = 24;
const TOP_PAD = 44;
const BOTTOM_PAD = 48;
const CIRCLE_R = 15;
const NUM_STRINGS = 6;

const SVG_W = LEFT_PAD + NUT_X + DISPLAY_FRETS * FRET_W + RIGHT_PAD;
const SVG_H = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + BOTTOM_PAD;

function fretX(fret: number) {
  // Fret 0 = nut position; fret n = center of the nth fret cell
  if (fret === 0) return LEFT_PAD + NUT_X / 2;
  return LEFT_PAD + NUT_X + (fret - 0.5) * FRET_W;
}

function stringY(svgStrIdx: number) {
  return TOP_PAD + svgStrIdx * STRING_H;
}

// SVG string index 0 = high e (visual top), 5 = low E (visual bottom)
function midiStrToSvg(midiStr: number) {
  return NUM_STRINGS - 1 - midiStr;
}

const POSITION_DOTS = [3, 5, 7, 9, 12, 15];

export function CAGEDPage() {
  const [rootNote, setRootNote] = useState<RootNote>('C');
  const [activeShape, setActiveShape] = useState<CagedName | null>(null);
  const [showScale, setShowScale] = useState(false);

  const rootPc = ROOT_NOTE_TO_PC[rootNote];

  const shapes = useMemo(() => computeCAGEDShapes(rootPc), [rootPc]);

  const scaleSet = useMemo(
    () => new Set(SCALE_INTERVALS['major'].map((i) => (rootPc + i) % 12)),
    [rootPc],
  );

  // Build set of positions occupied by chord shape dots (midiStr-fret keys)
  const occupiedKeys = useMemo(
    () =>
      new Set(
        shapes.flatMap((s) => s.notes.map((n) => `${n.string}-${n.fret}`)),
      ),
    [shapes],
  );

  function toggleShape(name: CagedName) {
    setActiveShape((prev) => (prev === name ? null : name));
  }

  return (
    <main
      className="flex flex-col gap-6 px-4 pt-6 pb-12 max-w-[1100px] mx-auto"
      aria-label="CAGED System Visualizer"
    >
      <div>
        <h1 className="text-xl font-bold text-[#d0d0f0]">CAGED System</h1>
        <p className="text-sm text-[#8888b8] mt-1">
          The 5 major chord shapes that tile the fretboard for any root note.
        </p>
      </div>

      {/* Root note selector */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#666688]">
          Root
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ROOT_NOTES.map((note) => (
            <button
              key={note}
              onClick={() => setRootNote(note)}
              className={`px-3 py-1 rounded-md text-sm font-semibold border transition-colors duration-100 ${
                rootNote === note
                  ? 'bg-[#252850] border-[#5b7fff] text-[#8eaaff]'
                  : 'bg-transparent border-[#333355] text-[#8888b8] hover:text-[#d0d0f0] hover:border-[#555577]'
              }`}
            >
              {note}
            </button>
          ))}
        </div>
      </div>

      {/* Shape selector + scale toggle */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#666688]">
            Shape
          </span>
          <div className="flex gap-2">
            {CAGED_SHAPE_ORDER.map((name) => (
              <button
                key={name}
                className="caged-shape-btn"
                data-shape={name}
                data-active={activeShape === name ? 'true' : 'false'}
                onClick={() => toggleShape(name)}
                title={`${name} shape — click to isolate`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#666688]">
            Overlay
          </span>
          <button
            onClick={() => setShowScale((s) => !s)}
            className={`px-3 py-1 rounded-md text-sm border transition-colors duration-100 ${
              showScale
                ? 'bg-[#252850] border-[#5b7fff] text-[#8eaaff]'
                : 'bg-transparent border-[#333355] text-[#8888b8] hover:text-[#d0d0f0] hover:border-[#555577]'
            }`}
          >
            Major Scale
          </button>
        </div>
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto rounded-lg bg-[#0b0b16] p-2">
        <svg
          width={SVG_W}
          height={SVG_H}
          style={{ display: 'block' }}
          aria-label={`CAGED fretboard for ${rootNote} major`}
        >
          {/* Fret lines */}
          {Array.from({ length: DISPLAY_FRETS + 1 }, (_, i) => {
            const x = LEFT_PAD + NUT_X + i * FRET_W;
            return (
              <line
                key={i}
                x1={x}
                y1={TOP_PAD}
                x2={x}
                y2={TOP_PAD + (NUM_STRINGS - 1) * STRING_H}
                stroke="#2a2a44"
                strokeWidth={1}
              />
            );
          })}

          {/* Nut */}
          <line
            x1={LEFT_PAD + NUT_X}
            y1={TOP_PAD - 4}
            x2={LEFT_PAD + NUT_X}
            y2={TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 4}
            stroke="#aaaacc"
            strokeWidth={3}
          />

          {/* String lines */}
          {Array.from({ length: NUM_STRINGS }, (_, svgStr) => {
            const y = stringY(svgStr);
            const weight = 0.8 + (svgStr / (NUM_STRINGS - 1)) * 2.4;
            return (
              <line
                key={svgStr}
                x1={LEFT_PAD}
                y1={y}
                x2={SVG_W - RIGHT_PAD}
                y2={y}
                stroke="#444466"
                strokeWidth={weight}
              />
            );
          })}

          {/* Fret number labels */}
          {Array.from({ length: DISPLAY_FRETS + 1 }, (_, fret) => (
            <text
              key={fret}
              x={fretX(fret)}
              y={TOP_PAD - 12}
              textAnchor="middle"
              fontSize={11}
              fill="#666699"
              fontFamily="monospace"
            >
              {fret}
            </text>
          ))}

          {/* Position dot markers */}
          {POSITION_DOTS.filter((f) => f <= DISPLAY_FRETS).map((fret) => {
            const x = fretX(fret);
            const midY =
              TOP_PAD + ((NUM_STRINGS - 1) * STRING_H) / 2;
            if (fret === 12) {
              return (
                <g key={fret}>
                  <circle cx={x} cy={midY - 10} r={4} fill="#4040660" />
                  <circle cx={x} cy={midY + 10} r={4} fill="#404066" />
                </g>
              );
            }
            return (
              <circle key={fret} cx={x} cy={midY} r={4} fill="#404066" />
            );
          })}

          {/* String name labels */}
          {Array.from({ length: NUM_STRINGS }, (_, svgStr) => (
            <text
              key={svgStr}
              x={LEFT_PAD - 2}
              y={stringY(svgStr) + 4}
              textAnchor="end"
              fontSize={11}
              fill="#666688"
              fontFamily="monospace"
            >
              {STRING_DISPLAY_NAMES[svgStr]}
            </text>
          ))}

          {/* Scale overlay dots */}
          {showScale &&
            Array.from({ length: NUM_STRINGS }, (_, svgStr) => {
              const midiStr = midiStrToSvg(svgStr);
              return Array.from({ length: DISPLAY_FRETS + 1 }, (_, fret) => {
                const pc = (OPEN_MIDI[midiStr] + fret) % 12;
                if (
                  scaleSet.has(pc) &&
                  !occupiedKeys.has(`${midiStr}-${fret}`)
                ) {
                  return (
                    <circle
                      key={`scale-${svgStr}-${fret}`}
                      cx={fretX(fret)}
                      cy={stringY(svgStr)}
                      r={5}
                      fill="#3a3a58"
                      stroke="#555577"
                      strokeWidth={1}
                    />
                  );
                }
                return null;
              });
            })}

          {/* Shape note dots */}
          {shapes.map((shape) => {
            const dimmed =
              activeShape !== null && activeShape !== shape.name;
            return (
              <g
                key={shape.name}
                opacity={dimmed ? 0.15 : 1}
                style={{ transition: 'opacity 0.2s' }}
              >
                {shape.notes.map((note) => {
                  const svgStr = midiStrToSvg(note.string);
                  const cx = fretX(note.fret);
                  const cy = stringY(svgStr);
                  const pc =
                    (OPEN_MIDI[note.string] + note.fret) % 12;
                  return (
                    <g key={`${note.string}-${note.fret}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={CIRCLE_R}
                        fill={shape.color}
                        stroke={shape.color}
                        strokeWidth={1.5}
                      />
                      {note.role === 'root' && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={CIRCLE_R - 4}
                          fill="none"
                          stroke="white"
                          strokeWidth={2}
                        />
                      )}
                      <text
                        x={cx}
                        y={cy + 4}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="white"
                        fontFamily="sans-serif"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {NOTE_NAMES[pc]}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#8888b8]">
        {CAGED_SHAPE_ORDER.map((name) => (
          <button
            key={name}
            className="flex items-center gap-2 hover:text-[#d0d0f0] transition-colors"
            onClick={() => toggleShape(name)}
            title={`Click to isolate ${name} shape`}
          >
            <span
              className="caged-legend-dot"
              style={{ background: CAGED_COLORS[name] }}
            />
            <span>{name} shape</span>
          </button>
        ))}
        <span className="flex items-center gap-2">
          <span className="caged-legend-ring" />
          <span>Root note</span>
        </span>
        {showScale && (
          <span className="flex items-center gap-2">
            <span
              className="caged-legend-dot"
              style={{ background: '#3a3a58', border: '1px solid #555577' }}
            />
            <span>Scale tone</span>
          </span>
        )}
      </div>

      {/* Info box */}
      <div className="text-xs text-[#666688] bg-[#0f0f1e] border border-[#1e1e38] rounded-lg p-4 leading-relaxed">
        <strong className="text-[#8888b8]">How to read this:</strong> Each
        colored region is one of the 5 CAGED shapes. White rings mark root
        notes. Click a shape letter above (or in the legend) to isolate it.
        Toggle{' '}
        <em>Major Scale</em> to see all scale tones that fill the spaces between
        chord tones.
      </div>
    </main>
  );
}
