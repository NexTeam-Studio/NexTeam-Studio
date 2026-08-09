const assignment = /\b([A-Z][A-Z0-9_]*(?:API_KEY|CLIENT_SECRET|PRIVATE_KEY|REFRESH_TOKEN|APP_PASSWORD|PASSWORD|SECRET|TOKEN)[A-Z0-9_]*)\s*[=:]\s*([^\s,;]+)/gi;
const bearer = /(Authorization\s*:\s*Bearer\s+)[^\s,;]+/gi;
const knownFormats = /(?:GOCSPX-[\w-]+|1\/\/[\w-]+|sk_[\w-]+|whsec_[\w-]+|re_[\w-]+|AIza[\w-]+)/g;

/** Never emit credentials through server diagnostics, logs, or operator receipts. */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(assignment, "$1=[REDACTED]")
      .replace(bearer, "$1[REDACTED]")
      .replace(knownFormats, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      /(?:key|secret|token|password|credential)/i.test(key) ? "[REDACTED]" : redactSecrets(child),
    ]));
  }
  return value;
}
