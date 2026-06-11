import type { TabTrack, MasterBar, Measure } from '../tabEditorTypes';
import { Duration } from '../tabEditorTypes';
import { buildOpenMidi } from '../tabEditorState';
import type { RootNote, ChordType } from '../data/chords';
import { chordName } from '../data/chords';

interface ProgressionSlotInput {
  root: RootNote;
  type: ChordType;
  beats: number;
}

function makeRestBeats(count: number): Measure['beats'] {
  const dot = { dotted: false, doubleDotted: false, triplet: false };
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    duration: Duration.Quarter,
    dot,
    notes: [],
  }));
}

export function chordProgressionToTabTrack(
  slots: ProgressionSlotInput[],
  bpm: number,
): TabTrack {
  const masterBars: MasterBar[] = [];
  const measures: Measure[] = [];

  if (slots.length === 0) {
    return {
      schemaVersion: 4,
      title: 'Chord Progression',
      masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm }],
      stringCount: 6,
      tuningName: 'Standard',
      openMidi: buildOpenMidi('Standard', 6),
      measures: [{ id: crypto.randomUUID(), beats: makeRestBeats(4) }],
    };
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const numerator = Math.max(1, slot.beats);
    masterBars.push({
      timeSignature: { numerator, denominator: 4 },
      ...(i === 0 ? { bpm } : {}),
    });
    measures.push({
      id: crypto.randomUUID(),
      beats: makeRestBeats(numerator),
    });
  }

  const title = slots.map((s) => chordName(s.root, s.type)).join(' – ');
  return {
    schemaVersion: 4,
    title: title.length <= 60 ? title : 'Chord Progression',
    masterBars,
    stringCount: 6,
    tuningName: 'Standard',
    openMidi: buildOpenMidi('Standard', 6),
    measures,
  };
}
