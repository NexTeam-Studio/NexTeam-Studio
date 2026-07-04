import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { google } from "googleapis";
import {
  createGoogleBusinessProfileTokenVault,
  normalizeGoogleBusinessProfileConnectionKey,
} from "./googleBusinessProfileTokenVault.js";

export const GOOGLE_BUSINESS_PROFILE_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const GOOGLE_BUSINESS_PROFILE_APPROVAL_CASE_ID = "6-2215000040637";
export const GOOGLE_BUSINESS_PROFILE_LIVE_TEST_BLOCK_NOTE =
  "Live Google Business Profile inventory calls are fully wired, but Google can still reject them until case 6-2215000040637 is approved.";

const DEFAULT_RETURN_TO = "/mission-control/google-business-profile";
const DEFAULT_GBP_CREDENTIALS_FILENAME = "nexteam-gbp-rail-oauth.json";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5173/auth/google/callback";
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const LOCATION_READ_MASK = "name,title,storeCode,websiteUri,phoneNumbers,storefrontAddress,metadata";

function safeJsonParse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stripLeadingByteOrderMark(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

function readStringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function sanitizeRelativePath(value, fallback = DEFAULT_RETURN_TO) {
  const candidate = String(value || "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  return candidate;
}

function normalizeAccountLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    throw new Error("A Google account label is required before connecting.");
  }

  return label;
}

function normalizeLoginHint(value) {
  const hint = String(value || "").trim();
  return hint || "";
}

function normalizeTokenPayload(tokens = {}) {
  const expiresAt =
    Number(tokens.expiry_date || 0) ||
    (tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : null);

  return {
    access_token: tokens.access_token || "",
    refresh_token: tokens.refresh_token || "",
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || "",
    expiry_date: expiresAt || null,
  };
}

function mergeGoogleTokens(existingToken = {}, incomingTokens = {}) {
  const normalizedIncoming = normalizeTokenPayload(incomingTokens);

  return {
    ...normalizeTokenPayload(existingToken),
    ...normalizedIncoming,
    refresh_token: normalizedIncoming.refresh_token || existingToken.refresh_token || "",
    scope: normalizedIncoming.scope || existingToken.scope || GOOGLE_BUSINESS_PROFILE_SCOPE,
  };
}

function formatStorefrontAddress(storefrontAddress = {}) {
  const lines = Array.isArray(storefrontAddress.addressLines)
    ? storefrontAddress.addressLines.filter(Boolean)
    : [];
  const locality = storefrontAddress.locality ? [storefrontAddress.locality] : [];
  const administrativeArea = storefrontAddress.administrativeArea
    ? [storefrontAddress.administrativeArea]
    : [];
  const postalCode = storefrontAddress.postalCode ? [storefrontAddress.postalCode] : [];

  return [...lines, [...locality, ...administrativeArea, ...postalCode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" | ");
}

function mapGoogleBusinessProfileAccount(account = {}) {
  return {
    name: account.name || "",
    accountId: account.name ? account.name.split("/").pop() : "",
    accountName: account.accountName || "",
    type: account.type || "",
    role: account.role || "",
  };
}

function mapGoogleBusinessProfileLocation(location = {}, account = {}) {
  return {
    name: location.name || "",
    locationId: location.name ? location.name.split("/").pop() : "",
    title: location.title || "",
    storeCode: location.storeCode || "",
    websiteUri: location.websiteUri || "",
    primaryPhone: location.phoneNumbers?.primaryPhone || "",
    address: formatStorefrontAddress(location.storefrontAddress),
    metadata: {
      placeId: location.metadata?.placeId || "",
      mapsUri: location.metadata?.mapsUri || "",
      newReviewUri: location.metadata?.newReviewUri || "",
    },
    accountName: account.name || "",
    accountDisplayName: account.accountName || "",
  };
}

class GoogleBusinessProfileApiError extends Error {
  constructor(message, { status = 500, detail = null, data = null } = {}) {
    super(message);
    this.name = "GoogleBusinessProfileApiError";
    this.status = status;
    this.detail = detail;
    this.data = data;
  }
}

class GoogleBusinessProfileSyncError extends Error {
  constructor(message, snapshot, options = {}) {
    super(message);
    this.name = "GoogleBusinessProfileSyncError";
    this.snapshot = snapshot;
    this.status = options.status || 500;
  }
}

export function isLikelyGoogleApprovalBlock(error) {
  const haystack = [error?.message, error?.detail, JSON.stringify(error?.data || null)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    Number(error?.status || 0) === 403 &&
    (haystack.includes("quota") ||
      haystack.includes("business profile") ||
      haystack.includes("request for access") ||
      haystack.includes("not been used") ||
      haystack.includes("access not configured"))
  );
}

export function loadGoogleBusinessProfileOAuthSettings({
  appRoot,
  credentialsPath = join(appRoot, "credentials", DEFAULT_GBP_CREDENTIALS_FILENAME),
} = {}) {
  if (!existsSync(credentialsPath)) {
    return {
      credentialsPath,
      clientId: "",
      clientSecret: "",
      redirectUris: [],
      redirectUri: process.env.GBP_GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    };
  }

  try {
    const parsed = JSON.parse(stripLeadingByteOrderMark(readFileSync(credentialsPath, "utf8")));
    const credentials = parsed.web || parsed.installed || {};
    const redirectUris = Array.isArray(credentials.redirect_uris) ? credentials.redirect_uris : [];

    return {
      credentialsPath,
      clientId: process.env.GBP_GOOGLE_CLIENT_ID || readStringOrEmpty(credentials.client_id),
      clientSecret: process.env.GBP_GOOGLE_CLIENT_SECRET || readStringOrEmpty(credentials.client_secret),
      redirectUris,
      redirectUri:
        process.env.GBP_GOOGLE_REDIRECT_URI ||
        redirectUris.find((entry) => entry === DEFAULT_REDIRECT_URI) ||
        redirectUris[0] ||
        DEFAULT_REDIRECT_URI,
    };
  } catch (error) {
    console.error("[gbp/oauth] credentials load error:", error.message);
    return {
      credentialsPath,
      clientId: "",
      clientSecret: "",
      redirectUris: [],
      redirectUri: process.env.GBP_GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    };
  }
}

function createOAuthClient(settings) {
  if (!settings.clientId || !settings.clientSecret || !settings.redirectUri) {
    throw new Error(
      "Google Business Profile OAuth settings are not configured. Confirm that credentials/nexteam-gbp-rail-oauth.json contains the real client_secret string."
    );
  }

  return new google.auth.OAuth2(settings.clientId, settings.clientSecret, settings.redirectUri);
}

async function exchangeAuthorizationCodeWithGoogle({ settings, code }) {
  const client = createOAuthClient(settings);
  const { tokens } = await client.getToken({
    code,
    redirect_uri: settings.redirectUri,
  });
  return tokens;
}

async function refreshAccessTokenWithGoogle({
  settings,
  refreshToken,
  fetchImpl = fetch,
}) {
  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await response.text();
  const data = safeJsonParse(text);

  if (!response.ok) {
    throw new GoogleBusinessProfileApiError("Google token refresh failed.", {
      status: response.status,
      detail: typeof data === "string" ? data : data?.error_description || data?.error || null,
      data,
    });
  }

  return data;
}

async function fetchGoogleJson(url, accessToken, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "NexTeam-Studio/GBP-Rail",
    },
  });

  const text = await response.text();
  const data = safeJsonParse(text);

  if (!response.ok) {
    throw new GoogleBusinessProfileApiError(`Google Business Profile request failed (${response.status}).`, {
      status: response.status,
      detail: typeof data === "string" ? data : data?.error?.message || data?.message || null,
      data,
    });
  }

  return data;
}

async function listAllGoogleBusinessProfileAccounts(accessToken, { fetchImpl = fetch } = {}) {
  const accounts = [];
  let nextPageToken = "";

  do {
    const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const data = await fetchGoogleJson(url.toString(), accessToken, { fetchImpl });
    accounts.push(...(Array.isArray(data.accounts) ? data.accounts : []));
    nextPageToken = data.nextPageToken || "";
  } while (nextPageToken);

  return accounts;
}

async function listAllLocationsForGoogleBusinessProfileAccount(
  accessToken,
  accountName,
  { fetchImpl = fetch } = {}
) {
  const locations = [];
  let nextPageToken = "";

  do {
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
    url.searchParams.set("readMask", LOCATION_READ_MASK);
    url.searchParams.set("pageSize", "100");
    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const data = await fetchGoogleJson(url.toString(), accessToken, { fetchImpl });
    locations.push(...(Array.isArray(data.locations) ? data.locations : []));
    nextPageToken = data.nextPageToken || "";
  } while (nextPageToken);

  return locations;
}

export function createGoogleBusinessProfileRailService({
  appRoot,
  credentialsPath,
  vaultPath,
  vaultKeyPath,
  envVaultKey,
  fetchImpl = fetch,
  exchangeCodeForTokensImpl,
  now = () => Date.now(),
} = {}) {
  const settings = loadGoogleBusinessProfileOAuthSettings({
    appRoot,
    credentialsPath,
  });
  const vault = createGoogleBusinessProfileTokenVault({
    appRoot,
    vaultPath,
    keyPath: vaultKeyPath,
    envKey: envVaultKey,
  });

  async function ensureFreshAccessToken(accountKey, { forceRefresh = false } = {}) {
    const existingConnection = vault.getConnection(accountKey);

    if (!existingConnection?.token?.refresh_token) {
      throw new Error(`No refresh token is stored for GBP connection "${accountKey}".`);
    }

    const isStillFresh =
      !forceRefresh &&
      existingConnection.token.access_token &&
      Number(existingConnection.token.expiry_date || 0) > now() + TOKEN_REFRESH_SKEW_MS;

    if (isStillFresh) {
      return {
        accessToken: existingConnection.token.access_token,
        connection: existingConnection,
      };
    }

    const refreshedTokens = await refreshAccessTokenWithGoogle({
      settings,
      refreshToken: existingConnection.token.refresh_token,
      fetchImpl,
    });

    const mergedToken = mergeGoogleTokens(existingConnection.token, refreshedTokens);
    const updatedConnection = vault.patchConnection(accountKey, (current) => ({
      ...current,
      token: mergedToken,
    }));

    return {
      accessToken: updatedConnection.token.access_token,
      connection: updatedConnection,
    };
  }

  function createConnectRequest({ accountLabel, loginHint, returnTo = DEFAULT_RETURN_TO }) {
    const normalizedLabel = normalizeAccountLabel(accountLabel);
    const normalizedHint = normalizeLoginHint(loginHint) || normalizedLabel;
    const safeReturnTo = sanitizeRelativePath(returnTo);
    const state = vault.signState({
      flow: "gbp",
      accountLabel: normalizedLabel,
      loginHint: normalizedHint,
      returnTo: safeReturnTo,
    });
    const client = createOAuthClient(settings);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      login_hint: normalizedHint,
      scope: [GOOGLE_BUSINESS_PROFILE_SCOPE],
      state,
    });

    return {
      url,
      state,
      accountKey: normalizeGoogleBusinessProfileConnectionKey(normalizedLabel),
      returnTo: safeReturnTo,
    };
  }

  function parseState(rawState) {
    return vault.parseSignedState(rawState);
  }

  async function handleOAuthCallback({ code, state }) {
    const parsedState = vault.parseSignedState(state);
    if (!parsedState || parsedState.flow !== "gbp") {
      throw new Error("The Google OAuth callback was not issued for the GBP rail.");
    }

    const incomingTokens = exchangeCodeForTokensImpl
      ? await exchangeCodeForTokensImpl({
          code,
          settings,
          state: parsedState,
        })
      : await exchangeAuthorizationCodeWithGoogle({
          settings,
          code,
        });

    const accountLabel = normalizeAccountLabel(parsedState.accountLabel);
    const accountKey = normalizeGoogleBusinessProfileConnectionKey(accountLabel);
    const existingConnection = vault.getConnection(accountKey);
    const mergedToken = mergeGoogleTokens(existingConnection?.token, incomingTokens);

    if (!mergedToken.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Reconnect with prompt=consent so offline access can be stored."
      );
    }

    const storedConnection = vault.patchConnection(accountKey, (current) => ({
      ...current,
      accountLabel,
      loginHint: normalizeLoginHint(parsedState.loginHint) || accountLabel,
      connectedAt: current?.connectedAt || new Date().toISOString(),
      approvalCaseId: GOOGLE_BUSINESS_PROFILE_APPROVAL_CASE_ID,
      token: mergedToken,
    }));

    return {
      accountKey,
      returnTo: sanitizeRelativePath(parsedState.returnTo),
      connection: vault.redactConnection(storedConnection),
    };
  }

  async function syncConnectionDirectory(accountKey) {
    const normalizedKey = normalizeGoogleBusinessProfileConnectionKey(accountKey);

    try {
      const { accessToken } = await ensureFreshAccessToken(normalizedKey);
      const rawAccounts = await listAllGoogleBusinessProfileAccounts(accessToken, { fetchImpl });
      const mappedAccounts = rawAccounts.map((account) => mapGoogleBusinessProfileAccount(account));
      const locationsByAccount = [];
      const flatLocations = [];

      for (const account of rawAccounts) {
        if (!account?.name) {
          continue;
        }

        const rawLocations = await listAllLocationsForGoogleBusinessProfileAccount(accessToken, account.name, {
          fetchImpl,
        });
        const mappedLocations = rawLocations.map((location) =>
          mapGoogleBusinessProfileLocation(location, account)
        );

        locationsByAccount.push({
          account: mapGoogleBusinessProfileAccount(account),
          locations: mappedLocations,
        });
        flatLocations.push(...mappedLocations);
      }

      const snapshot = {
        syncedAt: new Date().toISOString(),
        blockedByGoogleApproval: false,
        approvalCaseId: GOOGLE_BUSINESS_PROFILE_APPROVAL_CASE_ID,
        note: GOOGLE_BUSINESS_PROFILE_LIVE_TEST_BLOCK_NOTE,
        readMask: LOCATION_READ_MASK,
        googleAccounts: mappedAccounts,
        locationsByAccount,
        totalAccounts: mappedAccounts.length,
        totalLocations: flatLocations.length,
        flatLocations,
      };

      const updatedConnection = vault.patchConnection(normalizedKey, (current) => ({
        ...current,
        latestSync: snapshot,
      }));

      return {
        connection: vault.redactConnection(updatedConnection),
        snapshot,
      };
    } catch (error) {
      const snapshot = {
        syncedAt: new Date().toISOString(),
        blockedByGoogleApproval: isLikelyGoogleApprovalBlock(error),
        approvalCaseId: GOOGLE_BUSINESS_PROFILE_APPROVAL_CASE_ID,
        note: GOOGLE_BUSINESS_PROFILE_LIVE_TEST_BLOCK_NOTE,
        error: {
          status: Number(error?.status || 0) || null,
          message: error?.message || "Google Business Profile sync failed.",
          detail: error?.detail || null,
        },
      };

      vault.patchConnection(normalizedKey, (current) => ({
        ...current,
        latestSync: snapshot,
      }));

      throw new GoogleBusinessProfileSyncError(
        snapshot.blockedByGoogleApproval
          ? "Google Business Profile inventory is wired, but Google approval is still blocking live calls."
          : "Google Business Profile inventory sync failed.",
        snapshot,
        {
          status: snapshot.blockedByGoogleApproval ? 409 : 502,
        }
      );
    }
  }

  return {
    settings,
    vault,
    createConnectRequest,
    parseState,
    handleOAuthCallback,
    listConnections: () => vault.listConnections(),
    getConnection: (accountKey) => vault.redactConnection(vault.getConnection(accountKey)),
    syncConnectionDirectory,
    ensureFreshAccessToken,
  };
}
