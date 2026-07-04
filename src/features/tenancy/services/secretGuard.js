import { isPlainObject } from "../schemas/schemaUtils.js";

const FORBIDDEN_KEY_RE = /^(?:access(?:_?token)?|refresh(?:_?token)?|api_?key|client_?secret|secret|password|app_?password|private_?key|bearer(?:_?token)?)$/i;
const ALLOWED_REFERENCE_KEY_RE = /(?:authRef|accountRef|credentialRef|secretRef|tokenRef)$/i;
const SECRET_LIKE_VALUE_PATTERNS = [
  { re: /^sk-[a-z0-9_-]{10,}$/i, reason: "model/API key detected" },
  { re: /^ya29\.[a-z0-9._-]+$/i, reason: "Google OAuth token detected" },
  { re: /^AIza[0-9A-Za-z_-]{20,}$/, reason: "Google API key detected" },
  { re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/, reason: "private key material detected" },
];
const REFERENCE_VALUE_RE = /^(?:secret|vault|env|oauth|railref):\/\/[A-Za-z0-9/_\-.]+$/i;

function inspectValue(value, path, hits) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectValue(entry, `${path}[${index}]`, hits));
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;

      if (FORBIDDEN_KEY_RE.test(key) && !ALLOWED_REFERENCE_KEY_RE.test(key)) {
        hits.push({
          path: nextPath,
          reason: "secret-like field name is not allowed in tenant documents",
        });
      }

      inspectValue(nestedValue, nextPath, hits);
    }
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || REFERENCE_VALUE_RE.test(trimmed)) {
      return;
    }

    for (const pattern of SECRET_LIKE_VALUE_PATTERNS) {
      if (pattern.re.test(trimmed)) {
        hits.push({
          path,
          reason: pattern.reason,
        });
        break;
      }
    }
  }
}

export function findSecretLikeEntries(document) {
  const hits = [];
  inspectValue(document, "", hits);
  return hits;
}

export function assertNoSecretsInDocument(document, label = "document") {
  const hits = findSecretLikeEntries(document);
  if (!hits.length) {
    return;
  }

  const details = hits.map((hit) => `${hit.path || "(root)"}: ${hit.reason}`).join("; ");
  throw new Error(`Rejected ${label} because it contains secret-like material. ${details}`);
}

export const secretGuardInternals = {
  FORBIDDEN_KEY_RE,
  ALLOWED_REFERENCE_KEY_RE,
  SECRET_LIKE_VALUE_PATTERNS,
  REFERENCE_VALUE_RE,
};
