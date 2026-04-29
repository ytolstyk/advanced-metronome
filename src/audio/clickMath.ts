export type SubdivisionLabel =
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | 'sixteenth'
  | 'quarter-triplet' | 'eighth-triplet';

export function subsPerBeat(sub: SubdivisionLabel, numerator: number): number {
  switch (sub) {
    case 'whole': return 1 / numerator;
    case 'half': return 0.5;
    case 'quarter': return 1;
    case 'eighth': return 2;
    case 'sixteenth': return 4;
    case 'quarter-triplet': return 3;
    case 'eighth-triplet': return 6;
  }
}
