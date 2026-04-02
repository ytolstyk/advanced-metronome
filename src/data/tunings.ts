export type StringCount = 6 | 7 | 8;

export interface TuningNote {
  note: string;
  octave: number;
}

export interface TuningPreset {
  name: string;
  strings: TuningNote[]; // ordered low → high
}

const t = (note: string, octave: number): TuningNote => ({ note, octave });

export const TUNINGS: Record<StringCount, TuningPreset[]> = {
  6: [
    { name: 'Standard',    strings: [t('E',2), t('A',2), t('D',3), t('G',3), t('B',3), t('E',4)] },
    { name: 'Drop D',      strings: [t('D',2), t('A',2), t('D',3), t('G',3), t('B',3), t('E',4)] },
    { name: 'Open G',      strings: [t('D',2), t('G',2), t('D',3), t('G',3), t('B',3), t('D',4)] },
    { name: 'Open D',      strings: [t('D',2), t('A',2), t('D',3), t('F#',3), t('A',3), t('D',4)] },
    { name: 'Open E',      strings: [t('E',2), t('B',2), t('E',3), t('G#',3), t('B',3), t('E',4)] },
    { name: 'DADGAD',      strings: [t('D',2), t('A',2), t('D',3), t('G',3), t('A',3), t('D',4)] },
    { name: 'Eb Standard', strings: [t('D#',2), t('G#',2), t('C#',3), t('F#',3), t('A#',3), t('D#',4)] },
    { name: 'D Standard',  strings: [t('D',2), t('G',2), t('C',3), t('F',3), t('A',3), t('D',4)] },
    { name: 'Drop C',      strings: [t('C',2), t('G',2), t('C',3), t('F',3), t('A',3), t('D',4)] },
  ],
  7: [
    { name: 'Standard',    strings: [t('B',1), t('E',2), t('A',2), t('D',3), t('G',3), t('B',3), t('E',4)] },
    { name: 'Drop A',      strings: [t('A',1), t('E',2), t('A',2), t('D',3), t('G',3), t('B',3), t('E',4)] },
    { name: 'Eb Standard', strings: [t('A#',1), t('D#',2), t('G#',2), t('C#',3), t('F#',3), t('A#',3), t('D#',4)] },
    { name: 'D Standard',  strings: [t('A',1), t('D',2), t('G',2), t('C',3), t('F',3), t('A',3), t('D',4)] },
  ],
  8: [
    { name: 'Standard',    strings: [t('F#',1), t('B',1), t('E',2), t('A',2), t('D',3), t('G',3), t('B',3), t('E',4)] },
    { name: 'Drop E',      strings: [t('E',1), t('B',1), t('E',2), t('A',2), t('D',3), t('G',3), t('B',3), t('E',4)] },
    { name: 'Eb Standard', strings: [t('F',1), t('A#',1), t('D#',2), t('G#',2), t('C#',3), t('F#',3), t('A#',3), t('D#',4)] },
  ],
};
