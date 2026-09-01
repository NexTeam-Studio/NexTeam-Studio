import React, { useEffect, useState } from "react";
import { NexOpsRosterTemplate } from "../../../../../shared/ui/NexOpsBusinessTemplates";
import { NexOpsNavGlyph } from "../../../../nexopsShell/workspaceSupport";
import "../styles/approvalQueue.css";
import "../../../../queueShared/queuePrimitives.css";

interface ApprovalQueueItem {
  id: string;
  tenantId: string;
  kind: string;
  preview: {
    title: string;
    body: string;
    mediaRefs?: string[];
  };
  execute: {
    service: string;
    op: string;
    args?: unknown;
  };
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  createdBy: "nexi" | "system" | "user";
  decidedAt?: string;
}



interface ApprovalQueueResponse {
  ok: boolean;
  items?: ApprovalQueueItem[];
  error?: string;
}



interface ApprovalActionResponse {
  ok: boolean;
  item?: ApprovalQueueItem;
  result?: unknown;
  error?: string;
}



function canExecuteApproval(item: ApprovalQueueItem): boolean {
  return (item.execute.service === "comms" && item.execute.op === "sendEmail")
    || (item.execute.service === "crm" && item.execute.op === "createClient")
    || (item.execute.service === "intake" && item.execute.op === "provisionTenant");
}



function approvalPrimaryLabel(item: ApprovalQueueItem): string {
  if (item.execute.service === "comms" && item.execute.op === "sendEmail") {
    return "Approve & send";
  }
  if (item.execute.service === "crm" && item.execute.op === "createClient") {
    return "Approve & create";
  }
  if (item.execute.service === "intake" && item.execute.op === "provisionTenant") {
    return "Approve & provision";
  }
  return "Approve";
}



function approvalKindLabel(item: ApprovalQueueItem): string {
  return item.kind.replaceAll("_", " ");
}



export function ApprovalQueuePanel(props: { tenantId: string }): React.ReactElement {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [status, setStatus] = useState("Loading approvals...");
  const [workingId, setWorkingId] = useState("");

  async function refresh(): Promise<void> {
    setStatus("Loading approvals...");
    try {
      const body = await fetch(`/api/approval-queue?tenantId=${encodeURIComponent(props.tenantId)}&includeHistory=true`)
        .then((response) => response.json() as Promise<ApprovalQueueResponse>);
      if (!body.ok) {
        setItems([]);
        setStatus(body.error ?? "Approval queue unavailable.");
        return;
      }
      const nextItems = body.items ?? [];
      const pending = nextItems.filter((item) => item.status === "pending");
      const history = nextItems.filter((item) => item.status !== "pending");
      setItems(nextItems);
      setStatus(`${pending.length} pending. ${history.length} historical.`);
    } catch {
      setItems([]);
      setStatus("Approval queue API unreachable.");
    }
  }

  async function approve(item: ApprovalQueueItem): Promise<void> {
    setWorkingId(item.id);
    setStatus(canExecuteApproval(item) ? "Approving and running..." : "Approving...");
    try {
      const approved = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/approve`, {
        method: "POST"
      }).then((response) => response.json() as Promise<ApprovalActionResponse>);
      if (!approved.ok) {
        setStatus(approved.error ?? "Approval failed.");
        return;
      }
      if (canExecuteApproval(item)) {
        const executed = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/execute`, {
          method: "POST"
        }).then((response) => response.json() as Promise<ApprovalActionResponse>);
        setStatus(executed.ok ? "Approved and completed." : executed.error ?? "Approved, but running it failed.");
        if (executed.ok && item.execute.service === "crm" && item.execute.op === "createClient") {
          window.dispatchEvent(new CustomEvent("nexops:crm-mutated"));
        }
      } else {
        setStatus("Approved.");
      }
      await refresh();
    } catch {
      setStatus("Approval request failed.");
    } finally {
      setWorkingId("");
    }
  }

  async function reject(item: ApprovalQueueItem): Promise<void> {
    setWorkingId(item.id);
    setStatus("Rejecting...");
    try {
      const body = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/reject`, {
        method: "POST"
      }).then((response) => response.json() as Promise<ApprovalActionResponse>);
      setStatus(body.ok ? "Rejected." : body.error ?? "Reject failed.");
      await refresh();
    } catch {
      setStatus("Reject request failed.");
    } finally {
      setWorkingId("");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    const handleQueued = () => void refresh();
    window.addEventListener("nexops:approval-queued", handleQueued);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("nexops:approval-queued", handleQueued);
    };
  }, [props.tenantId]);

  const pendingItems = items.filter((item) => item.status === "pending");
  const historicalItems = items.filter((item) => item.status !== "pending");

  function renderApprovalItem(item: ApprovalQueueItem): React.ReactElement {
    const isPending = item.status === "pending";
    return (
      <article className="content-draft approval-item" key={item.id}>
        <div className="content-draft-head">
          <span>{approvalKindLabel(item)}</span>
          <span>{isPending ? item.createdBy : item.status}</span>
        </div>
        <h3>{item.preview.title}</h3>
        <p>{item.preview.body.split(/\n+/).filter(Boolean).slice(0, 3).join(" ")}</p>
        {item.preview.mediaRefs?.length ? (
          <div className="approval-attachments">
            {item.preview.mediaRefs.map((ref) => <span key={ref}>{ref}</span>)}
          </div>
        ) : null}
        {item.decidedAt ? <p className="approval-decided">Decided {new Date(item.decidedAt).toLocaleString()}</p> : null}
        {isPending ? (
          <div className="content-actions">
            <button type="button" disabled={workingId === item.id} onClick={() => void approve(item)}>{approvalPrimaryLabel(item)}</button>
            <button className="secondary" type="button" disabled={workingId === item.id} onClick={() => void reject(item)}>Reject</button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <NexOpsRosterTemplate title="Approvals" detail="Review the work that needs a deliberate approval before it can continue." icon={<NexOpsNavGlyph module="approvals" />} primaryAction={<button className="nexops-hero-primary-button" type="button" onClick={() => void refresh()}>Refresh</button>}>
      <section className="approval-queue-content" aria-label="Approval queue">
      <p className="schedule-status">{status}</p>
      <h3 className="queue-section-heading">Pending</h3>
      <div className="content-list">
        {pendingItems.length ? pendingItems.map(renderApprovalItem) : <p className="empty-state">No approvals are waiting right now.</p>}
      </div>
      <h3 className="queue-section-heading">Approved / Rejected History</h3>
      <div className="content-list">
        {historicalItems.length ? historicalItems.map(renderApprovalItem) : <p className="empty-state">No approval history yet.</p>}
      </div>
      </section>
    </NexOpsRosterTemplate>
  );
}
