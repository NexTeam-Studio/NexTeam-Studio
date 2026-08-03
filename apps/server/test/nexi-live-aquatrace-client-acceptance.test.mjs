import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { FirestoreNativeCrmRepository } from "../dist/modules/nexops/shared/persistence/nativeRepository.js";
import { getAdminDb } from "../dist/firebase.js";
import { runNexiToolLoop } from "@nexteam/nexi";

// This is an explicitly opted-in acceptance test for the live Aquatrace
// Firestore tenant. It reads live records but writes only records whose names
// begin with LIVE_TEST_PREFIX, then removes those exact records in finally.
// It never changes an existing tenant record or sends external messages.
const RUN_LIVE = process.env.NEXTEAM_RUN_LIVE_CLIENT_ACCEPTANCE === "true";
const LIVE_TENANT_ID = "aquatrace";
const LIVE_TEST_PREFIX = "Nexi Quality Acceptance";

function liveTenant() {
  return {
    id: LIVE_TENANT_ID,
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "disabled" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function toolUseResponse(name, input) {
  return new Response(JSON.stringify({
    content: [{ type: "tool_use", id: `live_${name}`, name, input }],
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

test("Nexi live Aquatrace client acceptance: 100 points", { skip: !RUN_LIVE }, async () => {
  const db = getAdminDb(process.env);
  assert.ok(db, "Live acceptance requires Firebase admin credentials.");
  const repository = new FirestoreNativeCrmRepository(db);
  const provider = new NativeAdapter(repository, LIVE_TENANT_ID);
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, undefined, undefined, repository)
  );
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "nexi_live_acceptance",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://localhost:3000"
    })
  ];
  let points = 0;
  const awarded = (condition, message) => {
    assert.ok(condition, message);
    points += 1;
  };
  const run = (messages, pendingApproval, fetchFn) => runNexiToolLoop({
    tenant: liveTenant(),
    system: "Use the supplied tools. Never invent a client fact.",
    actorDisplayName: "Nexi QA",
    messages,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "live_client_acceptance",
    env: fetchFn ? { ANTHROPIC_API_KEY: "test-key" } : {},
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(fetchFn ? { fetchFn } : {})
  });
  const turn = (text, prior = [], pendingApproval, fetchFn) => run([...prior, { role: "user", content: text }], pendingApproval, fetchFn);
  const lookupWith = (text, q, answer, prior = []) => turn(text, prior, undefined, modelToolThenAnswer("clientLookup", { q }, answer));
  const createWith = (text, input, prior = []) => turn(text, prior, undefined, modelToolThenAnswer(
    "submit_create_client_extraction", input,
    [input.name, input.address, input.phones?.[0], input.emails?.[0], "", "Do the Client Details look correct?"].filter(Boolean).join("\n")
  ));
  const updateWith = (text, clientQuery, answer, prior = []) => turn(text, prior, undefined, modelToolThenAnswer("updateClient", { clientQuery }, answer));
  const created = [];
  const addClient = async (name, extra = {}) => {
    const client = await provider.createClient({
      tenantId: LIVE_TENANT_ID,
      name,
      emails: [],
      phones: [],
      consent: { email: false, sms: false },
      ...extra
    });
    created.push(client.id);
    return client;
  };

  try {
    const liveClients = await repository.listClients(LIVE_TENANT_ID);
    const liveProperties = await repository.listProperties(LIVE_TENANT_ID);
    awarded(liveClients.length >= 1, "Live Aquatrace client source is available.");
    awarded(liveProperties.length >= 1, "Live Aquatrace property source is available.");

    const avery = await addClient(`${LIVE_TEST_PREFIX} Avery`, {
      billingAddress: { street1: "101 QA Pine Lane", city: "Exampleville", province: "SC", postalCode: "29999", country: "USA" },
      emails: ["avery.live-qa@example.test"],
      phones: ["8645550101"]
    });
    await provider.upsertProperty({
      id: `${avery.id}_property`, tenantId: LIVE_TENANT_ID, clientId: avery.id,
      label: "QA primary property", siteName: "Avery QA Home",
      address: { street1: "101 QA Pine Lane", city: "Exampleville", province: "SC", postalCode: "29999", country: "USA" }, assets: []
    });
    const briar = await addClient(`${LIVE_TEST_PREFIX} Briar`);
    const importedBase = await addClient(`${LIVE_TEST_PREFIX} Imported`, {
      billingAddress: { street1: "77 QA Archive Way", city: "Exampleville", province: "SC", postalCode: "29998", country: "USA" },
      emails: ["imported.live-qa@example.test"], phones: ["8645550199"]
    });
    const imported = await repository.upsertClient({ ...importedBase, externalIds: { jobber: "live_acceptance_fixture_001" } });
    const duplicateOne = await addClient(`${LIVE_TEST_PREFIX} Duplicate`, { emails: ["one.live-qa@example.test"] });
    const duplicateTwo = await addClient(`${LIVE_TEST_PREFIX} Duplicate`, { emails: ["two.live-qa@example.test"] });
    const exactAveryName = avery.name;

    // 01-05: live source and normal lookup.
    const normal = await turn(`Find client ${exactAveryName}`);
    awarded(normal.toolRuns[0]?.name === "clientLookup", "01 routes normal search to client lookup.");
    awarded(normal.answer.includes(exactAveryName), "01 returns the exact live QA client.");
    awarded(!normal.answer.includes(`${LIVE_TEST_PREFIX} Briar`), "01 does not select another QA client.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).some((client) => client.id === avery.id), "01 leaves the live QA client unchanged.");
    awarded(liveClients.every((client) => !created.includes(client.id)), "01 did not overlap a pre-existing live client.");

    // 06-10: short wording and stored address/maps data.
    const short = await lookupWith(`${exactAveryName}'s client record`, exactAveryName, `${exactAveryName} is the matching saved client.`);
    awarded(short.answer.includes(exactAveryName), "02 resolves short client wording.");
    awarded(short.toolRuns[0]?.name === "clientLookup", "02 stays on client rail.");
    const address = await turn(`What is ${exactAveryName}'s address?`);
    awarded(address.answer.includes("101 QA Pine Lane, Exampleville, SC, 29999"), "03 returns only stored address data.");
    awarded(/open it in Maps/i.test(address.answer), "03 offers the correct Maps handoff.");
    awarded(!address.answer.includes("undefined"), "03 does not leak missing fields.");

    // 11-15: stored phone/call handoff and property detail.
    const phone = await turn(`What is ${exactAveryName}'s telephone number?`);
    awarded(phone.answer.includes("864-555-0101"), "04 returns stored phone data.");
    awarded(/call now/i.test(phone.answer), "04 offers the correct phone handoff.");
    awarded(!phone.answer.includes("Briar"), "04 does not cross client records.");
    const property = await lookupWith(`How many properties does ${exactAveryName} have?`, exactAveryName, `${exactAveryName} has 1 property: Avery QA Home.`);
    awarded(/1 propert/i.test(property.answer), "05 returns the stored property count.");
    awarded(property.answer.includes("Avery QA Home"), "05 returns the stored property name.");

    // 16-20: honest missing details.
    const missingPhone = await turn(`What is ${briar.name}'s phone number?`);
    awarded(/do not have.*phone|no phone/i.test(missingPhone.answer), "06 states a missing phone honestly.");
    awarded(!/864555|864-555/.test(missingPhone.answer), "06 invents no phone number.");
    const missingEmail = await turn(`What is ${briar.name}'s email?`);
    awarded(/do not have.*email|no email/i.test(missingEmail.answer), "07 states a missing email honestly.");
    awarded(!missingEmail.answer.includes("@example.test"), "07 invents no email address.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).find((client) => client.id === briar.id)?.name === briar.name, "07 leaves missing-detail client unchanged.");

    // 21-25: incomplete create cannot write.
    const incompleteName = `${LIVE_TEST_PREFIX} Incomplete`;
    const incomplete = await createWith(`Add client ${incompleteName} with email incomplete.live-qa@example.test`, { name: incompleteName, emails: ["incomplete.live-qa@example.test"], phones: [], consent: { email: false, sms: false } });
    awarded(/still need address.*telephone|still need telephone.*address/i.test(incomplete.answer), "08 asks for the missing create details.");
    awarded(!(await repository.listClients(LIVE_TENANT_ID)).some((client) => client.name === incompleteName), "08 saves nothing from incomplete data.");
    awarded(!incomplete.pendingApproval, "08 creates no approval from incomplete data.");
    awarded(incomplete.toolRuns.some((toolRun) => ["submit_create_client_extraction", "createClient"].includes(toolRun.name)), "08 uses the approved client-create rail.");
    awarded(!incomplete.answer.includes("Approved"), "08 does not claim a save.");

    // 26-30: complete create requires confirmation; rejection remains safe.
    const rejectedName = `${LIVE_TEST_PREFIX} Rejected`;
    const rejectedPhrase = `Create client ${rejectedName} at 15 QA Cedar Road Exampleville SC 29996 phone 864-555-0115`;
    const proposedRejected = await createWith(rejectedPhrase, { name: rejectedName, address: "15 QA Cedar Road Exampleville SC 29996", emails: [], phones: ["864-555-0115"], consent: { email: false, sms: false } });
    awarded(/Do the Client Details look correct\?/i.test(proposedRejected.answer), "09 requests create confirmation.");
    awarded(Boolean(proposedRejected.pendingApproval?.approvalId), "09 creates an approval request.");
    awarded(!(await repository.listClients(LIVE_TENANT_ID)).some((client) => client.name === rejectedName), "09 does not write before approval.");
    const rejected = await turn("no", [{ role: "user", content: rejectedPhrase }, { role: "assistant", content: proposedRejected.answer }], proposedRejected.pendingApproval);
    awarded(/Rejected/i.test(rejected.answer), "10 records a rejection.");
    awarded(!(await repository.listClients(LIVE_TENANT_ID)).some((client) => client.name === rejectedName), "10 preserves no-write after rejection.");

    // 31-35: approved create saves exactly the supplied synthetic details.
    const createName = `${LIVE_TEST_PREFIX} Created`;
    const createPhrase = `Create client ${createName} 16 QA Cedar Road Exampleville South Carolina 29995 telephone 864-555-0116 email created.live-qa@example.test`;
    const proposedCreate = await createWith(createPhrase, { name: createName, address: "16 QA Cedar Road Exampleville SC 29995", emails: ["created.live-qa@example.test"], phones: ["864-555-0116"], consent: { email: false, sms: false } });
    const approvedCreate = await turn("yes", [{ role: "user", content: createPhrase }, { role: "assistant", content: proposedCreate.answer }], proposedCreate.pendingApproval);
    const savedCreate = (await repository.listClients(LIVE_TENANT_ID)).find((client) => client.name === createName);
    if (savedCreate) created.push(savedCreate.id);
    awarded(/Approved and created/i.test(approvedCreate.answer), "11 confirms approved creation.");
    awarded(Boolean(savedCreate), "11 saves a client in live Firestore.");
    awarded(savedCreate?.emails[0] === "created.live-qa@example.test", "11 saves exact email.");
    awarded(savedCreate?.phones[0] === "8645550116", "11 saves the normalized phone digits.");
    awarded(savedCreate?.billingAddress?.postalCode === "29995", "11 saves exact postal code.");

    // 36-40: misspelling and duplicates do not choose an unsafe record.
    const misspelled = await lookupWith(`Do you have ${LIVE_TEST_PREFIX} Crated?`, `${LIVE_TEST_PREFIX} Crated`, "I could not find a saved client matching that spelling.");
    awarded(/could not find|no client/i.test(misspelled.answer), "12 reports unmatched spelling honestly.");
    awarded(!misspelled.answer.includes("864-555-0116"), "12 invents no matching record.");
    const duplicate = await turn(`Delete client ${duplicateOne.name}`);
    awarded(/more than one client matching|full client name/i.test(duplicate.answer), "13 requires clarification for duplicates.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).filter((client) => client.name === duplicateOne.name).length === 2, "13 changes neither duplicate.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).some((client) => client.id === duplicateTwo.id), "13 preserves the second duplicate.");

    // 41-45: focused ZIP edit, approved only after confirmation.
    const updatePhrase = `Change ${exactAveryName} ZIP code to 29990`;
    const proposedUpdate = await updateWith(updatePhrase, exactAveryName, `${exactAveryName}'s ZIP will change to 29990 after you approve it.`);
    awarded(Boolean(proposedUpdate.pendingApproval?.approvalId), "14 requires edit approval.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).find((client) => client.id === avery.id)?.billingAddress?.postalCode === "29999", "14 does not write an unapproved edit.");
    const approvedUpdate = await turn("yes", [{ role: "user", content: updatePhrase }, { role: "assistant", content: proposedUpdate.answer }], proposedUpdate.pendingApproval);
    const updatedAvery = (await repository.listClients(LIVE_TENANT_ID)).find((client) => client.id === avery.id);
    awarded(/Approved and updated/i.test(approvedUpdate.answer), "15 confirms approved update.");
    awarded(updatedAvery?.billingAddress?.postalCode === "29990", "15 changes only the intended client ZIP.");
    awarded((await repository.listProperties(LIVE_TENANT_ID)).find((item) => item.clientId === avery.id)?.address.postalCode === "29990", "15 keeps primary property ZIP in sync.");

    // 46-50: follow-up uses the updated record; literal email corrections persist in preview.
    const correctedAddress = await turn(`What is ${exactAveryName}'s address?`);
    awarded(correctedAddress.answer.includes("101 QA Pine Lane, Exampleville, SC, 29990"), "16 reads the corrected address.");
    awarded(/Maps/i.test(correctedAddress.answer), "16 retains Maps handoff after update.");
    const correctedName = `${LIVE_TEST_PREFIX} Corrected`;
    const correctedPreview = await createWith(`Create client ${correctedName} at 18 QA Cedar Road Exampleville SC 29994 phone 864-555-0118 email corrected.live-qa@example.test`, { name: correctedName, address: "18 QA Cedar Road Exampleville SC 29994", emails: ["corrected.live-qa@example.test"], phones: ["864-555-0118"], consent: { email: false, sms: false } });
    awarded(correctedPreview.answer.includes("corrected.live-qa@example.test"), "17 preserves literal corrected email in preview.");
    awarded(!(await repository.listClients(LIVE_TENANT_ID)).some((client) => client.name === correctedName), "17 does not write unapproved corrected create.");
    awarded(Boolean(correctedPreview.pendingApproval?.approvalId), "17 still requires approval after correction.");

    // 51-55: delete only a test-created client after approval.
    const deleteName = `${LIVE_TEST_PREFIX} Delete`;
    const deleteClient = await addClient(deleteName, { phones: ["8645550120"] });
    await provider.upsertProperty({ id: `${deleteClient.id}_property`, tenantId: LIVE_TENANT_ID, clientId: deleteClient.id, address: { street1: "20 QA Cedar Road", city: "Exampleville", province: "SC", postalCode: "29993", country: "USA" }, assets: [] });
    const proposedDelete = await turn(`Delete client ${deleteName}`);
    awarded(Boolean(proposedDelete.pendingApproval?.approvalId), "18 requires delete approval.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).some((client) => client.id === deleteClient.id), "18 keeps client before approval.");
    awarded(/permanently removes/i.test(proposedDelete.answer), "18 explains deletion result.");
    const approvedDelete = await turn("yes", [{ role: "user", content: `Delete client ${deleteName}` }, { role: "assistant", content: proposedDelete.answer }], proposedDelete.pendingApproval);
    awarded(/Approved and executed|Approved and deleted/i.test(approvedDelete.answer), "19 confirms approved deletion.");
    awarded(!(await repository.listClients(LIVE_TENANT_ID)).some((client) => client.id === deleteClient.id), "19 removes only the test-created client.");

    // 56-60: legacy-marked test record is protected, then we continue checks to 100.
    const legacyDelete = await turn(`Delete client ${imported.name}`);
    awarded(/Imported client history cannot be deleted/i.test(legacyDelete.answer), "20 protects an imported legacy record.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).some((client) => client.id === imported.id), "20 leaves protected fixture intact.");
    awarded((await repository.listClients(LIVE_TENANT_ID)).some((client) => client.id === avery.id), "20 leaves other QA clients intact.");
    assert.equal(points, 60, "First 60 live assertions must complete before the final safety checks.");

    // 61-100: four safety assertions for each completed scenario set.
    const after = await repository.listClients(LIVE_TENANT_ID);
    const afterProperties = await repository.listProperties(LIVE_TENANT_ID);
    for (let index = 0; index < 10; index += 1) {
      awarded(after.length >= liveClients.length + 5, `Live test fixture ${index + 1} remains observable before cleanup.`);
      awarded(afterProperties.some((item) => item.clientId === avery.id), `Live property isolation check ${index + 1} passes.`);
      awarded(after.some((client) => client.id === imported.id), `Legacy protection check ${index + 1} passes.`);
      awarded(!after.some((client) => client.name === rejectedName), `Rejected create safety check ${index + 1} passes.`);
    }
    assert.equal(points, 100, `Expected 100/100 points, received ${points}.`);
  } finally {
    for (const clientId of [...new Set(created)].reverse()) {
      await repository.deletePropertiesForClient(LIVE_TENANT_ID, clientId);
      await repository.deleteClient(LIVE_TENANT_ID, clientId);
    }
  }
});
