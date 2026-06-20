import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";

// geminiSuggestFunction is wired to the schema in data/resource.ts via
// a.handler.function() — no separate top-level registration needed here.
defineBackend({
  auth,
  data,
});
