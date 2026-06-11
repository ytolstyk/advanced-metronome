import type { RootNote, ChordType } from '../data/chords';
import { playGuitarChord, playPianoChord, playPadChord } from './chordSynths';
import { encodeWav } from './wavEncoder';

interface ExportSlot {
  root: RootNote;
  type: ChordType;
  beats: number;
}

type InstrumentType = 'guitar' | 'piano' | 'pad';

export async function exportChordProgression(
  slots: ExportSlot[],
  bpm: number,
  instrument: InstrumentType,
): Promise<void> {
  if (slots.length === 0) return;

  const sampleRate = 44100;
  const beatDuration = 60 / bpm;
  // Pad instruments sustain up to 6s; give enough tail for the last chord to decay.
  const tail = 7;

  let cursor = 0;
  const events: { time: number; slot: ExportSlot }[] = [];
  for (const slot of slots) {
    events.push({ time: cursor, slot });
    cursor += slot.beats * beatDuration;
  }

  const duration = cursor + tail;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);

  for (const ev of events) {
    const { root, type } = ev.slot;
    const ctx = offlineCtx as unknown as AudioContext;
    if (instrument === 'guitar') playGuitarChord(ctx, offlineCtx.destination, root, type, ev.time);
    else if (instrument === 'piano') playPianoChord(ctx, offlineCtx.destination, root, type, ev.time);
    else playPadChord(ctx, offlineCtx.destination, root, type, ev.time);
  }

  const rendered = await offlineCtx.startRendering();
  const wav = encodeWav(rendered);
  const url = URL.createObjectURL(wav);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chord-progression.wav';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
