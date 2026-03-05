export type InstrumentSynth = (ctx: AudioContext, frequency: number) => () => void;

export interface InstrumentPreset {
  id: string;
  label: string;
  play: InstrumentSynth;
}

const piano: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.45, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.18, t + 0.22);
  env.gain.setValueAtTime(0.18, t + 1.8);
  env.gain.exponentialRampToValueAtTime(0.001, t + 4.0);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(frequency * 10, 6000);
  filter.Q.value = 0.4;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = frequency * 2;
  const harmGain = ctx.createGain();
  harmGain.gain.value = 0.18;

  osc.connect(env);
  osc2.connect(harmGain);
  harmGain.connect(env);
  env.connect(filter);
  filter.connect(ctx.destination);
  osc.start(t);
  osc2.start(t);

  const autoStop = window.setTimeout(() => {
    try { osc.stop(); } catch { /* already stopped */ }
    try { osc2.stop(); } catch { /* already stopped */ }
  }, 4500);

  return () => {
    clearTimeout(autoStop);
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    window.setTimeout(() => {
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc2.stop(); } catch { /* already stopped */ }
    }, 450);
  };
};

const organ: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, t);
  masterGain.gain.linearRampToValueAtTime(0.3, t + 0.012);
  masterGain.connect(ctx.destination);

  const harmonics = [1, 2, 3, 4, 6];
  const levels    = [1, 0.6, 0.4, 0.25, 0.1];
  const oscs = harmonics.map((h, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = frequency * h;
    const g = ctx.createGain();
    g.gain.value = levels[i];
    o.connect(g);
    g.connect(masterGain);
    o.start(t);
    return o;
  });

  const autoStop = window.setTimeout(() => {
    oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
  }, 8000);

  return () => {
    clearTimeout(autoStop);
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    window.setTimeout(() => {
      oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
    }, 100);
  };
};

const strings: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.28, t + 0.3); // slow attack
  env.gain.setValueAtTime(0.28, t + 3.0);
  env.gain.exponentialRampToValueAtTime(0.001, t + 5.0);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency * 6;
  filter.Q.value = 1.2;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = frequency * 1.004; // slight detune for chorus
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;

  osc.connect(env);
  osc2.connect(g2);
  g2.connect(env);
  env.connect(filter);
  filter.connect(ctx.destination);
  osc.start(t);
  osc2.start(t);

  const autoStop = window.setTimeout(() => {
    try { osc.stop(); } catch { /* already stopped */ }
    try { osc2.stop(); } catch { /* already stopped */ }
  }, 5500);

  return () => {
    clearTimeout(autoStop);
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    window.setTimeout(() => {
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc2.stop(); } catch { /* already stopped */ }
    }, 600);
  };
};

const marimba: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.6, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = frequency * 4;
  const g2 = ctx.createGain();
  g2.gain.value = 0.15;
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.6, t);
  env2.gain.exponentialRampToValueAtTime(0.001, t + 0.12); // harmonic fades faster

  osc.connect(env);
  osc2.connect(g2);
  g2.connect(env2);
  env.connect(ctx.destination);
  env2.connect(ctx.destination);
  osc.start(t);
  osc2.start(t);
  osc.stop(t + 0.9);
  osc2.stop(t + 0.2);

  return () => {
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  };
};

const synth: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.35, t + 0.008);
  env.gain.setValueAtTime(0.35, t + 2.0);
  env.gain.exponentialRampToValueAtTime(0.001, t + 3.5);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(frequency * 8, t);
  filter.frequency.exponentialRampToValueAtTime(frequency * 2, t + 0.4);
  filter.Q.value = 3;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = frequency;

  osc.connect(env);
  env.connect(filter);
  filter.connect(ctx.destination);
  osc.start(t);

  const autoStop = window.setTimeout(() => {
    try { osc.stop(); } catch { /* already stopped */ }
  }, 4000);

  return () => {
    clearTimeout(autoStop);
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    filter.frequency.cancelScheduledValues(now);
    window.setTimeout(() => {
      try { osc.stop(); } catch { /* already stopped */ }
    }, 250);
  };
};

const bass: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.55, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.3, t + 0.1);
  env.gain.setValueAtTime(0.3, t + 1.5);
  env.gain.exponentialRampToValueAtTime(0.001, t + 3.0);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency * 4;
  filter.Q.value = 0.8;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = frequency * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.2;

  osc.connect(env);
  osc2.connect(g2);
  g2.connect(env);
  env.connect(filter);
  filter.connect(ctx.destination);
  osc.start(t);
  osc2.start(t);

  const autoStop = window.setTimeout(() => {
    try { osc.stop(); } catch { /* already stopped */ }
    try { osc2.stop(); } catch { /* already stopped */ }
  }, 3500);

  return () => {
    clearTimeout(autoStop);
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    window.setTimeout(() => {
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc2.stop(); } catch { /* already stopped */ }
    }, 300);
  };
};

// Shared helper: pluck noise burst (pick/finger attack transient)
function pluckNoise(ctx: AudioContext, t: number, gain: number, duration: number, freq: number) {
  const bufSize = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq * 3;
  f.Q.value = 1.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t); src.stop(t + duration);
}

const harp: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;

  // Body resonance — sine fundamental with fast decay
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.5, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 3.5);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;

  // 2nd harmonic — decays faster, gives the bright pluck character
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = frequency * 2;
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.25, t);
  env2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

  // 3rd harmonic — very brief sparkle
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.value = frequency * 3;
  const env3 = ctx.createGain();
  env3.gain.setValueAtTime(0.1, t);
  env3.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

  osc.connect(env);   env.connect(ctx.destination);
  osc2.connect(env2); env2.connect(ctx.destination);
  osc3.connect(env3); env3.connect(ctx.destination);
  osc.start(t);  osc.stop(t + 4);
  osc2.start(t); osc2.stop(t + 1);
  osc3.start(t); osc3.stop(t + 0.4);

  pluckNoise(ctx, t, 0.08, 0.04, frequency);

  return () => {
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  };
};

const acousticGuitar: InstrumentSynth = (ctx, frequency) => {
  const t = ctx.currentTime;

  // Steel string: brighter, more harmonics, medium-fast decay
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.4, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency * 9;
  filter.Q.value = 0.5;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = frequency * 1.002;
  const g2 = ctx.createGain();
  g2.gain.value = 0.4;

  // 2nd harmonic bright pop
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.value = frequency * 2;
  const env3 = ctx.createGain();
  env3.gain.setValueAtTime(0.22, t);
  env3.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

  osc.connect(env); osc2.connect(g2); g2.connect(env);
  env.connect(filter); filter.connect(ctx.destination);
  osc3.connect(env3); env3.connect(ctx.destination);
  osc.start(t);  osc.stop(t + 2);
  osc2.start(t); osc2.stop(t + 2);
  osc3.start(t); osc3.stop(t + 0.7);

  pluckNoise(ctx, t, 0.12, 0.025, frequency);

  return () => {
    const now = ctx.currentTime;
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  };
};



export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { id: 'piano',    label: 'Piano',           play: piano          },
  { id: 'harp',     label: 'Harp',            play: harp           },
  { id: 'aguitar',  label: 'Acoustic Guitar',  play: acousticGuitar  },
  { id: 'organ',    label: 'Organ',            play: organ          },
  { id: 'strings',  label: 'Strings',          play: strings        },
  { id: 'marimba',  label: 'Marimba',          play: marimba        },
  { id: 'synth',    label: 'Synth',            play: synth          },
  { id: 'bass',     label: 'Bass',             play: bass           },
];
