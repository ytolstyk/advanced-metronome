export function pluckString(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  vol: number,
): void {
  const env = ctx.createGain();
  env.connect(ctx.destination);
  env.gain.setValueAtTime(0.001, startTime);
  env.gain.linearRampToValueAtTime(vol, startTime + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + 2.2);

  for (let h = 1; h <= 6; h++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h;
    const hg = ctx.createGain();
    hg.gain.value = 0.5 / (h * h);
    osc.connect(hg);
    hg.connect(env);
    osc.start(startTime);
    osc.stop(startTime + 2.5);
  }
}
