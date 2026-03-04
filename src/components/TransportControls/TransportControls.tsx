import { useState } from 'react';
import type { AppState } from '../../types';
import type { Action } from '../../state';
import { MIN_BPM, MAX_BPM, MAX_MEASURES } from '../../constants';
import { PRESETS } from '../../presets';
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

  const [bpmDraft, setBpmDraft] = useState('');
  const [bpmFocused, setBpmFocused] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');

  const commitBpm = () => {
    const parsed = parseInt(bpmDraft, 10);
    const clamped = isNaN(parsed) ? bpm : Math.min(MAX_BPM, Math.max(MIN_BPM, parsed));
    dispatch({ type: 'SET_BPM', bpm: clamped });
  };

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
          <span className="bpm-label-row">
            BPM
            <input
              type="number"
              className="bpm-number-input"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpmFocused ? bpmDraft : String(bpm)}
              onChange={(e) => setBpmDraft(e.target.value)}
              onFocus={() => { setBpmDraft(String(bpm)); setBpmFocused(true); }}
              onBlur={() => { setBpmFocused(false); commitBpm(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBpm();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </span>
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

      <div className="preset-row">
        <span className="preset-row-label">Preset</span>
        <select
          className="preset-select"
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value)}
        >
          <option value="">— select —</option>
          {PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="preset-apply-btn"
          disabled={!selectedPreset}
          onClick={() => {
            const preset = PRESETS.find((p) => p.name === selectedPreset);
            if (preset) {
              dispatch({ type: 'APPLY_PRESET', preset });
              setSelectedPreset('');
            }
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
