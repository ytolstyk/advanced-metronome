import { defineBackend } from "@aws-amplify/backend";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { geminiTabsFunction } from "./functions/gemini-tabs/resource";
import { songMetadataFunction } from "./functions/song-metadata/resource";

const backend = defineBackend({
  auth,
  data,
  geminiTabsFunction,
  songMetadataFunction,
});

// Reserved concurrency caps cost and abuse: gemini-tabs bills Gemini audio calls (so one user can't
// exhaust Gemini quota via parallel requests), song-metadata makes outbound requests.
// DynamoDB-backed per-user rate limiting via TabTranscriptionUsage is a planned upgrade.
//
// Opt-in: AWS refuses any reservation that leaves the account under 10 unreserved executions, and new
// accounts default to a total limit of 10, so a reservation there fails the whole deploy. Set
// FUNCTION_RESERVED_CONCURRENCY (e.g. 5) once the account's Lambda concurrency quota is raised.
//
// Functions are registered on defineBackend above: `backend.data.resources.functions` only holds the
// API construct's internal Lambdas, not the ones the schema handlers point at.
const reserved = Number(process.env.FUNCTION_RESERVED_CONCURRENCY);
if (Number.isInteger(reserved) && reserved > 0) {
  for (const fn of [backend.geminiTabsFunction, backend.songMetadataFunction]) {
    (fn.resources.lambda.node.defaultChild as CfnFunction).reservedConcurrentExecutions = reserved;
  }
}
