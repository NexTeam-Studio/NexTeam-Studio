import React, { useEffect, useState } from "react";
import "../styles/contentQueue.css";
import "../../../../queueShared/queuePrimitives.css";

interface ContentDraft {
  id: string;
  kind: "gbp_post" | "social_post" | "article";
  title: string;
  body: string;
  status: "draft" | "approval_pending" | "publish_ready" | "published_deferred" | "rejected";
  createdAt: string;
  mediaRefs: string[];
}



interface ContentQueueResponse {
  ok: boolean;
  drafts?: ContentDraft[];
  error?: string;
}



export function ContentQueuePanel(props: { tenantId: string }): React.ReactElement {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [status, setStatus] = useState("Loading content queue...");
  const [workingId, setWorkingId] = useState("");

  async function refresh(): Promise<void> {
    setStatus("Loading content queue...");
    try {
      const body = await fetch(`/api/content/queue?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<ContentQueueResponse>);
      if (!body.ok) {
        setDrafts([]);
        setStatus(body.error ?? "Content queue unavailable.");
        return;
      }
      const pending = (body.drafts ?? []).filter((draft) => draft.status === "approval_pending");
      setDrafts(pending);
      setStatus(pending.length ? "Publishing stays parked until you approve it." : "No content drafts are waiting right now.");
    } catch {
      setDrafts([]);
      setStatus("Content queue API unreachable.");
    }
  }

  async function decide(draftId: string, action: "approve" | "reject"): Promise<void> {
    setWorkingId(draftId);
    setStatus(action === "approve" ? "Approving draft..." : "Rejecting draft...");
    try {
      const body = await fetch(`/api/content/drafts/${encodeURIComponent(draftId)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      setStatus(body.ok ? `Draft ${action === "approve" ? "approved" : "rejected"}.` : body.error ?? "Content decision failed.");
      await refresh();
    } catch {
      setStatus("Content decision request failed.");
    } finally {
      setWorkingId("");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  return (
    <aside className="content-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M5 Content</p>
          <h2>Content Queue</h2>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="schedule-status">{status}</p>
      <div className="content-list">
        {drafts.map((draft) => (
          <article className="content-draft" key={draft.id}>
            <div className="content-draft-head">
              <span>{draft.kind.replace("_", " ")}</span>
              <span>{new Date(draft.createdAt).toLocaleDateString()}</span>
            </div>
            <h3>{draft.title}</h3>
            <p>{draft.body.split(/\n+/)[0]}</p>
            <div className="content-actions">
              <button type="button" disabled={workingId === draft.id} onClick={() => void decide(draft.id, "approve")}>Approve</button>
              <button className="secondary" type="button" disabled={workingId === draft.id} onClick={() => void decide(draft.id, "reject")}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
