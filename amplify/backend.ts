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
// Reserved concurrency caps cost and abuse: gemini-tabs bills Gemini audio calls, song-metadata makes
// outbound requests. Each reservation must leave AWS's 10 unreserved executions free.
for (const name of ["gemini-tabs", "song-metadata"]) {
  const fn = backend.data.resources.functions[name];
  if (!fn) throw new Error(`Cannot cap concurrency: function "${name}" not found`);
  (fn.node.defaultChild as CfnFunction).reservedConcurrentExecutions = 5;
}
