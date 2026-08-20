import { splinterLifecycleController } from "../../apps/server/src/splinter/lifecycleController.ts";

const separator = process.argv.indexOf("--");
const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
const decision = splinterLifecycleController.authorizeSecretOperation({
  store: "RAILWAY",
  kind: "COMMAND_EXECUTION",
  outputMode: "REDACTED",
  command: ["railway", ...command]
});

// This intentionally contains only policy metadata; command output never
// passes through this evaluator.
process.stdout.write(JSON.stringify({ allowed: decision.allowed, reason: decision.reason, safeAlternative: decision.requiredAction ?? null }));
