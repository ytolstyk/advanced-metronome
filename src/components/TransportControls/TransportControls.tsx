import { useState } from 'react';
import type { AppState } from '../../types';
import type { Action } from '../../state';
import { MIN_BPM, MAX_BPM, MAX_MEASURES } from '../../constants';
import { PRESETS } from '../../presets';
import { loadUserPresets, saveUserPresets } from '../../userPresets';
import type { UserPreset } from '../../userPresets';
import './TransportControls.css';

interface TransportControlsProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onTogglePlayback: () => void;
  onStop: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function TransportControls({
  state,
  dispatch,
  onTogglePlayback,
  onStop,
  onUndo,
  canUndo,
}: TransportControlsProps) {
  const { bpm, loopCount, measures } = state.config;

  const [bpmDraft, setBpmDraft] = useState('');
  const [bpmFocused, setBpmFocused] = useState(false);

  // Preset select — values are prefixed: "builtin:<name>" or "user:<id>"
  const [selectedPreset, setSelectedPreset] = useState('');
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const [presetName, setPresetName] = useState('');

  const commitBpm = () => {
    const parsed = parseInt(bpmDraft, 10);
    const clamped = isNaN(parsed) ? bpm : Math.min(MAX_BPM, Math.max(MIN_BPM, parsed));
    dispatch({ type: 'SET_BPM', bpm: clamped });
  };

  const applySelectedPreset = () => {
    if (selectedPreset.startsWith('builtin:')) {
      const name = selectedPreset.slice(8);
      const preset = PRESETS.find((p) => p.name === name);
      if (preset) dispatch({ type: 'APPLY_PRESET', preset });
    } else if (selectedPreset.startsWith('user:')) {
      const id = selectedPreset.slice(5);
      const up = userPresets.find((p) => p.id === id);
      if (up) dispatch({ type: 'APPLY_USER_PRESET', config: up.config, pattern: up.pattern });
    }
    setSelectedPreset('');
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset.startsWith('user:')) return;
    const id = selectedPreset.slice(5);
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    saveUserPresets(updated);
    setSelectedPreset('');
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const newPreset: UserPreset = {
      id: Date.now().toString(),
      name,
      config: state.config,
      pattern: state.pattern,
    };
    const updated = [...userPresets, newPreset];
    setUserPresets(updated);
    saveUserPresets(updated);
    setPresetName('');
  };

  const isUserPresetSelected = selectedPreset.startsWith('user:');

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
          className="transport-btn transport-btn--undo"
          onClick={onUndo}
          disabled={!canUndo}
          type="button"
          title="Undo (Ctrl+Z)"
        >
          ↩
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
          <optgroup label="Built-in">
            {PRESETS.map((p) => (
              <option key={p.name} value={`builtin:${p.name}`}>{p.name}</option>
            ))}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label="Saved">
              {userPresets.map((p) => (
                <option key={p.id} value={`user:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          className="preset-apply-btn"
          disabled={!selectedPreset}
          onClick={applySelectedPreset}
        >
          Apply
        </button>
        {isUserPresetSelected && (
          <button
            type="button"
            className="preset-delete-btn"
            onClick={deleteSelectedPreset}
            title="Delete this preset"
          >
            ✕
          </button>
        )}
      </div>

      <div className="save-preset-row">
        <span className="preset-row-label">Save</span>
        <input
          type="text"
          className="save-preset-input"
          placeholder="Name this beat…"
          value={presetName}
          maxLength={40}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
        />
        <button
          type="button"
          className="preset-apply-btn"
          disabled={!presetName.trim()}
          onClick={handleSavePreset}
        >
          Save
        </button>
      </div>
    </div>
  );
}
