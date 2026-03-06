import { useState, useMemo } from 'react';
import type { RootNote, ChordType, ChordVoicing } from '../data/chords';
import {
  CHORD_DATABASE,
  CHORD_TYPE_LABELS,
  CHORD_TYPES,
  ROOT_NOTES,
  chordName,
} from '../data/chords';
import './ChordsPage.css';

// ── SVG constants ───────────────────────────────────────────────────────────
const SVG_H = 120;
const SVG_TOTAL_W = 118; // wider than fretboard to give room for fret label
const STRING_X_START = 14;  // low E (string index 0)
const STRING_SPACING = 14.4;
const FRET_Y_START = 18;
const FRET_SPACING = 21;
const FRETS_SHOWN = 5;
const NUT_Y = FRET_Y_START;

// String x position: string 0 = low E (left), string 5 = high e (right)
function stringX(idx: number): number {
  return STRING_X_START + idx * STRING_SPACING;
}

// Fret y position (center of the fret space above that fret line)
function dotY(fretNum: number, visibleStart: number): number {
  return FRET_Y_START + (fretNum - visibleStart) * FRET_SPACING + FRET_SPACING / 2;
}

// ── FretboardDiagram ────────────────────────────────────────────────────────
function FretboardDiagram({ voicing }: { voicing: ChordVoicing }) {
  const { frets, barre, startFret = 1 } = voicing;
  const visibleStart = startFret;
  const isOpenPosition = startFret <= 1;

  // String lines (vertical)
  const stringLines = frets.map((_, i) => (
    <line
      key={`s${i}`}
      x1={stringX(i)} y1={FRET_Y_START}
      x2={stringX(i)} y2={FRET_Y_START + FRET_SPACING * FRETS_SHOWN}
      stroke="#555" strokeWidth="1"
    />
  ));

  // Fret lines (horizontal)
  const fretLines = Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => {
    const y = FRET_Y_START + f * FRET_SPACING;
    const isNut = f === 0 && isOpenPosition;
    return (
      <line
        key={`f${f}`}
        x1={stringX(0)} y1={y}
        x2={stringX(5)} y2={y}
        stroke={isNut ? '#ccc' : '#555'}
        strokeWidth={isNut ? 3 : 1}
      />
    );
  });

  // Open / muted markers above nut
  const markers = frets.map((fret, i) => {
    if (fret === 0) {
      return (
        <text key={`m${i}`} x={stringX(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#888">○</text>
      );
    }
    if (fret === -1) {
      return (
        <text key={`m${i}`} x={stringX(i)} y={NUT_Y - 4}
          textAnchor="middle" fontSize="14" fill="#666">×</text>
      );
    }
    return null;
  });

  // Barre bar
  const barreEl = barre ? (() => {
    const x1 = stringX(barre.fromString - 1);
    const x2 = stringX(barre.toString - 1);
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

  // Finger dots
  const dots = frets.map((fret, i) => {
    if (fret <= 0) return null;
    // Skip strings already covered by barre visually (the barre rect covers them)
    // Still render so they show on top of the barre for clarity at higher frets
    if (barre && fret === barre.fret && i >= barre.fromString - 1 && i <= barre.toString - 1) {
      return null; // barre rect handles these
    }
    const cx = stringX(i);
    const cy = dotY(fret, visibleStart);
    return (
      <circle key={`d${i}`} cx={cx} cy={cy} r={5.5} fill="#5b7fff" />
    );
  });

  // Fret label (e.g. "3fr") when not open position
  const fretLabel = !isOpenPosition ? (
    <text x={SVG_TOTAL_W - 2} y={FRET_Y_START + FRET_SPACING / 2}
      textAnchor="end" fontSize="14" fill="#888" dominantBaseline="middle">
      {startFret}fr
    </text>
  ) : null;

  return (
    <svg viewBox={`0 0 ${SVG_TOTAL_W} ${SVG_H}`} className="chord-diagram-svg"
      aria-hidden="true">
      {stringLines}
      {fretLines}
      {markers}
      {barreEl}
      {dots}
      {fretLabel}
    </svg>
  );
}

// ── TabView ─────────────────────────────────────────────────────────────────
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']; // high to low

function TabView({ voicing }: { voicing: ChordVoicing }) {
  const { frets } = voicing;
  // frets[5] = high e, frets[0] = low E — display high to low
  const lines = STRING_NAMES.map((name, i) => {
    const fret = frets[5 - i];
    const label = fret === -1 ? 'x' : String(fret);
    return (
      <div key={name} className="chord-tab-line">
        <span className="chord-tab-string">{name}</span>
        <span className="chord-tab-fret">{`|--${label.padEnd(2, '-')}|`}</span>
      </div>
    );
  });
  return <div className="chord-tab">{lines}</div>;
}

// ── ChordCard ────────────────────────────────────────────────────────────────
function ChordCard({
  root, type, voicing, viewMode,
}: {
  root: RootNote;
  type: ChordType;
  voicing: ChordVoicing;
  viewMode: 'fretboard' | 'tab';
}) {
  return (
    <div className="chord-card">
      <div className="chord-card-name">{chordName(root, type)}</div>
      {viewMode === 'fretboard'
        ? <FretboardDiagram voicing={voicing} />
        : <TabView voicing={voicing} />
      }
    </div>
  );
}

// ── ChordsPage ───────────────────────────────────────────────────────────────
export function ChordsPage() {
  const [selectedKey, setSelectedKey] = useState<RootNote | 'all'>('all');
  const [selectedType, setSelectedType] = useState<ChordType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'fretboard' | 'tab'>('fretboard');

  const filtered = useMemo(() =>
    CHORD_DATABASE.filter(e =>
      (selectedKey === 'all' || e.root === selectedKey) &&
      (selectedType === 'all' || e.type === selectedType)
    ),
    [selectedKey, selectedType]
  );

  return (
    <div className="chords-page">
      <div className="chords-filter-bar">

        {/* Key selector */}
        <div className="chords-key-btns">
          <span className="chords-section-label" style={{ alignSelf: 'center', marginRight: 4 }}>Key</span>
          <button
            className={`chord-key-btn${selectedKey === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedKey('all')}
          >
            All
          </button>
          {ROOT_NOTES.map(note => (
            <button
              key={note}
              className={`chord-key-btn${selectedKey === note ? ' active' : ''}`}
              onClick={() => setSelectedKey(note)}
            >
              {note}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="chords-key-btns">
          <span className="chords-section-label" style={{ alignSelf: 'center', marginRight: 4 }}>Type</span>
          <button
            className={`chord-key-btn${selectedType === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedType('all')}
          >
            All
          </button>
          {CHORD_TYPES.map(t => (
            <button
              key={t}
              className={`chord-key-btn${selectedType === t ? ' active' : ''}`}
              onClick={() => setSelectedType(t)}
            >
              {CHORD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="chords-type-row">
          <div className="chords-view-toggle">
            <button
              className={`chords-view-btn${viewMode === 'fretboard' ? ' active' : ''}`}
              onClick={() => setViewMode('fretboard')}
            >
              Diagram
            </button>
            <button
              className={`chords-view-btn${viewMode === 'tab' ? ' active' : ''}`}
              onClick={() => setViewMode('tab')}
            >
              Tab
            </button>
          </div>
        </div>
      </div>

      <div className="chords-grid">
        {filtered.length === 0 && (
          <div className="chords-empty">No chords found.</div>
        )}
        {filtered.map(entry => (
          <ChordCard
            key={`${entry.root}-${entry.type}`}
            root={entry.root}
            type={entry.type}
            voicing={entry.voicings[0]}
            viewMode={viewMode}
          />
        ))}
      </div>
    </div>
  );
}
