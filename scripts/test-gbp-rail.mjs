import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  GOOGLE_BUSINESS_PROFILE_SCOPE,
  createGoogleBusinessProfileRailService,
} from "../src/features/missioncontrol/services/googleBusinessProfileRailService.js";

const tempRoot = mkdtempSync(join(tmpdir(), "nexteam-gbp-rail-"));
const credentialsDir = join(tempRoot, "credentials");
const credentialsPath = join(credentialsDir, "nexteam-gbp-rail-oauth.json");
const vaultPath = join(credentialsDir, "nexteam-gbp-rail-token-vault.enc");
const vaultKeyPath = join(credentialsDir, "nexteam-gbp-rail-token-vault.key");

mkdirSync(credentialsDir, { recursive: true });

writeFileSync(
  credentialsPath,
  JSON.stringify(
    {
      web: {
        client_id: "test-client-id.apps.googleusercontent.com",
        client_secret: "test-client-secret",
        redirect_uris: [
          "http://127.0.0.1:5173/auth/google/callback",
          "http://localhost:5173/auth/google/callback",
        ],
      },
    },
    null,
    2
  ),
  "utf8"
);

const fetchCalls = [];

const service = createGoogleBusinessProfileRailService({
  appRoot: tempRoot,
  credentialsPath,
  vaultPath,
  vaultKeyPath,
  exchangeCodeForTokensImpl: async () => ({
    access_token: "initial-access-token",
    refresh_token: "refresh-token-123",
    token_type: "Bearer",
    scope: GOOGLE_BUSINESS_PROFILE_SCOPE,
    expiry_date: Date.now() - 5000,
  }),
  fetchImpl: async (url, options = {}) => {
    fetchCalls.push({ url, options });

    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            access_token: "refreshed-access-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: GOOGLE_BUSINESS_PROFILE_SCOPE,
          });
        },
      };
    }

    if (String(url).startsWith("https://mybusinessaccountmanagement.googleapis.com/v1/accounts")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            accounts: [
              {
                name: "accounts/111",
                accountName: "Aquatrace Primary",
                type: "LOCATION_GROUP",
                role: "OWNER",
              },
            ],
          });
        },
      };
    }

    if (
      String(url).startsWith(
        "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/111/locations"
      )
    ) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            locations: [
              {
                name: "locations/1001",
                title: "Aquatrace Fair Play",
                phoneNumbers: { primaryPhone: "+1 864-555-0101" },
                storefrontAddress: {
                  addressLines: ["101 Main St"],
                  locality: "Fair Play",
                  administrativeArea: "SC",
                  postalCode: "29643",
                },
                metadata: { placeId: "place-1001" },
              },
              {
                name: "locations/1002",
                title: "Aquatrace Gainesville",
                phoneNumbers: { primaryPhone: "+1 352-555-0102" },
                storefrontAddress: {
                  addressLines: ["202 Water Ave"],
                  locality: "Gainesville",
                  administrativeArea: "FL",
                  postalCode: "32601",
                },
                metadata: { placeId: "place-1002" },
              },
              {
                name: "locations/1003",
                title: "Aquatrace Myrtle Beach",
                phoneNumbers: { primaryPhone: "+1 843-555-0103" },
                storefrontAddress: {
                  addressLines: ["303 Ocean Blvd"],
                  locality: "Myrtle Beach",
                  administrativeArea: "SC",
                  postalCode: "29577",
                },
                metadata: { placeId: "place-1003" },
              },
              {
                name: "locations/1004",
                title: "Aquatrace Charleston",
                phoneNumbers: { primaryPhone: "+1 843-555-0104" },
                storefrontAddress: {
                  addressLines: ["404 Harbor Rd"],
                  locality: "Charleston",
                  administrativeArea: "SC",
                  postalCode: "29401",
                },
                metadata: { placeId: "place-1004" },
              },
            ],
          });
        },
      };
    }

    throw new Error(`Unexpected fetch during GBP rail test: ${url}`);
  },
});

const connectRequest = service.createConnectRequest({
  accountLabel: "aquatraceleak@gmail.com",
  loginHint: "aquatraceleak@gmail.com",
});

assert.equal(connectRequest.accountKey, "aquatraceleak@gmail.com");
assert.match(connectRequest.url, /business\.manage/);
assert.match(connectRequest.url, /login_hint=aquatraceleak%40gmail\.com/);

const parsedState = service.parseState(connectRequest.state);
assert.equal(parsedState.accountLabel, "aquatraceleak@gmail.com");

const callbackResult = await service.handleOAuthCallback({
  code: "fake-authorization-code",
  state: connectRequest.state,
});

assert.equal(callbackResult.accountKey, "aquatraceleak@gmail.com");

const encryptedVaultText = readFileSync(vaultPath, "utf8");
assert.ok(encryptedVaultText.includes("\"ciphertext\""));
assert.ok(!encryptedVaultText.includes("refresh-token-123"));

const syncResult = await service.syncConnectionDirectory("aquatraceleak@gmail.com");

assert.equal(syncResult.snapshot.totalAccounts, 1);
assert.equal(syncResult.snapshot.totalLocations, 4);
assert.equal(syncResult.snapshot.locationsByAccount[0].locations[0].locationId, "1001");
assert.ok(
  fetchCalls.some((call) => String(call.url).startsWith("https://oauth2.googleapis.com/token")),
  "Expected the refresh token flow to be exercised."
);

console.log("GBP rail test passed.");
