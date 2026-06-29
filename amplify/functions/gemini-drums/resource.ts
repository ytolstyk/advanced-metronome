import { defineFunction, secret } from '@aws-amplify/backend';

export const geminiDrumsFunction = defineFunction({
  name: 'gemini-drums',
  environment: {
    GEMINI_API_KEY: secret('GEMINI_API_KEY'),
  },
  timeoutSeconds: 25,
});
