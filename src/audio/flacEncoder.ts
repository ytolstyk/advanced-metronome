/**
 * A small lossless FLAC writer for mono 16-bit audio (RFC 9639), so a click track can be a fraction of
 * the WAV's size without changing a single sample. A click track is mostly digital silence, which FLAC
 * stores as a few bytes per block ("constant" subframes). Each block takes whichever of constant,
 * fixed-predictor + Rice coding, or raw verbatim is smallest.
 *
 * Not a general encoder: one channel, 16 bits, fixed block size, no seek table, MD5 left unset (a
 * zero MD5 means "not computed" and decoders skip the check).
 */

/** Samples per block. Small enough that silence between clicks becomes constant blocks, big enough that headers stay minor. */
export const FLAC_BLOCK_SIZE = 1024;

/**
 * Frame header codes for the sample rate. The spec lets a frame say "0: take it from STREAMINFO", but
 * Apple's decoder (CoreAudio: Safari, iOS, QuickTime, GarageBand) reads such a file as empty, so a
 * rate with its own code is always written explicitly. Rates without one fall back to 0.
 */
const SAMPLE_RATE_FROM_STREAMINFO = 0;
const SAMPLE_RATE_CODES: ReadonlyMap<number, number> = new Map([
  [88200, 1], [176400, 2], [192000, 3], [8000, 4], [16000, 5], [22050, 6],
  [24000, 7], [32000, 8], [44100, 9], [48000, 10], [96000, 11],
]);
/** Frame header code for 16 bits per sample. */
const SAMPLE_SIZE_16_BIT = 0b100;
/** Frame header code for one channel (independent channels, mono). */
const CHANNELS_MONO = 0;
/** Block size codes: a fixed code for exactly 1024, otherwise the size follows the frame number in 8 or 16 bits as (n - 1). */
const BLOCK_SIZE_1024 = 10;
const BLOCK_SIZE_8_BIT = 6;
const BLOCK_SIZE_16_BIT = 7;

const MAX_FIXED_ORDER = 4;
const MAX_PARTITION_ORDER = 6;
/** Rice parameter 15 is the "escape" code, so 14 is the largest real parameter. */
const MAX_RICE_PARAM = 14;

class BitWriter {
  private bytes: number[] = [];
  private acc = 0;
  private accBits = 0;

  /** Appends the low `n` bits (0 to 32) of `value`, most significant first. */
  bits(value: number, n: number): void {
    if (n > 16) {
      this.bits(Math.floor(value / 65536), n - 16);
      this.bits(value & 0xffff, 16);
      return;
    }
    this.acc = (this.acc << n) | (value & ((1 << n) - 1));
    this.accBits += n;
    while (this.accBits >= 8) {
      this.accBits -= 8;
      this.bytes.push((this.acc >> this.accBits) & 0xff);
    }
    this.acc &= (1 << this.accBits) - 1;
  }

  /** `count` zero bits then a one: the unary part of a Rice code. */
  unary(count: number): void {
    if (count < 16) {
      this.bits(1, count + 1);
      return;
    }
    for (let left = count; left > 0; left -= 16) this.bits(0, Math.min(16, left));
    this.bits(1, 1);
  }

  signed16(value: number): void {
    this.bits(value & 0xffff, 16);
  }

  /** Pads the last byte with zeros and returns everything written. */
  finish(): number[] {
    if (this.accBits > 0) this.bits(0, 8 - this.accBits);
    return this.bytes;
  }
}

const CRC8_TABLE = new Uint8Array(256);
const CRC16_TABLE = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c8 = i;
  let c16 = i << 8;
  for (let bit = 0; bit < 8; bit++) {
    c8 = c8 & 0x80 ? ((c8 << 1) ^ 0x07) & 0xff : (c8 << 1) & 0xff;
    c16 = c16 & 0x8000 ? ((c16 << 1) ^ 0x8005) & 0xffff : (c16 << 1) & 0xffff;
  }
  CRC8_TABLE[i] = c8;
  CRC16_TABLE[i] = c16;
}

/** CRC-8 (polynomial 0x07) over a frame header. */
const crc8 = (bytes: readonly number[]): number => {
  let crc = 0;
  for (const b of bytes) crc = CRC8_TABLE[crc ^ b]!;
  return crc;
};

/** CRC-16 (polynomial 0x8005) over a whole frame. */
const crc16 = (bytes: readonly number[]): number => {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) & 0xffff) ^ CRC16_TABLE[(crc >> 8) ^ b]!;
  return crc;
};

/** The frame number in FLAC's UTF-8-style coding (1 to 6 bytes). */
function utf8Number(value: number): number[] {
  if (value < 0x80) return [value];
  let bytes = 2;
  while (value >= 2 ** (5 * bytes + 1)) bytes++; // n bytes hold 5n+1 bits
  const lead = (0xff << (8 - bytes)) & 0xff;
  const out = [lead | Math.floor(value / 2 ** (6 * (bytes - 1)))];
  for (let i = bytes - 2; i >= 0; i--) out.push(0x80 | (Math.floor(value / 2 ** (6 * i)) & 0x3f));
  return out;
}

/** `fLaC`, then a STREAMINFO block for mono 16-bit audio of a known length. */
export function flacStreamHeader(sampleRate: number, totalSamples: number): Uint8Array<ArrayBuffer> {
  // STREAMINFO holds a 20-bit rate and a 36-bit length; anything else would wrap silently.
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate >= 2 ** 20) throw new RangeError(`FLAC sample rate out of range: ${sampleRate}`);
  if (!Number.isSafeInteger(totalSamples) || totalSamples < 0 || totalSamples >= 2 ** 36) throw new RangeError(`FLAC length out of range: ${totalSamples}`);
  const w = new BitWriter();
  w.bits(0x664c6143, 32); // "fLaC"
  w.bits(1, 1); // last metadata block
  w.bits(0, 7); // STREAMINFO
  w.bits(34, 24);
  w.bits(FLAC_BLOCK_SIZE, 16); // min block size (the last block may be shorter)
  w.bits(FLAC_BLOCK_SIZE, 16); // max block size
  w.bits(0, 24); // min frame size: unknown
  w.bits(0, 24); // max frame size: unknown
  w.bits(sampleRate, 20);
  w.bits(0, 3); // channels - 1
  w.bits(15, 5); // bits per sample - 1
  w.bits(Math.floor(totalSamples / 2 ** 32), 4); // total samples, high 4 bits of 36
  w.bits(totalSamples % 2 ** 32, 32);
  for (let i = 0; i < 4; i++) w.bits(0, 32); // MD5: not computed
  return Uint8Array.from(w.finish());
}

/** The zigzag-folded prediction errors of one block for one predictor order. */
interface Residuals {
  /** Zigzag-folded residuals: at most about 2^20, so they fit an unsigned 32-bit integer and Rice coding can use bit operations. */
  folded: Uint32Array;
  order: number;
}

function residualsFor(x: Int16Array, order: number): Residuals {
  const n = x.length;
  const folded = new Uint32Array(n - order);
  for (let i = order; i < n; i++) {
    let r: number;
    switch (order) {
      case 0: r = x[i]!; break;
      case 1: r = x[i]! - x[i - 1]!; break;
      case 2: r = x[i]! - 2 * x[i - 1]! + x[i - 2]!; break;
      case 3: r = x[i]! - 3 * x[i - 1]! + 3 * x[i - 2]! - x[i - 3]!; break;
      default: r = x[i]! - 4 * x[i - 1]! + 6 * x[i - 2]! - 4 * x[i - 3]! + x[i - 4]!; break;
    }
    folded[i - order] = r >= 0 ? 2 * r : -2 * r - 1;
  }
  return { folded, order };
}

/**
 * Rice parameter that is cheapest for `count` values summing to `sum`. Only parameters next to the
 * one matching the mean are tried, and never above MAX_RICE_PARAM, so a loud block still gets a
 * (poor) plan and loses to verbatim on its real cost. The bit count is an estimate: summing first
 * and shifting once can overstate the exact cost by up to `count` bits, which only affects which
 * encoding is chosen, never whether the file is valid.
 */
function bestRiceParam(sum: number, count: number): { k: number; bits: number } {
  const guess = Math.min(MAX_RICE_PARAM, Math.max(0, Math.floor(Math.log2(Math.max(1, sum / count)))));
  let best = { k: 0, bits: Infinity };
  for (let k = Math.max(0, guess - 1); k <= Math.min(MAX_RICE_PARAM, guess + 1); k++) {
    const bits = count * (k + 1) + Math.floor(sum / 2 ** k);
    if (bits < best.bits) best = { k, bits };
  }
  return best;
}

interface RicePlan {
  bits: number;
  partitionOrder: number;
  params: number[];
}

/** Picks the partition order (how many separate Rice parameters) that makes the residuals smallest. */
function planRice(res: Residuals, blockSize: number): RicePlan {
  const { folded, order } = res;
  let best: RicePlan = { bits: Infinity, partitionOrder: 0, params: [] };
  for (let po = 0; po <= MAX_PARTITION_ORDER; po++) {
    const parts = 1 << po;
    if (blockSize % parts !== 0 || blockSize / parts <= order) break;
    const per = blockSize / parts;
    let bits = 0;
    const params: number[] = [];
    let at = 0;
    for (let p = 0; p < parts; p++) {
      const count = p === 0 ? per - order : per;
      let sum = 0;
      for (let i = 0; i < count; i++) sum += folded[at + i]!;
      at += count;
      const { k, bits: partBits } = bestRiceParam(sum, count);
      params.push(k);
      bits += 4 + partBits;
    }
    if (bits < best.bits) best = { bits, partitionOrder: po, params };
  }
  return best;
}

function writeResidual(w: BitWriter, res: Residuals, blockSize: number, plan: RicePlan): void {
  const { folded, order } = res;
  w.bits(0, 2); // Rice coding with 4-bit parameters
  w.bits(plan.partitionOrder, 4);
  const per = blockSize >> plan.partitionOrder;
  let at = 0;
  for (let p = 0; p < plan.params.length; p++) {
    const k = plan.params[p]!;
    w.bits(k, 4);
    const count = p === 0 ? per - order : per;
    for (let i = 0; i < count; i++) {
      const u = folded[at + i]!;
      w.unary(u >>> k);
      if (k > 0) w.bits(u & ((1 << k) - 1), k);
    }
    at += count;
  }
}

function writeSubframe(w: BitWriter, x: Int16Array): void {
  const n = x.length;
  if (x.every((v) => v === x[0])) {
    w.bits(0, 8); // padding bit, CONSTANT, no wasted bits
    w.signed16(x[0]!);
    return;
  }
  let bestOrder = -1; // -1 = verbatim
  let bestBits = 8 + 16 * n;
  let bestRes: Residuals | null = null;
  let bestPlan: RicePlan | null = null;
  for (let order = 0; order <= MAX_FIXED_ORDER && order < n; order++) {
    const res = residualsFor(x, order);
    const plan = planRice(res, n);
    const bits = 8 + 16 * order + 6 + plan.bits;
    if (bits < bestBits) {
      bestBits = bits;
      bestOrder = order;
      bestRes = res;
      bestPlan = plan;
    }
  }
  if (bestOrder < 0 || !bestRes || !bestPlan) {
    w.bits(0b000001 << 1, 8); // VERBATIM
    for (let i = 0; i < n; i++) w.signed16(x[i]!);
    return;
  }
  w.bits((0b001000 | bestOrder) << 1, 8); // FIXED with `bestOrder`
  for (let i = 0; i < bestOrder; i++) w.signed16(x[i]!);
  writeResidual(w, bestRes, n, bestPlan);
}

/**
 * One FLAC frame holding `samples` (1 to 65536 of them). `frameNumber` counts frames from 0.
 * `sampleRate` must be the one in the STREAMINFO block; it is repeated in the frame header.
 */
export function flacFrame(samples: Int16Array, frameNumber: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const n = samples.length;
  if (n < 1 || n > 65536) throw new RangeError(`A FLAC frame holds 1 to 65536 samples, got ${n}`);
  const sizeCode = n === FLAC_BLOCK_SIZE ? BLOCK_SIZE_1024 : n <= 256 ? BLOCK_SIZE_8_BIT : BLOCK_SIZE_16_BIT;
  const rateCode = SAMPLE_RATE_CODES.get(sampleRate) ?? SAMPLE_RATE_FROM_STREAMINFO;
  // Sync code and fixed block size flag, then block size + sample rate, then channels + sample size + reserved bit.
  const header: number[] = [0xff, 0xf8, (sizeCode << 4) | rateCode, (CHANNELS_MONO << 4) | (SAMPLE_SIZE_16_BIT << 1), ...utf8Number(frameNumber)];
  if (sizeCode === BLOCK_SIZE_8_BIT) header.push(n - 1);
  if (sizeCode === BLOCK_SIZE_16_BIT) header.push((n - 1) >> 8, (n - 1) & 0xff);
  header.push(crc8(header));

  const body = new BitWriter();
  writeSubframe(body, samples);
  const frame = [...header, ...body.finish()];
  const crc = crc16(frame);
  frame.push(crc >> 8, crc & 0xff);
  return Uint8Array.from(frame);
}
