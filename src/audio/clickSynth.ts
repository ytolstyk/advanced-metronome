export function accentClick(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);
  osc.frequency.value = 1000;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
  osc.start(time);
  osc.stop(time + 0.02);
}

export function beatClick(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);
  osc.frequency.value = 700;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.012);
  osc.start(time);
  osc.stop(time + 0.016);
}

export function subClick(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);
  osc.frequency.value = 500;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.008);
  osc.start(time);
  osc.stop(time + 0.01);
}

export function countdownClick(ctx: AudioContext, dest: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);
  osc.frequency.value = 1200;
  osc.type = 'sine';
  gain.gain.setValueAtTime(1.0, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  osc.start(time);
  osc.stop(time + 0.025);
}
