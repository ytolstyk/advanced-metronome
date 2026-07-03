export function parseMmSs(value: string): number {
  const parts = value.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const s = parseFloat(value);
  return isNaN(s) ? 0 : s;
}
