import type { TrackPiece } from './ClickTrackEngine';
import { accentClick, beatClick, subClick } from './clickSynth';
import { getBpmAtRepetition, subsPerBeat } from './clickMath';
import { CLICK_EXPORT_EXTENSION, flacSink, wavSink, type ClickExportFormat } from './clickExportSinks';
import { pcm16 } from './wavEncoder';

/** A click is a 500-1000 Hz tone, far below the 11 kHz limit at 22.05 kHz, and both channels were identical, so mono at half the rate loses nothing audible. */
const SAMPLE_RATE = 22050;
const CHANNELS = 1;
/**
 * Longest slice rendered per offline context. Render time grows with (clicks in the slice) x (slice
 * length), because every oscillator stays in the graph for the whole slice, so short slices are much
 * faster: measured in Chrome, 5 s slices render the same 600 clicks/min about 8x faster than 60 s ones.
 */
const CHUNK_SECONDS = 5;
/** A click rings for at most 25 ms, so a chunk re-renders the 50 ms before it starts to pick up the previous chunk's tails. */
const LEAD_SECONDS = 0.05;
/** Most clicks scheduled as audio nodes (an oscillator and a gain each) in one offline context: bounds a dense slice to about 0.2 s of render. */
const MAX_CLICKS_PER_CHUNK = 500;

/**
 * Renders the track to a mono 22.05 kHz file and downloads it: a WAV by default, or a lossless FLAC
 * (`filename` defaults to `click-track.<ext>`).
 */
export async function exportClickTrack(
  pieces: TrackPiece[],
  speedPercent: number,
  filename?: string,
  format: ClickExportFormat = 'wav',
  /** Aborting stops after the current slice and rejects with the signal's reason; nothing is downloaded. */
  signal?: AbortSignal,
): Promise<void> {
  const speedMult = speedPercent / 100;

  type ClickEvent = { time: number; kind: 'accent' | 'beat' | 'sub' };
  const events: ClickEvent[] = [];

  let cursor = 0;
  for (const piece of pieces) {
    const subs = subsPerBeat(piece.subdivision, piece.timeSignature.numerator);
    let subTicksPerMeasure: number;
    if (piece.subdivision === 'whole') {
      subTicksPerMeasure = 1;
    } else {
      subTicksPerMeasure = Math.round(piece.timeSignature.numerator * subs);
    }

    for (let rep = 0; rep < piece.repeats; rep++) {
      const bpm = getBpmAtRepetition(piece, rep);
      const beatDur = (60 / (bpm * speedMult)) * (4 / piece.timeSignature.denominator);
      const subDur = piece.subdivision === 'whole'
        ? beatDur * piece.timeSignature.numerator
        : beatDur / subs;

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
  const totalSamples = Math.ceil(SAMPLE_RATE * (cursor + tail));
  const leadSamples = Math.round(LEAD_SECONDS * SAMPLE_RATE);

  // Render a slice at a time and keep only 16-bit PCM, so a 20 minute track never holds a
  // multi-hundred-megabyte float buffer. A slice ends after CHUNK_SECONDS or MAX_CLICKS_PER_CHUNK
  // clicks, whichever comes first, so a dense track can't put tens of thousands of audio nodes into
  // one graph. Events are in time order, so two pointers walk them.
  const sink = format === 'flac' ? flacSink(totalSamples, SAMPLE_RATE) : wavSink(totalSamples, SAMPLE_RATE);
  let firstKept = 0; // first event that starts at or after this slice
  let firstLead = 0; // first event that can still ring into this slice
  for (let start = 0; start < totalSamples; ) {
    signal?.throwIfAborted();
    let end = Math.min(start + CHUNK_SECONDS * SAMPLE_RATE, totalSamples);
    const overflow = events[firstKept + MAX_CLICKS_PER_CHUNK];
    if (overflow) end = Math.max(start + 1, Math.min(end, Math.ceil(overflow.time * SAMPLE_RATE)));

    const lead = Math.min(leadSamples, start);
    const originSec = (start - lead) / SAMPLE_RATE;
    const endSec = end / SAMPLE_RATE;
    const ctx = new OfflineAudioContext(CHANNELS, lead + (end - start), SAMPLE_RATE);

    while (firstLead < events.length && events[firstLead]!.time < originSec) firstLead++;
    for (let i = firstLead; i < events.length && events[i]!.time < endSec; i++) {
      const ev = events[i]!;
      const at = ev.time - originSec;
      if (ev.kind === 'accent') accentClick(ctx as unknown as AudioContext, ctx.destination, at);
      else if (ev.kind === 'beat') beatClick(ctx as unknown as AudioContext, ctx.destination, at);
      else subClick(ctx as unknown as AudioContext, ctx.destination, at);
    }

    const rendered = await ctx.startRendering();
    const channels = Array.from({ length: CHANNELS }, (_, ch) => rendered.getChannelData(ch));
    await sink.push(pcm16(channels, lead, lead + (end - start)));

    while (firstKept < events.length && events[firstKept]!.time < endSec) firstKept++;
    start = end;
  }

  signal?.throwIfAborted();
  const url = URL.createObjectURL(sink.finish());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `click-track.${CLICK_EXPORT_EXTENSION[format]}`;
  a.click();
  // Not at once: a large file can still be handed to the browser's download manager after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
