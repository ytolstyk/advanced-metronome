import { describe, expect, it } from 'vitest';
import { CLICK_EXPORT_EXTENSION, FLAC_DOWNLOAD_HINT, flacSink, wavSink } from './clickExportSinks';
import { FLAC_BLOCK_SIZE } from './flacEncoder';
import { decodeFlac } from '../test/flacReferenceDecoder';

const RATE = 22050;

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

async function encodeInSlices(signal: Int16Array, sizes: number[], rate = RATE): Promise<Blob> {
  const sink = flacSink(signal.length, rate);
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
    expect(CLICK_EXPORT_EXTENSION).toEqual({ wav: 'wav', flac: 'flac' });
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

describe('FLAC_DOWNLOAD_HINT', () => {
  it('names both FLAC and the WAV, so people know what to fall back to', () => {
    expect(FLAC_DOWNLOAD_HINT).toMatch(/lossless/i);
    expect(FLAC_DOWNLOAD_HINT).toContain('FLAC');
    expect(FLAC_DOWNLOAD_HINT).toContain('WAV');
  });
});

describe('flacSink', () => {
  const SLICINGS: Array<[string, number[]]> = [
    ['one push', [Number.MAX_SAFE_INTEGER]],
    ['1-sample slices then the rest', [1, 1, 1, Number.MAX_SAFE_INTEGER]],
    ['777-sample slices', new Array(40).fill(777)],
    ['1024-sample slices (exactly one frame each)', new Array(40).fill(1024)],
    ['odd mix', [1, 777, 1024, 5000, 3, 1023, 1025, 20000, 2047]],
    ['5000-sample slices', new Array(10).fill(5000)],
  ];

  it('types the file audio/flac and starts with the fLaC marker', async () => {
    const blob = await encodeInSlices(clickSignal(1), [RATE]);
    expect(blob.type).toBe('audio/flac');
    const bytes = await bytesOf(blob);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('fLaC');
  });

  it('keeps the audio/flac type when it is only the header (nothing pushed)', () => {
    const sink = flacSink(0, RATE);
    const blob = sink.finish();
    expect(blob.type).toBe('audio/flac');
    expect(blob.size).toBe(42);
  });

  it.each(SLICINGS)('produces a byte-identical file for %s as for pushing everything at once', async (_name, sizes) => {
    const signal = clickSignal(3);
    const whole = await bytesOf(await encodeInSlices(signal, [signal.length]));
    const cut = await bytesOf(await encodeInSlices(signal, sizes));
    expect(cut.length).toBe(whole.length);
    expect(cut).toEqual(whole);
  });

  it.each(SLICINGS)('decodes to exactly the input PCM for %s', async (_name, sizes) => {
    const signal = clickSignal(3);
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, sizes)));
    expect(Array.from(decoded.samples)).toEqual(Array.from(signal));
  });

  it('writes the explicit 22050 Hz sample-rate code into every frame header (Apple decoders need it)', async () => {
    const signal = clickSignal(1).slice(0, FLAC_BLOCK_SIZE + 300);
    const bytes = await bytesOf(await encodeInSlices(signal, [signal.length]));
    const decoded = decodeFlac(bytes);
    expect(Array.from(bytes.subarray(42, 46))).toEqual([0xff, 0xf8, 0xa6, 0x08]);
    expect(bytes[42 + decoded.frames[0]!.byteLength + 2]).toBe(0x76);
    expect(decoded.frames.every((f) => f.sampleRateCode === 6)).toBe(true);
  });

  it('writes the code for the rate it was given (44100 Hz -> 9) in every frame', async () => {
    const signal = clickSignal(1).slice(0, 3000);
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, [signal.length], 44100)));
    expect(decoded.frames.every((f) => f.sampleRateCode === 9)).toBe(true);
  });

  it('writes the declared total and sample rate into STREAMINFO', async () => {
    const signal = clickSignal(2);
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, [3000, 100000], 22050)));
    expect(decoded.info.totalSamples).toBe(signal.length);
    expect(decoded.info.sampleRate).toBe(22050);
    expect(decoded.info.channels).toBe(1);
    expect(decoded.info.bitsPerSample).toBe(16);
  });

  it('declares the sample rate it was given', async () => {
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(clickSignal(1).slice(0, 2000), [2000], 44100)));
    expect(decoded.info.sampleRate).toBe(44100);
  });

  it('cuts every frame at 1024 samples except the last, whatever the push sizes', async () => {
    const signal = clickSignal(3).slice(0, FLAC_BLOCK_SIZE * 7 + 300);
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, [1, 777, 1024, 5000, 3])));
    expect(decoded.frames.map((f) => f.blockSize)).toEqual([...new Array(7).fill(FLAC_BLOCK_SIZE), 300]);
    expect(decoded.frames.map((f) => f.frameNumber)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('emits no partial frame when the total is a whole number of blocks', async () => {
    const signal = clickSignal(3).slice(0, FLAC_BLOCK_SIZE * 4);
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, [1500, 1500])));
    expect(decoded.frames.map((f) => f.blockSize)).toEqual([1024, 1024, 1024, 1024]);
  });

  it('flushes a leftover shorter than a block as a final frame in finish()', async () => {
    const signal = clickSignal(1).slice(0, 1500);
    const sink = flacSink(signal.length, RATE);
    await sink.push(slice(signal, 0, 1500));
    const decoded = decodeFlac(await bytesOf(sink.finish()));
    expect(decoded.frames.map((f) => f.blockSize)).toEqual([1024, 476]);
    expect(Array.from(decoded.samples)).toEqual(Array.from(signal));
  });

  it('keeps a sub-block push entirely in the carry until finish() writes it', async () => {
    const sink = flacSink(10, RATE);
    await sink.push(Int16Array.from([1, 2, 3, 4, 5]).buffer);
    await sink.push(Int16Array.from([6, 7, 8, 9, 10]).buffer);
    const decoded = decodeFlac(await bytesOf(sink.finish()));
    expect(decoded.frames).toHaveLength(1);
    expect(Array.from(decoded.samples)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('writes a final frame of a single sample', async () => {
    const signal = clickSignal(1).slice(0, FLAC_BLOCK_SIZE + 1);
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, [signal.length])));
    expect(decoded.frames.map((f) => f.blockSize)).toEqual([FLAC_BLOCK_SIZE, 1]);
    expect(Array.from(decoded.samples)).toEqual(Array.from(signal));
  });

  it('accepts empty pushes anywhere without changing the file', async () => {
    const signal = clickSignal(1);
    const plain = await bytesOf(await encodeInSlices(signal, [signal.length]));
    const sink = flacSink(signal.length, RATE);
    await sink.push(new ArrayBuffer(0));
    await sink.push(slice(signal, 0, 3000));
    await sink.push(new ArrayBuffer(0));
    await sink.push(slice(signal, 3000, signal.length));
    await sink.push(new ArrayBuffer(0));
    expect(await bytesOf(sink.finish())).toEqual(plain);
  });

  it('a second finish() adds nothing', async () => {
    const signal = clickSignal(1).slice(0, 1500);
    const sink = flacSink(signal.length, RATE);
    await sink.push(slice(signal, 0, 1500));
    const first = await bytesOf(sink.finish());
    const second = await bytesOf(sink.finish());
    expect(second).toEqual(first);
  });

  it('does not read pushed memory later: changing the pushed buffer after push() leaves the file alone', async () => {
    const signal = clickSignal(1);
    const expected = await bytesOf(await encodeInSlices(signal, [signal.length]));
    const sink = flacSink(signal.length, RATE);
    const first = slice(signal, 0, 1500); // 1500 = one frame plus a carry
    await sink.push(first);
    new Int16Array(first).fill(12345);
    await sink.push(slice(signal, 1500, signal.length));
    expect(await bytesOf(sink.finish())).toEqual(expected);
  });

  it('returns a promise from push', () => {
    expect(flacSink(0, RATE).push(new ArrayBuffer(0))).toBeInstanceOf(Promise);
  });

  it('round-trips full-scale content that forces verbatim frames', async () => {
    const signal = Int16Array.from({ length: 5000 }, (_, i) => (i % 2 === 0 ? -32768 : 32767));
    const decoded = decodeFlac(await bytesOf(await encodeInSlices(signal, [999, 3001])));
    expect(Array.from(decoded.samples)).toEqual(Array.from(signal));
    expect(decoded.frames.some((f) => f.subframe === 'verbatim')).toBe(true);
  });

  it('is far smaller than the equivalent mono WAV for sparse clicks', async () => {
    const seconds = 6;
    const blob = await encodeInSlices(clickSignal(seconds), [RATE * seconds]);
    expect(blob.size).toBeLessThan((44 + seconds * RATE * 2) / 10);
  });

  it('matches the WAV sink sample for sample', async () => {
    const signal = clickSignal(2);
    const wav = wavSink(signal.length, RATE);
    await wav.push(signal.slice().buffer);
    const wavBytes = await bytesOf(wav.finish());
    const wavSamples = new Int16Array(wavBytes.slice(44).buffer);
    const flacSamples = decodeFlac(await bytesOf(await encodeInSlices(signal, [12345, 999999]))).samples;
    expect(Array.from(flacSamples)).toEqual(Array.from(wavSamples));
  });
});
