import { AudioWaveform, Drum, Guitar, Mic, Music, Music2, Piano, Wind, type LucideIcon } from 'lucide-react';
import type { InstrumentKey } from '../../bandInstruments';

export const INSTRUMENT_ICONS: Record<InstrumentKey, LucideIcon> = {
  guitar: Guitar,
  bass: AudioWaveform,
  drums: Drum,
  vocals: Mic,
  keys: Piano,
  strings: Music2,
  winds: Wind,
  other: Music,
};
