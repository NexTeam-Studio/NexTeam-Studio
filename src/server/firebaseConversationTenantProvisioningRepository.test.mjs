import test from "node:test";
import assert from "node:assert/strict";
import { createTenantActorScope } from "../features/tenancy/services/tenantAccessPolicy.js";
import { assertActorCanProvisionAgentSession } from "./firebaseConversationTenantProvisioningRepository.js";

test("platform operator can provision any completed session", () => {
  const actorScope = createTenantActorScope({ tenantId: "nexteam-studio", roles: ["platform_operator"] });
  const allowed = assertActorCanProvisionAgentSession({
    actorScope,
    decodedToken: { uid: "operator-1" },
    session: { id: "session-1", tenantId: "blue-harbor", ownerUid: "owner-1" },
  });

  assert.equal(allowed, true);
});

test("same-tenant session owner can self-provision", () => {
  const actorScope = createTenantActorScope({ tenantId: "nexteam-studio" });
  const allowed = assertActorCanProvisionAgentSession({
    actorScope,
    decodedToken: { uid: "owner-1" },
    session: { id: "session-1", tenantId: "nexteam-studio", ownerUid: "owner-1" },
  });

  assert.equal(allowed, true);
});

test("cross-tenant actor is denied", () => {
  const actorScope = createTenantActorScope({ tenantId: "nexteam-studio" });

  assert.throws(
    () =>
      assertActorCanProvisionAgentSession({
        actorScope,
        decodedToken: { uid: "owner-1" },
        session: { id: "session-1", tenantId: "other-tenant", ownerUid: "owner-1" },
      }),
    /Tenant access denied/
  );
});

test("missing ownerUid blocks self-provision", () => {
  const actorScope = createTenantActorScope({ tenantId: "nexteam-studio" });

  assert.throws(
    () =>
      assertActorCanProvisionAgentSession({
        actorScope,
        decodedToken: { uid: "owner-1" },
        session: { id: "session-1", tenantId: "nexteam-studio" },
      }),
    /ownerUid is missing/
  );
});

test("mismatched ownerUid blocks self-provision", () => {
  const actorScope = createTenantActorScope({ tenantId: "nexteam-studio" });

  assert.throws(
    () =>
      assertActorCanProvisionAgentSession({
        actorScope,
        decodedToken: { uid: "owner-2" },
        session: { id: "session-1", tenantId: "nexteam-studio", ownerUid: "owner-1" },
      }),
    /owned by a different Firebase user/
  );
});
