import type { Pattern, Measure } from '../types';
import { INSTRUMENT_IDS } from '../constants';
import { drumSynths } from './drumSynths';
import { encodeWav } from './wavEncoder';

function getBeatDuration(beatIndex: number, measures: Measure[], bpm: number): number {
  let offset = 0;
  for (const measure of measures) {
    const stepsPerBeat = measure.timeSignature.stepsPerBeat ?? 1;
    const mSteps = measure.timeSignature.beats * stepsPerBeat;
    if (beatIndex < offset + mSteps) {
      return (60 / bpm) * (4 / measure.timeSignature.subdivision) / stepsPerBeat;
    }
    offset += mSteps;
  }
  return 60 / bpm;
}

export async function exportDrumLoop(
  pattern: Pattern,
  measures: Measure[],
  bpm: number,
): Promise<void> {
  const totalBeats = measures.reduce(
    (sum, m) => sum + m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1),
    0,
  );

  // Build beat timestamps
  const beatTimes: number[] = [];
  let cursor = 0;
  for (let i = 0; i < totalBeats; i++) {
    beatTimes.push(cursor);
    cursor += getBeatDuration(i, measures, bpm);
  }

  const tail = 0.6; // let last sounds ring out
  const duration = cursor + tail;
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);

  for (let beat = 0; beat < totalBeats; beat++) {
    for (const id of INSTRUMENT_IDS) {
      if (pattern[id][beat]) {
        // OfflineAudioContext shares the BaseAudioContext API used by drumSynths
        drumSynths[id](offlineCtx as unknown as AudioContext, offlineCtx.destination, beatTimes[beat]);
      }
    }
  }

  const rendered = await offlineCtx.startRendering();
  const wav = encodeWav(rendered);

  const url = URL.createObjectURL(wav);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drum-loop.wav';
  a.click();
  URL.revokeObjectURL(url);
}
