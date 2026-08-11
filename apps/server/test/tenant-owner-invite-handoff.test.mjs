import assert from "node:assert/strict";
import test from "node:test";
import { ownerInviteContinueUrl } from "../src/platform/tenantOwnerInvite.ts";

test("owner invite continuation targets the branded NexOps sign-in handoff", () => {
  assert.equal(
    ownerInviteContinueUrl("https://nexstage.nexteam.studio/"),
    "https://nexstage.nexteam.studio/nexops/sign-in?ownerInvite=1"
  );
});
