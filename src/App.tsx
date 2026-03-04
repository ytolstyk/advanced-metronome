import { useReducer, useEffect } from 'react';
import { reducer, createInitialState } from './state';
import { useAudioEngine } from './hooks/useAudioEngine';
import { DrumGrid } from './components/DrumGrid/DrumGrid';
import { TransportControls } from './components/TransportControls/TransportControls';
import './App.css';

function App() {
  const [state, dispatch] = useReducer(reducer, null, createInitialState);
  const { togglePlayback, stop } = useAudioEngine(state, dispatch);

  // Space bar shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback]);

  return (
    <div className="app">
      <h1 className="app-title">Drum Machine</h1>
      <DrumGrid state={state} dispatch={dispatch} />
      <TransportControls
        state={state}
        dispatch={dispatch}
        onTogglePlayback={togglePlayback}
        onStop={stop}
      />
      <p className="app-hint">Press Space to play/pause</p>
    </div>
  );
}

export default App;
