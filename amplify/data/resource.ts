import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  // One record per user — auto-saved on every change
  CurrentTrack: a.model({
    configJson: a.string().required(),
    patternJson: a.string().required(),
    chordPatternJson: a.string().required(),
    chordInstrument: a.string().required(),
    chordVolume: a.float().required(),
  }).authorization(allow => [allow.owner()]),

  // Many records per user — saved explicitly as named drum tracks
  DrumTrack: a.model({
    name: a.string().required(),
    configJson: a.string().required(),
    patternJson: a.string().required(),
    chordPatternJson: a.string().required(),
  }).authorization(allow => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
