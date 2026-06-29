/**
 * Spike: validate Gemini YouTube URL support via @google/generative-ai + API key auth.
 *
 * Run: GEMINI_API_KEY=your_key node scripts/spike-gemini-youtube.mjs
 *
 * Pass/fail criteria:
 *   PASS: Response contains a `hits` array with at least one entry with a numeric offsetSec
 *   FAIL: API error, empty hits, or offsetSec values that are all wrong by >30ms (verify manually)
 *
 * If this script fails with a fileData error, the feature must use the fallback
 * architecture (user-uploaded audio file via FileReader.readAsDataURL + inlineData).
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set GEMINI_API_KEY environment variable');
  process.exit(1);
}

// A short public drum tutorial video — replace with any YouTube URL that has clear drums
const TEST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const START_SEC = 0;
const END_SEC = 15;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    status: { type: SchemaType.STRING },
    detectedBpm: { type: SchemaType.NUMBER },
    hits: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          instrument: { type: SchemaType.STRING },
          offsetSec: { type: SchemaType.NUMBER },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['instrument', 'offsetSec', 'confidence'],
      },
    },
  },
  required: ['status', 'detectedBpm', 'hits'],
};

const SYSTEM_INSTRUCTION = `You are an expert music analyst specializing in drum patterns.
Given a video, identify every drum instrument hit in the requested time range.
Return offsetSec as absolute seconds from the START OF THE VIDEO (not from the range start).
Instruments: kick | snare | hihat | openhat | clap | rim | tom
Return status "no_drums" if you detect no drums. Return status "ok" if drums are present.`;

const ai = new GoogleGenerativeAI(apiKey);
const model = ai.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: SYSTEM_INSTRUCTION,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  },
});

console.log(`Testing YouTube URL: ${TEST_URL}`);
console.log(`Time range: ${START_SEC}s – ${END_SEC}s`);
console.log('Calling Gemini...\n');

const start = Date.now();
try {
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: TEST_URL, mimeType: 'video/mp4' } },
        { text: `Analyze drum hits from ${START_SEC}s to ${END_SEC}s in this video. Return JSON only.` },
      ],
    }],
  });

  const elapsed = Date.now() - start;
  const text = result.response.text();
  console.log(`Elapsed: ${elapsed}ms`);
  console.log('Raw response:', text);

  const parsed = JSON.parse(text);
  console.log('\nParsed:', JSON.stringify(parsed, null, 2));

  if (parsed.status === 'ok' && Array.isArray(parsed.hits) && parsed.hits.length > 0) {
    console.log('\n✓ SPIKE 1 PASSED — Gemini accepted YouTube fileData URL');
    console.log(`  Detected BPM: ${parsed.detectedBpm}`);
    console.log(`  Hit count: ${parsed.hits.length}`);
  } else if (parsed.status === 'no_drums') {
    console.log('\n⚠ Gemini returned no_drums — try a different URL with clear drums');
  } else {
    console.log('\n✗ SPIKE 1 UNCERTAIN — check the parsed output above');
  }
} catch (err) {
  const elapsed = Date.now() - start;
  console.error(`\nError after ${elapsed}ms:`, err.message);
  if (err.message?.includes('fileData') || err.message?.includes('INVALID_ARGUMENT')) {
    console.error('\n✗ SPIKE 1 FAILED — fileData with YouTube URLs not supported by this SDK/auth method');
    console.error('  → Use fallback architecture: FileReader.readAsDataURL + inlineData');
  }
  process.exit(1);
}
