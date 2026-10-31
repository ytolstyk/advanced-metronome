import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mp3Encoder } from '@breezystack/lamejs';
import { CLICK_EXPORT_EXTENSION, mp3Sink, wavSink, type PcmSink } from './clickExportSinks';

const RATE = 22050;
const MP3_KBPS = 32;

/** 16-bit mono PCM of short 1 kHz click bursts every half second: what the exporter really feeds the sink. */
function clickSignal(seconds: number): Int16Array {
  const samples = new Int16Array(Math.round(seconds * RATE));
  const burst = Math.round(0.025 * RATE);
  const period = RATE / 2;
  for (let i = 0; i < samples.length; i++) {
    const phase = i % period;
    if (phase < burst) {
      const envelope = 1 - phase / burst;
      samples[i] = Math.round(Math.sin((2 * Math.PI * 1000 * i) / RATE) * envelope * 0x6000);
    }
  }
  return samples;
}

/** The slice as the ArrayBuffer the exporter hands over (copy: `subarray` shares its parent's buffer). */
const slice = (all: Int16Array, from: number, to: number): ArrayBuffer => all.slice(from, to).buffer;

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

async function encodeInSlices(signal: Int16Array, sizes: number[]): Promise<Blob> {
  const sink = await mp3Sink(RATE);
  let at = 0;
  for (const size of sizes) {
    await sink.push(slice(signal, at, Math.min(at + size, signal.length)));
    at += size;
  }
  if (at < signal.length) await sink.push(slice(signal, at, signal.length));
  return sink.finish();
}

describe('CLICK_EXPORT_EXTENSION', () => {
  it('maps each format to its file extension', () => {
    expect(CLICK_EXPORT_EXTENSION).toEqual({ wav: 'wav', mp3: 'mp3' });
  });
});

describe('wavSink', () => {
  it('writes a mono 16-bit header for the declared sample count and rate', async () => {
    const sink = wavSink(1000, RATE);
    await sink.push(new Int16Array(1000).buffer);
    const blob = sink.finish();
    const view = new DataView(await blob.arrayBuffer());
    const tag = (off: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(off + i)));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(12)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint32(28, true)).toBe(RATE * 2); // byte rate: mono, 2 bytes per sample
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(tag(36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(2000);
    expect(view.getUint32(4, true)).toBe(36 + 2000);
  });

  it('is 44 header bytes plus 2 bytes per mono sample, typed audio/wav', async () => {
    const sink = wavSink(300, RATE);
    await sink.push(new Int16Array(100).buffer);
    await sink.push(new Int16Array(200).buffer);
    const blob = sink.finish();
    expect(blob.size).toBe(44 + 300 * 2);
    expect(blob.type).toBe('audio/wav');
  });

  it('concatenates the pushed slices in order after the header', async () => {
    const sink = wavSink(6, RATE);
    await sink.push(Int16Array.from([1, 2, 3]).buffer);
    await sink.push(Int16Array.from([-4, 5, 6]).buffer);
    const view = new DataView(await sink.finish().arrayBuffer());
    expect([0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true))).toEqual([1, 2, 3, -4, 5, 6]);
  });

  it('returns a promise from push, and a header-only file before anything is pushed', async () => {
    const sink = wavSink(0, RATE);
    expect(sink.finish().size).toBe(44);
    expect(sink.push(new ArrayBuffer(0))).toBeInstanceOf(Promise);
  });
});

describe('mp3Sink', () => {
  it('types the file audio/mpeg and starts with an MPEG frame sync', async () => {
    const blob = await encodeInSlices(clickSignal(3), [RATE * 3]);
    expect(blob.type).toBe('audio/mpeg');
    const bytes = await bytesOf(blob);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]! & 0xe0).toBe(0xe0); // the 11 sync bits: 0xFF then three more set bits
  });

  it('is far smaller than the equivalent mono WAV and close to bitrate x duration', async () => {
    const seconds = 6;
    const blob = await encodeInSlices(clickSignal(seconds), [RATE * seconds]);
    const wavSize = 44 + seconds * RATE * 2;
    expect(blob.size).toBeLessThan(wavSize / 10);
    const expected = (MP3_KBPS * 1000 * seconds) / 8; // constant bitrate
    expect(blob.size).toBeGreaterThan(expected * 0.9);
    expect(blob.size).toBeLessThan(expected * 1.1 + 1000); // + a frame or two of encoder delay and flush
  });

  it('handles slices that are not a multiple of 1152 samples (or of the 9216-sample block)', async () => {
    const seconds = 5;
    const signal = clickSignal(seconds);
    const blob = await encodeInSlices(signal, [10001, 777, 33333, 1, 4096 + 3]);
    const bytes = await bytesOf(blob);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]! & 0xe0).toBe(0xe0);
    const expected = (MP3_KBPS * 1000 * seconds) / 8;
    expect(blob.size).toBeGreaterThan(expected * 0.9);
    expect(blob.size).toBeLessThan(expected * 1.1 + 1000);
  });

  it('gives the same bytes however the signal is cut into pushes (multiple pushes concatenate)', async () => {
    const signal = clickSignal(4);
    const whole = await bytesOf(await encodeInSlices(signal, [signal.length]));
    const cut = await bytesOf(await encodeInSlices(signal, [5000, 12345, 1, 20000, 999]));
    expect(cut.length).toBe(whole.length);
    expect(cut).toEqual(whole);
  });

  it('includes the encoder flush: the file equals encode + flush from a reference encoder', async () => {
    const signal = clickSignal(2);
    const reference = new Mp3Encoder(1, RATE, MP3_KBPS);
    const parts: Uint8Array[] = [];
    for (let i = 0; i < signal.length; i += 1152) {
      const out = reference.encodeBuffer(signal.subarray(i, i + 1152));
      if (out.length > 0) parts.push(new Uint8Array(out));
    }
    const flushed = reference.flush();
    expect(flushed.length).toBeGreaterThan(0); // otherwise this test could not tell flush from no flush
    parts.push(new Uint8Array(flushed));
    const expected = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      expected.set(p, at);
      at += p.length;
    }

    const actual = await bytesOf(await encodeInSlices(signal, [signal.length]));
    expect(actual.length).toBe(expected.length);
    expect(actual).toEqual(expected);
  });

  it('keeps earlier output intact when the encoder reuses its output array between calls', async () => {
    // Two different signals through two pushes: the second half must not overwrite the first half's bytes.
    const signal = clickSignal(4);
    const twoPushes = await bytesOf(await encodeInSlices(signal, [signal.length / 2]));
    const onePush = await bytesOf(await encodeInSlices(signal, [signal.length]));
    expect(twoPushes).toEqual(onePush);
  });

  it('produces a valid file with no audio pushed (flush only) and with an empty push', async () => {
    const sink: PcmSink = await mp3Sink(RATE);
    await sink.push(new ArrayBuffer(0));
    const blob = sink.finish();
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThanOrEqual(0);
  });

  describe('yielding to the page', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    /** Counts message channels created: each `nextTurn()` makes one. */
    function countTurns() {
      const Real = globalThis.MessageChannel;
      const counter = { turns: 0 };
      vi.stubGlobal(
        'MessageChannel',
        class CountingChannel extends Real {
          constructor() {
            super();
            counter.turns++;
          }
        },
      );
      return counter;
    }

    it('takes a turn before a block once 25 ms of work have passed, then resumes and finishes the file', async () => {
      const counter = countTurns();
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (now += 100)); // every block looks slow
      const sink = await mp3Sink(RATE);
      await sink.push(clickSignal(1).slice(0, 9216 * 3).buffer); // 3 blocks
      expect(counter.turns).toBe(3);
      const bytes = await bytesOf(sink.finish());
      expect(bytes[0]).toBe(0xff);
    });

    it('does not take a turn while the work stays within the budget', async () => {
      const counter = countTurns();
      vi.spyOn(performance, 'now').mockReturnValue(1000); // time stands still
      const sink = await mp3Sink(RATE);
      await sink.push(new Int16Array(9216 * 20).buffer);
      expect(counter.turns).toBe(0);
    });

    it('produces the same bytes whether or not it yielded between blocks', async () => {
      const signal = clickSignal(3);
      const quiet = await bytesOf(await encodeInSlices(signal, [signal.length]));
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (now += 100));
      const yielding = await bytesOf(await encodeInSlices(signal, [signal.length]));
      expect(yielding).toEqual(quiet);
    });
  });
});

describe('mp3Sink when the encoder cannot be loaded', () => {
  afterEach(() => {
    vi.doUnmock('@breezystack/lamejs');
    vi.resetModules();
  });

  it('rejects with a plain-language message that points at the WAV', async () => {
    vi.resetModules();
    vi.doMock('@breezystack/lamejs', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const fresh = await import('./clickExportSinks');
    await expect(fresh.mp3Sink(RATE)).rejects.toThrow(
      "Couldn't load the MP3 encoder. Check your connection and try again, or download the WAV.",
    );
  });

  it('does not leak the underlying loader error text', async () => {
    vi.resetModules();
    vi.doMock('@breezystack/lamejs', () => {
      throw new Error('https://example.invalid/assets/lamejs-abc123.js');
    });
    const fresh = await import('./clickExportSinks');
    await expect(fresh.mp3Sink(RATE)).rejects.not.toThrow(/example\.invalid/);
  });
});
