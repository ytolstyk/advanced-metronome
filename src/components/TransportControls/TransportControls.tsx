import { useState, useEffect } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { AppState } from "../../types";
import type { Action } from "../../state";
import { MIN_BPM, MAX_BPM, MAX_MEASURES } from "../../constants";
import { exportDrumLoop } from "../../audio/exportAudio";
import { PRESETS } from "../../presets";
import { loadCloudDrumTracks, createCloudDrumTrack, updateCloudDrumTrack, deleteCloudDrumTrack } from "../../api/drumApi";
import type { CloudDrumTrack } from "../../api/drumApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./TransportControls.css";

interface TransportControlsProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onTogglePlayback: () => void;
  onStop: () => void;
  onUndo: () => void;
  canUndo: boolean;
  humanize: number;
  onHumanizeChange: (v: number) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  chordVolume: number;
  onChordVolumeChange: (v: number) => void;
}

export function TransportControls({
  state,
  dispatch,
  onTogglePlayback,
  onStop,
  onUndo,
  canUndo,
  humanize,
  onHumanizeChange,
  volume,
  onVolumeChange,
  chordVolume,
  onChordVolumeChange,
}: TransportControlsProps) {
  const { bpm, loopCount, measures } = state.config;

  const [bpmDraft, setBpmDraft] = useState("");
  const [bpmFocused, setBpmFocused] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDrumLoop(
        state.pattern,
        state.config.measures,
        state.config.bpm,
      );
    } finally {
      setExporting(false);
    }
  };

  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = authStatus === "authenticated";

  // Preset select — values are prefixed: "builtin:<name>" or "user:<id>"
  const [selectedPreset, setSelectedPreset] = useState("");
  const [userPresets, setUserPresets] = useState<CloudDrumTrack[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [conflictPreset, setConflictPreset] = useState<CloudDrumTrack | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setUserPresets([]);
      return;
    }
    setPresetsLoading(true);
    loadCloudDrumTracks()
      .then(setUserPresets)
      .catch(() => setUserPresets([]))
      .finally(() => setPresetsLoading(false));
  }, [authStatus]);

  const commitBpm = () => {
    const parsed = parseInt(bpmDraft, 10);
    const clamped = isNaN(parsed)
      ? bpm
      : Math.min(MAX_BPM, Math.max(MIN_BPM, parsed));
    dispatch({ type: "SET_BPM", bpm: clamped });
  };

  const applySelectedPreset = () => {
    onStop();
    if (selectedPreset.startsWith("builtin:")) {
      const name = selectedPreset.slice(8);
      const preset = PRESETS.find((p) => p.name === name);
      if (preset) dispatch({ type: "APPLY_PRESET", preset });
    } else if (selectedPreset.startsWith("user:")) {
      const id = selectedPreset.slice(5);
      const up = userPresets.find((p) => p.id === id);
      if (up)
        dispatch({
          type: "APPLY_USER_PRESET",
          config: up.config,
          pattern: up.pattern,
          chordPattern: up.chordPattern,
        });
    }
    setSelectedPreset("");
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset.startsWith("user:")) return;
    const id = selectedPreset.slice(5);
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
    setSelectedPreset("");
    void deleteCloudDrumTrack(id);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const existing = userPresets.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      setConflictPreset(existing);
      return;
    }
    setPresetName("");
    void createCloudDrumTrack(name, state.config, state.pattern, state.chordPattern).then((created) => {
      if (created) setUserPresets((prev) => [...prev, created]);
    });
  };

  const handleOverridePreset = () => {
    if (!conflictPreset) return;
    const { id, name } = conflictPreset;
    setConflictPreset(null);
    setPresetName("");
    void updateCloudDrumTrack(id, name, state.config, state.pattern, state.chordPattern).then(
      (updated) => {
        if (updated)
          setUserPresets((prev) => prev.map((p) => (p.id === id ? updated : p)));
      },
    );
  };

  const isUserPresetSelected = selectedPreset.startsWith("user:");

  return (
    <div className="transport-controls">
      <div className="transport-buttons">
        <Button
          variant="outline"
          size="icon"
          className="h-[52px] w-[52px] rounded-xl bg-[#1e3a22] border-[#336833] text-[#5ddb7a] hover:bg-[#265030] hover:border-[#428542] hover:text-[#5ddb7a] text-xl"
          onClick={onTogglePlayback}
          aria-label={state.isPlaying ? "Pause" : "Play"}
        >
          <span aria-hidden="true">{state.isPlaying ? "⏸" : "▶"}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-[52px] w-[52px] rounded-xl bg-[#3a1e22] border-[#683336] text-[#e07878] hover:bg-[#502628] hover:border-[#854244] hover:text-[#e07878] text-xl"
          onClick={onStop}
          aria-label="Stop"
        >
          <span aria-hidden="true">⏹</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-[52px] w-[52px] rounded-xl text-lg"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <span aria-hidden="true">↩</span>
        </Button>
      </div>

      <div className="transport-controls-group">
        <div className="flex flex-col gap-2 flex-1 min-w-0 max-sm:basis-full">
          <Label htmlFor="bpm-input" className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            <span className="flex items-center justify-between">
              BPM
              <Input
                id="bpm-input"
                type="number"
                className="w-16 h-7 text-center font-bold text-base bg-secondary border-border [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                min={MIN_BPM}
                max={MAX_BPM}
                value={bpmFocused ? bpmDraft : String(bpm)}
                onChange={(e) => setBpmDraft(e.target.value)}
                onFocus={() => {
                  setBpmDraft(String(bpm));
                  setBpmFocused(true);
                }}
                onBlur={() => {
                  setBpmFocused(false);
                  commitBpm();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
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
            onValueChange={([v]) => dispatch({ type: "SET_BPM", bpm: v })}
            aria-label="BPM"
          />
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0 max-sm:basis-full">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider flex items-center justify-between">
            Measures: {measures.length}
            <span className="flex gap-1">
              <button
                type="button"
                className="w-5 h-5 rounded text-xs leading-none bg-secondary border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() =>
                  dispatch({
                    type: "SET_MEASURE_COUNT",
                    count: measures.length - 1,
                  })
                }
                disabled={measures.length <= 1}
                aria-label="Remove measure"
              >
                <span aria-hidden="true">−</span>
              </button>
              <button
                type="button"
                className="w-5 h-5 rounded text-xs leading-none bg-secondary border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() =>
                  dispatch({
                    type: "SET_MEASURE_COUNT",
                    count: measures.length + 1,
                  })
                }
                disabled={measures.length >= MAX_MEASURES}
                aria-label="Add measure"
              >
                <span aria-hidden="true">+</span>
              </button>
            </span>
          </Label>
          <Slider
            min={1}
            max={MAX_MEASURES}
            step={1}
            value={[measures.length]}
            onValueChange={([v]) =>
              dispatch({ type: "SET_MEASURE_COUNT", count: v })
            }
            aria-label="Number of measures"
          />
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0 max-sm:basis-full">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            Loops: {loopCount === 0 ? "∞" : loopCount}
          </Label>
          <Slider
            min={0}
            max={16}
            step={1}
            value={[loopCount]}
            onValueChange={([v]) =>
              dispatch({ type: "SET_LOOP_COUNT", loopCount: v })
            }
            aria-label="Loop count"
          />
        </div>
      </div>

      <div className="secondary-controls-row">
        <Button
          variant="outline"
          className="h-9 rounded-lg px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          onClick={() => dispatch({ type: "CLEAR_PATTERN" })}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-lg px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          onClick={() => {
            void handleExport();
          }}
          disabled={exporting}
          aria-label={exporting ? "Exporting WAV…" : "Export as WAV"}
          title="Download drum loop as WAV"
        >
          <span aria-hidden="true">{exporting ? "⏳" : "⬇ WAV"}</span>
        </Button>
        <div className="flex flex-col gap-2 min-w-0 w-[180px] max-sm:w-auto max-sm:flex-1">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            Human: {humanize}%
          </Label>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[humanize]}
            onValueChange={([v]) => onHumanizeChange(v)}
            aria-label="Humanize amount"
          />
        </div>
        <div className="flex flex-col gap-2 min-w-0 w-[180px] max-sm:basis-full max-sm:w-auto">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            Drum Vol: {volume}%
          </Label>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[volume]}
            onValueChange={([v]) => onVolumeChange(v)}
            aria-label="Drum volume"
          />
        </div>
        <div className="flex flex-col gap-2 min-w-0 w-[180px] max-sm:basis-full max-sm:w-auto">
          <Label className="text-[0.72rem] text-muted-foreground font-bold uppercase tracking-wider">
            Chord Vol: {chordVolume}%
          </Label>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[chordVolume]}
            onValueChange={([v]) => onChordVolumeChange(v)}
            aria-label="Chord volume"
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
                <SelectItem key={p.name} value={`builtin:${p.name}`}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {presetsLoading ? (
              <SelectGroup>
                <SelectLabel>Saved</SelectLabel>
                <SelectItem value="__loading__" disabled>Loading…</SelectItem>
              </SelectGroup>
            ) : userPresets.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Saved</SelectLabel>
                {userPresets.map((p) => (
                  <SelectItem key={p.id} value={`user:${p.id}`}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
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
            aria-label="Delete preset"
            title="Delete this preset"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        )}
      </div>

      <div className="save-preset-row">
        <span className="preset-row-label">Save</span>
        <span
          className="flex flex-1 min-w-0 gap-[10px]"
          title={!isAuthenticated ? "Sign in to save beats" : undefined}
        >
          <Input
            type="text"
            className="flex-1 bg-secondary border-border"
            placeholder={isAuthenticated ? "Name this beat…" : "Sign in to save beats"}
            value={presetName}
            maxLength={40}
            disabled={!isAuthenticated}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleSavePreset(); }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="font-bold uppercase tracking-wider text-xs"
            disabled={!isAuthenticated || !presetName.trim()}
            onClick={handleSavePreset}
          >
            Save
          </Button>
        </span>
      </div>

      <Dialog open={!!conflictPreset} onOpenChange={(open) => { if (!open) setConflictPreset(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Preset already exists</DialogTitle>
            <DialogDescription>
              A preset named <strong>&ldquo;{conflictPreset?.name}&rdquo;</strong> already exists.
              Override it with the current beat, or go back and choose a different name.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConflictPreset(null)}>
              Choose different name
            </Button>
            <Button variant="destructive" size="sm" onClick={handleOverridePreset}>
              Override
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
