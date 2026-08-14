import React, { useState } from "react";
import type { User } from "firebase/auth";
import type { PlatformTenantRow } from "../../../shared/contracts/platform";

async function sendOnboardingEmail(user: User, tenantId: string): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/onboarding-email`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}"
  });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The onboarding email could not be sent.");
}

export function PlatformTenantOnboardingPanel({ user, rows }: { user: User | null; rows: PlatformTenantRow[] }): React.ReactElement {
  const [workingTenantId, setWorkingTenantId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function send(tenantId: string, tenantName: string): Promise<void> {
    if (!user || workingTenantId) return;
    setWorkingTenantId(tenantId); setMessage(""); setError("");
    try {
      await sendOnboardingEmail(user, tenantId);
      setMessage(`Onboarding email sent for ${tenantName}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The onboarding email could not be sent.");
    } finally { setWorkingTenantId(""); }
  }

  return <section className="nexcommand__panel" aria-labelledby="tenant-onboarding-title">
    <p className="ui-eyebrow">Tenant Activation</p><h2 id="tenant-onboarding-title">Onboarding</h2>
    <p>Send a secure first-access email only after the tenant profile and Primary Contact are ready. The server validates the active tenant owner and email separation before delivery.</p>
    <div className="nexcommand__directory">
      {rows.map((row) => <article key={row.tenant.id}>
        <h3>{row.tenant.name}</h3>
        <p>{row.subscriptionDisplay?.name ?? row.plan.name} · {row.subscriptionDisplay?.status ?? row.subscription?.status ?? "No subscription"}</p>
        <button className="tenant-action" type="button" disabled={Boolean(workingTenantId)} onClick={() => void send(row.tenant.id, row.tenant.name)}>{workingTenantId === row.tenant.id ? "Sending…" : "Send Onboarding Email"}</button>
      </article>)}
    </div>
    {message ? <p className="tenant-profile__message tenant-profile__message--success" role="status">{message}</p> : null}
    {error ? <p className="tenant-profile__message tenant-profile__message--error" role="alert">{error}</p> : null}
  </section>;
}
