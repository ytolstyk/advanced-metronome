// vel: volume multiplier (1 = normal), pitch: frequency multiplier (1 = normal)
type DrumSynth = (ctx: AudioContext, time: number, vel?: number, pitch?: number) => void;

export const drumSynths: Record<string, DrumSynth> = {
  kick(ctx, time, vel = 1, pitch = 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 * pitch, time);
    osc.frequency.exponentialRampToValueAtTime(40 * pitch, time + 0.12);
    gain.gain.setValueAtTime(vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.4);
  },

  snare(ctx, time, vel = 1, pitch = 1) {
    // Triangle oscillator body
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180 * pitch, time);
    oscGain.gain.setValueAtTime(0.7 * vel, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.15);

    // Noise component
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, time);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6 * vel, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.15);
  },

  hihat(ctx, time, vel = 1, ) {
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8000, time);
    filter.Q.setValueAtTime(1, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.05);
  },

  openhat(ctx, time, vel = 1, ) {
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8000, time);
    filter.Q.setValueAtTime(1, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.3);
  },

  clap(ctx, time, vel = 1, ) {
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
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
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.15);
  },

  rim(ctx, time, vel = 1, pitch = 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 * pitch, time);
    gain.gain.setValueAtTime(0.6 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.03);
  },

  tom(ctx, time, vel = 1, pitch = 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300 * pitch, time);
    osc.frequency.exponentialRampToValueAtTime(150 * pitch, time + 0.15);
    gain.gain.setValueAtTime(0.8 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.3);
  },
};
