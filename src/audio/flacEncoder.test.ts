import { describe, expect, it } from 'vitest';
import { FLAC_BLOCK_SIZE, flacFrame as encodeFrame, flacStreamHeader } from './flacEncoder';
import {
  decodeFlac,
  decodeFlacFrame,
  parseStreamInfo,
  referenceCrc16,
  referenceCrc8,
  type FlacStreamInfo,
} from '../test/flacReferenceDecoder';

const RATE = 22050;

// ── Signal builders ────────────────────────────────────────────────────────────

/** Deterministic noise (mulberry32) so the suite never depends on Math.random. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const silence = (n: number) => new Int16Array(n);

const noise = (n: number, amplitude: number, seed = 1) => {
  const next = prng(seed);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round((next() * 2 - 1) * amplitude);
  return out;
};

/** A decaying 1 kHz burst starting at `at`, inside `n` samples of digital silence. */
function clickInSilence(n: number, at: number, length = 550): Int16Array {
  const out = new Int16Array(n);
  for (let i = 0; i < length && at + i < n; i++) {
    const env = 1 - i / length;
    out[at + i] = Math.round(Math.sin((2 * Math.PI * 1000 * i) / RATE) * env * 0x6000);
  }
  return out;
}

const decayingSine = (n: number, hz: number, amplitude: number, decay: number) => {
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / RATE) * amplitude * Math.exp(-decay * i));
  return out;
};

const alternatingFullScale = (n: number) => Int16Array.from({ length: n }, (_, i) => (i % 2 === 0 ? -32768 : 32767));
const squareWave = (n: number, half: number) => Int16Array.from({ length: n }, (_, i) => (Math.floor(i / half) % 2 === 0 ? 32767 : -32768));
const rampUp = (n: number) => Int16Array.from({ length: n }, (_, i) => Math.round(-32768 + (65535 * i) / Math.max(1, n - 1)));
const rampDown = (n: number) => Int16Array.from({ length: n }, (_, i) => Math.round(32767 - (65535 * i) / Math.max(1, n - 1)));
const slope = (n: number, step: number, start = 0) => Int16Array.from({ length: n }, (_, i) => start + i * step);
const extremes = (n: number) => Int16Array.from({ length: n }, (_, i) => [0, 32767, -32768, 32767, 32767, -32768][i % 6]!);

// ── Encoding helpers ───────────────────────────────────────────────────────────

const frameAt = (samples: Int16Array, frameNumber: number, sampleRate = RATE) => encodeFrame(samples, frameNumber, sampleRate);

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A whole file, the way the sink cuts it: 1024-sample frames, a shorter last one. */
function encodeFile(samples: Int16Array, sampleRate = RATE): Uint8Array {
  const parts: Uint8Array[] = [flacStreamHeader(sampleRate, samples.length)];
  for (let i = 0, n = 0; i < samples.length; i += FLAC_BLOCK_SIZE, n++) {
    parts.push(frameAt(samples.subarray(i, i + FLAC_BLOCK_SIZE), n, sampleRate));
  }
  return concat(parts);
}

const infoFor = (totalSamples = 0, rate = RATE): FlacStreamInfo => parseStreamInfo(flacStreamHeader(rate, totalSamples));

function decodeSingleFrame(samples: Int16Array, frameNumber = 0) {
  const bytes = frameAt(samples, frameNumber);
  const frame = decodeFlacFrame(bytes, 0, infoFor());
  return { bytes, frame };
}

// ── The reference decoder itself ───────────────────────────────────────────────

describe('reference decoder checks', () => {
  const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

  it('computes the standard CRC-8 (poly 0x07) and CRC-16 (poly 0x8005) check values', () => {
    expect(referenceCrc8(ascii('123456789'))).toBe(0xf4);
    expect(referenceCrc16(ascii('123456789'))).toBe(0xfee8);
  });

  it('rejects a frame whose body was altered (CRC-16)', () => {
    const bytes = frameAt(decayingSine(FLAC_BLOCK_SIZE, 440, 9000, 0.002), 0);
    bytes[bytes.length - 5] = bytes[bytes.length - 5]! ^ 0x10;
    expect(() => decodeFlacFrame(bytes, 0, infoFor())).toThrow();
  });

  it('rejects a frame whose header was altered (CRC-8)', () => {
    const bytes = frameAt(silence(FLAC_BLOCK_SIZE), 3);
    bytes[4] = bytes[4]! ^ 0x01; // the frame number
    expect(() => decodeFlacFrame(bytes, 0, infoFor())).toThrow(/CRC-8|UTF-8/);
  });

  it('rejects data that is not at a frame boundary', () => {
    const bytes = frameAt(silence(FLAC_BLOCK_SIZE), 0);
    expect(() => decodeFlacFrame(bytes, 1, infoFor())).toThrow(/sync/);
  });

  it('rejects a stream whose STREAMINFO length does not match the frames', () => {
    const bytes = encodeFile(silence(3000));
    const header = flacStreamHeader(RATE, 2999);
    const tampered = concat([header, bytes.subarray(header.length)]);
    expect(() => decodeFlac(tampered)).toThrow(/STREAMINFO says 2999/);
  });
});

// ── STREAMINFO ─────────────────────────────────────────────────────────────────

describe('flacStreamHeader', () => {
  it('starts with the fLaC marker and one last-block STREAMINFO header of 34 bytes', () => {
    const h = flacStreamHeader(RATE, 1234);
    expect(String.fromCharCode(h[0]!, h[1]!, h[2]!, h[3]!)).toBe('fLaC');
    expect(h[4]).toBe(0x80); // last-metadata-block flag + type 0
    expect([h[5], h[6], h[7]]).toEqual([0, 0, 34]);
    expect(h.length).toBe(4 + 4 + 34);
  });

  it('declares mono 16-bit audio at the given rate and a fixed 1024 block size', () => {
    const info = parseStreamInfo(flacStreamHeader(22050, 1234));
    expect(info.sampleRate).toBe(22050);
    expect(info.channels).toBe(1);
    expect(info.bitsPerSample).toBe(16);
    expect(info.minBlockSize).toBe(FLAC_BLOCK_SIZE);
    expect(info.maxBlockSize).toBe(FLAC_BLOCK_SIZE);
    expect(info.totalSamples).toBe(1234);
    expect(info.headerLength).toBe(42);
  });

  it('leaves the MD5 as all zeros (not computed)', () => {
    expect(parseStreamInfo(flacStreamHeader(RATE, 5)).md5Unset).toBe(true);
    expect(Array.from(flacStreamHeader(RATE, 5).subarray(26, 42))).toEqual(new Array(16).fill(0));
  });

  it.each([1, 8000, 22050, 44100, 48000, 96000, 1048575])('stores a sample rate of %i Hz in its 20-bit field', (rate) => {
    expect(parseStreamInfo(flacStreamHeader(rate, 10)).sampleRate).toBe(rate);
  });

  it.each([
    0,
    1,
    1024,
    2 ** 31,
    2 ** 32 - 1,
    2 ** 32, // first value that needs the extra 4 bits of the 36-bit field
    2 ** 32 + 12345,
    2 ** 35 + 7,
    2 ** 36 - 1,
  ])('stores %i total samples exactly through the 36-bit field', (total) => {
    expect(parseStreamInfo(flacStreamHeader(RATE, total)).totalSamples).toBe(total);
  });

  it('does not let the high bits of a long file disturb the sample rate, channel or bit-depth fields', () => {
    const info = parseStreamInfo(flacStreamHeader(RATE, 2 ** 36 - 1));
    expect([info.sampleRate, info.channels, info.bitsPerSample]).toEqual([RATE, 1, 16]);
  });
});

describe('flacStreamHeader range checks', () => {
  it('accepts the largest rate (2**20 - 1), the smallest rate (1), and the largest length (2**36 - 1)', () => {
    expect(parseStreamInfo(flacStreamHeader(2 ** 20 - 1, 0)).sampleRate).toBe(2 ** 20 - 1);
    expect(parseStreamInfo(flacStreamHeader(1, 0)).sampleRate).toBe(1);
    expect(parseStreamInfo(flacStreamHeader(RATE, 2 ** 36 - 1)).totalSamples).toBe(2 ** 36 - 1);
  });

  it.each([0, -1, 2 ** 20, 2 ** 20 + 1, 22050.5, NaN, Infinity, -Infinity])('throws a RangeError for a sample rate of %s', (rate) => {
    expect(() => flacStreamHeader(rate, 10)).toThrow(RangeError);
  });

  it.each([-1, 2 ** 36, 2 ** 36 + 1, 2 ** 53, 1.5, NaN, Infinity, -Infinity])('throws a RangeError for a total of %s samples', (total) => {
    expect(() => flacStreamHeader(RATE, total)).toThrow(RangeError);
  });
});

describe('flacFrame range checks', () => {
  it('accepts the smallest (1) and the largest (65536) frame', () => {
    expect(decodeSingleFrame(Int16Array.of(-5)).frame.samples).toEqual(Int16Array.of(-5));
    const big = clickInSilence(65536, 1000);
    expect(Array.from(decodeSingleFrame(big).frame.samples)).toEqual(Array.from(big));
  });

  it('throws a RangeError for an empty frame', () => {
    expect(() => frameAt(new Int16Array(0), 0)).toThrow(RangeError);
  });

  it('throws a RangeError for a frame one sample past 65536', () => {
    expect(() => frameAt(new Int16Array(65537), 0)).toThrow(RangeError);
  });
});

// ── Round trips ────────────────────────────────────────────────────────────────

describe('flacFrame round trip', () => {
  const signals: Array<[string, () => Int16Array]> = [
    ['digital silence', () => silence(FLAC_BLOCK_SIZE)],
    ['constant non-zero level', () => new Int16Array(FLAC_BLOCK_SIZE).fill(-1234)],
    ['constant at full scale', () => new Int16Array(FLAC_BLOCK_SIZE).fill(-32768)],
    ['a click at the start of the block', () => clickInSilence(FLAC_BLOCK_SIZE, 0)],
    ['a click in the middle of silence', () => clickInSilence(FLAC_BLOCK_SIZE, 400)],
    ['a single one-sample impulse', () => Int16Array.from({ length: FLAC_BLOCK_SIZE }, (_, i) => (i === 700 ? 32767 : 0))],
    ['a decaying low sine', () => decayingSine(FLAC_BLOCK_SIZE, 220, 20000, 0.002)],
    ['a fast-decaying high sine', () => decayingSine(FLAC_BLOCK_SIZE, 3000, 30000, 0.01)],
    ['a full-scale sine', () => decayingSine(FLAC_BLOCK_SIZE, 1000, 32767, 0)],
    ['alternating -32768 / 32767', () => alternatingFullScale(FLAC_BLOCK_SIZE)],
    ['a full-scale square wave', () => squareWave(FLAC_BLOCK_SIZE, 20)],
    ['a square wave with a 1 sample half-period', () => squareWave(FLAC_BLOCK_SIZE, 1)],
    ['the extreme values mixed', () => extremes(FLAC_BLOCK_SIZE)],
    ['quiet noise', () => noise(FLAC_BLOCK_SIZE, 20)],
    ['loud noise', () => noise(FLAC_BLOCK_SIZE, 20000, 7)],
    ['full-scale noise', () => noise(FLAC_BLOCK_SIZE, 32767, 9)],
    ['an upward ramp over the whole range', () => rampUp(FLAC_BLOCK_SIZE)],
    ['a downward ramp over the whole range', () => rampDown(FLAC_BLOCK_SIZE)],
    ['a gentle slope', () => slope(FLAC_BLOCK_SIZE, 3, -1000)],
    ['a loud first half and a quiet second half', () => {
      const out = noise(FLAC_BLOCK_SIZE, 3);
      out.set(noise(FLAC_BLOCK_SIZE / 2, 25000, 4));
      return out;
    }],
  ];

  it.each(signals)('decodes %s back to exactly the input', (_name, make) => {
    const input = make();
    const { frame, bytes } = decodeSingleFrame(input, 5);
    expect(Array.from(frame.samples)).toEqual(Array.from(input));
    expect(frame.byteLength).toBe(bytes.length);
    expect(frame.frameNumber).toBe(5);
    expect(frame.blockSize).toBe(FLAC_BLOCK_SIZE);
  });

  it('never makes a frame bigger than the raw samples plus a small fixed overhead', () => {
    for (const [, make] of signals) {
      const input = make();
      const bytes = frameAt(input, 0);
      // header (6) + subframe byte + 16-bit samples + CRC-16 (2): the worst case is verbatim
      expect(bytes.length).toBeLessThanOrEqual(6 + 1 + input.length * 2 + 2);
    }
  });

  it('is deterministic and does not modify its input', () => {
    const input = noise(FLAC_BLOCK_SIZE, 5000, 3);
    const copy = input.slice();
    const a = frameAt(input, 2);
    const b = frameAt(input, 2);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(input)).toEqual(Array.from(copy));
  });

  it('encodes a subarray view the same as an independent copy of the same samples', () => {
    const big = noise(5000, 9000, 11);
    const view = big.subarray(1000, 1000 + FLAC_BLOCK_SIZE);
    expect(Array.from(frameAt(view, 1))).toEqual(Array.from(frameAt(view.slice(), 1)));
    expect(Array.from(decodeSingleFrame(view.slice()).frame.samples)).toEqual(Array.from(view));
  });

  it('round-trips a random mix of block contents under many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const next = prng(seed * 977);
      const amp = Math.floor(next() * 32767) + 1;
      const input = noise(FLAC_BLOCK_SIZE, amp, seed);
      // randomly flatten a stretch so some blocks mix constant runs with signal
      const from = Math.floor(next() * FLAC_BLOCK_SIZE);
      input.fill(0, from, Math.min(FLAC_BLOCK_SIZE, from + Math.floor(next() * 600)));
      expect(Array.from(decodeSingleFrame(input, seed).frame.samples)).toEqual(Array.from(input));
    }
  });
});

describe('loud and jagged blocks (Rice search is clamped to parameter 14)', () => {
  it.each([1, 2, 3, 64, 255, 256, 257, 1023, 1024, 3000])('round-trips %i samples of alternating +32767 / -32768 and full-scale noise', (n) => {
    for (const input of [alternatingFullScale(n), noise(n, 32767, n + 100), squareWave(n, 1), extremes(n)]) {
      const { frame, bytes } = decodeSingleFrame(input);
      expect(Array.from(frame.samples)).toEqual(Array.from(input));
      for (const k of frame.riceParams) expect(k).toBeLessThanOrEqual(14);
      expect(bytes.length).toBeLessThanOrEqual(frame.headerLength + 1 + n * 2 + 2); // never worse than verbatim
    }
  });
});

describe('subframe selection', () => {
  it('stores a block of digital silence as a constant subframe a handful of bytes long', () => {
    const { frame, bytes } = decodeSingleFrame(silence(FLAC_BLOCK_SIZE), 0);
    expect(frame.subframe).toBe('constant');
    expect(bytes.length).toBeLessThan(12);
    expect(bytes.length).toBe(frame.headerLength + 3 + 2); // subframe header + 16-bit value + CRC-16
  });

  it('stores a constant non-zero block as a constant subframe too', () => {
    const { frame, bytes } = decodeSingleFrame(new Int16Array(FLAC_BLOCK_SIZE).fill(32767), 7);
    expect(frame.subframe).toBe('constant');
    expect(bytes.length).toBeLessThan(12);
  });

  it('falls back to verbatim for full-scale noise, where nothing beats the raw 16-bit samples', () => {
    const input = noise(FLAC_BLOCK_SIZE, 32767, 9);
    const { frame, bytes } = decodeSingleFrame(input);
    expect(frame.subframe).toBe('verbatim');
    expect(bytes.length).toBe(frame.headerLength + 1 + input.length * 2 + 2);
  });

  it('falls back to verbatim for alternating -32768 / 32767, whose residuals are enormous', () => {
    const { frame } = decodeSingleFrame(alternatingFullScale(FLAC_BLOCK_SIZE));
    expect(frame.subframe).toBe('verbatim');
  });

  it('uses a fixed predictor with far fewer bytes than verbatim for a smooth decaying sine', () => {
    const { frame, bytes } = decodeSingleFrame(decayingSine(FLAC_BLOCK_SIZE, 440, 20000, 0.003));
    expect(frame.subframe).toBe('fixed');
    expect(frame.order).toBeGreaterThanOrEqual(1);
    expect(bytes.length).toBeLessThan(FLAC_BLOCK_SIZE * 2 * 0.6);
  });

  it('picks order 2 or higher for a straight slope, whose second difference is zero', () => {
    const { frame, bytes } = decodeSingleFrame(slope(FLAC_BLOCK_SIZE, 3, -1000));
    expect(frame.subframe).toBe('fixed');
    expect(frame.order).toBeGreaterThanOrEqual(2);
    expect(bytes.length).toBeLessThan(FLAC_BLOCK_SIZE / 4);
  });

  it('uses fixed order 0 for small zero-mean noise, with no worse than 8 bits per sample', () => {
    const { frame, bytes } = decodeSingleFrame(noise(FLAC_BLOCK_SIZE, 20));
    expect(frame.subframe).toBe('fixed');
    expect(bytes.length).toBeLessThan(FLAC_BLOCK_SIZE);
  });

  it('splits a half-loud, half-quiet block into several Rice partitions', () => {
    const input = noise(FLAC_BLOCK_SIZE, 1);
    input.set(noise(FLAC_BLOCK_SIZE / 2, 20000, 5));
    const { frame } = decodeSingleFrame(input);
    expect(frame.subframe).toBe('fixed');
    expect(frame.partitionOrder).toBeGreaterThan(0);
    expect(frame.riceParams.length).toBe(2 ** frame.partitionOrder);
    expect(new Set(frame.riceParams).size).toBeGreaterThan(1);
  });

  it('never uses a Rice parameter above 14 (15 is the escape code)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { frame } = decodeSingleFrame(noise(FLAC_BLOCK_SIZE, 30000, seed));
      for (const k of frame.riceParams) expect(k).toBeLessThanOrEqual(14);
    }
  });
});

// ── Partial and odd-sized frames ───────────────────────────────────────────────

describe('frame sizes', () => {
  it.each([1, 2, 3, 4, 5, 7, 100, 255, 256, 257, 511, 1000, 1023, 1024, 3000, 4096, 65536])(
    'round-trips a %i sample frame',
    (n) => {
      for (const make of [() => noise(n, 12000, n), () => clickInSilence(n, Math.floor(n / 3), 400), () => silence(n), () => slope(n, 2)]) {
        const input = make();
        const { frame } = decodeSingleFrame(input, 9);
        expect(frame.blockSize).toBe(n);
        expect(Array.from(frame.samples)).toEqual(Array.from(input));
      }
    },
  );

  it.each([
    [1, 6],
    [2, 6],
    [255, 6],
    [256, 6],
    [257, 7],
    [1023, 7],
    [1024, 10],
    [1025, 7],
    [3000, 7],
    [65536, 7],
  ])('writes a %i sample frame with block-size code %i', (n, code) => {
    const { frame } = decodeSingleFrame(noise(n, 500));
    expect(frame.blockSizeCode).toBe(code);
  });

  it('puts the 8-bit (n-1) after the frame number for sizes up to 256 and the 16-bit (n-1) above', () => {
    expect(frameAt(silence(256), 0)[5]).toBe(255);
    const big = frameAt(silence(3000), 0);
    expect([big[5], big[6]]).toEqual([(2999 >> 8) & 0xff, 2999 & 0xff]);
  });

  it('writes the standard sync, mono 16-bit and the 22.05 kHz rate code', () => {
    const bytes = frameAt(silence(FLAC_BLOCK_SIZE), 0);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xf8); // sync + reserved 0 + fixed block size
    expect(bytes[2]! & 0x0f).toBe(6); // 22.05 kHz is written explicitly, not left to STREAMINFO
    expect(bytes[3]).toBe(0b0000_1000); // mono, 16 bits per sample, reserved 0
  });
});

// ── Sample rate in the frame header ────────────────────────────────────────────

describe('frame header sample-rate code', () => {
  // Apple's decoder reads a file as empty when frames defer to STREAMINFO, so known rates get their own code.
  it.each([
    [88200, 1], [176400, 2], [192000, 3], [8000, 4], [16000, 5], [22050, 6],
    [24000, 7], [32000, 8], [44100, 9], [48000, 10], [96000, 11],
  ])('writes code %i -> %i for a frame at that rate and decodes it against STREAMINFO', (rate, code) => {
    const input = decayingSine(FLAC_BLOCK_SIZE, 440, 9000, 0.002);
    const bytes = frameAt(input, 0, rate);
    expect(bytes[2]! & 0x0f).toBe(code);
    const frame = decodeFlacFrame(bytes, 0, infoFor(0, rate));
    expect(frame.sampleRateCode).toBe(code);
    expect(Array.from(frame.samples)).toEqual(Array.from(input));
  });

  it.each([1, 11025, 12000, 12345, 22000, 50000, 1048575])('falls back to "from STREAMINFO" (0) for %i Hz, which has no code', (rate) => {
    const bytes = frameAt(silence(FLAC_BLOCK_SIZE), 0, rate);
    expect(bytes[2]! & 0x0f).toBe(0);
    expect(decodeFlacFrame(bytes, 0, infoFor(0, rate)).sampleRateCode).toBe(0);
  });

  it('golden bytes: the first frame of a 22050 Hz, 1024-sample file starts FF F8 A6 08', () => {
    const file = encodeFile(clickInSilence(3000, 500));
    const first = file.subarray(42, 46);
    expect(Array.from(first).map((b) => b.toString(16).toUpperCase())).toEqual(['FF', 'F8', 'A6', '8']);
  });

  it('golden bytes: a short last frame of 300 samples (size code 7) has byte 2 === 0x76', () => {
    const file = encodeFile(clickInSilence(1024 + 300, 100));
    const decoded = decodeFlac(file);
    expect(decoded.frames.map((f) => f.blockSize)).toEqual([1024, 300]);
    const lastAt = 42 + decoded.frames[0]!.byteLength;
    expect(file[lastAt]).toBe(0xff);
    expect(file[lastAt + 1]).toBe(0xf8);
    expect(file[lastAt + 2]).toBe(0x76);
    expect(file[lastAt + 3]).toBe(0x08);
  });

  it('golden bytes: the same frames at 44100 Hz carry code 9 (0xA9 / 0x79)', () => {
    expect(frameAt(silence(1024), 0, 44100)[2]).toBe(0xa9);
    expect(frameAt(silence(300), 0, 44100)[2]).toBe(0x79);
  });

  it('a rate without a code (12345 Hz) keeps byte 2 at the block-size code alone', () => {
    expect(frameAt(silence(1024), 0, 12345)[2]).toBe(0xa0);
    expect(frameAt(silence(300), 0, 12345)[2]).toBe(0x70);
  });

  it('keeps the sample-rate code independent of the block-size code', () => {
    for (const n of [1, 256, 257, 1024, 3000]) {
      const bytes = frameAt(silence(n), 0, 44100);
      expect(bytes[2]! & 0x0f).toBe(9);
      expect(decodeFlacFrame(bytes, 0, infoFor(0, 44100)).blockSize).toBe(n);
    }
  });

  it('whole files at 22050 and 44100 Hz carry the rate in every frame and round-trip', () => {
    for (const rate of [22050, 44100]) {
      const input = clickInSilence(5000, 1500);
      const decoded = decodeFlac(encodeFile(input, rate));
      expect(decoded.info.sampleRate).toBe(rate);
      expect(decoded.frames.every((f) => f.sampleRateCode === (rate === 22050 ? 6 : 9))).toBe(true);
      expect(Array.from(decoded.samples)).toEqual(Array.from(input));
    }
  });

  it('is rejected by the reference decoder when the frame code disagrees with STREAMINFO', () => {
    const bytes = frameAt(silence(FLAC_BLOCK_SIZE), 0, 44100);
    expect(() => decodeFlacFrame(bytes, 0, infoFor(0, 22050))).toThrow(/44100/);
  });
});

// ── Frame numbers ──────────────────────────────────────────────────────────────

describe('frame numbers', () => {
  it.each([
    [0, 1],
    [1, 1],
    [127, 1],
    [128, 2],
    [2047, 2],
    [2048, 3],
    [65535, 3],
    [65536, 4],
    [2 ** 21 - 1, 4],
    [2 ** 21, 5],
    [2 ** 26 - 1, 5],
    [2 ** 26, 6],
  ])('codes frame number %i in %i UTF-8 byte(s) and reads it back', (n, utf8Bytes) => {
    const { frame } = decodeSingleFrame(silence(FLAC_BLOCK_SIZE), n);
    expect(frame.frameNumber).toBe(n);
    expect(frame.headerLength).toBe(4 + utf8Bytes + 1); // sync/flags (4), number, CRC-8
  });

  it('keeps the frame content intact around a multi-byte frame number', () => {
    const input = decayingSine(FLAC_BLOCK_SIZE, 330, 12000, 0.004);
    for (const n of [128, 2048, 65536, 2 ** 21]) {
      expect(Array.from(decodeSingleFrame(input, n).frame.samples)).toEqual(Array.from(input));
    }
  });

  it('numbers consecutive frames of a file 0, 1, 2, ... in order', () => {
    const decoded = decodeFlac(encodeFile(noise(FLAC_BLOCK_SIZE * 5 + 17, 800)));
    expect(decoded.frames.map((f) => f.frameNumber)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// ── Whole files ────────────────────────────────────────────────────────────────

describe('a whole file', () => {
  it.each([0, 1, 2, 255, 256, 257, 1023, 1024, 1025, 2048, 3000, 5000])('round-trips %i samples, the last frame partial where needed', (n) => {
    const input = decayingSine(n, 500, 15000, 0.0005);
    const decoded = decodeFlac(encodeFile(input));
    expect(Array.from(decoded.samples)).toEqual(Array.from(input));
    expect(decoded.info.totalSamples).toBe(n);
    expect(decoded.frames.length).toBe(Math.ceil(n / FLAC_BLOCK_SIZE));
    decoded.frames.forEach((f, i, all) => {
      expect(f.blockSize).toBe(i < all.length - 1 ? FLAC_BLOCK_SIZE : n - FLAC_BLOCK_SIZE * i);
    });
  });

  it('round-trips silence, a single click in silence, and ramps as whole files', () => {
    for (const input of [silence(20000), clickInSilence(20000, 8000), rampUp(7000), rampDown(7000), alternatingFullScale(4097), squareWave(9000, 33)]) {
      expect(Array.from(decodeFlac(encodeFile(input)).samples)).toEqual(Array.from(input));
    }
  });

  it('round-trips two seconds of clicks every half second, as the exporter produces them', () => {
    const n = RATE * 2;
    const input = new Int16Array(n);
    for (let beat = 0; beat < 4; beat++) input.set(clickInSilence(2000, 0).subarray(0, Math.min(2000, n - beat * (RATE / 2))), beat * (RATE / 2));
    expect(Array.from(decodeFlac(encodeFile(input)).samples)).toEqual(Array.from(input));
  });

  it('makes the silent frames between clicks tiny constant frames', () => {
    const input = clickInSilence(RATE * 2, 5000);
    const decoded = decodeFlac(encodeFile(input));
    const constants = decoded.frames.filter((f) => f.subframe === 'constant');
    expect(constants.length).toBeGreaterThan(decoded.frames.length * 0.8);
    for (const f of constants) expect(f.byteLength).toBeLessThan(12 + 2); // 2 more allowed for frame numbers past 127
  });

  it('is far smaller than the WAV for a sparse click track', () => {
    const seconds = 30;
    const n = RATE * seconds;
    const input = new Int16Array(n);
    const click = clickInSilence(600, 0, 550);
    for (let at = 0; at + click.length <= n; at += RATE / 2) input.set(click, at);
    const flac = encodeFile(input);
    const wavSize = 44 + n * 2;
    expect(flac.length).toBeLessThan(wavSize / 20);
    expect(Array.from(decodeFlac(flac).samples)).toEqual(Array.from(input));
  });

  it('costs about 11 bytes per 1024 samples of pure silence', () => {
    const blocks = 100;
    const flac = encodeFile(silence(FLAC_BLOCK_SIZE * blocks));
    const body = flac.length - 42;
    expect(body).toBeLessThan(blocks * 13);
    expect(body).toBeGreaterThan(blocks * 10);
  });
});
