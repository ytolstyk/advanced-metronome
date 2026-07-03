import { defineFunction, secret } from '@aws-amplify/backend';

export const geminiChordsFunction = defineFunction({
  name: 'gemini-chords',
  environment: {
    GEMINI_API_KEY: secret('GEMINI_API_KEY'),
  },
  // AppSync enforces a ~30s hard ceiling on Lambda resolvers; 25s matches gemini-drums and
  // provides headroom to absorb cold-start time (~2-3s for @google/generative-ai package).
  // The handler also sets a 24s AbortController to return a clean error rather than being killed.
  timeoutSeconds: 25,
});
