import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreApprovalQueueRepository } from "../src/approval/firestoreRepository.ts";
import { setTenantOwnedDocument } from "../src/core/tenantOwnedWrite.ts";
import { FirestoreMediaRepository } from "../src/fielddocs/mediaRepository.ts";
import { createQuoteFirestoreRepository } from "../src/modules/nexops/areas/quotes/components/quoteEngine/server/firestoreRepository.ts";
import { createRequestFirestoreRepository } from "../src/modules/nexops/areas/requests/components/requestCore/server/firestoreRepository.ts";
import { FirestorePlatformRepository } from "../src/platform/repository.ts";

const SHOULD_RUN = process.env.RUN_ADMIN_TENANT_ISOLATION_EMULATOR_TESTS === "1";

if (!SHOULD_RUN) {
  test("Admin SDK tenant isolation emulator tests", { skip: "Run via npm run test:admin-tenant-isolation:emulator" }, () => {});
} else {
  const projectId = "demo-nexteam-studio";
  const suffix = randomUUID();
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const ids = {
    seam: `seam-${suffix}`,
    approval: `approval-${suffix}`,
    quote: `quote-${suffix}`,
    quoteTransaction: `quote-transaction-${suffix}`,
    request: `request-${suffix}`,
    user: `user-${suffix}`,
    folder: `folder-${suffix}`
  };
  let app;
  let db;

  before(() => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must target the local emulator");
    app = initializeApp({ projectId }, `admin-tenant-isolation-${suffix}`);
    db = getFirestore(app);
  });

  after(async () => {
    await Promise.all([
      db.collection("tenantOwnedProbe").doc(ids.seam).delete(),
      db.collection("approvalQueue").doc(ids.approval).delete(),
      db.collection("quotes").doc(ids.quote).delete(),
      db.collection("quotes").doc(ids.quoteTransaction).delete(),
      db.collection("requests").doc(ids.request).delete(),
      db.collection("tenantUsers").doc(ids.user).delete(),
      db.collection("nexDocsFolders").doc(ids.folder).delete()
    ]);
    await deleteApp(app);
  });

  test("shared Admin write seam rejects a cross-tenant overwrite in a real transaction", async () => {
    const ref = db.collection("tenantOwnedProbe").doc(ids.seam);
    await ref.set({ tenantId: tenantB, value: "private" });

    await assert.rejects(() => setTenantOwnedDocument({
      db,
      collection: "tenantOwnedProbe",
      id: ids.seam,
      tenantId: tenantA,
      data: { tenantId: tenantA, value: "blocked" },
      label: `Isolation probe ${ids.seam}`
    }), /belongs to another tenant/i);
    assert.deepEqual((await ref.get()).data(), { tenantId: tenantB, value: "private" });
  });

  test("ApprovalQueue Admin repository rejects cross-tenant reads and mutations", async () => {
    const repository = new FirestoreApprovalQueueRepository(db);
    await repository.create({
      id: ids.approval,
      tenantId: tenantB,
      kind: "email",
      preview: { title: "Private", body: "Tenant B approval" },
      execute: { service: "comms", op: "sendEmail", args: { tenantId: tenantB } },
      status: "pending",
      createdBy: "system"
    });

    assert.equal(await repository.get(tenantA, ids.approval), null);
    await assert.rejects(() => repository.update(tenantA, ids.approval, { status: "approved" }), /belongs to another tenant/i);
    const stored = await repository.get(tenantB, ids.approval);
    assert.equal(stored?.status, "pending");
  });

  test("CRM Admin repository rejects a caller-selected quote ID owned by another tenant", async () => {
    const repository = createQuoteFirestoreRepository(db);
    const quote = {
      id: ids.quote,
      tenantId: tenantB,
      clientId: `client-${suffix}`,
      status: "draft",
      title: "Tenant B quote",
      lineItems: [],
      totals: { subtotal: 0, tax: 0, total: 0 },
      approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false },
      pdfRef: `native://quotes/${tenantB}/${ids.quote}.pdf`
    };
    await repository.createQuote(quote);

    await assert.rejects(() => repository.createQuote({ ...quote, tenantId: tenantA, title: "Blocked" }), /belongs to another tenant/i);
    await assert.rejects(() => repository.updateQuote(ids.quote, { tenantId: tenantA, title: "Blocked" }), /belongs to another tenant/i);
    assert.equal((await db.collection("quotes").doc(ids.quote).get()).data()?.tenantId, tenantB);
  });

  test("Firestore request conversion atomically writes a quote and its request link", async () => {
    const repository = createRequestFirestoreRepository(db);
    const timestamp = "2026-09-04T02:00:00.000Z";
    const request = {
      id: ids.request,
      tenantId: tenantA,
      source: "office_new_client",
      status: "new",
      subject: "Leak detection",
      clientName: "Transaction Test",
      narrative: "Verify the builder conversion transaction.",
      consent: { email: true, sms: false, marketing: false },
      intake: { fieldValues: [], fieldIndex: {} },
      match: { matchedBy: "none", reviewRequired: false },
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const quote = {
      id: ids.quoteTransaction,
      tenantId: tenantA,
      clientId: `client-${suffix}`,
      requestId: ids.request,
      status: "draft",
      title: "Leak detection",
      lineItems: [{ id: `line-${suffix}`, code: "LEAK", name: "Leak Detection", quantity: 1, unitPrice: 595, total: 595, taxable: false, source: "custom" }],
      totals: { subtotal: 595, tax: 0, total: 595 },
      approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false },
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await repository.createRequest(request);
    const converted = await repository.createQuoteAndMarkRequestConverted({
      quote,
      requestId: ids.request,
      tenantId: tenantA,
      clientId: quote.clientId
    });
    assert.equal(converted.quote.id, ids.quoteTransaction);
    assert.equal(converted.request.convertedQuoteId, ids.quoteTransaction);
    assert.equal(converted.request.status, "converted_to_quote");
    assert.equal((await db.collection("quotes").doc(ids.quoteTransaction).get()).exists, true);
    assert.equal((await db.collection("requests").doc(ids.request).get()).data()?.convertedQuoteId, ids.quoteTransaction);
  });

  test("Platform Admin repository rejects a tenant user ID owned by another tenant", async () => {
    const repository = new FirestorePlatformRepository(db);
    const user = {
      id: ids.user,
      tenantId: tenantB,
      displayName: "Tenant B User",
      role: "OFFICE_ADMIN",
      active: true,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z"
    };
    await repository.upsertTenantUser(user);

    await assert.rejects(() => repository.upsertTenantUser({ ...user, tenantId: tenantA }), /belongs to another tenant/i);
    assert.equal((await db.collection("tenantUsers").doc(ids.user).get()).data()?.tenantId, tenantB);
  });

  test("Field Docs Admin repository rejects cross-tenant folder overwrite and delete", async () => {
    const repository = new FirestoreMediaRepository(db);
    const folder = {
      id: ids.folder,
      tenantId: tenantB,
      clientId: `client-${suffix}`,
      label: "Tenant B folder",
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z"
    };
    await repository.saveNexDocsFolder(folder);

    await assert.rejects(() => repository.saveNexDocsFolder({ ...folder, tenantId: tenantA }), /belongs to another tenant/i);
    await assert.rejects(() => repository.deleteNexDocsFolder(tenantA, ids.folder), /was not found/i);
    assert.equal((await db.collection("nexDocsFolders").doc(ids.folder).get()).data()?.tenantId, tenantB);
  });
}
