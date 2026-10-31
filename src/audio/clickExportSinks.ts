import { wavHeader } from './wavEncoder';

/** What the click export writes to: it is handed 16-bit mono PCM slices in order, then asked for the file. */
export interface PcmSink {
  /** May take a while (MP3 encoding), so it yields to the page when it has worked for a while; await it. */
  push(pcm: ArrayBuffer): Promise<void>;
  finish(): Blob;
}

export type ClickExportFormat = 'wav' | 'mp3';

export const CLICK_EXPORT_EXTENSION: Record<ClickExportFormat, string> = { wav: 'wav', mp3: 'mp3' };

/** A click only has to be heard, and a constant-bitrate MP3 of mostly silence is tiny at this rate (about 4.8 MB per 20 minutes). */
const MP3_KBPS = 32;
/** lamejs works in blocks of 1152 samples; a block takes about 3 ms to encode. */
const MP3_BLOCK = 1152 * 8;
/** Encoding runs on the main thread: after this much work the browser gets a turn. */
const WORK_BUDGET_MS = 25;

/**
 * Lets the page paint and handle input. A message event rather than `setTimeout`, because browsers
 * throttle timers in a background tab to once a second or less, which would stall a long export
 * the moment the person switches tabs.
 */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

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
 * Encodes mono PCM as MP3. The encoder (LGPL-3.0, about 170 KB) is its own chunk, fetched and run only
 * when this is called. (The service worker may still precache the file.)
 */
export async function mp3Sink(sampleRate: number): Promise<PcmSink> {
  let lib: typeof import('@breezystack/lamejs');
  try {
    lib = await import('@breezystack/lamejs');
  } catch {
    throw new Error("Couldn't load the MP3 encoder. Check your connection and try again, or download the WAV.");
  }
  const { Mp3Encoder } = lib;
  const encoder = new Mp3Encoder(1, sampleRate, MP3_KBPS);
  const type = 'audio/mpeg';
  let blob = new Blob([], { type });
  return {
    push: async (pcm) => {
      // pcm16 writes little-endian, which is what every browser's Int16Array is.
      const samples = new Int16Array(pcm);
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let turnStart = performance.now();
      for (let i = 0; i < samples.length; i += MP3_BLOCK) {
        if (performance.now() - turnStart > WORK_BUDGET_MS) {
          await nextTurn();
          turnStart = performance.now();
        }
        // slice(): the encoder may reuse the array it returns on the next call.
        const out = encoder.encodeBuffer(samples.subarray(i, i + MP3_BLOCK)).slice();
        if (out.length > 0) parts.push(out);
      }
      blob = new Blob([blob, ...parts], { type });
    },
    finish: () => new Blob([blob, encoder.flush().slice()], { type }),
  };
}
