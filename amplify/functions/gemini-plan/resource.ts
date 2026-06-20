import { defineFunction, secret } from '@aws-amplify/backend';

export const geminiPlanFunction = defineFunction({
  name: 'gemini-plan',
  environment: {
    GEMINI_API_KEY: secret('GEMINI_API_KEY'),
  },
  timeoutSeconds: 60,
});
