import React, { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";

interface Blocker {
  id: string;
  tenantId: string;
  title: string;
  detail: string;
  category: string;
  severity: string;
  status: string;
}

interface Escalation {
  id: string;
  blockerId: string;
  priority: string;
  status: string;
  summary: string;
}

async function request<T>(user: User, path: string, init?: RequestInit): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers }
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "NexTeam Admin could not update tenant support.");
  return result;
}

export function PlatformTenantBlockersPanel({ user }: { user: User | null }): React.ReactElement {
  const [tenantId, setTenantId] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState("BLOCKING");
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const reload = useCallback(async () => {
    if (!user) return;
    const query = tenantId.trim() ? `?tenantId=${encodeURIComponent(tenantId.trim())}` : "";
    const data = await request<{ blockers: Blocker[]; escalations: Escalation[] }>(user, `/api/platform/admin/tenant-blockers${query}`);
    setBlockers(data.blockers);
    setEscalations(data.escalations);
  }, [tenantId, user]);

  useEffect(() => { void reload().catch((error) => setStatus(error instanceof Error ? error.message : "Tenant support could not load.")); }, [reload]);

  async function createBlocker(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user || working) return;
    setWorking(true); setStatus("");
    try {
      await request(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId.trim())}/blockers`, {
        method: "POST", body: JSON.stringify({ title: title.trim(), detail: detail.trim(), category: "CONFIGURATION", severity })
      });
      setTitle(""); setDetail(""); await reload(); setStatus("Tenant blocker saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Tenant blocker could not be saved."); }
    finally { setWorking(false); }
  }

  async function escalate(blocker: Blocker): Promise<void> {
    if (!user || working) return;
    setWorking(true); setStatus("");
    try {
      await request(user, `/api/platform/admin/tenant-blockers/${encodeURIComponent(blocker.id)}/escalations`, {
        method: "POST", body: JSON.stringify({ priority: blocker.severity === "BLOCKING" ? "P1" : "P2", summary: blocker.detail })
      });
      await reload(); setStatus("Platform support escalation opened.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Support escalation could not be opened."); }
    finally { setWorking(false); }
  }

  return <section className="platform-tenant-blockers" aria-labelledby="tenant-blockers-title">
    <div><p className="ui-eyebrow">Phase H</p><h2 id="tenant-blockers-title">Tenant blockers and support</h2><p>Track activation obstacles and escalate them to NexTeam support without exposing tenant credentials.</p></div>
    <form onSubmit={(event) => void createBlocker(event)}>
      <label>Tenant ID<input required value={tenantId} onChange={(event) => setTenantId(event.target.value)} /></label>
      <label>Blocker title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Detail<textarea required value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
      <label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>BLOCKING</option><option>HIGH</option><option>NORMAL</option></select></label>
      <button type="submit" disabled={!user || working || !tenantId.trim() || !title.trim() || !detail.trim()}>{working ? "Saving…" : "Save blocker"}</button>
    </form>
    <div className="platform-tenant-blockers__list" aria-live="polite">
      {blockers.map((blocker) => <article key={blocker.id}><strong>{blocker.title}</strong><span>{blocker.tenantId} · {blocker.severity} · {blocker.status}</span><p>{blocker.detail}</p>{blocker.status !== "RESOLVED" ? <button type="button" disabled={!user || working} onClick={() => void escalate(blocker)}>Escalate to support</button> : null}</article>)}
      {escalations.map((escalation) => <article key={escalation.id}><strong>Support {escalation.priority}: {escalation.status}</strong><span>Blocker {escalation.blockerId}</span><p>{escalation.summary}</p></article>)}
    </div>
    {status ? <p className="platform-prospect-intake__status">{status}</p> : null}
  </section>;
}
