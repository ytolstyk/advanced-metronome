import type { TrackPiece } from './ClickTrackEngine';
import { accentClick, beatClick, subClick } from './clickSynth';
import { subsPerBeat } from './clickMath';
import { encodeWav } from './wavEncoder';

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
