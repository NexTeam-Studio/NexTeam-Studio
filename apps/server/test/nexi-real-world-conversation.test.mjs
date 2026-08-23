import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Default mode is an isolated local tenant. The explicitly opted-in Aquatrace
// mode is safe only because it creates a unique, tagged QA namespace and the
// finally block deletes only those exact tagged records.
const RUN_LIVE_AQUATRACE = process.env.NEXTEAM_RUN_LIVE_AQUATRACE_CONVERSATION === "true";
const TEST_TENANT_ID = RUN_LIVE_AQUATRACE ? "aquatrace" : "nexi-conversation-qa-local-20260802";
const QA_PREFIX = RUN_LIVE_AQUATRACE ? "NEXI QA 20260803" : "Nexi QA";
const SYNTHETIC_MARKER = process.env.NEXTEAM_QA_RUN_MARKER?.trim()
  || `nexi-qa-${RUN_LIVE_AQUATRACE ? "aquatrace" : "local"}-${Date.now()}`;
const RUN_REAL = process.env.NEXTEAM_RUN_REAL_NEXI_CONVERSATION === "true";
const REPORT_DIR = join(process.cwd(), "receipts", "nexi");
const REPORT_PATH = join(REPORT_DIR, RUN_LIVE_AQUATRACE ? "real-world-conversation-aquatrace-20260803.json" : "real-world-conversation-20260802.json");

function tenant() {
  return {
    id: TEST_TENANT_ID,
    name: RUN_LIVE_AQUATRACE ? "Aquatrace" : "Nexi Local Conversation QA",
    industryPack: RUN_LIVE_AQUATRACE ? "pool_leak" : "test",
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
    const name = `${QA_PREFIX} ${firstName} ${lastName}`;
    const client = await provider.createClient({
      tenantId: TEST_TENANT_ID,
      name,
      billingAddress: address(index, index % 2 ? "Greenville" : "Seneca"),
      emails: [`qa.individual.${String(index).padStart(2, "0")}@example.test`],
      phones: [`864555${String(1000 + index).slice(-4)}`],
      tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "individual"],
      consent: { email: false, sms: false }
    });
    const taggedClient = await repository.upsertClient({ ...client, tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "individual"] });
    const property = await provider.upsertProperty({
      id: `qa_individual_property_${index}`,
      tenantId: TEST_TENANT_ID,
      clientId: taggedClient.id,
      label: `QA home ${index}`,
      siteName: `QA ${firstName} ${index} Residence`,
      address: client.billingAddress,
      assets: [],
      contacts: [{ id: `qa_contact_${index}`, personName: { firstName, lastName }, emails: [{ value: client.emails[0], label: "Work" }], phones: [{ value: client.phones[0], label: "Mobile" }], channelPreference: "email" }]
    });
    individuals.push({ client: taggedClient, property, firstName, lastName });
  }

  for (let index = 1; index <= 25; index += 1) {
    const company = `${QA_PREFIX} Contractor ${String(index).padStart(2, "0")} Pool Services`;
    const client = await provider.createClient({
      tenantId: TEST_TENANT_ID,
      name: company,
      company,
      billingAddress: address(200 + index, "Spartanburg"),
      emails: [`qa.contractor.${String(index).padStart(2, "0")}@example.test`],
      phones: [`864556${String(2000 + index).slice(-4)}`],
      tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "contractor"],
      consent: { email: false, sms: false }
    });
    const taggedClient = await repository.upsertClient({ ...client, tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "contractor"] });
    const properties = [];
    for (let site = 1; site <= 3; site += 1) {
      const property = await provider.upsertProperty({
        id: `qa_contractor_${index}_property_${site}`,
        tenantId: TEST_TENANT_ID,
        clientId: taggedClient.id,
        label: `Oak Street site ${site}`,
        siteName: `${QA_PREFIX} Contractor ${index} Oak Street Site ${site}`,
        address: address(300 + (index * 3) + site, site === 1 ? "Greenville" : "Anderson"),
        assets: [],
        contacts: [{ id: `qa_contractor_contact_${index}_${site}`, personName: { firstName: `Site${site}`, lastName: `Contact${index}` }, emails: [{ value: `qa.site.${index}.${site}@example.test`, label: "Work" }], phones: [{ value: `864557${String((index * 10) + site).padStart(4, "0").slice(-4)}`, label: "Work" }], channelPreference: "both" }]
      });
      properties.push(property);
    }
    contractors.push({ client: taggedClient, properties });
  }

  // This fixture is synthetic, but deliberately carries an imported-source ID.
  // It tests the exact protection rule without referencing actual legacy data.
  const imported = await provider.createClient({
    tenantId: TEST_TENANT_ID,
    name: `${QA_PREFIX} Imported Protection Fixture`,
    billingAddress: address(900, "Greenville"),
    emails: ["qa.imported.protection@example.test"],
    phones: ["8645599000"],
    tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "imported-protection"],
    consent: { email: false, sms: false }
  });
  const protectedLegacy = await repository.upsertClient({ ...imported, tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "imported-protection"], externalIds: { jobber: "qa_imported_protection_fixture" } });
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

test("Nexi real-world client conversations: 278 synthetic interactions through the live Claude tool gateway", { skip: !RUN_REAL }, async () => {
  // Keep the default (skipped) suite isolated from ambient Railway Firebase
  // credentials. These modules construct the live Nexi/CRM/Firebase graph, so
  // loading them before the skip gate can leave Firebase handles open even
  // though the real external-conversation scenario never runs.
  const [
    { ApprovalQueueService, InMemoryApprovalQueueRepository },
    { MemoryNativeCrmRepository, NativeAdapter },
    { createApprovalNexiTools },
    { CrmApprovalExecutor },
    { createCrmToolsWithOptions },
    { answerNexiMessage },
    { MemoryNexiRepository },
    { FirestoreNativeCrmRepository },
    { getAdminDb }
  ] = await Promise.all([
    import("@nexteam/core"),
    import("@nexteam/providers"),
    import("../dist/approval/nexiTools.js"),
    import("../dist/crm/approvalExecutor.js"),
    import("../dist/crm/nexiTools.js"),
    import("../dist/nexi/nexiService.js"),
    import("../dist/nexi/nexiRepository.js"),
    import("../dist/modules/nexops/shared/persistence/nativeRepository.js"),
    import("../dist/firebase.js")
  ]);
  assert.ok(process.env.ANTHROPIC_API_KEY?.trim(), "ANTHROPIC_API_KEY is required for this real, non-mocked conversation run.");
  const db = RUN_LIVE_AQUATRACE ? getAdminDb(process.env) : null;
  assert.ok(!RUN_LIVE_AQUATRACE || db, "Live Aquatrace QA requires Firebase admin credentials.");
  const crmRepository = RUN_LIVE_AQUATRACE ? new FirestoreNativeCrmRepository(db) : new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(crmRepository, TEST_TENANT_ID);
  const nexiRepository = new MemoryNexiRepository();
  const approvals = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(provider, undefined, undefined, crmRepository));
  const tools = [
    ...createCrmToolsWithOptions(provider, approvals, { requestRepository: crmRepository }),
    ...createApprovalNexiTools({ approvalQueue: approvals, actorId: "qa_owner", actorRole: "OWNER", crmRepository, publicBaseUrl: "http://localhost:3000" })
  ];
  // Older interrupted QA runs may have reached the real create path before
  // tagging was applied.  These three exact name/email pairs are exclusively
  // this suite's synthetic records; remove them before establishing the real
  // tenant baseline so they cannot create false duplicate matches.
  function isConversationCreatedQaClient(client) {
    const match = new RegExp(`^${QA_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Created Conversation ([1-3])$`).exec(client.name ?? "");
    if (!match || client.externalIds?.jobber || client.externalIds?.companyCam) return false;
    return (client.emails ?? []).includes(`qa.created.${match[1]}@example.test`);
  }
  async function removeExactQaClients() {
    const candidates = (await crmRepository.listClients(TEST_TENANT_ID)).filter((client) =>
      (client.name.startsWith(QA_PREFIX) && Array.isArray(client.tags) && client.tags.includes(SYNTHETIC_MARKER))
      || isConversationCreatedQaClient(client)
    );
    for (const client of [...candidates].reverse()) {
      await crmRepository.deletePropertiesForClient(TEST_TENANT_ID, client.id);
      await crmRepository.deleteClient(TEST_TENANT_ID, client.id);
    }
    return candidates;
  }
  await removeExactQaClients();
  const baselineClientIds = new Set((await crmRepository.listClients(TEST_TENANT_ID)).map((client) => client.id));
  let report;
  try {
  const data = await seedSyntheticData(provider, crmRepository);
  const expectedAggregateCount = baselineClientIds.size + 103;
  report = {
    title: "Nexi Real-World Conversation Test — Clients & Client Details",
    ranAt: new Date().toISOString(),
    localOnly: !RUN_LIVE_AQUATRACE,
    realGateway: true,
    tenantId: TEST_TENANT_ID,
    legacySafety: { aquatraceTenantTouched: RUN_LIVE_AQUATRACE, importedFixtureProtected: true, qaMarker: SYNTHETIC_MARKER },
    manifest: manifest(data),
    interactions: [],
    summary: {}
  };
  // Write the manifest before interactions so it is inspectable even if a later model call fails.
  saveReport(report);
  const category = new Map();
  const failures = [];
  let sequence = 0;
  // Independent people and contractor questions are safe to send in small
  // batches.  This keeps the test genuinely conversational while preventing
  // a 250-turn external-model run from being killed by a CI time limit.
  async function inBatches(items, worker, batchSize = RUN_LIVE_AQUATRACE ? 3 : 5) {
    for (let start = 0; start < items.length; start += batchSize) {
      await Promise.all(items.slice(start, start + batchSize).map(worker));
    }
  }
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
  await inBatches(data.individuals.map((record, index) => ({ record, index })), async ({ record, index }) => {
    await ask({ group: "conversational recall", prompt: index % 3 === 0 ? `Where does ${record.client.name} live?` : `What is ${record.client.name}'s address?`, expected: [record.client.billingAddress.street1, record.client.billingAddress.city] });
  });
  // 25 natural phone questions (including phone handoff wording).
  await inBatches(data.individuals.slice(0, 25), async (record) => {
    await ask({ group: "client details and phone handoff", prompt: `What's ${record.client.name}'s number? I may need to call them.`, expected: [record.client.phones[0]], assertAnswer: (answer) => includesFact(answer, record.client.phones[0]) && /call|phone|number/i.test(answer) });
  });
  // 25 billing-address questions for multi-property contractors.
  await inBatches(data.contractors, async (record) => {
    await ask({ group: "multi-property contractor", prompt: `For ${record.client.name}, what is the billing address, not the job site?`, expected: [record.client.billingAddress.street1, record.client.billingAddress.city] });
  });
  // 50 property-specific site questions, two per contractor.
  await inBatches(data.contractors.flatMap((record) => record.properties.slice(0, 2)), async (property) => {
      await ask({ group: "multi-property contractor", prompt: `What is the address and site contact for ${property.siteName}?`, expected: [property.address.street1, property.address.city], assertAnswer: (answer) => includesFact(answer, property.address.street1) && /site|contact|address/i.test(answer) });
  });
  // 20 conversations with a person-shaped follow-up. Each pair stays in the same thread.
  await inBatches(data.individuals.slice(25, 45).map((record, index) => ({ record, index })), async ({ record, index }) => {
    const conversationId = `qa_context_${index}`;
    await ask({ group: "context tracking", conversationId, prompt: `Pull up ${record.client.name}.`, expected: [record.client.name] });
    await ask({ group: "context tracking", conversationId, prompt: "What is their email and phone?", expected: [record.client.emails[0], record.client.phones[0]] });
  });
  // 20 misspellings/casual references. A correct match or a clearly targeted clarification passes.
  await inBatches(data.individuals.slice(45, 65), async (record) => {
    const casualName = `${QA_PREFIX} ${misspell(record.firstName)} ${record.lastName}`;
    const naturalName = `${record.firstName} ${record.lastName}`;
    await ask({ group: "misspelling and casual phrasing", prompt: `Can you find ${casualName} for me?`, expected: [record.client.name], assertAnswer: (answer) =>
      includesFact(answer, record.client.name)
      || (includesFact(answer, naturalName) && includesFact(answer, record.client.billingAddress.street1))
      || /did you mean|clarif|more than one/i.test(answer)
    });
  });
  // 10 safe ambiguity requests. The right answer is a question, never a confident guess.
  const similar = [];
  for (let index = 1; index <= 2; index += 1) {
    const Jamie = await provider.createClient({ tenantId: TEST_TENANT_ID, name: `${QA_PREFIX} Jamie Shared`, emails: [`qa.jamie.${index}@example.test`], phones: [`86455800${index}`], billingAddress: address(800 + index), consent: { email: false, sms: false } });
    similar.push(await crmRepository.upsertClient({ ...Jamie, tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "ambiguity"] }));
  }
  await inBatches([...Array(10).keys()], async (index) => {
    await ask({ group: "appropriate ambiguity", prompt: index % 2 ? `What is ${QA_PREFIX} Jamie Shared's phone number?` : `Delete ${QA_PREFIX} Jamie Shared`, expected: [], assertAnswer: (answer) => /more than one|matching clients?|which(?:\s+(?:one|address))?|clarif|full client name/i.test(answer), assertDatabase: async () => (await crmRepository.listClients(TEST_TENANT_ID)).filter((client) => client.name === `${QA_PREFIX} Jamie Shared`).length === 2 });
  });
  // 10 aggregate questions—same real tool route, but tests the model's ability to count its returned records.
  await inBatches([...Array(10).keys()], async (index) => {
    await ask({ group: "aggregate questions", prompt: index % 2 ? "How many customers are in this tenant?" : "How many clients do we have?", expected: [String(expectedAggregateCount)], assertAnswer: (answer) => includesFact(answer, expectedAggregateCount) && /client|customer/i.test(answer) });
  });

  // 15 live create / reject / approval turns. Records use an unmistakable synthetic marker.
  for (let index = 1; index <= 3; index += 1) {
    const name = `${QA_PREFIX} Created Conversation ${index}`;
    const conversationId = `qa_create_${index}`;
    const prompt = `Set up a new client named ${name} at ${500 + index} QA New Client Road, Greenville, South Carolina 296${70 + index}, phone 864-555-77${index}0, email qa.created.${index}@example.test.`;
    const proposed = await ask({ group: "CRUD and data integrity", conversationId, prompt, expected: [name], assertAnswer: (answer, result) => includesFact(answer, name) && Boolean(result?.pendingApproval?.approvalId), assertDatabase: async () => !(await crmRepository.listClients(TEST_TENANT_ID)).some((client) => client.name === name) });
    await ask({ group: "CRUD and data integrity", conversationId, prompt: index === 1 ? "No, cancel that." : "Yes, that is correct.", expected: [name], assertAnswer: (answer) => index === 1 ? /rejected|cancel/i.test(answer) : /approved|created/i.test(answer), assertDatabase: async () => (await crmRepository.listClients(TEST_TENANT_ID)).some((client) => client.name === name) === (index !== 1) });
    if (index !== 1) {
      const email = `qa.created.${index}@example.test`;
      const createdMatches = (await crmRepository.listClients(TEST_TENANT_ID)).filter((client) => client.name === name && (client.emails ?? []).includes(email));
      assert.equal(createdMatches.length, 1, "The approved conversation create must produce exactly one identifiable QA record.");
      await crmRepository.upsertClient({ ...createdMatches[0], tags: [...new Set([...(createdMatches[0].tags ?? []), "nexi-qa-synthetic", SYNTHETIC_MARKER, "conversation-created"])] });
    }
    if (index !== 1) await ask({ group: "CRUD and data integrity", prompt: `What is the phone number for ${name}?`, expected: [`86455577${index}0`] });
    void proposed;
  }

  // 5 safe deletion flows, each against a preverified synthetic record only.
  for (let index = 1; index <= 5; index += 1) {
    const created = await provider.createClient({ tenantId: TEST_TENANT_ID, name: `${QA_PREFIX} Delete Candidate ${index}`, emails: [], phones: [`8645549${String(index).padStart(3, "0")}`], billingAddress: address(700 + index), consent: { email: false, sms: false } });
    const client = await crmRepository.upsertClient({ ...created, tags: ["nexi-qa-synthetic", SYNTHETIC_MARKER, "delete-candidate"] });
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

  assert.ok(sequence >= 250, "This suite must run at least 250 distinct conversational interactions.");
  const preCleanupClients = await crmRepository.listClients(TEST_TENANT_ID);
  const preCleanupIds = new Set(preCleanupClients.map((client) => client.id));
  assert.ok([...baselineClientIds].every((id) => preCleanupIds.has(id)), "No pre-existing tenant client may be removed by QA.");
  if (!RUN_LIVE_AQUATRACE) {
    assert.equal((await crmRepository.listClients("aquatrace")).length, 0, "The local suite must never create, query, alter, or delete Aquatrace records.");
  }
  report.summary = { total: sequence, passed: sequence - failures.length, failed: failures.length, passRate: Number((((sequence - failures.length) / sequence) * 100).toFixed(2)), categories: Object.fromEntries(category), failures, legacySafety: { aquatraceTenantTouched: RUN_LIVE_AQUATRACE, baselineClientsStillPresent: [...baselineClientIds].every((id) => preCleanupIds.has(id)), importedFixtureStillPresent: preCleanupClients.some((client) => client.id === data.protectedLegacy.id) } };
  saveReport(report);
  assert.equal(failures.length, 0, `Real conversational failures: ${failures.map((failure) => `#${failure.id} ${failure.prompt}`).join(" | ")}`);
  } finally {
    // Cleanup is intentionally tag-and-prefix gated. It cannot select a
    // pre-existing Aquatrace record, even if a test failed part-way through.
    const candidates = await removeExactQaClients();
    const remainingQaClients = (await crmRepository.listClients(TEST_TENANT_ID)).filter((client) =>
      (client.name.startsWith(QA_PREFIX) && Array.isArray(client.tags) && client.tags.includes(SYNTHETIC_MARKER))
      || isConversationCreatedQaClient(client)
    );
    if (report) {
      report.cleanup = { attempted: candidates.length, remainingQaClients: remainingQaClients.length, marker: SYNTHETIC_MARKER };
      saveReport(report);
    }
    assert.equal(remainingQaClients.length, 0, "QA cleanup must remove only the exact records it created.");
  }
});
