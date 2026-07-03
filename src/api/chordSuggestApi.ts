import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { ChordSlot } from '../utils/chordTheory';
import { ROOT_NOTES, CHORD_TYPES } from '../data/chords';
import { isAuthenticated } from './authUtils';

const client = generateClient<Schema>();

export interface SuggestedProgression {
  chords: ChordSlot[];
  description: string;
}

export const SUGGESTION_COUNT = 3;
const MAX_PROMPT_LENGTH = 500;

function parseAndValidateProgressions(json: string): SuggestedProgression[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('No progressions returned — try rephrasing your prompt.');
  }

  if (!Array.isArray(parsed) || !parsed.length)
    throw new Error('No progressions returned — try rephrasing your prompt.');

  return (parsed as unknown[]).flatMap((prog) => {
    if (
      typeof prog !== 'object' ||
      prog === null ||
      !Array.isArray((prog as Record<string, unknown>).chords) ||
      typeof (prog as Record<string, unknown>).description !== 'string'
    ) return [];

    const chords: ChordSlot[] = ((prog as Record<string, unknown>).chords as unknown[]).flatMap(
      (c) => {
        if (typeof c !== 'object' || c === null) return [];
        const { root, type } = c as Record<string, unknown>;
        if (typeof root !== 'string' || typeof type !== 'string') return [];
        const validRoot = ROOT_NOTES.find((r) => r === root);
        const validType = CHORD_TYPES.find((t) => t === type);
        if (!validRoot || !validType) return [];
        return [{ root: validRoot, type: validType }];
      },
    );

    if (!chords.length) return [];
    return [{ chords, description: String((prog as Record<string, unknown>).description) }];
  });
}

export async function suggestChordProgressions(prompt: string): Promise<SuggestedProgression[]> {
  if (!(await isAuthenticated())) throw new Error('AI suggestions are unavailable.');
  if (prompt.length > MAX_PROMPT_LENGTH)
    throw new Error(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);

  const { data, errors } = await client.queries.suggestChordProgressions({ prompt });

  if (errors?.length) throw new Error('AI suggestions are unavailable.');
  if (!data) throw new Error('No progressions returned — try rephrasing your prompt.');

  const progressions = parseAndValidateProgressions(data);
  if (!progressions.length)
    throw new Error('No progressions returned — try rephrasing your prompt.');

  return progressions.slice(0, SUGGESTION_COUNT);
}
