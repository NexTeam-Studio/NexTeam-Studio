import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { registerCrmRoutes } from "../dist/crm/routes.js";

function tenantUsers() {
  return [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }];
}

test("CRM address suggestions route normalizes geocode results into UI-ready fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "OK",
    results: [{
      formatted_address: "6020 Frest Dr, Seneca, SC 29672, USA",
      geometry: { location: { lat: 34.6851, lng: -82.9532 } },
      address_components: [
        { long_name: "6020", short_name: "6020", types: ["street_number"] },
        { long_name: "Frest Dr", short_name: "Frest Dr", types: ["route"] },
        { long_name: "Seneca", short_name: "Seneca", types: ["locality"] },
        { long_name: "South Carolina", short_name: "SC", types: ["administrative_area_level_1"] },
        { long_name: "29672", short_name: "29672", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] }
      ]
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });

  const app = express();
  registerCrmRoutes(app, {
    memoryRepository: new MemoryNativeCrmRepository(),
    platformRepository: { listTenantUsers: async () => tenantUsers() },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false", GOOGLE_MAPS_API_KEY: "test-google-key" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal(typeof originalFetch, "function");
    const response = await originalFetch(`${base}/api/crm/address-suggestions?tenantId=aquatrace&query=${encodeURIComponent("6020 Frest Dr Seneca SC")}`);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.suggestions.length, 1);
    assert.equal(body.suggestions[0].street1, "6020 Frest Dr");
    assert.equal(body.suggestions[0].city, "Seneca");
    assert.equal(body.suggestions[0].province, "SC");
    assert.equal(body.suggestions[0].postalCode, "29672");
    assert.equal(body.suggestions[0].country, "US");
    assert.equal(body.suggestions[0].lat, 34.6851);
    assert.equal(body.suggestions[0].lng, -82.9532);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM client create route persists property coordinates when address autocomplete provides them", async () => {
  const repository = new MemoryNativeCrmRepository();
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    memoryRepository: repository,
    platformRepository: { listTenantUsers: async () => tenantUsers() },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/api/crm/clients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        name: "Nova Test Client",
        phones: ["8645550100"],
        emails: [],
        consent: { email: false, sms: false, marketing: false },
        primaryProperty: {
          address: {
            street1: "6020 Frest Dr",
            city: "Seneca",
            province: "SC",
            postalCode: "29672",
            country: "US"
          },
          geo: { lat: 34.6851, lng: -82.9532 }
        }
      })
    });
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.property.geo.lat, 34.6851);
    assert.equal(body.property.geo.lng, -82.9532);

    const properties = await repository.listProperties("aquatrace");
    assert.equal(properties[0]?.geo?.lat, 34.6851);
    assert.equal(properties[0]?.geo?.lng, -82.9532);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
