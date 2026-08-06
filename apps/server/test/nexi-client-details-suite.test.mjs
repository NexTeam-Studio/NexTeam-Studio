import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { runNexiToolLoop } from "@nexteam/nexi";

// This is deliberately an in-memory tenant. It neither reads nor writes a real
// tenant, Firestore, imported production data, external maps, or phone services.
const TEST_TENANT_ID = "nexi-client-details-suite-20260802";

function testTenant() {
  return {
    id: TEST_TENANT_ID,
    name: "Nexi Client Details Test Tenant",
    industryPack: "test",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "disabled" },
    approval: {},
    timezone: "America/New_York",
    plan: "test"
  };
}

function toolUseResponse(name, input) {
  return new Response(JSON.stringify({
    content: [{ type: "tool_use", id: `test_${name}`, name, input }],
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  }), { status: 200 });
}

function textResponse(text) {
  return new Response(JSON.stringify({
    content: [{ type: "text", text }],
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  }), { status: 200 });
}

function modelToolThenAnswer(name, input, answer) {
  let calls = 0;
  return async () => {
    calls += 1;
    return calls === 1 ? toolUseResponse(name, input) : textResponse(answer);
  };
}

test("Nexi Client and Client Details: 20 isolated tenant regression scenarios", async (t) => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, TEST_TENANT_ID);
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, undefined, undefined, repository)
  );
  const allTools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "test_owner",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://localhost:3000"
    })
  ];
  // Use the full routed tool inventory, not a client-only mock. This protects
  // the client-detail route from being stolen by another rail's generic tool.
  const tools = allTools;
  const run = (messages, pendingApproval, fetchFn, routingMode) => runNexiToolLoop({
    tenant: testTenant(),
    system: "Use the supplied tools. Never invent a client fact.",
    actorDisplayName: "Test Owner",
    messages,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "client_details_regression",
    env: fetchFn
      ? { ANTHROPIC_API_KEY: "test-key", ...(routingMode ? { NEXI_ROUTING_MODE: routingMode } : {}) }
      : { NEXI_ROUTING_MODE: "offline" },
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(fetchFn ? { fetchFn } : {})
  });
  const turn = (text, prior = [], pendingApproval, fetchFn) => run([...prior, { role: "user", content: text }], pendingApproval, fetchFn);
  const createWith = (text, input, prior = []) => run([...prior, { role: "user", content: text }], undefined, modelToolThenAnswer(
    "submit_create_client_extraction",
    input,
    [input.name, input.address, input.phones?.[0], input.emails?.[0], "", "Do the Client Details look correct?"].filter(Boolean).join("\n")
  ), "offline");
  const lookupWith = (text, q, answer, prior = []) => turn(text, prior, undefined, modelToolThenAnswer("clientLookup", { q }, answer));
  const updateWith = (text, clientQuery, answer, prior = []) => turn(text, prior, undefined, modelToolThenAnswer("updateClient", { clientQuery }, answer));

  const avery = await provider.createClient({
    tenantId: TEST_TENANT_ID,
    name: "Avery Redwood",
    billingAddress: { street1: "101 Test Pine Lane", city: "Exampleville", province: "SC", postalCode: "29999", country: "USA" },
    emails: ["avery.redwood@example.test"], phones: ["8645550101"], consent: { email: false, sms: false }
  });
  await provider.upsertProperty({
    id: "property_avery_primary", tenantId: TEST_TENANT_ID, clientId: avery.id,
    label: "Primary service address", siteName: "Avery Test Home",
    address: { street1: "101 Test Pine Lane", city: "Exampleville", province: "SC", postalCode: "29999", country: "USA" }, assets: []
  });
  const noContact = await provider.createClient({
    tenantId: TEST_TENANT_ID, name: "Briar Stone", emails: [], phones: [], consent: { email: false, sms: false }
  });
  const legacyCreated = await provider.createClient({
    tenantId: TEST_TENANT_ID, name: "Casey Imported",
    billingAddress: { street1: "77 Archive Way", city: "Exampleville", province: "SC", postalCode: "29998", country: "USA" },
    emails: ["casey.imported@example.test"], phones: ["8645550199"], consent: { email: false, sms: false }
  });
  const legacy = await repository.upsertClient({ ...legacyCreated, externalIds: { jobber: "legacy_test_fixture_001" } });
  const duplicateOne = await provider.createClient({ tenantId: TEST_TENANT_ID, name: "Drew Duplicate", emails: ["drew.one@example.test"], phones: [], consent: { email: false, sms: false } });
  const duplicateTwo = await provider.createClient({ tenantId: TEST_TENANT_ID, name: "Drew Duplicate", emails: ["drew.two@example.test"], phones: [], consent: { email: false, sms: false } });
  void noContact; void duplicateOne; void duplicateTwo;

  await t.test("01 normal client search finds the exact fake client", async () => {
    const result = await turn("Find client Avery Redwood");
    assert.match(result.answer, /Avery Redwood/);
    assert.equal(result.toolRuns[0]?.name, "clientLookup");
  });
  await t.test("02 short client search finds the same client", async () => {
    const result = await lookupWith("Avery Redwood's client record", "Avery Redwood", "Avery Redwood is the matching saved client.");
    assert.match(result.answer, /Avery Redwood/);
  });
  await t.test("03 address question returns stored address and a correct Maps handoff", async () => {
    const result = await turn("What is Avery Redwood's address?");
    assert.match(result.answer, /101 Test Pine Lane, Exampleville, SC, 29999/);
    assert.match(result.answer, /open it in Maps/i);
  });
  await t.test("04 phone question returns stored phone and a correct phone handoff", async () => {
    const result = await turn("What is Avery Redwood's telephone number?");
    assert.match(result.answer, /864-555-0101/);
    assert.match(result.answer, /call now/i);
  });
  await t.test("05 property question returns only the saved test property", async () => {
    const result = await lookupWith("How many properties does Avery Redwood have?", "Avery Redwood", "Avery Redwood has 1 property: Avery Test Home.");
    assert.match(result.answer, /1 propert/i);
    assert.match(result.answer, /Avery Test Home/);
  });
  await t.test("06 missing phone does not invent a phone number", async () => {
    const result = await turn("What is Briar Stone's phone number?");
    assert.match(result.answer, /do not have.*phone|no phone/i);
    assert.doesNotMatch(result.answer, /864555/);
  });
  await t.test("07 missing email does not invent an email address", async () => {
    const result = await turn("What is Briar Stone's email?");
    assert.match(result.answer, /do not have.*email|no email/i);
    assert.doesNotMatch(result.answer, /@example\.test/);
  });
  await t.test("08 incomplete create asks for missing required details and saves nothing", async () => {
    const result = await createWith("Add client Emery Test with email emery@example.test", { name: "Emery Test", emails: ["emery@example.test"], phones: [], consent: { email: false, sms: false } });
    assert.match(result.answer, /still need address.*telephone|still need telephone.*address/i);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.name === "Emery Test"), false);
  });
  await t.test("09 create asks for confirmation before saving", async () => {
    const result = await createWith("Create client Finley Test at 14 Test Cedar Road Exampleville SC 29997 phone 864-555-0114", { name: "Finley Test", address: "14 Test Cedar Road Exampleville SC 29997", emails: [], phones: ["864-555-0114"], consent: { email: false, sms: false } });
    assert.match(result.answer, /Do the Client Details look correct\?/);
    assert.ok(result.pendingApproval?.approvalId);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.name === "Finley Test"), false);
  });
  await t.test("10 rejected create saves no client", async () => {
    const phrase = "Create client Gale Test at 15 Test Cedar Road Exampleville SC 29996 phone 864-555-0115";
    const proposed = await createWith(phrase, { name: "Gale Test", address: "15 Test Cedar Road Exampleville SC 29996", emails: [], phones: ["864-555-0115"], consent: { email: false, sms: false } });
    const rejected = await turn("no", [{ role: "user", content: phrase }, { role: "assistant", content: proposed.answer }], proposed.pendingApproval);
    assert.match(rejected.answer, /Rejected/);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.name === "Gale Test"), false);
  });
  let harper;
  await t.test("11 approved create saves exact client and property data", async () => {
    const phrase = "Create client Harper Test 16 Test Cedar Road Exampleville South Carolina 29995 telephone 864-555-0116 email harper@example.test";
    const proposed = await createWith(phrase, { name: "Harper Test", address: "16 Test Cedar Road Exampleville SC 29995", emails: ["harper@example.test"], phones: ["864-555-0116"], consent: { email: false, sms: false } });
    const approved = await turn("yes", [{ role: "user", content: phrase }, { role: "assistant", content: proposed.answer }], proposed.pendingApproval);
    assert.match(approved.answer, /Approved and created Harper Test/);
    harper = (await repository.listClients(TEST_TENANT_ID)).find((client) => client.name === "Harper Test");
    assert.equal(harper?.emails[0], "harper@example.test");
    assert.equal(harper?.billingAddress?.postalCode, "29995");
    assert.equal((await repository.listProperties(TEST_TENANT_ID)).some((property) => property.clientId === harper?.id), true);
  });
  await t.test("12 client search tolerates a clear spelling correction without inventing a record", async () => {
    const result = await lookupWith("Do you have Harper Tset?", "Harper Tset", "I could not find a saved client matching Harper Tset.");
    assert.match(result.answer, /could not find|no client/i);
    assert.doesNotMatch(result.answer, /Harper Tset.*phone/i);
  });
  await t.test("13 duplicate names require clarification before choosing a record", async () => {
    const result = await turn("Delete client Drew Duplicate");
    assert.match(result.answer, /more than one client matching|full client name/i);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).filter((client) => client.name === "Drew Duplicate").length, 2);
  });
  await t.test("14 ZIP edit asks for confirmation and does not write early", async () => {
    const result = await updateWith("Change Avery Redwood ZIP code to 29990", "Avery Redwood", "Avery Redwood's ZIP will change to 29990 after you approve it.");
    assert.match(result.answer, /29990/);
    assert.ok(result.pendingApproval?.approvalId);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).find((client) => client.id === avery.id)?.billingAddress?.postalCode, "29999");
  });
  await t.test("15 approved ZIP correction updates only the chosen client and property", async () => {
    const phrase = "Change Avery Redwood ZIP code to 29990";
    const proposed = await updateWith(phrase, "Avery Redwood", "Avery Redwood's ZIP will change to 29990 after you approve it.");
    const approved = await turn("yes", [{ role: "user", content: phrase }, { role: "assistant", content: proposed.answer }], proposed.pendingApproval);
    assert.match(approved.answer, /Approved and updated Avery Redwood/);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).find((client) => client.id === avery.id)?.billingAddress?.postalCode, "29990");
    assert.equal((await repository.listProperties(TEST_TENANT_ID)).find((property) => property.clientId === avery.id)?.address.postalCode, "29990");
    assert.equal((await repository.listClients(TEST_TENANT_ID)).find((client) => client.id === legacy.id)?.billingAddress?.postalCode, "29998");
  });
  await t.test("16 follow-up address question reports the corrected address", async () => {
    const result = await turn("What is Avery Redwood's address?");
    assert.match(result.answer, /101 Test Pine Lane, Exampleville, SC, 29990/);
  });
  await t.test("17 create correction preserves the literal corrected email before approval", async () => {
    const phrase = "Create client Indigo Test at 18 Test Cedar Road Exampleville SC 29994 phone 864-555-0118 email indigo@example.test";
    const proposed = await createWith(phrase, { name: "Indigo Test", address: "18 Test Cedar Road Exampleville SC 29994", emails: ["indigo@example.test"], phones: ["864-555-0118"], consent: { email: false, sms: false } });
    assert.match(proposed.answer, /indigo@example\.test/);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.name === "Indigo Test"), false);
  });
  let julian;
  await t.test("18 deletion of a NexTeam-created client requires confirmation", async () => {
    julian = await provider.createClient({ tenantId: TEST_TENANT_ID, name: "Julian Delete Test", emails: [], phones: ["8645550120"], consent: { email: false, sms: false } });
    await provider.upsertProperty({ id: "property_julian", tenantId: TEST_TENANT_ID, clientId: julian.id, address: { street1: "20 Test Cedar Road", city: "Exampleville", province: "SC", postalCode: "29993", country: "USA" }, assets: [] });
    const result = await turn("Delete client Julian Delete Test");
    assert.match(result.answer, /Julian Delete Test/);
    assert.match(result.answer, /permanently removes/i);
    assert.ok(result.pendingApproval?.approvalId);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.id === julian.id), true);
  });
  await t.test("19 approved deletion removes only the NexTeam-created client and its property", async () => {
    const phrase = "Delete client Julian Delete Test";
    const proposed = await turn(phrase);
    const approved = await turn("yes", [{ role: "user", content: phrase }, { role: "assistant", content: proposed.answer }], proposed.pendingApproval);
    assert.match(approved.answer, /Approved and executed|Approved and deleted/i);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.id === julian.id), false);
    assert.equal((await repository.listProperties(TEST_TENANT_ID)).some((property) => property.clientId === julian.id), false);
    assert.ok(harper);
  });
  await t.test("20 imported legacy test client cannot be deleted", async () => {
    const result = await turn("Delete client Casey Imported");
    assert.match(result.answer, /Imported client history cannot be deleted/i);
    assert.equal((await repository.listClients(TEST_TENANT_ID)).some((client) => client.id === legacy.id), true);
  });
});
