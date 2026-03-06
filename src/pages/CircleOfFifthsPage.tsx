import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// ── Data ─────────────────────────────────────────────────────────────────────

const CIRCLE = [
  { major: 'C',  minor: 'Am',  sharps: 0, flats: 0 },
  { major: 'G',  minor: 'Em',  sharps: 1, flats: 0 },
  { major: 'D',  minor: 'Bm',  sharps: 2, flats: 0 },
  { major: 'A',  minor: 'F#m', sharps: 3, flats: 0 },
  { major: 'E',  minor: 'C#m', sharps: 4, flats: 0 },
  { major: 'B',  minor: 'G#m', sharps: 5, flats: 0 },
  { major: 'F#', minor: 'D#m', sharps: 6, flats: 0 },
  { major: 'Db', minor: 'Bbm', sharps: 0, flats: 5 },
  { major: 'Ab', minor: 'Fm',  sharps: 0, flats: 4 },
  { major: 'Eb', minor: 'Cm',  sharps: 0, flats: 3 },
  { major: 'Bb', minor: 'Gm',  sharps: 0, flats: 2 },
  { major: 'F',  minor: 'Dm',  sharps: 0, flats: 1 },
] as const;

function keySigLabel(sharps: number, flats: number): string {
  if (sharps === 0 && flats === 0) return '♮';
  if (sharps > 0) return `${sharps}♯`;
  return `${flats}♭`;
}

function getRelationship(from: number, to: number): 'best' | 'good' | null {
  const dist = Math.min(Math.abs(from - to), 12 - Math.abs(from - to));
  if (dist === 1) return 'best';
  if (dist === 2) return 'good';
  return null;
}

function majorColor(pos: number, lit = false): string {
  return `hsl(${pos * 30}, ${lit ? 75 : 62}%, ${lit ? 52 : 40}%)`;
}

function minorColor(pos: number, lit = false): string {
  return `hsl(${pos * 30}, ${lit ? 55 : 42}%, ${lit ? 36 : 26}%)`;
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

const CX = 300;
const CY = 300;
const SLICE = (2 * Math.PI) / 12;

function startAngle(i: number, rootOffset: number): number {
  return (i - rootOffset) * SLICE - Math.PI / 2;
}

function wedgePath(
  cx: number, cy: number,
  r1: number, r2: number,
  a1: number, a2: number,
): string {
  const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
  const cos2 = Math.cos(a2), sin2 = Math.sin(a2);
  const x1 = cx + r2 * cos1, y1 = cy + r2 * sin1;
  const x2 = cx + r2 * cos2, y2 = cy + r2 * sin2;
  const x3 = cx + r1 * cos2, y3 = cy + r1 * sin2;
  const x4 = cx + r1 * cos1, y4 = cy + r1 * sin1;
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${r2} ${r2} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${r1} ${r1} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

function segmentCenter(i: number, rootOffset: number): { x: number; y: number } {
  const a = startAngle(i, rootOffset) + SLICE / 2;
  const r = (164 + 262) / 2;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function textPoint(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// ── Shared class ─────────────────────────────────────────────────────────────

const FILTER_ITEM_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#353650] bg-[#1e1f2c] text-[#777] ' +
  'hover:bg-[#1e1f2c] hover:border-[#555] hover:text-[#bbb] ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]';

// ── Page ─────────────────────────────────────────────────────────────────────

export function CircleOfFifthsPage() {
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [hoveredKey, setHoveredKey]   = useState<number | null>(null);
  const [rootOffset, setRootOffset]   = useState(0);

  function handleSegmentClick(i: number) {
    setSelectedKey(prev => (prev === i ? null : i));
  }

  // Which positions should be "lit"
  function isLit(i: number): boolean {
    if (hoveredKey !== null) {
      if (i === hoveredKey) return true;
      const dist = Math.min(Math.abs(i - hoveredKey), 12 - Math.abs(i - hoveredKey));
      return dist === 1;
    }
    if (selectedKey !== null && i === selectedKey) return true;
    return false;
  }

  const selectedEntry = selectedKey !== null ? CIRCLE[selectedKey] : null;
  const neighbours = selectedKey !== null
    ? CIRCLE.map((k, i) => ({ ...k, i })).filter(({ i }) => {
        const dist = Math.min(
          Math.abs(i - selectedKey),
          12 - Math.abs(i - selectedKey),
        );
        return dist === 1;
      })
    : [];

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 pb-12 max-w-[700px] mx-auto">

      {/* Orientation toolbar */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#7070a0] mr-1 whitespace-nowrap">
          Root at top
        </span>
        <ToggleGroup
          type="single"
          value={CIRCLE[rootOffset].major}
          onValueChange={v => {
            if (v) {
              const idx = CIRCLE.findIndex(k => k.major === v);
              if (idx !== -1) setRootOffset(idx);
            }
          }}
          className="flex flex-wrap justify-start gap-1"
        >
          {CIRCLE.map(k => (
            <ToggleGroupItem key={k.major} value={k.major} className={FILTER_ITEM_CLS}>
              {k.major}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* SVG circle */}
      <div className="w-full max-w-[600px] mx-auto">
        <svg viewBox="0 0 600 600" className="w-full" aria-label="Circle of Fifths">

          {/* Drop shadow filter */}
          <defs>
            <filter id="txt-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Connection lines (below segments) */}
          {selectedKey !== null && CIRCLE.map((_, i) => {
            const rel = getRelationship(selectedKey, i);
            if (!rel || i === selectedKey) return null;
            const from = segmentCenter(selectedKey, rootOffset);
            const to   = segmentCenter(i, rootOffset);
            return (
              <line
                key={`line-${i}`}
                x1={from.x} y1={from.y}
                x2={to.x}   y2={to.y}
                stroke={rel === 'best' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)'}
                strokeWidth={rel === 'best' ? 4 : 2}
                strokeDasharray={rel === 'good' ? '6 4' : undefined}
              />
            );
          })}

          {/* Segments */}
          {CIRCLE.map((entry, i) => {
            const a1 = startAngle(i, rootOffset);
            const a2 = a1 + SLICE;
            const midAngle = a1 + SLICE / 2;
            const lit = isLit(i);
            const isSelected = selectedKey === i;

            // Major ring text position
            const majorPt = textPoint(CX, CY, (164 + 262) / 2, midAngle);
            // Minor ring text position
            const minorPt = textPoint(CX, CY, (82 + 160) / 2, midAngle);

            return (
              <g
                key={entry.major}
                style={{ cursor: 'pointer' }}
                onClick={() => handleSegmentClick(i)}
                onMouseEnter={() => setHoveredKey(i)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                {/* Major ring */}
                <path
                  d={wedgePath(CX, CY, 164, 262, a1, a2)}
                  fill={majorColor(i, lit)}
                  stroke="#0a0a0a"
                  strokeWidth="1.5"
                  opacity={isSelected ? 1 : lit ? 0.95 : 0.85}
                />
                {/* Minor ring */}
                <path
                  d={wedgePath(CX, CY, 82, 160, a1, a2)}
                  fill={minorColor(i, lit)}
                  stroke="#0a0a0a"
                  strokeWidth="1.5"
                  opacity={isSelected ? 1 : lit ? 0.95 : 0.85}
                />
                {/* Major label */}
                <text
                  x={majorPt.x}
                  y={majorPt.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="22"
                  fontWeight="700"
                  fill="white"
                  filter="url(#txt-shadow)"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {entry.major}
                </text>
                {/* Minor label */}
                <text
                  x={minorPt.x}
                  y={minorPt.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="13"
                  fontWeight="500"
                  fill="#ccc"
                  filter="url(#txt-shadow)"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {entry.minor}
                </text>
              </g>
            );
          })}

          {/* Rim */}
          <circle cx={CX} cy={CY} r={276} fill="none" stroke="#333" strokeWidth="2" />
          <circle cx={CX} cy={CY} r={264} fill="none" stroke="#333" strokeWidth="1" />

          {/* Center circle */}
          <circle cx={CX} cy={CY} r={78} fill="#111" stroke="#2a2a2a" strokeWidth="1.5" />
          {selectedEntry ? (
            <>
              <text
                x={CX} y={CY - 12}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="20"
                fontWeight="700"
                fill="#e0e0e0"
                style={{ userSelect: 'none' }}
              >
                {selectedEntry.major}
              </text>
              <text
                x={CX} y={CY + 12}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="16"
                fill="#aaa"
                style={{ userSelect: 'none' }}
              >
                {keySigLabel(selectedEntry.sharps, selectedEntry.flats)}
              </text>
            </>
          ) : (
            <text
              x={CX} y={CY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="13"
              fill="#555"
              style={{ userSelect: 'none' }}
            >
              select a key
            </text>
          )}
        </svg>
      </div>

      {/* Info panel */}
      {selectedEntry && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 rounded-xl bg-[#1e1f2c] border border-[#353650] text-sm">
          <span className="text-[#f0f0f0] font-bold text-base">
            {selectedEntry.major} Major
          </span>
          <span>
            <span className="text-[#888]">relative minor: </span>
            <span className="text-[#8eaaff] font-semibold">{selectedEntry.minor}</span>
          </span>
          <span>
            <span className="text-[#888]">key signature: </span>
            <span className="text-[#f0f0f0] font-semibold">
              {keySigLabel(selectedEntry.sharps, selectedEntry.flats)}
            </span>
          </span>
          {neighbours.length > 0 && (
            <span>
              <span className="text-[#888]">neighbours: </span>
              <span className="text-[#f0f0f0] font-semibold">
                {neighbours.map(n => n.major).join(' · ')}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
