import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { assignNexCommandTenantOwner, getNexCommandTenantMembers, type NexCommandTenantMembers } from "../api/nexCommandAdminApi";

export function NexCommandTenantMembersPanel({ user, tenantId }: { user: User | null; tenantId: string }): React.ReactElement {
  const [data, setData] = useState<NexCommandTenantMembers | null>(null);
  const [status, setStatus] = useState("Loading authoritative tenant members…");
  const [working, setWorking] = useState("");
  useEffect(() => {
    let active = true;
    if (!user) { setData(null); setStatus("NexCommand authorization is required."); return; }
    setStatus("Loading authoritative tenant members…");
    void getNexCommandTenantMembers(user, tenantId).then((result) => { if (active) { setData(result); setStatus(""); } }).catch(() => { if (active) { setData(null); setStatus("Tenant member management is unavailable without NexCommand authorization."); } });
    return () => { active = false; };
  }, [user, tenantId]);
  async function selectOwner(userId: string): Promise<void> {
    if (!user || !data || !window.confirm("Assign this existing active member as the tenant owner? The current owner will be demoted to Office Admin.")) return;
    setWorking(userId);
    try { const result = await assignNexCommandTenantOwner(user, tenantId, userId); setStatus(`${result.owner.displayName} is now the tenant owner.`); setData(await getNexCommandTenantMembers(user, tenantId)); } catch { setStatus("Owner assignment was denied or could not be completed."); } finally { setWorking(""); }
  }
  if (!data) return <p>{status}</p>;
  return <section className="nexcommand__panel" aria-label={`Tenant member management for ${tenantId}`}><p className="ui-eyebrow">NexCommand tenant authority</p><h3>Existing members</h3><p>Current owner: {data.currentOwner ? `${data.currentOwner.displayName} (${data.currentOwner.email ?? "no email"})` : "No active owner assigned"}.</p>{status ? <p>{status}</p> : null}<div className="nexcommand__directory">{data.users.map((member) => <article key={member.id}><h3>{member.displayName}</h3><p>{member.email ?? "No email"} · {member.authUid ?? "No identity ID"}</p><p>{member.role} · {member.active ? "Active" : "Inactive"}</p><p>{member.effectiveCapabilities.join(", ") || "No capabilities"}</p><button type="button" disabled={!member.active || member.role === "OWNER" || Boolean(working)} onClick={() => void selectOwner(member.id)}>{working === member.id ? "Assigning…" : "Make owner"}</button></article>)}</div></section>;
}
