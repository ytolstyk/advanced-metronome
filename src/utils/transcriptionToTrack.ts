import type { Beat, DotModifier, DurationValue, MasterBar, Measure, TabNote, TabTrack } from '../tabEditorTypes';
import { Duration } from '../tabEditorTypes';
import { measureCapacityTicks, DURATION_TICKS } from '../tabEditorState';
import type { GeminiTabMeasure } from '../api/tabTranscriptionApi';

// Maps Gemini string convention (1 = high E) to alphaTab convention (1 = lowest string)
function invertString(geminiString: number, stringCount: number): number {
  return stringCount - geminiString + 1;
}

const DURATION_MAP: Record<string, DurationValue> = {
  whole:        Duration.Whole,
  half:         Duration.Half,
  quarter:      Duration.Quarter,
  eighth:       Duration.Eighth,
  sixteenth:    Duration.Sixteenth,
  thirty_second: Duration.ThirtySecond,
};

function parseDot(dot: string): DotModifier {
  return {
    dotted:       dot === 'dotted',
    doubleDotted: dot === 'double_dotted',
    triplet:      dot === 'triplet',
  };
}

function beatTicks(duration: DurationValue, dot: DotModifier): number {
  let t = DURATION_TICKS[duration] ?? 240;
  if (dot.doubleDotted) t *= 1.75;
  else if (dot.dotted) t *= 1.5;
  if (dot.triplet) t *= 2 / 3;
  return t;
}

function convertMeasure(
  raw: GeminiTabMeasure,
  stringCount: number,
  timeSignature: { numerator: number; denominator: number },
): Measure {
  const capacity = measureCapacityTicks(timeSignature);
  let usedTicks = 0;
  const beats: Beat[] = [];

  for (const rawBeat of raw.beats) {
    const duration = DURATION_MAP[rawBeat.duration] ?? Duration.Quarter;
    const dot = parseDot(rawBeat.dot);
    const ticks = beatTicks(duration, dot);

    if (usedTicks + ticks > capacity + 1e-6) break;

    const notes: TabNote[] = rawBeat.notes
      .map((n): TabNote => ({
        string: invertString(Math.max(1, Math.min(stringCount, n.string)), stringCount),
        fret:   Math.max(0, Math.min(24, n.fret)),
        modifiers: {},
      }))
      // Deduplicate by alphaTab string index (keep first)
      .filter((n, idx, arr) => arr.findIndex(x => x.string === n.string) === idx)
      .sort((a, b) => a.string - b.string);

    beats.push({
      id: crypto.randomUUID(),
      duration,
      dot,
      notes,
    });
    usedTicks += ticks;
  }

  return { id: crypto.randomUUID(), beats };
}

export function geminiResponseToTabTrack(
  measures: GeminiTabMeasure[],
  detectedBpm: number,
  tuningName: string,
  openMidi: number[],
  stringCount: 6 | 7 | 8,
  bpm: number,
  timeSignature: { numerator: number; denominator: number },
): TabTrack {
  const effectiveBpm = detectedBpm > 0 ? detectedBpm : bpm;

  const masterBars: MasterBar[] = measures.map((_, i): MasterBar => ({
    timeSignature: { ...timeSignature },
    // Only set BPM on the first bar; others inherit via effectiveBpmAt
    ...(i === 0 ? { bpm: effectiveBpm } : {}),
  }));

  const convertedMeasures: Measure[] = measures.map(m =>
    convertMeasure(m, stringCount, timeSignature),
  );

  // Ensure at least one measure
  if (convertedMeasures.length === 0) {
    convertedMeasures.push({ id: crypto.randomUUID(), beats: [] });
    masterBars.push({ timeSignature: { ...timeSignature }, bpm: effectiveBpm });
  }

  return {
    schemaVersion: 4,
    title: 'AI Transcription',
    masterBars,
    stringCount,
    tuningName,
    openMidi: [...openMidi],
    measures: convertedMeasures,
  };
}
