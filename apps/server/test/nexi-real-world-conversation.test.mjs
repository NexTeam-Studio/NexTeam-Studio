import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { answerNexiMessage } from "../dist/nexi/nexiService.js";
import { MemoryNexiRepository } from "../dist/nexi/nexiRepository.js";

// This is intentionally a local, throw-away tenant. It never opens Firestore,
// never uses aquatrace as a tenant ID, and never receives legacy Aquatrace data.
const TEST_TENANT_ID = "nexi-conversation-qa-local-20260802";
const SYNTHETIC_MARKER = "Nexi QA Synthetic 20260802";
const RUN_REAL = process.env.NEXTEAM_RUN_REAL_NEXI_CONVERSATION === "true";
const REPORT_DIR = join(process.cwd(), "receipts", "nexi");
const REPORT_PATH = join(REPORT_DIR, "real-world-conversation-20260802.json");

function tenant() {
  return {
    id: TEST_TENANT_ID,
    name: "Nexi Local Conversation QA",
    industryPack: "test",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "disabled" },
    approval: {},
    timezone: "America/New_York",
    plan: "test"
  };
}

function address(index, city = "Greenville") {
  return {
    street1: `${100 + index} QA Service Lane`,
    city,
    province: "SC",
    postalCode: String(29600 + index).padStart(5, "0"),
    country: "USA"
  };
}

function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function includesFact(answer, value) {
  return normalized(answer).includes(normalized(value));
}

function misspell(value) {
  return value.length > 4 ? `${value.slice(0, 2)}${value.slice(3)}` : `${value}e`;
}

async function seedSyntheticData(provider, repository) {
  const individuals = [];
  const contractors = [];
  const firstNames = ["Avery", "Briar", "Cameron", "Dakota", "Emery", "Finley", "Gale", "Harper", "Indigo", "Jordan", "Kendall", "Logan", "Morgan", "Parker", "Quinn"];
  const lastNames = ["Merritt", "Sloan", "Parker", "Rowan", "Vance"];

  for (let index = 1; index <= 75; index += 1) {
    const firstName = firstNames[(index - 1) % firstNames.length];
    const lastName = lastNames[Math.floor((index - 1) / firstNames.length)];
    // The marker is a durable tag, not part of the human-facing name. This
    // keeps the input realistic while still making every fixture auditable.
    const name = `${firstName} ${lastName}`;
    const client = await provider.createClient({
      tenantId: TEST_TENANT_ID,
      name,
      billingAddress: address(index, index % 2 ? "Greenville" : "Seneca"),
      emails: [`qa.individual.${String(index).padStart(2, "0")}@example.test`],
      phones: [`864555${String(1000 + index).slice(-4)}`],
      tags: ["nexi-qa-synthetic", "individual"],
      consent: { email: false, sms: false }
    });
    const taggedClient = await repository.upsertClient({ ...client, tags: ["nexi-qa-synthetic", "individual"] });
    const property = await provider.upsertProperty({
      id: `qa_individual_property_${index}`,
      tenantId: TEST_TENANT_ID,
      clientId: taggedClient.id,
      label: `QA home ${index}`,
      siteName: `QA ${firstName} ${index} Residence`,
      address: client.billingAddress,
      assets: [],
      contacts: [{ id: `qa_contact_${index}`, personName: { firstName, lastName }, emails: [{ value: client.emails[0] }], phones: [{ value: client.phones[0] }], channelPreference: "email" }]
    });
    individuals.push({ client: taggedClient, property, firstName, lastName });
  }

  for (let index = 1; index <= 25; index += 1) {
    const company = `Contractor ${String(index).padStart(2, "0")} Pool Services`;
    const client = await provider.createClient({
      tenantId: TEST_TENANT_ID,
      name: company,
      company,
      billingAddress: address(200 + index, "Spartanburg"),
      emails: [`qa.contractor.${String(index).padStart(2, "0")}@example.test`],
      phones: [`864556${String(2000 + index).slice(-4)}`],
      tags: ["nexi-qa-synthetic", "contractor"],
      consent: { email: false, sms: false }
    });
    const taggedClient = await repository.upsertClient({ ...client, tags: ["nexi-qa-synthetic", "contractor"] });
    const properties = [];
    for (let site = 1; site <= 3; site += 1) {
      const property = await provider.upsertProperty({
        id: `qa_contractor_${index}_property_${site}`,
        tenantId: TEST_TENANT_ID,
        clientId: taggedClient.id,
        label: `Oak Street site ${site}`,
        siteName: `QA Contractor ${index} Oak Street Site ${site}`,
        address: address(300 + (index * 3) + site, site === 1 ? "Greenville" : "Anderson"),
        assets: [],
        contacts: [{ id: `qa_contractor_contact_${index}_${site}`, personName: { firstName: `Site${site}`, lastName: `Contact${index}` }, emails: [{ value: `qa.site.${index}.${site}@example.test` }], phones: [{ value: `864557${String((index * 10) + site).padStart(4, "0").slice(-4)}` }], channelPreference: "both" }]
      });
      properties.push(property);
    }
    contractors.push({ client: taggedClient, properties });
  }

  // This fixture is synthetic, but deliberately carries an imported-source ID.
  // It tests the exact protection rule without referencing actual legacy data.
  const imported = await provider.createClient({
    tenantId: TEST_TENANT_ID,
    name: "QA Imported Protection Fixture",
    billingAddress: address(900, "Greenville"),
    emails: ["qa.imported.protection@example.test"],
    phones: ["8645599000"],
    tags: ["nexi-qa-synthetic", "imported-protection"],
    consent: { email: false, sms: false }
  });
  const protectedLegacy = await repository.upsertClient({ ...imported, tags: ["nexi-qa-synthetic", "imported-protection"], externalIds: { jobber: "qa_imported_protection_fixture" } });
  return { individuals, contractors, protectedLegacy };
}

function manifest(data) {
  return {
    tenantId: TEST_TENANT_ID,
    marker: SYNTHETIC_MARKER,
    individuals: data.individuals.map(({ client }) => ({ name: client.name, type: "individual", propertyCount: 1 })),
    contractors: data.contractors.map(({ client, properties }) => ({ name: client.name, type: "contractor", propertyCount: properties.length })),
    protectionFixture: { name: data.protectedLegacy.name, type: "synthetic_imported_protection_fixture", propertyCount: 0 }
  };
}

function saveReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

test("Nexi real-world client conversations: 250 local synthetic interactions through the live Claude tool gateway", { skip: !RUN_REAL }, async () => {
  assert.ok(process.env.ANTHROPIC_API_KEY?.trim(), "ANTHROPIC_API_KEY is required for this real, non-mocked conversation run.");
  const crmRepository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(crmRepository, TEST_TENANT_ID);
  const nexiRepository = new MemoryNexiRepository();
  const approvals = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(provider, undefined, undefined, crmRepository));
  const tools = [
    ...createCrmToolsWithOptions(provider, approvals, { requestRepository: crmRepository }),
    ...createApprovalNexiTools({ approvalQueue: approvals, actorId: "qa_owner", actorRole: "OWNER", crmRepository, publicBaseUrl: "http://localhost:3000" })
  ];
  const data = await seedSyntheticData(provider, crmRepository);
  const report = {
    title: "Nexi Real-World Conversation Test — Clients & Client Details",
    ranAt: new Date().toISOString(),
    localOnly: true,
    realGateway: true,
    tenantId: TEST_TENANT_ID,
    legacySafety: { aquatraceTenantTouched: false, importedFixtureProtected: true },
    manifest: manifest(data),
    interactions: [],
    summary: {}
  };
  // Write the manifest before interactions so it is inspectable even if a later model call fails.
  saveReport(report);
  const category = new Map();
  const failures = [];
  let sequence = 0;
  async function ask({ group, prompt, expected, conversationId, assertAnswer, assertDatabase }) {
    sequence += 1;
    let result;
    let error;
    try {
      result = await answerNexiMessage({
        tenant: tenant(), message: prompt, conversationId, actorDisplayName: "QA Owner", tools,
        repository: nexiRepository, env: { ...process.env, NEXI_ROUTING_MODE: "claude_first", NEXI_CONVERSATION_CONTEXT_RECORD_LIMIT: "40" }
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const answer = result?.answer ?? "";
    const passed = !error && (assertAnswer ? assertAnswer(answer, result) : expected.every((value) => includesFact(answer, value))) && (!assertDatabase || await assertDatabase());
    const entry = { id: sequence, category: group, prompt, expected, answer, toolRuns: result?.toolRuns ?? [], error: error ?? null, pass: Boolean(passed) };
    report.interactions.push(entry);
    const current = category.get(group) ?? { total: 0, passed: 0, failed: 0 };
    current.total += 1;
    if (passed) current.passed += 1; else { current.failed += 1; failures.push(entry); }
    category.set(group, current);
    // Persist incrementally. A provider timeout must not erase the raw evidence
    // from earlier completed turns.
    report.summary = { inProgress: true, totalAttempted: sequence, categories: Object.fromEntries(category), failures };
    saveReport(report);
    return { result, entry };
  }

  // 75 factual client-detail interactions: a person asking for the address.
  for (const [index, record] of data.individuals.entries()) {
    await ask({ group: "conversational recall", prompt: index % 3 === 0 ? `Where does ${record.firstName} ${record.lastName} live?` : `What is ${record.firstName} ${record.lastName}'s address?`, expected: [record.client.billingAddress.street1, record.client.billingAddress.city] });
  }
  // 25 natural phone questions (including phone handoff wording).
  for (const record of data.individuals.slice(0, 25)) {
    await ask({ group: "client details and phone handoff", prompt: `What's ${record.firstName} ${record.lastName}'s number? I may need to call them.`, expected: [record.client.phones[0]], assertAnswer: (answer) => includesFact(answer, record.client.phones[0]) && /call|phone|number/i.test(answer) });
  }
  // 25 billing-address questions for multi-property contractors.
  for (const record of data.contractors) {
    await ask({ group: "multi-property contractor", prompt: `For Contractor ${record.client.name.match(/\d{2}/)?.[0]}, what is the billing address, not the job site?`, expected: [record.client.billingAddress.street1, record.client.billingAddress.city] });
  }
  // 50 property-specific site questions, two per contractor.
  for (const record of data.contractors) {
    for (const property of record.properties.slice(0, 2)) {
      await ask({ group: "multi-property contractor", prompt: `What is the address and site contact for ${property.siteName}?`, expected: [property.address.street1, property.address.city], assertAnswer: (answer) => includesFact(answer, property.address.street1) && /site|contact|address/i.test(answer) });
    }
  }
  // 20 conversations with a person-shaped follow-up. Each pair stays in the same thread.
  for (const [index, record] of data.individuals.slice(25, 45).entries()) {
    const conversationId = `qa_context_${index}`;
    await ask({ group: "context tracking", conversationId, prompt: `Pull up ${record.firstName} ${record.lastName}.`, expected: [record.client.name] });
    await ask({ group: "context tracking", conversationId, prompt: "What is their email and phone?", expected: [record.client.emails[0], record.client.phones[0]] });
  }
  // 20 misspellings/casual references. A correct match or a clearly targeted clarification passes.
  for (const record of data.individuals.slice(45, 65)) {
    const casualName = `${misspell(record.firstName)} ${record.lastName}`;
    await ask({ group: "misspelling and casual phrasing", prompt: `Can you find ${casualName} for me?`, expected: [record.client.name], assertAnswer: (answer) => includesFact(answer, record.client.name) || /did you mean|clarif|more than one/i.test(answer) });
  }
  // 10 safe ambiguity requests. The right answer is a question, never a confident guess.
  const similar = [];
  for (let index = 1; index <= 2; index += 1) {
    const Jamie = await provider.createClient({ tenantId: TEST_TENANT_ID, name: "Jamie Shared", emails: [`qa.jamie.${index}@example.test`], phones: [`86455800${index}`], billingAddress: address(800 + index), consent: { email: false, sms: false } });
    similar.push(await crmRepository.upsertClient({ ...Jamie, tags: ["nexi-qa-synthetic", "ambiguity"] }));
  }
  for (let index = 0; index < 10; index += 1) {
    await ask({ group: "appropriate ambiguity", prompt: index % 2 ? "What is Jamie Shared's phone number?" : "Delete Jamie Shared", expected: [], assertAnswer: (answer) => /more than one|which jamie|clarif|full client name/i.test(answer), assertDatabase: async () => (await crmRepository.listClients(TEST_TENANT_ID)).filter((client) => client.name.endsWith("Jamie Shared")).length === 2 });
  }
  // 10 aggregate questions—same real tool route, but tests the model's ability to count its returned records.
  for (let index = 0; index < 10; index += 1) {
    await ask({ group: "aggregate questions", prompt: index % 2 ? "How many customers are in this test tenant?" : "How many clients do we have?", expected: ["103"], assertAnswer: (answer) => /103/.test(answer) && /client|customer/i.test(answer) });
  }

  // 15 live create / reject / approval turns. Records use an unmistakable synthetic marker.
  for (let index = 1; index <= 3; index += 1) {
    const name = `QA Created Conversation ${index}`;
    const conversationId = `qa_create_${index}`;
    const prompt = `Set up a new client named ${name} at ${500 + index} QA New Client Road, Greenville, South Carolina 296${70 + index}, phone 864-555-77${index}0, email qa.created.${index}@example.test.`;
    const proposed = await ask({ group: "CRUD and data integrity", conversationId, prompt, expected: [name], assertAnswer: (answer, result) => includesFact(answer, name) && Boolean(result?.pendingApproval?.approvalId), assertDatabase: async () => !(await crmRepository.listClients(TEST_TENANT_ID)).some((client) => client.name === name) });
    await ask({ group: "CRUD and data integrity", conversationId, prompt: index === 1 ? "No, cancel that." : "Yes, that is correct.", expected: [name], assertAnswer: (answer) => index === 1 ? /rejected|cancel/i.test(answer) : /approved|created/i.test(answer), assertDatabase: async () => (await crmRepository.listClients(TEST_TENANT_ID)).some((client) => client.name === name) === (index !== 1) });
    if (index !== 1) await ask({ group: "CRUD and data integrity", prompt: `What is the phone number for Created Conversation ${index}?`, expected: [`86455577${index}0`] });
    void proposed;
  }

  // 5 safe deletion flows, each against a preverified synthetic record only.
  for (let index = 1; index <= 5; index += 1) {
    const created = await provider.createClient({ tenantId: TEST_TENANT_ID, name: `QA Delete Candidate ${index}`, emails: [], phones: [`8645549${String(index).padStart(3, "0")}`], billingAddress: address(700 + index), consent: { email: false, sms: false } });
    const client = await crmRepository.upsertClient({ ...created, tags: ["nexi-qa-synthetic", "delete-candidate"] });
    assert.equal(client.tags.includes("nexi-qa-synthetic"), true, "A delete target must be a clearly marked synthetic record.");
    assert.equal(Boolean(client.externalIds?.jobber), false, "An imported record is never eligible for delete testing.");
    const conversationId = `qa_delete_${index}`;
    await ask({ group: "CRUD and data integrity", conversationId, prompt: `Delete ${client.name}.`, expected: [client.name], assertAnswer: (answer, result) => includesFact(answer, client.name) && Boolean(result?.pendingApproval?.approvalId), assertDatabase: async () => (await crmRepository.listClients(TEST_TENANT_ID)).some((candidate) => candidate.id === client.id) });
    await ask({ group: "CRUD and data integrity", conversationId, prompt: "Yes, delete that test client.", expected: [client.name], assertAnswer: (answer) => /approved|deleted|executed/i.test(answer), assertDatabase: async () => !(await crmRepository.listClients(TEST_TENANT_ID)).some((candidate) => candidate.id === client.id) });
  }
  // Protect an imported test record 5 times; it must be present after every attempt.
  for (let index = 0; index < 5; index += 1) {
    await ask({ group: "legacy delete protection", prompt: `Delete ${data.protectedLegacy.name}.`, expected: [], assertAnswer: (answer) => /imported.*cannot be deleted|cannot.*imported|protected/i.test(answer), assertDatabase: async () => (await crmRepository.listClients(TEST_TENANT_ID)).some((client) => client.id === data.protectedLegacy.id) });
  }

  assert.equal(sequence, 250, "This suite must run exactly 250 distinct conversational interactions.");
  assert.equal((await crmRepository.listClients("aquatrace")).length, 0, "The suite must never create, query, alter, or delete Aquatrace records.");
  report.summary = { total: sequence, passed: sequence - failures.length, failed: failures.length, passRate: Number((((sequence - failures.length) / sequence) * 100).toFixed(2)), categories: Object.fromEntries(category), failures, legacySafety: { aquatraceTenantTouched: false, importedFixtureStillPresent: (await crmRepository.listClients(TEST_TENANT_ID)).some((client) => client.id === data.protectedLegacy.id) } };
  saveReport(report);
  assert.equal(failures.length, 0, `Real conversational failures: ${failures.map((failure) => `#${failure.id} ${failure.prompt}`).join(" | ")}`);
});
