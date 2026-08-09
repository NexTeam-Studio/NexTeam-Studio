import React, { useState } from "react";
import type { User } from "firebase/auth";

interface ProspectResponse {
  ok: boolean;
  prospect?: { id: string; status: string };
  error?: string;
}

interface ActivatedTenantResponse {
  ok: boolean;
  tenant?: { id: string; name: string };
  owner?: { id?: string; email: string };
  activationAlreadyExisted?: boolean;
  invite?: { status: string; provider?: string; messageId?: string; attemptCount: number };
  error?: string;
}

function splitList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

async function postJson<T>(user: User, path: string, body: unknown): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "NexTeam Admin could not save this step.");
  return result;
}

/** Manual staff intake uses the same platform Prospect/onboarding-plan API reserved for future Nexi intake. */
export function PlatformProspectIntakePanel({ user }: { user: User | null }): React.ReactElement {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [services, setServices] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [prospectId, setProspectId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [subscriptionAssigned, setSubscriptionAssigned] = useState(false);
  const [activation, setActivation] = useState<ActivatedTenantResponse | null>(null);

  async function createProspectAndBlueprint(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working || !user) return;
    setWorking(true);
    setStatus("");
    try {
      const prospect = await postJson<ProspectResponse>(user, "/api/platform/admin/prospects", {
        businessName: businessName.trim(),
        industry: industry.trim(),
        serviceArea: splitList(serviceArea)
      });
      if (!prospect.prospect) throw new Error("NexTeam Admin did not return a Prospect record.");
      const id = encodeURIComponent(prospect.prospect.id);
      await postJson(user, `/api/platform/admin/prospects/${id}/intake`, {
        services: splitList(services),
        customerTypes: [],
        currentSystems: [],
        source: "MANUAL"
      });
      await postJson(user, `/api/platform/admin/prospects/${id}/blueprints`, {
        recommendedLayout: ["Office operations"],
        nexiResponsibilities: ["Provide tool-backed operational assistance"],
        recommendedModules: ["nexi", "crm"],
        reason: "Initial manual intake"
      });
      setProspectId(prospect.prospect.id);
      setSubscriptionAssigned(false);
      setStatus(`Onboarding plan saved for ${businessName.trim()}. Select the required pilot package to continue.`);
      setBusinessName("");
      setIndustry("");
      setServiceArea("");
      setServices("");
    } catch {
      setStatus("Data query needs attention. NexTeam has logged the issue.");
    } finally {
      setWorking(false);
    }
  }

  async function assignPilotSubscription(): Promise<void> {
    if (!user || !prospectId || working) return;
    setWorking(true); setStatus("");
    try {
      await postJson(user, `/api/platform/admin/prospects/${encodeURIComponent(prospectId)}/subscription`, { packageId: "all-access-test" });
      setSubscriptionAssigned(true);
      setStatus("NexTeam All Access Test assigned. Enter the tenant and owner details to activate secure setup.");
    } catch {
      setStatus("Data query needs attention. NexTeam has logged the issue.");
    } finally { setWorking(false); }
  }

  async function activateTenant(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user || !prospectId || !subscriptionAssigned || working) return;
    setWorking(true); setStatus("");
    try {
      const result = await postJson<ActivatedTenantResponse>(user, `/api/platform/admin/prospects/${encodeURIComponent(prospectId)}/activate`, {
        ...(tenantId.trim() ? { tenantId: tenantId.trim() } : {}), ownerEmail: ownerEmail.trim(), ownerDisplayName: ownerDisplayName.trim()
      });
      if (!result.tenant || !result.owner) throw new Error("Activation did not return the tenant and owner records.");
      setActivation(result);
      setStatus(result.activationAlreadyExisted ? "Tenant activation was already complete. No duplicate tenant was created." : "Tenant Activated Successfully.");
    } catch {
      setStatus("Data query needs attention. NexTeam has logged the issue.");
    } finally { setWorking(false); }
  }

  async function resendOwnerInvite(): Promise<void> {
    if (!user || !activation?.tenant?.id || working) return;
    setWorking(true); setStatus("");
    try {
      const result = await postJson<ActivatedTenantResponse>(user, `/api/platform/admin/tenants/${encodeURIComponent(activation.tenant.id)}/owner-invite/resend`, { ownerEmail: activation.owner?.email });
      setActivation({ ...activation, invite: result.invite ?? activation.invite });
      setStatus("Owner invite was sent to the configured email provider.");
    } catch {
      setStatus("Owner invite delivery failed. The tenant remains activated and can be retried safely.");
    } finally { setWorking(false); }
  }

  return (
    <section className="platform-prospect-intake" aria-labelledby="manual-intake-title">
      <div>
        <p className="ui-eyebrow">Manual intake</p>
        <h2 id="manual-intake-title">Start a tenant onboarding plan</h2>
        <p>Pre-subscription intake accepts only business information. Private setup unlocks after activation.</p>
      </div>
      <form onSubmit={(event) => void createProspectAndBlueprint(event)}>
        <label>Business name<input required value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
        <label>Industry or trade<input required value={industry} onChange={(event) => setIndustry(event.target.value)} /></label>
        <label>Service area <span>(comma separated)</span><input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} /></label>
        <label>Services <span>(comma separated)</span><input value={services} onChange={(event) => setServices(event.target.value)} /></label>
        <button type="submit" disabled={working || !user || !businessName.trim() || !industry.trim()}>{working ? "Saving intake…" : "Create Prospect and onboarding plan"}</button>
      </form>
      {prospectId ? <section className="platform-prospect-intake__continuation" aria-label="Continue tenant onboarding">
        <p className="ui-eyebrow">Continue onboarding</p>
        <h3>Pilot Onboarding Package</h3>
        <p>NexTeam All Access Test &middot; $0.00 &middot; all approved pilot modules</p>
        <button type="button" disabled={working || !user || subscriptionAssigned} onClick={() => void assignPilotSubscription()}>{subscriptionAssigned ? "Pilot package assigned" : "Assign NexTeam All Access Test — $0.00"}</button>
        {subscriptionAssigned ? <form onSubmit={(event) => void activateTenant(event)}>
          <label>Tenant ID <span>(optional legacy value; blank generates an immutable ID)</span><input value={tenantId} onChange={(event) => setTenantId(event.target.value)} /></label>
          <label>Owner name<input required value={ownerDisplayName} onChange={(event) => setOwnerDisplayName(event.target.value)} /></label>
          <label>Owner email<input required type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} /></label>
          <button type="submit" disabled={working || !ownerDisplayName.trim() || !ownerEmail.trim()}>{working ? "Activating…" : "Activate tenant and secure owner setup"}</button>
        </form> : null}
      </section> : null}
      {activation?.tenant && activation.owner ? <section className="platform-prospect-intake__confirmation" aria-label="Tenant activation confirmation"><p className="ui-eyebrow">Tenant Activated Successfully</p><h3>{activation.tenant.name}</h3><p><strong>Tenant ID:</strong> {activation.tenant.id}</p><p><strong>Owner:</strong> {activation.owner.email}</p><p><strong>Invite delivery:</strong> {activation.invite?.status ?? "NOT_SENT"}{activation.invite?.provider ? ` via ${activation.invite.provider}` : ""}</p><button type="button" disabled={working} onClick={() => void resendOwnerInvite()}>{working ? "Sending..." : "Resend Owner Invite"}</button></section> : null}
      {status ? <p className="platform-prospect-intake__status">{status}</p> : null}
    </section>
  );
}
