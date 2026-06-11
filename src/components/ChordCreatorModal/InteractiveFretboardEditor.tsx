import { detectBarre } from '../../data/chords';

// SVG layout constants (matching ChordsPage diagram renderer)
const STRING_X_START = 14;
const STRING_SPACING = 14.4;
const FRET_Y_START = 18;
const FRET_SPACING = 21;
const FRETS_SHOWN = 5;
const NUT_Y = FRET_Y_START;
const SVG_H = 140;
const MAX_EDITOR_FRET = 20;

function sx(i: number): number {
  return STRING_X_START + i * STRING_SPACING;
}

function dotY(fretNum: number, visibleStart: number): number {
  return FRET_Y_START + (fretNum - visibleStart) * FRET_SPACING + FRET_SPACING / 2;
}

interface Props {
  frets: number[];
  editorStartFret: number;
  stringNames: string[];
  onFretsChange: (frets: number[]) => void;
  onEditorStartFretChange: (startFret: number) => void;
}

export function InteractiveFretboardEditor({
  frets,
  editorStartFret,
  stringNames,
  onFretsChange,
  onEditorStartFretChange,
}: Props) {
  const numStrings = frets.length;
  const svgWidth = STRING_X_START + (numStrings - 1) * STRING_SPACING + 18 + STRING_X_START;
  const isOpenPosition = editorStartFret <= 1;
  const barre = detectBarre(frets);

  function handleOpenZoneClick(si: number) {
    const updated = [...frets];
    updated[si] = updated[si] === 0 ? -1 : 0;
    onFretsChange(updated);
  }

  function handleFretClick(si: number, fretNumber: number) {
    const updated = [...frets];
    updated[si] = updated[si] === fretNumber ? -1 : fretNumber;
    onFretsChange(updated);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-3">
        <button
          className="px-2 py-0.5 text-[0.8rem] text-[#9898c8] hover:text-[#ccd6ff] border border-[#505270] rounded disabled:opacity-30 transition-colors"
          onClick={() => onEditorStartFretChange(Math.max(1, editorStartFret - 1))}
          disabled={editorStartFret <= 1}
          type="button"
          aria-label="Scroll up one fret"
        >▲</button>
        <span className="text-[0.75rem] text-[#9898c8] min-w-[100px] text-center">
          {editorStartFret === 1 ? 'Open position' : `Frets ${editorStartFret}–${editorStartFret + FRETS_SHOWN - 1}`}
        </span>
        <button
          className="px-2 py-0.5 text-[0.8rem] text-[#9898c8] hover:text-[#ccd6ff] border border-[#505270] rounded disabled:opacity-30 transition-colors"
          onClick={() => onEditorStartFretChange(Math.min(MAX_EDITOR_FRET, editorStartFret + 1))}
          disabled={editorStartFret >= MAX_EDITOR_FRET}
          type="button"
          aria-label="Scroll down one fret"
        >▼</button>
      </div>

      <svg
        viewBox={`0 0 ${svgWidth} ${SVG_H}`}
        className="w-full max-w-[260px] touch-none select-none"
        aria-label="Interactive fretboard editor"
      >
        {/* String lines */}
        {frets.map((_, i) => (
          <line key={`sl${i}`}
            x1={sx(i)} y1={FRET_Y_START}
            x2={sx(i)} y2={FRET_Y_START + FRET_SPACING * FRETS_SHOWN}
            stroke="#888" strokeWidth="1"
          />
        ))}

        {/* Fret lines */}
        {Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => {
          const y = FRET_Y_START + f * FRET_SPACING;
          const isNut = f === 0 && isOpenPosition;
          return (
            <line key={`fl${f}`}
              x1={sx(0)} y1={y}
              x2={sx(numStrings - 1)} y2={y}
              stroke={isNut ? '#eee' : '#888'}
              strokeWidth={isNut ? 3 : 1}
            />
          );
        })}

        {/* Open/muted/out-of-range indicators above nut */}
        {frets.map((fret, i) => {
          const outOfRange = fret > 0 &&
            (fret < editorStartFret || fret >= editorStartFret + FRETS_SHOWN);
          if (outOfRange) {
            return (
              <text key={`m${i}`} x={sx(i)} y={NUT_Y - 4}
                textAnchor="middle" fontSize="9" fill="#5b7fff">
                {fret}fr
              </text>
            );
          }
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
        })}

        {/* Barre */}
        {barre && (() => {
          const bf = barre.fret;
          if (bf < editorStartFret || bf >= editorStartFret + FRETS_SHOWN) return null;
          const x1 = sx(barre.fromString - 1);
          const x2 = sx(barre.toString - 1);
          const y = dotY(bf, editorStartFret);
          return (
            <rect key="barre"
              x={Math.min(x1, x2) - 5.5} y={y - 5.5}
              width={Math.abs(x2 - x1) + 11} height={11}
              rx="5.5" fill="#5b7fff" opacity="0.9"
            />
          );
        })()}

        {/* Fret dots */}
        {frets.map((fret, i) => {
          if (fret <= 0) return null;
          if (fret < editorStartFret || fret >= editorStartFret + FRETS_SHOWN) return null;
          if (barre && fret === barre.fret && i >= barre.fromString - 1 && i <= barre.toString - 1) return null;
          return (
            <circle key={`d${i}`}
              cx={sx(i)} cy={dotY(fret, editorStartFret)}
              r={5.5} fill="#5b7fff"
            />
          );
        })}

        {/* Fret position label */}
        {!isOpenPosition && (
          <text
            x={svgWidth - 2}
            y={FRET_Y_START + FRET_SPACING / 2}
            textAnchor="end" fontSize="14" fill="#bbb" dominantBaseline="middle"
          >
            {editorStartFret}fr
          </text>
        )}

        {/* String name labels */}
        {frets.map((_, i) => (
          <text key={`sn${i}`}
            x={sx(i)} y={FRET_Y_START + FRET_SPACING * FRETS_SHOWN + 12}
            textAnchor="middle" fontSize="9" fill="#666"
          >
            {stringNames[i]}
          </text>
        ))}

        {/* Hit areas: open/muted zone (above nut) */}
        {frets.map((_, i) => (
          <rect
            key={`oh${i}`}
            x={sx(i) - 7} y={1}
            width={14} height={FRET_Y_START - 3}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => handleOpenZoneClick(i)}
          />
        ))}

        {/* Hit areas: fret cells */}
        {Array.from({ length: FRETS_SHOWN }).flatMap((_, row) => {
          const fretNumber = editorStartFret + row;
          return frets.map((_, i) => (
            <rect
              key={`fh${row}-${i}`}
              x={sx(i) - 7} y={FRET_Y_START + row * FRET_SPACING + 1}
              width={14} height={FRET_SPACING - 2}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => handleFretClick(i, fretNumber)}
            />
          ));
        })}
      </svg>

      <p className="text-[0.68rem] text-[#505270] text-center leading-relaxed">
        Click a fret to place a dot · click again to mute<br />
        Click ○/× above nut to toggle open/mute
      </p>
    </div>
  );
}
