import { defineFunction, secret } from '@aws-amplify/backend';

export const geminiSuggestFunction = defineFunction({
  name: 'gemini-suggest',
  environment: {
    GEMINI_API_KEY: secret('GEMINI_API_KEY'),
  },
  timeoutSeconds: 28,
});
