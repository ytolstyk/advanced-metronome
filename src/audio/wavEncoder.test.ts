import { describe, expect, it, vi } from 'vitest';
import { encodeWav, pcm16, wavHeader } from './wavEncoder';

function fakeBuffer(channels: number[][], sampleRate = 44100) {
  const getChannelData = vi.fn((ch: number) => Float32Array.from(channels[ch]!));
  return { buffer: { numberOfChannels: channels.length, sampleRate, length: channels[0]!.length, getChannelData } as unknown as AudioBuffer, getChannelData };
}

const bytesOf = async (blob: Blob) => new DataView(await blob.arrayBuffer());

describe('encodeWav', () => {
  it('writes a 16-bit PCM header and interleaves the channels, clamping to full scale', async () => {
    const { buffer } = fakeBuffer([[0, 1, -1, 2], [0.5, -0.5, 0, -3]]);
    const view = await bytesOf(encodeWav(buffer));
    const tag = (off: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(off + i)));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2); // samples x channels x 2 bytes
    const sample = (i: number) => view.getInt16(44 + i * 2, true);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(sample)).toEqual([0, Math.trunc(0.5 * 0x7fff), 0x7fff, Math.trunc(-0.5 * 0x8000), -0x8000, 0, 0x7fff, -0x8000]);
  });

  it('asks for each channel once, not once per sample', () => {
    const { buffer, getChannelData } = fakeBuffer([new Array(5000).fill(0.1), new Array(5000).fill(-0.1)]);
    encodeWav(buffer);
    expect(getChannelData).toHaveBeenCalledTimes(2);
  });
});

describe('wavHeader', () => {
  const tag = (view: DataView, off: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(off + i)));

  it('is exactly 44 bytes with the RIFF/WAVE/fmt/data tags in place', () => {
    const header = wavHeader(100, 2, 44100);
    expect(header.byteLength).toBe(44);
    const view = new DataView(header);
    expect([tag(view, 0), tag(view, 8), tag(view, 12), tag(view, 36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
  });

  it('describes 16-bit PCM: format, channels, rate, byte rate, block align, bit depth', () => {
    const view = new DataView(wavHeader(100, 2, 44100));
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('sizes the data chunk from frames x channels x 2 bytes and the RIFF chunk as 36 + data', () => {
    const view = new DataView(wavHeader(1000, 2, 44100));
    expect(view.getUint32(40, true)).toBe(4000);
    expect(view.getUint32(4, true)).toBe(4036);
  });

  it('follows the channel count and sample rate it is given', () => {
    const view = new DataView(wavHeader(10, 1, 22050));
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint32(28, true)).toBe(22050 * 2);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(20);
  });

  it('handles zero frames and sizes beyond 2 GiB as unsigned values', () => {
    expect(new DataView(wavHeader(0, 2, 44100)).getUint32(40, true)).toBe(0);
    const big = 600_000_000; // 600M frames x 4 bytes = 2.4 GB, above the signed 32-bit limit
    expect(new DataView(wavHeader(big, 2, 44100)).getUint32(40, true)).toBe(big * 4);
  });
});

describe('pcm16', () => {
  const int16s = (buf: ArrayBuffer) => {
    const view = new DataView(buf);
    return Array.from({ length: buf.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true));
  };

  it('interleaves the channels frame by frame', () => {
    const left = Float32Array.from([0.25, 0.5, 0.75]);
    const right = Float32Array.from([-0.25, -0.5, -0.75]);
    expect(int16s(pcm16([left, right], 0, 3))).toEqual([
      Math.trunc(0.25 * 0x7fff), Math.trunc(-0.25 * 0x8000),
      Math.trunc(0.5 * 0x7fff), Math.trunc(-0.5 * 0x8000),
      Math.trunc(0.75 * 0x7fff), Math.trunc(-0.75 * 0x8000),
    ]);
  });

  it('writes 2 bytes per channel per frame', () => {
    expect(pcm16([new Float32Array(10), new Float32Array(10)], 0, 10).byteLength).toBe(40);
    expect(pcm16([new Float32Array(10)], 2, 7).byteLength).toBe(10);
  });

  it('clamps out-of-range samples to full scale', () => {
    const ch = Float32Array.from([2, -2, 1, -1, 1e9, -1e9]);
    expect(int16s(pcm16([ch], 0, 6))).toEqual([0x7fff, -0x8000, 0x7fff, -0x8000, 0x7fff, -0x8000]);
  });

  it('scales positive values by 0x7fff and negative values by 0x8000, with silence as 0', () => {
    expect(int16s(pcm16([Float32Array.from([0, 0.5, -0.5])], 0, 3))).toEqual([0, Math.trunc(0.5 * 0x7fff), -0x4000]);
  });

  it('converts only the half-open range [from, to)', () => {
    const ch = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
    const out = int16s(pcm16([ch], 1, 4));
    expect(out).toEqual([Math.fround(0.2), Math.fround(0.3), Math.fround(0.4)].map((v) => Math.trunc(v * 0x7fff)));
  });

  it('returns an empty buffer for an empty range', () => {
    expect(pcm16([new Float32Array(4)], 2, 2).byteLength).toBe(0);
  });

  it('is little-endian', () => {
    const view = new DataView(pcm16([Float32Array.from([1])], 0, 1));
    expect(view.getUint8(0)).toBe(0xff);
    expect(view.getUint8(1)).toBe(0x7f);
  });
});

describe('encodeWav composition', () => {
  it('is exactly wavHeader followed by pcm16 of the whole buffer', async () => {
    const data = [[0.3, -0.3, 0.9], [0.1, 0.2, -0.8]];
    const { buffer } = fakeBuffer(data);
    const blob = encodeWav(buffer);
    const channels = data.map((c) => Float32Array.from(c));
    const expected = new Uint8Array([
      ...new Uint8Array(wavHeader(3, 2, 44100)),
      ...new Uint8Array(pcm16(channels, 0, 3)),
    ]);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(expected);
    expect(blob.type).toBe('audio/wav');
  });
});
