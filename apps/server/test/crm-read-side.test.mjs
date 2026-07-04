import test from "node:test";
import assert from "node:assert/strict";
import { invoiceSchema, quoteSchema } from "@nexteam/core";
import { NativeAdapter } from "@nexteam/providers";
import { createCrmReadTools } from "../dist/crm/nexiTools.js";

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
  approval: {},
  timezone: "America/New_York",
  plan: "suite"
};

const client = {
  id: "client_1",
  tenantId: "aquatrace",
  name: "Deborah Justice",
  emails: ["deborah@example.test"],
  phones: [],
  tags: [],
  consent: { email: false, sms: false },
  externalIds: { jobber: "jobber_client_1" }
};

const property = {
  id: "property_1",
  tenantId: "aquatrace",
  clientId: "client_1",
  address: { street1: "181 Isbell Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
  assets: []
};

const job = {
  id: "job_1",
  tenantId: "aquatrace",
  clientId: "client_1",
  propertyId: "property_1",
  status: "lead",
  title: "Swimming Pool Leak Detection",
  lineItems: [],
  totals: { subtotal: 795, tax: 0, total: 795 },
  externalIds: { jobber: "jobber_job_1" }
};

test("CRM quote and invoice native schemas parse", () => {
  quoteSchema.parse({
    id: "quote_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "draft",
    title: "Leak detection quote",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  });
  invoiceSchema.parse({
    id: "invoice_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "sent",
    title: "Leak detection invoice",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  });
});

test("NativeAdapter exposes CRM read methods", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job] });
  assert.equal((await adapter.getClients("Deborah")).length, 1);
  assert.equal((await adapter.getJobs({ from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).length, 1);
  const detail = await adapter.getJobDetail({ nameQuery: "Swimming Pool" });
  assert.equal(detail.client?.name, "Deborah Justice");
  assert.equal(detail.property?.address.street1, "181 Isbell Road");
});

test("CRM read nexi-tools expose pipeline and client lookup", async () => {
  const adapter = NativeAdapter.fromRecords("aquatrace", { clients: [client], properties: [property], jobs: [job] });
  const tools = createCrmReadTools(adapter);
  const clientLookup = tools.find((tool) => tool.name === "clientLookup");
  const getPipeline = tools.find((tool) => tool.name === "getPipeline");
  assert.ok(clientLookup);
  assert.ok(getPipeline);
  const clients = await clientLookup.handler(tenant, { q: "Deborah" });
  const pipeline = await getPipeline.handler(tenant, {});
  assert.equal(clients.sources[0].rail, "native");
  assert.equal(pipeline.result.counts.lead, 1);
});
