import type { TrackPiece, SubdivisionLabel } from './ClickTrackEngine';
import { accentClick, beatClick, subClick } from './clickSynth';

function subsPerBeat(sub: SubdivisionLabel, numerator: number): number {
  switch (sub) {
    case 'whole': return 1 / numerator;
    case 'half': return 0.5;
    case 'quarter': return 1;
    case 'eighth': return 2;
    case 'sixteenth': return 4;
    case 'quarter-triplet': return 3;
    case 'eighth-triplet': return 6;
  }
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
  view.setUint16(20, 1, true);
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

export async function exportClickTrack(pieces: TrackPiece[], speedPercent: number): Promise<void> {
  const speedMult = speedPercent / 100;
  const sampleRate = 44100;

  type ClickEvent = { time: number; kind: 'accent' | 'beat' | 'sub' };
  const events: ClickEvent[] = [];

  let cursor = 0;
  for (const piece of pieces) {
    const beatDur = (60 / (piece.bpm * speedMult)) * (4 / piece.timeSignature.denominator);
    const subs = subsPerBeat(piece.subdivision, piece.timeSignature.numerator);
    let subTicksPerMeasure: number;
    if (piece.subdivision === 'whole') {
      subTicksPerMeasure = 1;
    } else {
      subTicksPerMeasure = Math.round(piece.timeSignature.numerator * subs);
    }
    const subDur = piece.subdivision === 'whole'
      ? beatDur * piece.timeSignature.numerator
      : beatDur / subs;

    for (let rep = 0; rep < piece.repeats; rep++) {
      for (let tick = 0; tick < subTicksPerMeasure; tick++) {
        let kind: ClickEvent['kind'];
        if (tick === 0) {
          kind = 'accent';
        } else if (tick % Math.max(1, Math.round(subs)) === 0) {
          kind = 'beat';
        } else {
          kind = 'sub';
        }
        events.push({ time: cursor, kind });
        cursor += subDur;
      }
    }
  }

  if (events.length === 0) return;

  const tail = 0.5;
  const duration = cursor + tail;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);

  for (const ev of events) {
    if (ev.kind === 'accent') accentClick(offlineCtx as unknown as AudioContext, offlineCtx.destination, ev.time);
    else if (ev.kind === 'beat') beatClick(offlineCtx as unknown as AudioContext, offlineCtx.destination, ev.time);
    else subClick(offlineCtx as unknown as AudioContext, offlineCtx.destination, ev.time);
  }

  const rendered = await offlineCtx.startRendering();
  const wav = encodeWav(rendered);
  const url = URL.createObjectURL(wav);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'click-track.wav';
  a.click();
  URL.revokeObjectURL(url);
}
