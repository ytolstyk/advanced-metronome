import type { Pattern, Measure } from '../types';
import { INSTRUMENT_IDS } from '../constants';
import { drumSynths } from './drumSynths';

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

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }

  return new Blob([out], { type: 'audio/wav' });
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
        drumSynths[id](offlineCtx as unknown as AudioContext, beatTimes[beat]);
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
