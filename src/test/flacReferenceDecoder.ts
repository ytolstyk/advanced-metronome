/**
 * A small, independent FLAC decoder for tests only. It shares no code with `src/audio/flacEncoder.ts`
 * (its own CRCs, bit reader and predictor maths), so a round trip through it proves the encoder's
 * output is a valid stream, not merely that the encoder agrees with itself.
 *
 * Scope: what the encoder promises to write (STREAMINFO only, mono 16-bit, CONSTANT / VERBATIM /
 * FIXED subframes with 4-bit Rice partitions). Anything else throws, as does any CRC mismatch.
 */

export interface FlacStreamInfo {
  minBlockSize: number;
  maxBlockSize: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  totalSamples: number;
  /** True when the 16 MD5 bytes are all zero ("not computed"). */
  md5Unset: boolean;
  /** Bytes consumed by `fLaC` plus the metadata blocks. */
  headerLength: number;
}

export type FlacSubframeKind = 'constant' | 'verbatim' | 'fixed';

export interface FlacFrameInfo {
  frameNumber: number;
  blockSize: number;
  /** The 4-bit block-size code from the frame header. */
  blockSizeCode: number;
  /** The 4-bit sample-rate code from the frame header (0 = "take it from STREAMINFO"). */
  sampleRateCode: number;
  /** How many bytes the frame header occupied (sync through CRC-8). */
  headerLength: number;
  /** Whole frame length including both CRCs. */
  byteLength: number;
  subframe: FlacSubframeKind;
  /** Fixed-predictor order (fixed subframes only). */
  order: number;
  partitionOrder: number;
  riceParams: number[];
  samples: Int16Array;
}

export interface DecodedFlac {
  info: FlacStreamInfo;
  frames: FlacFrameInfo[];
  samples: Int16Array;
}

/** CRC-8, polynomial x^8 + x^2 + x + 1, computed with a table-less MSB-first loop. */
export function referenceCrc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit--) {
      const inBit = (byte >> bit) & 1;
      const top = (crc >> 7) & 1;
      crc = (crc << 1) & 0xff;
      if (top ^ inBit) crc ^= 0x07;
    }
  }
  return crc;
}

/** CRC-16, polynomial x^16 + x^15 + x^2 + 1. */
export function referenceCrc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit--) {
      const inBit = (byte >> bit) & 1;
      const top = (crc >> 15) & 1;
      crc = (crc << 1) & 0xffff;
      if (top ^ inBit) crc ^= 0x8005;
    }
  }
  return crc;
}

class BitReader {
  private pos: number; // in bits
  private readonly bytes: Uint8Array;
  private readonly endByte: number;
  constructor(bytes: Uint8Array, startByte: number, endByte: number) {
    this.bytes = bytes;
    this.endByte = endByte;
    this.pos = startByte * 8;
  }

  private bit(): number {
    const byte = this.pos >> 3;
    if (byte >= this.endByte) throw new Error('read past the end of the frame');
    const value = (this.bytes[byte]! >> (7 - (this.pos & 7))) & 1;
    this.pos++;
    return value;
  }

  /** Unsigned value of `n` bits (n up to 36 is safe in a double). */
  uint(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i++) value = value * 2 + this.bit();
    return value;
  }

  int(n: number): number {
    const value = this.uint(n);
    return value >= 2 ** (n - 1) ? value - 2 ** n : value;
  }

  /** Number of zero bits before the next one bit (the one is consumed). */
  unary(): number {
    let zeros = 0;
    while (this.bit() === 0) zeros++;
    return zeros;
  }

  alignToByte(): void {
    while (this.pos & 7) {
      if (this.bit() !== 0) throw new Error('non-zero padding bit');
    }
  }

  get bytePosition(): number {
    return this.pos >> 3;
  }
}

export function parseStreamInfo(bytes: Uint8Array): FlacStreamInfo {
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (tag !== 'fLaC') throw new Error('missing fLaC marker');
  let at = 4;
  let info: FlacStreamInfo | null = null;
  for (;;) {
    const head = bytes[at]!;
    const last = (head & 0x80) !== 0;
    const type = head & 0x7f;
    const length = (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!;
    at += 4;
    if (type === 0) {
      if (length !== 34) throw new Error('STREAMINFO must be 34 bytes');
      const r = new BitReader(bytes, at, at + length);
      const minBlockSize = r.uint(16);
      const maxBlockSize = r.uint(16);
      r.uint(24); // min frame size
      r.uint(24); // max frame size
      const sampleRate = r.uint(20);
      const channels = r.uint(3) + 1;
      const bitsPerSample = r.uint(5) + 1;
      const totalSamples = r.uint(36);
      let md5Unset = true;
      for (let i = 0; i < 16; i++) if (r.uint(8) !== 0) md5Unset = false;
      info = { minBlockSize, maxBlockSize, sampleRate, channels, bitsPerSample, totalSamples, md5Unset, headerLength: 0 };
    }
    at += length;
    if (last) break;
  }
  if (!info) throw new Error('no STREAMINFO block');
  info.headerLength = at;
  return info;
}

/** Decodes FLAC's UTF-8 style number and checks it uses the shortest form. Returns [value, length]. */
function readUtf8Number(bytes: Uint8Array, at: number): [number, number] {
  const first = bytes[at]!;
  if (first < 0x80) return [first, 1];
  let length = 0;
  while (length < 8 && (first & (0x80 >> length)) !== 0) length++;
  if (length < 2 || length > 7) throw new Error(`bad UTF-8 lead byte ${first}`);
  let value = first & (0x7f >> length);
  for (let i = 1; i < length; i++) {
    const b = bytes[at + i]!;
    if ((b & 0xc0) !== 0x80) throw new Error('bad UTF-8 continuation byte');
    value = value * 64 + (b & 0x3f);
  }
  // The shortest form for `length` bytes starts above what `length - 1` bytes can hold.
  const minForLength = length === 2 ? 0x80 : 2 ** (5 * (length - 1) + 1);
  if (value < minForLength) throw new Error('over-long UTF-8 frame number');
  return [value, length];
}

/** Frame header sample-rate codes that name a rate directly (RFC 9639 table). */
const SAMPLE_RATE_FROM_CODE: Record<number, number> = {
  1: 88200, 2: 176400, 3: 192000, 4: 8000, 5: 16000, 6: 22050,
  7: 24000, 8: 32000, 9: 44100, 10: 48000, 11: 96000,
};

const BLOCK_SIZE_FROM_CODE: Record<number, number> = {
  1: 192, 2: 576, 3: 1152, 4: 2304, 5: 4608,
  8: 256, 9: 512, 10: 1024, 11: 2048, 12: 4096, 13: 8192, 14: 16384, 15: 32768,
};

/** Decodes the one frame starting at `offset`. Verifies sync, header CRC-8 and frame CRC-16. */
export function decodeFlacFrame(bytes: Uint8Array, offset: number, info: FlacStreamInfo, endByte = bytes.length): FlacFrameInfo {
  if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xfe) !== 0xf8) throw new Error(`no frame sync at ${offset}`);
  if ((bytes[offset + 1]! & 1) !== 0) throw new Error('variable block size streams are not supported');
  const blockSizeCode = bytes[offset + 2]! >> 4;
  const rateCode = bytes[offset + 2]! & 0xf;
  const channelCode = bytes[offset + 3]! >> 4;
  const sampleSizeCode = (bytes[offset + 3]! >> 1) & 7;
  if ((bytes[offset + 3]! & 1) !== 0) throw new Error('reserved bit set');
  if (channelCode !== 0) throw new Error(`unexpected channel assignment ${channelCode}`);
  if (sampleSizeCode !== 4) throw new Error(`unexpected sample size code ${sampleSizeCode}`);
  if (rateCode !== 0) {
    const rate = SAMPLE_RATE_FROM_CODE[rateCode];
    if (rate === undefined) throw new Error(`unsupported sample rate code ${rateCode}`);
    if (rate !== info.sampleRate) throw new Error(`frame says ${rate} Hz, STREAMINFO says ${info.sampleRate} Hz`);
  }

  const [frameNumber, numberLength] = readUtf8Number(bytes, offset + 4);
  let at = offset + 4 + numberLength;
  let blockSize: number;
  if (blockSizeCode === 6) {
    blockSize = bytes[at]! + 1;
    at += 1;
  } else if (blockSizeCode === 7) {
    blockSize = ((bytes[at]! << 8) | bytes[at + 1]!) + 1;
    at += 2;
  } else {
    const fromCode = BLOCK_SIZE_FROM_CODE[blockSizeCode];
    if (fromCode === undefined) throw new Error(`bad block size code ${blockSizeCode}`);
    blockSize = fromCode;
  }
  const headerEnd = at;
  if (referenceCrc8(bytes.subarray(offset, headerEnd)) !== bytes[headerEnd]) throw new Error('header CRC-8 mismatch');
  const headerLength = headerEnd + 1 - offset;

  const r = new BitReader(bytes, headerEnd + 1, endByte);
  if (r.uint(1) !== 0) throw new Error('subframe padding bit set');
  const typeCode = r.uint(6);
  if (r.uint(1) !== 0) throw new Error('wasted bits are not supported');
  const bps = info.bitsPerSample;
  const samples = new Int16Array(blockSize);
  let subframe: FlacSubframeKind;
  let order = 0;
  let partitionOrder = 0;
  let riceParams: number[] = [];

  if (typeCode === 0) {
    subframe = 'constant';
    samples.fill(r.int(bps));
  } else if (typeCode === 1) {
    subframe = 'verbatim';
    for (let i = 0; i < blockSize; i++) samples[i] = r.int(bps);
  } else if (typeCode >= 8 && typeCode <= 12) {
    subframe = 'fixed';
    order = typeCode - 8;
    const out = new Array<number>(blockSize);
    for (let i = 0; i < order; i++) out[i] = r.int(bps);
    if (r.uint(2) !== 0) throw new Error('only 4-bit Rice coding is supported');
    partitionOrder = r.uint(4);
    const parts = 2 ** partitionOrder;
    if (blockSize % parts !== 0) throw new Error('block size not divisible by partition count');
    const perPart = blockSize / parts;
    if (perPart <= order) throw new Error('partition too small for the predictor order');
    let index = order;
    for (let p = 0; p < parts; p++) {
      const k = r.uint(4);
      if (k === 15) throw new Error('escaped Rice partitions are not supported');
      riceParams.push(k);
      const count = p === 0 ? perPart - order : perPart;
      for (let i = 0; i < count; i++) {
        const q = r.unary();
        const u = q * 2 ** k + r.uint(k);
        const residual = u % 2 === 0 ? u / 2 : -(u + 1) / 2;
        const x = (j: number) => out[index - j]!;
        let predicted: number;
        switch (order) {
          case 0: predicted = 0; break;
          case 1: predicted = x(1); break;
          case 2: predicted = 2 * x(1) - x(2); break;
          case 3: predicted = 3 * x(1) - 3 * x(2) + x(3); break;
          default: predicted = 4 * x(1) - 6 * x(2) + 4 * x(3) - x(4); break;
        }
        out[index++] = predicted + residual;
      }
    }
    for (let i = 0; i < blockSize; i++) {
      const v = out[i]!;
      if (v < -32768 || v > 32767) throw new Error(`decoded sample ${v} is outside 16 bits`);
      samples[i] = v;
    }
  } else {
    throw new Error(`unsupported subframe type ${typeCode}`);
  }
  if (subframe !== 'fixed') riceParams = [];

  r.alignToByte();
  const crcAt = r.bytePosition;
  const end = crcAt + 2;
  if (end > endByte) throw new Error('frame is missing its CRC-16');
  const expected = (bytes[crcAt]! << 8) | bytes[crcAt + 1]!;
  if (referenceCrc16(bytes.subarray(offset, crcAt)) !== expected) throw new Error('frame CRC-16 mismatch');

  return { frameNumber, blockSize, blockSizeCode, sampleRateCode: rateCode, headerLength, byteLength: end - offset, subframe, order, partitionOrder, riceParams, samples };
}

/** Decodes a whole mono 16-bit FLAC file, checking frame numbering and the declared total length. */
export function decodeFlac(bytes: Uint8Array): DecodedFlac {
  const info = parseStreamInfo(bytes);
  if (info.channels !== 1 || info.bitsPerSample !== 16) throw new Error('only mono 16-bit is supported');
  const frames: FlacFrameInfo[] = [];
  let at = info.headerLength;
  while (at < bytes.length) {
    const frame = decodeFlacFrame(bytes, at, info);
    if (frame.frameNumber !== frames.length) throw new Error(`frame ${frames.length} is numbered ${frame.frameNumber}`);
    frames.push(frame);
    at += frame.byteLength;
  }
  const total = frames.reduce((n, f) => n + f.blockSize, 0);
  if (total !== info.totalSamples) throw new Error(`STREAMINFO says ${info.totalSamples} samples, frames hold ${total}`);
  const samples = new Int16Array(total);
  let offset = 0;
  for (const f of frames) {
    samples.set(f.samples, offset);
    offset += f.blockSize;
  }
  return { info, frames, samples };
}
