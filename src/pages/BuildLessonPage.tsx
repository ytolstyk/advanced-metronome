import { useCallback, useEffect, useReducer, useRef } from 'react';
import './BuildLessonPage.css';

// Display order: row 0 = high e, row 5 = low E
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'] as const;
// Map display row → practiceNotes string index (0 = low E, 5 = high e)
const ROW_TO_STRING_IDX = [5, 4, 3, 2, 1, 0] as const;

const DEFAULT_COL_COUNT = 24;

interface GridState {
  cells: (string | null)[][];   // cells[col][row]
  barCols: boolean[];
  cursor: { col: number; row: number } | null;
  colCount: number;
  defaultBpm: number;
}

type Action =
  | { type: 'SET_CURSOR'; col: number; row: number }
  | { type: 'MOVE_CURSOR'; dCol: number; dRow: number }
  | { type: 'INPUT_DIGIT'; digit: string }
  | { type: 'CLEAR_CELL' }
  | { type: 'TOGGLE_BAR'; col: number }
  | { type: 'ADD_COL' }
  | { type: 'REMOVE_COL' }
  | { type: 'SET_BPM'; bpm: number };

function makeEmptyCols(n: number): (string | null)[][] {
  return Array.from({ length: n }, () => Array(6).fill(null) as (string | null)[]);
}

function nextNonBar(barCols: boolean[], from: number, dir: 1 | -1, max: number): number {
  let c = from + dir;
  while (c >= 0 && c < max) {
    if (!barCols[c]) return c;
    c += dir;
  }
  return from;
}

function init(): GridState {
  return {
    cells: makeEmptyCols(DEFAULT_COL_COUNT),
    barCols: Array(DEFAULT_COL_COUNT).fill(false) as boolean[],
    cursor: { col: 0, row: 0 },
    colCount: DEFAULT_COL_COUNT,
    defaultBpm: 80,
  };
}

function reducer(state: GridState, action: Action): GridState {
  switch (action.type) {
    case 'SET_CURSOR':
      if (state.barCols[action.col]) return state;
      return { ...state, cursor: { col: action.col, row: action.row } };

    case 'MOVE_CURSOR': {
      if (!state.cursor) return { ...state, cursor: { col: 0, row: 0 } };
      const { col, row } = state.cursor;
      let newCol = col;
      let newRow = row;
      if (action.dCol !== 0) {
        newCol = nextNonBar(state.barCols, col, action.dCol as 1 | -1, state.colCount);
      }
      if (action.dRow !== 0) {
        newRow = Math.max(0, Math.min(5, row + action.dRow));
      }
      return { ...state, cursor: { col: newCol, row: newRow } };
    }

    case 'INPUT_DIGIT': {
      if (!state.cursor) return state;
      const { col, row } = state.cursor;
      if (state.barCols[col]) return state;
      const current = state.cells[col][row];
      let next: string;
      if (current !== null && current.length === 1) {
        next = current + action.digit;
      } else {
        next = action.digit;
      }
      const newCells = state.cells.map((c, ci) =>
        ci === col ? c.map((v, ri) => (ri === row ? next : v)) : c,
      );
      return { ...state, cells: newCells };
    }

    case 'CLEAR_CELL': {
      if (!state.cursor) return state;
      const { col, row } = state.cursor;
      if (state.barCols[col]) return state;
      const newCells = state.cells.map((c, ci) =>
        ci === col ? c.map((v, ri) => (ri === row ? null : v)) : c,
      );
      return { ...state, cells: newCells };
    }

    case 'TOGGLE_BAR': {
      const newBarCols = state.barCols.map((b, i) => (i === action.col ? !b : b));
      // Clear cell data when making a bar col
      let newCells = state.cells;
      if (newBarCols[action.col]) {
        newCells = state.cells.map((c, ci) =>
          ci === action.col ? Array(6).fill(null) as (string | null)[] : c,
        );
      }
      // Move cursor away if it was on this col
      let newCursor = state.cursor;
      if (state.cursor && state.cursor.col === action.col && newBarCols[action.col]) {
        const next = nextNonBar(newBarCols, action.col, 1, state.colCount);
        newCursor = { col: next, row: state.cursor.row };
      }
      return { ...state, barCols: newBarCols, cells: newCells, cursor: newCursor };
    }

    case 'ADD_COL': {
      const newCount = state.colCount + 8;
      return {
        ...state,
        colCount: newCount,
        cells: [...state.cells, ...makeEmptyCols(8)],
        barCols: [...state.barCols, ...Array(8).fill(false)],
      };
    }

    case 'REMOVE_COL': {
      if (state.colCount <= 8) return state;
      const newCount = state.colCount - 8;
      const newCells = state.cells.slice(0, newCount);
      const newBarCols = state.barCols.slice(0, newCount);
      const newCursor = state.cursor && state.cursor.col >= newCount
        ? { col: newCount - 1, row: state.cursor.row }
        : state.cursor;
      return { ...state, colCount: newCount, cells: newCells, barCols: newBarCols, cursor: newCursor };
    }

    case 'SET_BPM':
      return { ...state, defaultBpm: action.bpm };

    default:
      return state;
  }
}

function buildJson(state: GridState) {
  const { cells, barCols, defaultBpm } = state;

  // Find last column that has any data (non-null cell or bar line)
  let lastUsed = -1;
  for (let ci = 0; ci < state.colCount; ci++) {
    if (barCols[ci] || cells[ci].some(v => v !== null)) lastUsed = ci;
  }
  const colCount = lastUsed + 1;

  const tab = STRING_LABELS.map((str, rowIdx) => ({
    string: str,
    steps: Array.from({ length: colCount }, (_, ci) =>
      barCols[ci] ? '|' : cells[ci][rowIdx],
    ),
  }));

  const seen = new Set<string>();
  const fretHighlights: { string: number; fret: number }[] = [];
  const practiceSteps: { string: number; fret: number }[] = [];

  for (let ci = 0; ci < colCount; ci++) {
    if (barCols[ci]) continue;
    for (let ri = 0; ri < 6; ri++) {
      const val = cells[ci][ri];
      if (val === null) continue;
      const fret = parseInt(val, 10);
      const stringIdx = ROW_TO_STRING_IDX[ri];
      practiceSteps.push({ string: stringIdx, fret });
      const key = `${stringIdx}-${fret}`;
      if (!seen.has(key)) {
        seen.add(key);
        fretHighlights.push({ string: stringIdx, fret });
      }
    }
  }

  return {
    tab,
    fretHighlights,
    practiceNotes: { steps: practiceSteps, defaultBpm },
  };
}

function serializeLesson(data: ReturnType<typeof buildJson>): string {
  const tabLines = data.tab
    .map(line => `    ${JSON.stringify(line)}`)
    .join(',\n');
  const highlightLines = data.fretHighlights
    .map(h => `    ${JSON.stringify(h)}`)
    .join(',\n');
  const stepLines = data.practiceNotes.steps
    .map(s => `      ${JSON.stringify(s)}`)
    .join(',\n');

  return [
    '{',
    '  "tab": [',
    tabLines,
    '  ],',
    '  "fretHighlights": [',
    highlightLines,
    '  ],',
    '  "practiceNotes": {',
    `    "steps": [`,
    stepLines,
    '    ],',
    `    "defaultBpm": ${data.practiceNotes.defaultBpm}`,
    '  }',
    '}',
  ].join('\n');
}

export function BuildLessonPage() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'MOVE_CURSOR', dCol: -1, dRow: 0 }); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'MOVE_CURSOR', dCol: 1, dRow: 0 }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'MOVE_CURSOR', dCol: 0, dRow: -1 }); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'MOVE_CURSOR', dCol: 0, dRow: 1 }); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); dispatch({ type: 'CLEAR_CELL' }); return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); dispatch({ type: 'INPUT_DIGIT', digit: e.key }); return; }
    },
    [],
  );

  // Auto-focus the grid on mount
  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  const handleDownload = useCallback(() => {
    const data = buildJson(state);
    const blob = new Blob([serializeLesson(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lesson-tab.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const { cells, barCols, cursor, colCount, defaultBpm } = state;

  return (
    <div className="build-lesson-page">
      <h1>Lesson Tab Builder</h1>
      <div className="build-lesson-grid-wrapper">
        <div
          ref={gridRef}
          className="build-lesson-grid"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {/* Checkbox row */}
          <div className="build-lesson-checkrow">
            <span className="build-lesson-string-label-spacer" />
            <span className="build-lesson-open-bar" />
            {Array.from({ length: colCount }, (_, ci) => (
              <span
                key={ci}
                className={`build-lesson-checkbox-cell${barCols[ci] ? ' bar-col' : ''}`}
              >
                {!barCols[ci] && (
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => dispatch({ type: 'TOGGLE_BAR', col: ci })}
                    onMouseDown={e => e.stopPropagation()}
                    title="Insert bar line"
                  />
                )}
                {barCols[ci] && (
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => dispatch({ type: 'TOGGLE_BAR', col: ci })}
                    onMouseDown={e => e.stopPropagation()}
                    title="Remove bar line"
                  />
                )}
              </span>
            ))}
          </div>

          {/* String rows */}
          {STRING_LABELS.map((label, rowIdx) => (
            <div key={label} className="build-lesson-string-row">
              <span className="build-lesson-string-label">{label}</span>
              <span className="build-lesson-open-bar-cell">|</span>
              {Array.from({ length: colCount }, (_, ci) => {
                const isBar = barCols[ci];
                const isCursor = !isBar && cursor?.col === ci && cursor?.row === rowIdx;
                const val = isBar ? '|' : cells[ci][rowIdx];
                const display = isBar ? '|' : (val !== null ? val.padEnd(2, '-') : '--');
                return (
                  <span
                    key={ci}
                    className={[
                      'build-lesson-cell',
                      isBar ? 'bar-col' : '',
                      isCursor ? 'cursor' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => !isBar && dispatch({ type: 'SET_CURSOR', col: ci, row: rowIdx })}
                  >
                    {display}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="build-lesson-controls">
        <button className="build-lesson-btn" onClick={() => dispatch({ type: 'ADD_COL' })}>+ 8 cols</button>
        <button className="build-lesson-btn" onClick={() => dispatch({ type: 'REMOVE_COL' })}>- 8 cols</button>
        <label className="build-lesson-bpm-group">
          BPM:
          <input
            type="number"
            className="build-lesson-bpm-input"
            value={defaultBpm}
            min={20}
            max={400}
            onChange={e => dispatch({ type: 'SET_BPM', bpm: parseInt(e.target.value, 10) || 80 })}
          />
        </label>
        <button className="build-lesson-btn primary" onClick={handleDownload}>Download JSON</button>
      </div>

      <p className="build-lesson-hint">
        Click a cell to focus · Arrow keys to navigate · 0–9 to enter fret numbers (two digits: type first then second) · Backspace to clear · Checkboxes insert bar lines
      </p>
    </div>
  );
}
