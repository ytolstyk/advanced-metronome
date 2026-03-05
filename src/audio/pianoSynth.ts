/**
 * Plays a piano-like note and returns a stop function.
 * The stop function should be called on key release for a natural decay.
 */
export function playPianoNote(ctx: AudioContext, frequency: number): () => void {
  const t = ctx.currentTime;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.45, t + 0.006); // fast attack
  env.gain.exponentialRampToValueAtTime(0.18, t + 0.22); // decay to sustain
  env.gain.setValueAtTime(0.18, t + 1.8);
  env.gain.exponentialRampToValueAtTime(0.001, t + 4.0); // natural long decay

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(frequency * 10, 6000);
  filter.Q.value = 0.4;

  // Fundamental
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency;

  // 2nd harmonic for brightness
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
}
