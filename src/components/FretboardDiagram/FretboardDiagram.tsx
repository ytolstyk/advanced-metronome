import { memo } from 'react';

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

export interface FretDiagramVoicing {
  frets: number[];
  barre?: { fret: number; fromString: number; toString: number };
  startFret?: number;
}

export const FretboardDiagram = memo(function FretboardDiagram({
  voicing, stringNames, leftHanded, color = '#5b7fff',
}: {
  voicing: FretDiagramVoicing;
  stringNames?: string[];
  leftHanded?: boolean;
  color?: string;
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
        rx="5.5" fill={color} opacity="0.9"
      />
    );
  })() : null;

  const dots = frets.map((fret, i) => {
    if (fret <= 0) return null;
    if (barre && fret === barre.fret && i >= barre.fromString - 1 && i <= barre.toString - 1) {
      return null;
    }
    return <circle key={`d${i}`} cx={sx(i)} cy={dotY(fret, visibleStart)} r={5.5} fill={color} />;
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
  const stringLabels = stringNames ? frets.map((_, i) => (
    <text key={`n${i}`} x={sx(i)} y={STRING_LABEL_Y}
      textAnchor="middle" fontSize="9" fill="#666">
      {stringNames[i]}
    </text>
  )) : null;

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
});
