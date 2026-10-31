import { FLAC_BLOCK_SIZE, flacFrame, flacStreamHeader } from './flacEncoder';
import { wavHeader } from './wavEncoder';

/** What the click export writes to: it is handed 16-bit mono PCM slices in order, then asked for the file. */
export interface PcmSink {
  push(pcm: ArrayBuffer): Promise<void>;
  finish(): Blob;
}

export type ClickExportFormat = 'wav' | 'flac';

/** Shown on every FLAC download button. A sparse track shrinks about 40x, a dense one about 6x. */
export const FLAC_DOWNLOAD_HINT =
  "Lossless and 6 to 40 times smaller than the WAV, depending on how busy the track is. Not every app opens FLAC; if yours doesn't, use the WAV";

export const CLICK_EXPORT_EXTENSION: Record<ClickExportFormat, string> = { wav: 'wav', flac: 'flac' };

/** Folds each slice into a Blob straight away, so its ArrayBuffer can be freed and the browser may spill the Blob to disk. */
export function wavSink(totalSamples: number, sampleRate: number): PcmSink {
  const type = 'audio/wav';
  let blob = new Blob([wavHeader(totalSamples, 1, sampleRate)], { type });
  return {
    push: async (pcm) => {
      blob = new Blob([blob, pcm], { type });
    },
    finish: () => blob,
  };
}

/**
 * Lossless FLAC: every sample is exactly what the WAV has (no smearing, no encoder delay), and the
 * silence between clicks costs a few bytes per block, so a sparse track is about 40x smaller than the
 * WAV. Slices are not a whole number of blocks, so the leftover samples wait for the next slice.
 */
export function flacSink(totalSamples: number, sampleRate: number): PcmSink {
  const type = 'audio/flac';
  let blob = new Blob([flacStreamHeader(sampleRate, totalSamples)], { type });
  let carry = new Int16Array(0);
  let frameNumber = 0;
  return {
    push: async (pcm) => {
      // pcm16 writes little-endian, which is what every browser's Int16Array is.
      const incoming = new Int16Array(pcm);
      const samples = new Int16Array(carry.length + incoming.length);
      samples.set(carry);
      samples.set(incoming, carry.length);
      const whole = samples.length - (samples.length % FLAC_BLOCK_SIZE);
      const frames: Uint8Array<ArrayBuffer>[] = [];
      for (let i = 0; i < whole; i += FLAC_BLOCK_SIZE) {
        frames.push(flacFrame(samples.subarray(i, i + FLAC_BLOCK_SIZE), frameNumber++, sampleRate));
      }
      carry = samples.slice(whole);
      if (frames.length > 0) blob = new Blob([blob, ...frames], { type });
    },
    finish: () => {
      if (carry.length === 0) return blob;
      const last = flacFrame(carry, frameNumber++, sampleRate);
      carry = new Int16Array(0);
      blob = new Blob([blob, last], { type });
      return blob;
    },
  };
}
