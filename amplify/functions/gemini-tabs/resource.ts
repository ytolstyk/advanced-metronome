import { defineFunction, secret } from '@aws-amplify/backend';

export const geminiTabsFunction = defineFunction({
  name: 'gemini-tabs',
  environment: {
    GEMINI_API_KEY: secret('GEMINI_API_KEY'),
  },
  timeoutSeconds: 25,
});
