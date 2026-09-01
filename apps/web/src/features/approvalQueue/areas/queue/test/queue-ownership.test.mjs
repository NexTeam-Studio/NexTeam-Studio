import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Approval Queue route imports the owner panel and keeps its server-backed actions", () => {
  const workspace = readFileSync(new URL("../../../../nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/ApprovalQueuePanel.tsx", import.meta.url), "utf8");
  assert.match(workspace, /import \{ ApprovalQueuePanel \} from "\.\.\/approvalQueue\/areas\/queue\/components\/ApprovalQueuePanel"/);
  assert.match(workspace, /activeModule === "approvals"/);
  assert.match(panel, /\/api\/approval-queue\?tenantId=/);
  assert.match(panel, /\/api\/approval-queue\/\$\{encodeURIComponent\(item\.id\)\}\/execute/);
  assert.match(panel, /\/api\/approval-queue\/\$\{encodeURIComponent\(item\.id\)\}\/reject/);
  assert.match(panel, /import \{ NexOpsRosterTemplate \} from ".*NexOpsBusinessTemplates"/);
  assert.match(panel, /<NexOpsRosterTemplate title="Approvals"/);
  assert.doesNotMatch(panel, /className="approval-card"/);
});
