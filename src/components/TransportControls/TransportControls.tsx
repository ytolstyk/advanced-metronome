import { useState } from 'react';
import type { AppState } from '../../types';
import type { Action } from '../../state';
import { MIN_BPM, MAX_BPM, MAX_MEASURES } from '../../constants';
import { exportDrumLoop } from '../../audio/exportAudio';
import { PRESETS } from '../../presets';
import { loadUserPresets, saveUserPresets } from '../../userPresets';
import type { UserPreset } from '../../userPresets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDrumLoop(state.pattern, state.config.measures, state.config.bpm);
    } finally {
      setExporting(false);
    }
  };

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
        <Button
          variant="outline"
          size="icon"
          className="h-[52px] w-[52px] rounded-xl bg-[#1e3a22] border-[#336833] text-[#5ddb7a] hover:bg-[#265030] hover:border-[#428542] hover:text-[#5ddb7a] text-xl"
          onClick={onTogglePlayback}
        >
          {state.isPlaying ? '⏸' : '▶'}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-[52px] w-[52px] rounded-xl bg-[#3a1e22] border-[#683336] text-[#e07878] hover:bg-[#502628] hover:border-[#854244] hover:text-[#e07878] text-xl"
          onClick={onStop}
        >
          ⏹
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-[52px] w-[52px] rounded-xl text-lg"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </Button>
        <Button
          variant="outline"
          className="h-[52px] rounded-xl px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          onClick={() => dispatch({ type: 'CLEAR_PATTERN' })}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          className="h-[52px] rounded-xl px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          onClick={() => { void handleExport(); }}
          disabled={exporting}
          title="Download drum loop as WAV"
        >
          {exporting ? '⏳' : '⬇ WAV'}
        </Button>
      </div>

      <div className="transport-controls-group">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            <span className="flex items-center justify-between">
              BPM
              <Input
                type="number"
                className="w-16 h-7 text-center font-bold text-base bg-secondary border-border [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
          </Label>
          <Slider
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            value={[bpm]}
            onValueChange={([v]) => dispatch({ type: 'SET_BPM', bpm: v })}
          />
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            Measures: {measures.length}
          </Label>
          <Slider
            min={1}
            max={MAX_MEASURES}
            step={1}
            value={[measures.length]}
            onValueChange={([v]) =>
              dispatch({ type: 'SET_MEASURE_COUNT', count: v })
            }
          />
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            Loops: {loopCount === 0 ? '∞' : loopCount}
          </Label>
          <Slider
            min={0}
            max={16}
            step={1}
            value={[loopCount]}
            onValueChange={([v]) =>
              dispatch({ type: 'SET_LOOP_COUNT', loopCount: v })
            }
          />
        </div>
      </div>

      <div className="preset-row">
        <span className="preset-row-label">Preset</span>
        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
          <SelectTrigger className="flex-1 bg-secondary border-border">
            <SelectValue placeholder="— select —" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Built-in</SelectLabel>
              {PRESETS.map((p) => (
                <SelectItem key={p.name} value={`builtin:${p.name}`}>{p.name}</SelectItem>
              ))}
            </SelectGroup>
            {userPresets.length > 0 && (
              <SelectGroup>
                <SelectLabel>Saved</SelectLabel>
                {userPresets.map((p) => (
                  <SelectItem key={p.id} value={`user:${p.id}`}>{p.name}</SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          className="font-bold uppercase tracking-wider text-xs"
          disabled={!selectedPreset}
          onClick={applySelectedPreset}
        >
          Apply
        </Button>
        {isUserPresetSelected && (
          <Button
            variant="destructive"
            size="sm"
            onClick={deleteSelectedPreset}
            title="Delete this preset"
          >
            ✕
          </Button>
        )}
      </div>

      <div className="save-preset-row">
        <span className="preset-row-label">Save</span>
        <Input
          type="text"
          className="flex-1 bg-secondary border-border"
          placeholder="Name this beat…"
          value={presetName}
          maxLength={40}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
        />
        <Button
          variant="secondary"
          size="sm"
          className="font-bold uppercase tracking-wider text-xs"
          disabled={!presetName.trim()}
          onClick={handleSavePreset}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
