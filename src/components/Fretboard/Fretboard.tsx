import type { FretHighlight } from '@/data/lessons/types';
import { NOTE_NAMES } from '@/data/scales';

const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const STRING_NAMES_TOP = ['e', 'B', 'G', 'D', 'A', 'E'];
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

const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_DOT_FRETS = new Set([12, 24]);

const FILL_MAP = { root: '#5b7fff', accent: '#22dd88', default: '#2a2a4c' } as const;
const STROKE_MAP = { root: '#8eaaff', accent: '#66ffbb', default: '#6060a0' } as const;

function fretX(fret: number): number {
  return LEFT_PAD + NUT_X + fret * FRET_W;
}

function stringY(svgStringIdx: number): number {
  return TOP_PAD + svgStringIdx * STRING_H;
}

interface FretboardProps {
  highlights: FretHighlight[];
  highlightedDotKey?: string | null;
  onNoteClick?: (midiNote: number, label: string, dotKey: string) => void;
  interactive?: boolean;
}

export function Fretboard({ highlights, highlightedDotKey, onNoteClick, interactive }: FretboardProps) {
  // Build a lookup from "string-fret" to highlight info
  const hlMap = new Map<string, FretHighlight>();
  for (const h of highlights) {
    hlMap.set(`${h.string}-${h.fret}`, h);
  }

  const noteDots: React.ReactNode[] = [];

  for (let svgStr = 0; svgStr < NUM_STRINGS; svgStr++) {
    const midiStringIdx = NUM_STRINGS - 1 - svgStr;
    const cy = stringY(svgStr);

    for (let fret = 0; fret <= NUM_FRETS; fret++) {
      const midiNote = OPEN_MIDI[midiStringIdx] + fret;
      const pc = midiNote % 12;
      const key = `${midiStringIdx}-${fret}`;
      const hl = hlMap.get(key);
      if (!hl) continue;

      const dotKey = `${svgStr}-${fret}`;
      const isHighlighted = dotKey === highlightedDotKey;
      const cx =
        fret === 0
          ? LEFT_PAD + NUT_X / 2
          : fretX(fret) - FRET_W / 2;

      const color = hl.color ?? 'default';
      const fill = isHighlighted ? '#ffcc00' : FILL_MAP[color];
      const stroke = isHighlighted ? '#ffee66' : STROKE_MAP[color];
      const noteName = NOTE_NAMES[pc];

      noteDots.push(
        <g
          key={dotKey}
          onClick={onNoteClick ? () => onNoteClick(midiNote, noteName, dotKey) : undefined}
          style={{ cursor: onNoteClick || interactive ? 'pointer' : 'default' }}
          role={onNoteClick ? 'button' : undefined}
          aria-label={`${noteName} on ${STRING_NAMES_TOP[svgStr]} string fret ${fret}`}
        >
          <circle cx={cx} cy={cy} r={CIRCLE_R} fill={fill} stroke={stroke} strokeWidth="1.5" />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11"
            fontWeight="700"
            fill="white"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {noteName}
          </text>
        </g>,
      );
    }
  }

  const markerY = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 24;
  const markers: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    const cx = fretX(fret) - FRET_W / 2;
    if (SINGLE_DOT_FRETS.has(fret)) {
      markers.push(<circle key={`m${fret}`} cx={cx} cy={markerY} r={4} fill="#6060a0" />);
    } else if (DOUBLE_DOT_FRETS.has(fret)) {
      markers.push(
        <circle key={`m${fret}a`} cx={cx - 8} cy={markerY} r={4} fill="#6060a0" />,
        <circle key={`m${fret}b`} cx={cx + 8} cy={markerY} r={4} fill="#6060a0" />,
      );
    }
  }

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
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width={SVG_W} height={SVG_H} aria-label="Guitar fretboard">
      {Array.from({ length: NUM_STRINGS }, (_, i) => (
        <line
          key={`str${i}`}
          x1={LEFT_PAD}
          y1={stringY(i)}
          x2={SVG_W - RIGHT_PAD}
          y2={stringY(i)}
          stroke="#444466"
          strokeWidth={i === 0 ? 0.8 : i === NUM_STRINGS - 1 ? 1.8 : 1 + i * 0.2}
        />
      ))}
      <line
        x1={LEFT_PAD + NUT_X}
        y1={TOP_PAD - 4}
        x2={LEFT_PAD + NUT_X}
        y2={TOP_PAD + (NUM_STRINGS - 1) * STRING_H + 4}
        stroke="#aaaacc"
        strokeWidth="3"
        strokeLinecap="round"
      />
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
