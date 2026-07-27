import test from "node:test";
import assert from "node:assert/strict";
import { mediaSchema, nexDocsDocumentSchema, nexDocsFolderSchema } from "@nexteam/core";
import { FirestoreMediaRepository } from "../dist/fielddocs/mediaRepository.js";

class FakeDocumentSnapshot {
  constructor(value) {
    this.value = value;
    this.exists = value !== undefined;
  }

  data() {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(store, collection, id) {
    this.store = store;
    this.collectionName = collection;
    this.id = id;
  }

  get key() {
    return `${this.collectionName}/${this.id}`;
  }

  async get() {
    return new FakeDocumentSnapshot(this.store.get(this.key));
  }

  async set(value, options) {
    const current = this.store.get(this.key);
    this.store.set(this.key, options?.merge && current ? { ...current, ...value } : value);
  }

  async delete() {
    this.store.delete(this.key);
  }
}

class FakeFirestore {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed));
  }

  collection(name) {
    return {
      doc: (id) => new FakeDocumentReference(this.store, name, id)
    };
  }

  async runTransaction(callback) {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
      delete: (ref) => ref.delete()
    });
  }
}

function photo(tenantId, id = "media_shared") {
  return mediaSchema.parse({
    id,
    tenantId,
    type: "photo",
    storageRef: `native://tenants/${tenantId}/media/${id}/photo.jpg`,
    aiTags: []
  });
}

test("Field Docs Admin repository rejects cross-tenant create collisions and updates", async () => {
  const otherTenantPhoto = photo("tenant_b");
  const db = new FakeFirestore({ "media/media_shared": otherTenantPhoto });
  const repository = new FirestoreMediaRepository(db);

  await assert.rejects(() => repository.saveMedia(photo("tenant_a")), /belongs to another tenant/i);
  await assert.rejects(() => repository.updateMedia("tenant_a", "media_shared", { aiCaption: "blocked" }), /not found/i);
  assert.equal(db.store.get("media/media_shared").tenantId, "tenant_b");
  assert.equal(db.store.get("media/media_shared").aiCaption, undefined);
});

test("Field Docs Admin repository preserves tenant identity on valid updates", async () => {
  const db = new FakeFirestore();
  const repository = new FirestoreMediaRepository(db);
  await repository.saveMedia(photo("tenant_a", "media_owned"));

  const updated = await repository.updateMedia("tenant_a", "media_owned", {
    tenantId: "tenant_b",
    aiCaption: "Tenant-safe caption"
  });

  assert.equal(updated.tenantId, "tenant_a");
  assert.equal(db.store.get("media/media_owned").tenantId, "tenant_a");
});

test("NexDocs Admin writes reject a folder id already owned by another tenant", async () => {
  const existing = nexDocsFolderSchema.parse({
    id: "folder_shared",
    tenantId: "tenant_b",
    clientId: "client_b",
    label: "Private",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  });
  const db = new FakeFirestore({ "nexDocsFolders/folder_shared": existing });
  const repository = new FirestoreMediaRepository(db);

  await assert.rejects(() => repository.saveNexDocsFolder({
    ...existing,
    tenantId: "tenant_a",
    clientId: "client_a"
  }), /belongs to another tenant/i);
  assert.equal(db.store.get("nexDocsFolders/folder_shared").tenantId, "tenant_b");
});

test("NexDocs Admin deletes reject a document owned by another tenant", async () => {
  const existing = nexDocsDocumentSchema.parse({
    id: "document_shared",
    tenantId: "tenant_b",
    clientId: "client_b",
    kind: "uploaded_file",
    source: "staff_upload",
    label: "Private permit",
    fileName: "permit.pdf",
    mimeType: "application/pdf",
    storageRef: "native://tenants/tenant_b/nexdocs/document_shared/permit.pdf",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  });
  const db = new FakeFirestore({ "nexDocsDocuments/document_shared": existing });
  const repository = new FirestoreMediaRepository(db);

  await assert.rejects(() => repository.deleteNexDocsDocument("tenant_a", "document_shared"), /not found/i);
  assert.equal(db.store.get("nexDocsDocuments/document_shared").tenantId, "tenant_b");
});
