/**
 * Controller-owned command policy for operational secret handling.
 *
 * This intentionally decides only whether a proposed operation is safe to
 * execute and what its output contract must be. It never reads credentials.
 */
export type SecretOperationStore = "RAILWAY" | "GCP_SECRET_MANAGER" | "GITHUB" | "RUNTIME_ENV" | "PROVIDER" | "OTHER";
export type SecretOperationKind = "METADATA_INSPECTION" | "RUNTIME_INJECTION" | "COMMAND_EXECUTION";
export type SecretOutputMode = "METADATA_ONLY" | "REDACTED" | "SILENT" | "RAW";

export interface SplinterSecretOperation {
  store: SecretOperationStore;
  kind: SecretOperationKind;
  outputMode: SecretOutputMode;
  /** Tokenized command for a proposed external-tool operation, never its output. */
  command?: readonly string[];
  /** Runtime use is permitted only when the provider receives the value silently. */
  requiresSecretValue?: boolean;
  /** Informational only: a completed rotation never relaxes this policy. */
  credentialsRotated?: boolean;
}

export interface SecretOperationDecision {
  allowed: boolean;
  reason: string;
  safeAlternative?: string;
}

const allow = (reason: string): SecretOperationDecision => ({ allowed: true, reason });
const deny = (reason: string, safeAlternative: string): SecretOperationDecision => ({ allowed: false, reason, safeAlternative });

function normalizedCommand(command: readonly string[] | undefined): string {
  return (command ?? []).join(" ").trim().toLowerCase().replace(/\s+/g, " ");
}

function valueDumpCommand(command: string): boolean {
  if (!command) return false;
  // Railway's variable listing returns values. There is no name-only CLI form;
  // use an application status/readiness projection or a committed secret-name
  // contract instead.
  if (/\brailway(?:\.exe)?\s+(?:variable|variables|run|shell)\b/.test(command)) return true;
  // These patterns expose raw process/runtime environments regardless of the
  // provider whose credential happens to be present.
  if (/(?:^|\s)(?:env|printenv|set)(?:\s|$)/.test(command)) return true;
  if (/\b(?:get-item|get-childitem|get-content|set-item|remove-item)\s+env:|\benv:|process\.env|\bexport\s+-p\b/.test(command)) return true;
  // Google Secret Manager's payload access command deliberately returns bytes.
  if (/\bgcloud\s+secrets\s+versions\s+access\b/.test(command)) return true;
  return false;
}

/**
 * A deterministic pre-execution check. Callers must submit command metadata
 * before running an operational tool; raw output is never an acceptable
 * inspection mode, including after credentials have been rotated.
 */
export function evaluateSecretOperation(input: SplinterSecretOperation): SecretOperationDecision {
  const command = normalizedCommand(input.command);
  if (input.outputMode === "RAW") {
    return deny("Raw output is never permitted for an operation that can reach secrets.", "Use a metadata-only status, a safe reference manifest, or a redacted diagnostic projection.");
  }
  if (valueDumpCommand(command)) {
    return deny("The proposed command can return secret values and is denied before execution.", "Use provider metadata/status commands only; do not enumerate raw variables, environments, or secret payload versions.");
  }
  if (input.kind === "METADATA_INSPECTION") {
    if (input.requiresSecretValue) {
      return deny("Metadata inspection cannot require a secret value.", "Use a provider readiness/status projection that reports configured state without reading the credential.");
    }
    if (input.outputMode !== "METADATA_ONLY" && input.outputMode !== "REDACTED") {
      return deny("Secret metadata inspection must have a safe output contract.", "Use METADATA_ONLY or REDACTED output.");
    }
    return allow("The proposed inspection is metadata-only and cannot return a secret payload.");
  }
  if (input.kind === "RUNTIME_INJECTION") {
    if (!input.requiresSecretValue || input.outputMode !== "SILENT") {
      return deny("Runtime credential use must be silent and narrowly required by the provider adapter.", "Inject the credential directly into the authorized runtime adapter without collecting command output.");
    }
    return allow("A narrow runtime adapter may consume an injected credential without exposing it.");
  }
  if (input.requiresSecretValue && input.outputMode !== "SILENT") {
    return deny("A command that needs a credential must not surface its output without redaction.", "Run the authorized adapter silently or return a redacted status projection.");
  }
  return allow("The command has no identified secret-value retrieval path and has a safe output contract.");
}
