import { defineBackend } from "@aws-amplify/backend";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";

const backend = defineBackend({
  auth,
  data,
});

// Cap concurrent executions on the AI guitar-tab transcription Lambda so a single
// user cannot exhaust Gemini API quota via parallel requests across Lambda instances.
// DynamoDB-backed per-user rate limiting via TabTranscriptionUsage is a planned upgrade.
const geminiTabsFn = backend.data.resources.functions["gemini-tabs"];
if (geminiTabsFn) {
  const cfnFn = geminiTabsFn.node.defaultChild as CfnFunction;
  cfnFn.reservedConcurrentExecutions = 5;
}
