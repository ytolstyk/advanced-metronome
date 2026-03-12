import { useReducer, useEffect, useRef, useCallback, useState } from "react";
import { reducer, createInitialState, saveState } from "./state";
import type { Action } from "./state";
import type { AppState } from "./types";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { DrumGrid } from "./components/DrumGrid/DrumGrid";
import { TransportControls } from "./components/TransportControls/TransportControls";
import { PianoKeyboard } from "./components/PianoKeyboard/PianoKeyboard";
import "./App.css";

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
  "SET_CHORD_BEAT",
  "CLEAR_CHORD_PATTERN",
]);

function App() {
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

  const [showPiano, setShowPiano] = useState(false);

  const { humanize, volume } = state.config;
  const { chordVolume } = state;
  const { togglePlayback, stop, previewChord } = useAudioEngine(
    state,
    dispatchWithHistory,
    humanize,
    volume / 100,
    chordVolume / 100,
  );

  const { config, pattern, chordPattern, chordInstrument } = state;
  useEffect(() => {
    saveState(config, pattern, chordPattern, chordInstrument, chordVolume);
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

  return (
    <main className="app" aria-label="Drum machine">
      <DrumGrid state={state} dispatch={dispatchWithHistory} onPreviewChord={(root, type) => previewChord(root, type, state.chordInstrument)} />
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
      <div className="piano-toggle-row">
        <button
          className="piano-toggle-btn"
          onClick={() => setShowPiano((v) => !v)}
          aria-expanded={showPiano}
        >
          {showPiano ? "Hide Piano" : "Show Piano"}
        </button>
      </div>
      {showPiano && <PianoKeyboard />}
      <p className="app-hint">Space to play/pause · Ctrl+Z to undo</p>
    </main>
  );
}

export default App;
