import { useReducer, useEffect, useRef, useCallback, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { reducer, createInitialState, saveState, validateStoredState } from "../state";
import type { Action, StorageValidationError } from "../state";
import type { AppState } from "../types";
import { loadCurrentTrack, saveCurrentTrack } from "../api/drumApi";
import { decodeShareState } from "../shareUtils";
import { StorageErrorBanner } from "../components/StorageErrorBanner/StorageErrorBanner";
import { Button } from "@/components/ui/button";
import { useAudioEngine } from "../hooks/useAudioEngine";
import { DrumGrid } from "../components/DrumGrid/DrumGrid";
import { TransportControls } from "../components/TransportControls/TransportControls";
import { PianoKeyboard } from "../components/PianoKeyboard/PianoKeyboard";
import { GenerateDrumsModal } from "../components/GenerateDrumsModal/GenerateDrumsModal";
import type { DrumStyle } from "../drumPatterns";
import { drumToClickTrackPieces } from "../utils/drumToClickTrack";
import { INSTRUMENT_IDS } from "../constants";
import type { Measure, Pattern } from "../types";
import "../App.css";

const MAX_HISTORY = 10;

const UNDOABLE: Set<Action["type"]> = new Set([
  "TOGGLE_BEAT",
  "SET_BPM",
  "SET_LOOP_COUNT",
  "SET_MEASURE_COUNT",
  "SET_TIME_SIGNATURE",
  "CLEAR_PATTERN",
  "COPY_MEASURE",
  "APPLY_PRESET",
  "APPLY_USER_PRESET",
  "APPLY_GENERATED_DRUMS",
  "SET_CHORD_BEAT",
  "CLEAR_CHORD_PATTERN",
]);

export function DrumMachinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, null, createInitialState);

  // Refs let dispatchWithHistory / undo stay stable without re-creating on every render
  const stateRef = useRef<AppState>(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const historyRef = useRef<AppState[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  const dispatchWithHistory = useCallback((action: Action) => {
    if (UNDOABLE.has(action.type)) {
      const next = [
        ...historyRef.current.slice(-(MAX_HISTORY - 1)),
        stateRef.current,
      ];
      historyRef.current = next;
      setHistoryLen(next.length);
    }
    dispatch(action);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.length === 0) return;
    const prev = h[h.length - 1];
    const next = h.slice(0, -1);
    historyRef.current = next;
    setHistoryLen(next.length);
    dispatch({ type: "RESTORE_STATE", state: prev });
  }, []);

  const handleGenerate = useCallback((style: DrumStyle) => {
    const measures = stateRef.current.config.measures;
    // Only force stepsPerBeat for styles that require triplets (3) or quarter beats (4).
    // For straight (1) or half-beat (2) styles, preserve the measure's existing stepsPerBeat.
    const newMeasures: Measure[] = measures.map(m => ({
      timeSignature: {
        beats: m.timeSignature.beats,
        subdivision: m.timeSignature.subdivision,
        stepsPerBeat: style.stepsPerBeat >= 3
          ? style.stepsPerBeat
          : Math.max(m.timeSignature.stepsPerBeat ?? 1, style.stepsPerBeat),
      },
    }));
    // Generate pattern for each measure, accumulating offsets
    const pattern = {} as Pattern;
    for (const id of INSTRUMENT_IDS) {
      const totalSteps = newMeasures.reduce(
        (sum, m) => sum + m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1),
        0,
      );
      pattern[id] = new Array(totalSteps).fill(false);
    }
    let offset = 0;
    for (const m of newMeasures) {
      const beats = m.timeSignature.beats;
      const spb = m.timeSignature.stepsPerBeat ?? 1;
      const measureSteps = beats * spb;
      const hit = style.getPattern(beats);
      // Scale hit positions from the style's step space to the measure's actual step space
      const scale = spb / style.stepsPerBeat;
      for (const id of INSTRUMENT_IDS) {
        const steps = hit[id] ?? [];
        for (const s of steps) {
          const scaledS = Math.round(s * scale);
          if (scaledS >= 0 && scaledS < measureSteps) {
            pattern[id][offset + scaledS] = true;
          }
        }
      }
      offset += measureSteps;
    }
    dispatchWithHistory({ type: 'APPLY_GENERATED_DRUMS', measures: newMeasures, pattern });
    setShowGenerateModal(false);
  }, [dispatchWithHistory]);

  const handleExportToClickTrack = useCallback(() => {
    const { config, pattern } = stateRef.current;
    const pieces = drumToClickTrackPieces(config.measures, pattern, config.bpm);
    sessionStorage.setItem('drum-to-click-import', JSON.stringify(pieces));
    void navigate('/click-track');
  }, [navigate]);

  const handleAcceptClickImport = useCallback(() => {
    const raw = sessionStorage.getItem('click-to-drum-import');
    sessionStorage.removeItem('click-to-drum-import');
    setClickImportBanner(false);
    if (!raw) return;
    try {
      const { measures, bpm } = JSON.parse(raw) as { measures: Measure[]; bpm: number };
      const totalSteps = measures.reduce(
        (sum, m) => sum + m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1),
        0,
      );
      const emptyPattern = {} as Pattern;
      for (const id of INSTRUMENT_IDS) {
        emptyPattern[id] = new Array(totalSteps).fill(false);
      }
      dispatch({
        type: 'RESTORE_STATE',
        state: {
          ...stateRef.current,
          config: { ...stateRef.current.config, measures, bpm },
          pattern: emptyPattern,
          chordPattern: new Array(totalSteps).fill(null),
          isPlaying: false,
          currentBeat: 0,
          currentLoop: 0,
        },
      });
      setShowGenerateModal(true);
    } catch { /* malformed — ignore */ }
  }, []);

  const [storageError, setStorageError] = useState<StorageValidationError | null>(
    () => validateStoredState(),
  );

  const [showPiano, setShowPiano] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [clickImportBanner, setClickImportBanner] = useState<boolean>(() => {
    return sessionStorage.getItem('click-to-drum-import') !== null;
  });

  const { humanize, volume } = state.config;
  const { chordVolume } = state;
  const { togglePlayback, stop, previewChord, previewDrum } = useAudioEngine(
    state,
    dispatchWithHistory,
    humanize,
    volume / 100,
    chordVolume / 100,
  );

  const { config, pattern, chordPattern, chordInstrument } = state;

  // Persist to localStorage on every change
  useEffect(() => {
    saveState(config, pattern, chordPattern, chordInstrument, chordVolume);
  }, [config, pattern, chordPattern, chordInstrument, chordVolume]);

  // Load current track from cloud on mount and apply it (skip if share param present)
  useEffect(() => {
    const shareParam = searchParams.get('share');
    if (shareParam) {
      const shared = decodeShareState(shareParam);
      if (shared) {
        dispatch({
          type: 'RESTORE_STATE',
          state: { ...stateRef.current, ...shared },
        });
      }
      setSearchParams({}, { replace: true });
      return;
    }
    loadCurrentTrack().then((track) => {
      if (track) {
        dispatch({
          type: "RESTORE_STATE",
          state: {
            ...stateRef.current,
            config: track.config,
            pattern: track.pattern,
            chordPattern: track.chordPattern,
            chordInstrument: track.chordInstrument,
            chordVolume: track.chordVolume,
          },
        });
      }
    }).catch(() => { /* cloud unavailable — keep local state */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save current track to cloud (debounced 2s)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveCurrentTrack({ config, pattern, chordPattern, chordInstrument, chordVolume });
    }, 2000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [config, pattern, chordPattern, chordInstrument, chordVolume]);

  // Space = play/pause, Ctrl/Cmd+Z = undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        togglePlayback();
      }
      if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayback, undo]);

  const hasPattern = INSTRUMENT_IDS.some(id => state.pattern[id].some(Boolean));

  return (
    <main className="app" aria-label="Drum machine">
      {storageError && (
        <StorageErrorBanner
          error={storageError}
          onDismiss={() => setStorageError(null)}
          onClear={() => setStorageError(null)}
        />
      )}
      {clickImportBanner && (
        <div className="import-banner">
          <span>Click track imported — apply measures to drum machine?</span>
          <div className="import-banner-actions">
            <Button size="sm" className="h-7 text-xs" onClick={handleAcceptClickImport}>
              Apply &amp; Generate Drums
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
              sessionStorage.removeItem('click-to-drum-import');
              setClickImportBanner(false);
            }}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      <DrumGrid state={state} dispatch={dispatchWithHistory} onPreviewChord={(root, type) => previewChord(root, type, state.chordInstrument)} onPreviewDrum={previewDrum} />
      <TransportControls
        state={state}
        dispatch={dispatchWithHistory}
        onTogglePlayback={togglePlayback}
        onStop={stop}
        onUndo={undo}
        canUndo={historyLen > 0}
        humanize={humanize}
        onHumanizeChange={(v) => dispatchWithHistory({ type: 'SET_HUMANIZE', humanize: v })}
        volume={volume}
        onVolumeChange={(v) => dispatchWithHistory({ type: 'SET_VOLUME', volume: v })}
        chordVolume={chordVolume}
        onChordVolumeChange={(v) => dispatchWithHistory({ type: 'SET_CHORD_VOLUME', volume: v })}
      />
      <div className="drum-extra-row">
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowGenerateModal(true)}>
          Generate Drums
        </Button>
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowExportConfirm(true)}>
          Export to Click Track
        </Button>
      </div>
      {showExportConfirm && (
        <div className="export-confirm-overlay" onClick={() => setShowExportConfirm(false)}>
          <div className="export-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>This will navigate to the Click Track Builder and load your drum measures as segments.</p>
            <div className="export-confirm-actions">
              <Button size="sm" variant="outline" onClick={() => setShowExportConfirm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => { setShowExportConfirm(false); handleExportToClickTrack(); }}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="piano-toggle-row">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => setShowPiano((v) => !v)}
          aria-expanded={showPiano}
        >
          {showPiano ? "Hide Piano" : "Show Piano"}
        </Button>
      </div>
      {showPiano && <PianoKeyboard />}
      <p className="app-hint">Space to play/pause · Ctrl+Z to undo</p>
      <GenerateDrumsModal
        open={showGenerateModal}
        hasExistingPattern={hasPattern}
        onClose={() => setShowGenerateModal(false)}
        onGenerate={handleGenerate}
      />
    </main>
  );
}
