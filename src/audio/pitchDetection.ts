// McLeod Pitch Method (NSDF autocorrelation)
// Shared between FretMemorizerPage and TunerPage.
// Returns the detected frequency in Hz, or -1 for silence / no clear pitch.

// Pre-allocated to avoid per-call Float32Array allocation on the 20fps mic hot path.
// Sized for a 4096-sample FFT window (maxLag = N/2 = 2048).
const _nsdf = new Float32Array(2048);

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  rmsGate = 0.01,
  maxLagOverride?: number,
): number {
  const N = buffer.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / N);
  if (rms < rmsGate) return -1;

  const maxLag = maxLagOverride ?? Math.floor(N / 2);
  // Reuse pre-allocated buffer (view into _nsdf, writes go to the backing store)
  const nsdf = maxLag <= _nsdf.length ? _nsdf.subarray(0, maxLag) : new Float32Array(maxLag);

  for (let tau = 0; tau < maxLag; tau++) {
    let acf = 0, energy = 0;
    for (let i = 0; i < N - tau; i++) {
      acf += buffer[i] * buffer[i + tau];
      energy += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
    }
    nsdf[tau] = energy > 0 ? 2 * acf / energy : 0;
  }

  let start = 0;
  while (start < maxLag - 1 && nsdf[start] > 0) start++;
  let globalMax = 0;
  for (let i = start; i < maxLag; i++) if (nsdf[i] > globalMax) globalMax = nsdf[i];
  if (globalMax < 0.25) return -1;

  const threshold = 0.8 * globalMax;
  let peakPos = -1;
  for (let i = start + 1; i < maxLag - 1; i++) {
    if (nsdf[i] > threshold && nsdf[i] >= nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) {
      peakPos = i;
      break;
    }
  }
  if (peakPos < 1 || peakPos >= maxLag - 1) return -1;

  const y1 = nsdf[peakPos - 1], y2 = nsdf[peakPos], y3 = nsdf[peakPos + 1];
  const d = 2 * y2 - y1 - y3;
  const shift = d !== 0 ? (y3 - y1) / (2 * d) : 0;
  return sampleRate / (peakPos + shift);
}

export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}
