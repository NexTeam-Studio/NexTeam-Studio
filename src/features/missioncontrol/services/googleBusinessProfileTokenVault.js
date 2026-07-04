import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_VAULT_FILENAME = "nexteam-gbp-rail-token-vault.enc";
const DEFAULT_VAULT_KEY_FILENAME = "nexteam-gbp-rail-token-vault.key";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const VAULT_VERSION = 1;
const STATE_TTL_MS = 15 * 60 * 1000;

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function ensureParentDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url");
}

function deriveKeyFromValue(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return null;
  }

  for (const encoding of ["base64url", "base64", "hex"]) {
    try {
      const decoded = Buffer.from(trimmed, encoding);
      if (decoded.byteLength === 32) {
        return decoded;
      }
    } catch {
      // Try the next encoding.
    }
  }

  return createHash("sha256").update(trimmed).digest();
}

function loadOrCreateVaultKey({ keyPath, envKey }) {
  const envDerivedKey = deriveKeyFromValue(envKey);
  if (envDerivedKey) {
    return envDerivedKey;
  }

  if (existsSync(keyPath)) {
    const stored = readFileSync(keyPath, "utf8");
    const derivedKey = deriveKeyFromValue(stored);
    if (derivedKey) {
      return derivedKey;
    }
  }

  const generated = randomBytes(32);
  ensureParentDirectory(keyPath);
  writeFileSync(keyPath, `${generated.toString("base64url")}\n`, "utf8");
  return generated;
}

function deriveStateSigningKey(encryptionKey) {
  return createHash("sha256")
    .update(encryptionKey)
    .update("nexteam-gbp-rail-state-signing-key")
    .digest();
}

function createEmptyVault() {
  return {
    version: VAULT_VERSION,
    updatedAt: null,
    connections: {},
  };
}

function encryptVaultPayload(payload, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify(
    {
      version: VAULT_VERSION,
      algorithm: ENCRYPTION_ALGORITHM,
      iv: toBase64Url(iv),
      authTag: toBase64Url(authTag),
      ciphertext: toBase64Url(ciphertext),
    },
    null,
    2
  );
}

function decryptVaultPayload(serializedEnvelope, encryptionKey) {
  if (!serializedEnvelope || !serializedEnvelope.trim()) {
    return createEmptyVault();
  }

  const envelope = JSON.parse(serializedEnvelope);
  const decipher = createDecipheriv(
    envelope.algorithm || ENCRYPTION_ALGORITHM,
    encryptionKey,
    fromBase64Url(envelope.iv)
  );
  decipher.setAuthTag(fromBase64Url(envelope.authTag));

  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(envelope.ciphertext)),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(plaintext);
  return {
    ...createEmptyVault(),
    ...parsed,
    connections: parsed.connections || {},
  };
}

export function normalizeGoogleBusinessProfileConnectionKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9@._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new Error("A Google Business Profile account label is required.");
  }

  return normalized;
}

export function createGoogleBusinessProfileTokenVault({
  appRoot,
  vaultPath,
  keyPath,
  envKey = process.env.GBP_TOKEN_VAULT_KEY,
} = {}) {
  const resolvedVaultPath = vaultPath || join(appRoot, "credentials", DEFAULT_VAULT_FILENAME);
  const resolvedKeyPath = keyPath || join(appRoot, "credentials", DEFAULT_VAULT_KEY_FILENAME);
  const encryptionKey = loadOrCreateVaultKey({
    keyPath: resolvedKeyPath,
    envKey,
  });
  const stateSigningKey = deriveStateSigningKey(encryptionKey);

  function loadVault() {
    if (!existsSync(resolvedVaultPath)) {
      return createEmptyVault();
    }

    return decryptVaultPayload(readFileSync(resolvedVaultPath, "utf8"), encryptionKey);
  }

  function saveVault(nextVault) {
    const serializableVault = {
      ...createEmptyVault(),
      ...cloneValue(nextVault),
      updatedAt: new Date().toISOString(),
      connections: cloneValue(nextVault?.connections) || {},
    };

    ensureParentDirectory(resolvedVaultPath);
    writeFileSync(resolvedVaultPath, encryptVaultPayload(serializableVault, encryptionKey), "utf8");
    return serializableVault;
  }

  function redactConnection(connection) {
    if (!connection) {
      return null;
    }

    return {
      accountKey: connection.accountKey,
      accountLabel: connection.accountLabel,
      loginHint: connection.loginHint || "",
      connectedAt: connection.connectedAt || null,
      updatedAt: connection.updatedAt || null,
      approvalCaseId: connection.approvalCaseId || null,
      scope: connection.token?.scope || null,
      tokenType: connection.token?.token_type || null,
      accessTokenExpiresAt: connection.token?.expiry_date
        ? new Date(connection.token.expiry_date).toISOString()
        : null,
      hasRefreshToken: Boolean(connection.token?.refresh_token),
      latestSync: cloneValue(connection.latestSync || null),
    };
  }

  function getConnection(accountKey) {
    const normalizedKey = normalizeGoogleBusinessProfileConnectionKey(accountKey);
    return cloneValue(loadVault().connections?.[normalizedKey] || null);
  }

  function listConnections() {
    const vault = loadVault();
    return Object.values(vault.connections || {})
      .map((connection) => redactConnection(connection))
      .sort((left, right) => String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || "")));
  }

  function patchConnection(accountKey, updater) {
    const normalizedKey = normalizeGoogleBusinessProfileConnectionKey(accountKey);
    const vault = loadVault();
    const current = cloneValue(vault.connections?.[normalizedKey] || null);
    const nextValue = updater(current);

    if (!nextValue) {
      if (vault.connections?.[normalizedKey]) {
        delete vault.connections[normalizedKey];
        saveVault(vault);
      }
      return null;
    }

    vault.connections[normalizedKey] = {
      ...(current || {}),
      ...cloneValue(nextValue),
      accountKey: normalizedKey,
      updatedAt: new Date().toISOString(),
    };

    saveVault(vault);
    return cloneValue(vault.connections[normalizedKey]);
  }

  function signState(payload) {
    const body = {
      ...cloneValue(payload),
      issuedAt: Date.now(),
      nonce: toBase64Url(randomBytes(12)),
    };
    const encodedBody = toBase64Url(Buffer.from(JSON.stringify(body), "utf8"));
    const signature = createHmac("sha256", stateSigningKey).update(encodedBody).digest();
    return `${encodedBody}.${toBase64Url(signature)}`;
  }

  function parseSignedState(rawState, { maxAgeMs = STATE_TTL_MS } = {}) {
    const value = String(rawState || "").trim();
    if (!value) {
      return null;
    }

    const separatorIndex = value.indexOf(".");
    if (separatorIndex === -1) {
      return null;
    }

    const encodedBody = value.slice(0, separatorIndex);
    const encodedSignature = value.slice(separatorIndex + 1);
    const expectedSignature = createHmac("sha256", stateSigningKey).update(encodedBody).digest();
    const providedSignature = fromBase64Url(encodedSignature);

    if (
      expectedSignature.byteLength !== providedSignature.byteLength ||
      !timingSafeEqual(expectedSignature, providedSignature)
    ) {
      throw new Error("Google OAuth state validation failed.");
    }

    const parsedBody = JSON.parse(fromBase64Url(encodedBody).toString("utf8"));
    const issuedAt = Number(parsedBody.issuedAt || 0);

    if (!issuedAt || Date.now() - issuedAt > maxAgeMs) {
      throw new Error("Google OAuth state expired. Start the connection again.");
    }

    return parsedBody;
  }

  return {
    paths: {
      vaultPath: resolvedVaultPath,
      keyPath: resolvedKeyPath,
    },
    loadVault,
    listConnections,
    getConnection,
    patchConnection,
    redactConnection,
    signState,
    parseSignedState,
  };
}
