import type { AppState } from '../../types';
import type { Action } from '../../state';
import { MIN_BPM, MAX_BPM, MAX_MEASURES } from '../../constants';
import './TransportControls.css';

interface TransportControlsProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onTogglePlayback: () => void;
  onStop: () => void;
}

export function TransportControls({
  state,
  dispatch,
  onTogglePlayback,
  onStop,
}: TransportControlsProps) {
  const { bpm, loopCount, measures } = state.config;

  return (
    <div className="transport-controls">
      <div className="transport-buttons">
        <button
          className="transport-btn transport-btn--play"
          onClick={onTogglePlayback}
          type="button"
        >
          {state.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="transport-btn transport-btn--stop"
          onClick={onStop}
          type="button"
        >
          ⏹
        </button>
        <button
          className="transport-btn transport-btn--clear"
          onClick={() => dispatch({ type: 'CLEAR_PATTERN' })}
          type="button"
        >
          Clear
        </button>
      </div>

      <div className="transport-controls-group">
        <label className="transport-label">
          BPM: {bpm}
          <input
            type="range"
            className="transport-slider"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) =>
              dispatch({ type: 'SET_BPM', bpm: Number(e.target.value) })
            }
          />
        </label>

        <label className="transport-label">
          Measures: {measures.length}
          <input
            type="range"
            className="transport-slider"
            min={1}
            max={MAX_MEASURES}
            value={measures.length}
            onChange={(e) =>
              dispatch({
                type: 'SET_MEASURE_COUNT',
                count: Number(e.target.value),
              })
            }
          />
        </label>

        <label className="transport-label">
          Loops: {loopCount === 0 ? '∞' : loopCount}
          <input
            type="range"
            className="transport-slider"
            min={0}
            max={16}
            value={loopCount}
            onChange={(e) =>
              dispatch({
                type: 'SET_LOOP_COUNT',
                loopCount: Number(e.target.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
