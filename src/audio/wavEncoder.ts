const BYTES_PER_SAMPLE = 2;

/** The 44-byte RIFF/WAVE header for 16-bit PCM of `numSamples` frames. */
export function wavHeader(numSamples: number, numChannels: number, sampleRate: number): ArrayBuffer {
  const dataSize = numSamples * numChannels * BYTES_PER_SAMPLE;
  const out = new ArrayBuffer(44);
  const view = new DataView(out);

  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * BYTES_PER_SAMPLE, true);
  view.setUint16(32, numChannels * BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);
  return out;
}

/** Interleaves frames `[from, to)` of every channel as little-endian 16-bit PCM, clamping to full scale. */
export function pcm16(channels: readonly Float32Array[], from: number, to: number): ArrayBuffer {
  const numChannels = channels.length;
  const out = new ArrayBuffer((to - from) * numChannels * BYTES_PER_SAMPLE);
  const view = new DataView(out);
  let off = 0;
  for (let i = from; i < to; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch]![i]!));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += BYTES_PER_SAMPLE;
    }
  }
  return out;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  // Fetch each channel once: asking for it per sample is millions of calls on a long render.
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  return new Blob(
    [wavHeader(buffer.length, buffer.numberOfChannels, buffer.sampleRate), pcm16(channels, 0, buffer.length)],
    { type: 'audio/wav' },
  );
}
