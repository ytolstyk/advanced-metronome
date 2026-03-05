import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { INSTRUMENT_PRESETS } from '../../audio/pianoPresets';
import './PianoKeyboard.css';

// White key width in pixels — used to compute black key positions
const WKW = 44;

// Base definitions at octave 4 (offset 0)
const BASE_WHITE_KEYS = [
  { code: 'KeyA',      label: 'A', note: 'C4',  freq: 261.63, index: 0 },
  { code: 'KeyS',      label: 'S', note: 'D4',  freq: 293.66, index: 1 },
  { code: 'KeyD',      label: 'D', note: 'E4',  freq: 329.63, index: 2 },
  { code: 'KeyF',      label: 'F', note: 'F4',  freq: 349.23, index: 3 },
  { code: 'KeyG',      label: 'G', note: 'G4',  freq: 392.00, index: 4 },
  { code: 'KeyH',      label: 'H', note: 'A4',  freq: 440.00, index: 5 },
  { code: 'KeyJ',      label: 'J', note: 'B4',  freq: 493.88, index: 6 },
  { code: 'KeyK',      label: 'K', note: 'C5',  freq: 523.25, index: 7 },
  { code: 'KeyL',      label: 'L', note: 'D5',  freq: 587.33, index: 8 },
  { code: 'Semicolon', label: ';', note: 'E5',  freq: 659.25, index: 9 },
];

const BASE_BLACK_KEYS = [
  { code: 'KeyW', label: 'W', note: 'C#4', freq: 277.18, whiteOffset: 0.65 },
  { code: 'KeyE', label: 'E', note: 'D#4', freq: 311.13, whiteOffset: 1.65 },
  { code: 'KeyT', label: 'T', note: 'F#4', freq: 369.99, whiteOffset: 3.65 },
  { code: 'KeyY', label: 'Y', note: 'G#4', freq: 415.30, whiteOffset: 4.65 },
  { code: 'KeyU', label: 'U', note: 'A#4', freq: 466.16, whiteOffset: 5.65 },
  { code: 'KeyO', label: 'O', note: 'C#5', freq: 554.37, whiteOffset: 7.65 },
  { code: 'KeyP', label: 'P', note: 'D#5', freq: 622.25, whiteOffset: 8.65 },
];

// Octave presets: label shown in UI → offset from base (octave 4)
const OCTAVE_PRESETS = [
  { label: 'C2', offset: -2 },
  { label: 'C3', offset: -1 },
  { label: 'C4', offset:  0 },
  { label: 'C5', offset:  1 },
  { label: 'C6', offset:  2 },
];

function shiftNote(note: string, offset: number): string {
  return note.replace(/\d/, (n) => String(Number(n) + offset));
}

function getAudioContext(ref: React.MutableRefObject<AudioContext | null>): AudioContext {
  if (!ref.current) {
    ref.current = new AudioContext();
  }
  if (ref.current.state === 'suspended') {
    void ref.current.resume();
  }
  return ref.current;
}

export function PianoKeyboard() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeNotesRef = useRef<Map<string, () => void>>(new Map());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [octaveOffset, setOctaveOffset] = useState(0);
  const [presetId, setPresetId] = useState('piano');

  const preset = useMemo(
    () => INSTRUMENT_PRESETS.find((p) => p.id === presetId) ?? INSTRUMENT_PRESETS[0],
    [presetId],
  );

  const WHITE_KEYS = useMemo(() =>
    BASE_WHITE_KEYS.map((k) => ({
      ...k,
      note: shiftNote(k.note, octaveOffset),
      freq: k.freq * Math.pow(2, octaveOffset),
    })),
  [octaveOffset]);

  const BLACK_KEYS = useMemo(() =>
    BASE_BLACK_KEYS.map((k) => ({
      ...k,
      note: shiftNote(k.note, octaveOffset),
      freq: k.freq * Math.pow(2, octaveOffset),
    })),
  [octaveOffset]);

  const allKeys = useMemo(() =>
    new Map([...WHITE_KEYS, ...BLACK_KEYS].map((k) => [k.code, { freq: k.freq }])),
  [WHITE_KEYS, BLACK_KEYS]);

  const pressKey = useCallback((code: string) => {
    const def = allKeys.get(code);
    if (!def) return;
    if (activeNotesRef.current.has(code)) return; // already playing

    const ctx = getAudioContext(audioCtxRef);
    const stop = preset.play(ctx, def.freq);
    activeNotesRef.current.set(code, stop);
    setPressedKeys((prev) => {
      const next = new Set(prev);
      next.add(code);
      return next;
    });
  }, [allKeys, preset]);

  const releaseKey = useCallback((code: string) => {
    const stop = activeNotesRef.current.get(code);
    if (!stop) return;
    stop();
    activeNotesRef.current.delete(code);
    setPressedKeys((prev) => {
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      pressKey(e.code);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      releaseKey(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pressKey, releaseKey]);

  // Release all notes on unmount
  useEffect(() => {
    const active = activeNotesRef.current;
    return () => {
      active.forEach((stop) => stop());
    };
  }, []);

  const releaseAllAndSetOctave = useCallback((offset: number) => {
    activeNotesRef.current.forEach((stop) => stop());
    activeNotesRef.current.clear();
    setPressedKeys(new Set());
    setOctaveOffset(offset);
  }, []);

  const totalWidth = WHITE_KEYS.length * WKW;

  return (
    <div className="piano-container">
      <div className="piano-hint">
        <span className="piano-hint-controls">
          <select
            className="piano-instrument-select"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
          >
            {INSTRUMENT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <span><kbd>A–;</kbd> white · <kbd>W E T Y U O P</kbd> black</span>
        </span>
        <span className="piano-presets">
          {OCTAVE_PRESETS.map(({ label, offset }) => (
            <button
              key={label}
              className={`piano-preset-btn${octaveOffset === offset ? ' piano-preset-btn--active' : ''}`}
              onClick={() => releaseAllAndSetOctave(offset)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <div className="piano-keyboard" style={{ width: totalWidth }}>
        {/* White keys */}
        {WHITE_KEYS.map((k) => (
          <div
            key={k.code}
            className={`piano-key piano-key--white${pressedKeys.has(k.code) ? ' piano-key--active-white' : ''}`}
            style={{ left: k.index * WKW, width: WKW }}
            onMouseDown={() => pressKey(k.code)}
            onMouseUp={() => releaseKey(k.code)}
            onMouseLeave={() => releaseKey(k.code)}
          >
            <span className="piano-key-note">{k.note}</span>
            <span className="piano-key-label">{k.label}</span>
          </div>
        ))}

        {/* Black keys */}
        {BLACK_KEYS.map((k) => (
          <div
            key={k.code}
            className={`piano-key piano-key--black${pressedKeys.has(k.code) ? ' piano-key--active-black' : ''}`}
            style={{ left: k.whiteOffset * WKW }}
            onMouseDown={(e) => { e.stopPropagation(); pressKey(k.code); }}
            onMouseUp={(e) => { e.stopPropagation(); releaseKey(k.code); }}
            onMouseLeave={() => releaseKey(k.code)}
          >
            <span className="piano-key-label piano-key-label--black">{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
