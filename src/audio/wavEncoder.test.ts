import { describe, expect, it, vi } from 'vitest';
import { encodeWav } from './wavEncoder';

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
