// vel: volume multiplier (1 = normal), pitch: frequency multiplier (1 = normal)
type DrumSynth = (ctx: AudioContext, dest: AudioNode, time: number, vel?: number, pitch?: number) => void;

// Lazily pre-allocated noise buffer shared across all noise-based synths.
// Keyed by sampleRate so WAV export (which may use a different OfflineAudioContext rate) stays correct.
let _noiseBuffer: AudioBuffer | null = null;
let _noiseBufferRate = 0;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!_noiseBuffer || _noiseBufferRate !== ctx.sampleRate) {
    _noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    _noiseBufferRate = ctx.sampleRate;
    const data = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return _noiseBuffer;
}

export const drumSynths: Record<string, DrumSynth> = {
  kick(ctx, dest, time, vel = 1, pitch = 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 * pitch, time);
    osc.frequency.exponentialRampToValueAtTime(40 * pitch, time + 0.12);
    gain.gain.setValueAtTime(vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
  },

  snare(ctx, dest, time, vel = 1, pitch = 1) {
    // Triangle oscillator body
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180 * pitch, time);
    oscGain.gain.setValueAtTime(0.7 * vel, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.15);

    // Noise component
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, time);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6 * vel, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.15);
  },

  hihat(ctx, dest, time, vel = 1) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8000, time);
    filter.Q.setValueAtTime(1, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.05);
  },

  openhat(ctx, dest, time, vel = 1) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8000, time);
    filter.Q.setValueAtTime(1, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.3);
  },

  clap(ctx, dest, time, vel = 1) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, time);
    filter.Q.setValueAtTime(0.5, time);
    const gain = ctx.createGain();
    // Stuttered envelope for clap effect
    gain.gain.setValueAtTime(0.6 * vel, time);
    gain.gain.setValueAtTime(0.001, time + 0.01);
    gain.gain.setValueAtTime(0.5 * vel, time + 0.02);
    gain.gain.setValueAtTime(0.001, time + 0.03);
    gain.gain.setValueAtTime(0.4 * vel, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.15);
  },

  rim(ctx, dest, time, vel = 1, pitch = 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 * pitch, time);
    gain.gain.setValueAtTime(0.6 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.03);
  },

  tom(ctx, dest, time, vel = 1, pitch = 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300 * pitch, time);
    osc.frequency.exponentialRampToValueAtTime(150 * pitch, time + 0.15);
    gain.gain.setValueAtTime(0.8 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.3);
  },
};
