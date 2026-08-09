import React, { useState } from "react";

interface ProspectResponse {
  ok: boolean;
  prospect?: { id: string; status: string };
  error?: string;
}

function splitList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "NexTeam Admin could not save this step.");
  return result;
}

/** Manual staff intake uses the same platform Prospect/onboarding-plan API reserved for future Nexi intake. */
export function PlatformProspectIntakePanel(): React.ReactElement {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [services, setServices] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  async function createProspectAndBlueprint(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setStatus("");
    try {
      const prospect = await postJson<ProspectResponse>("/api/platform/admin/prospects", {
        businessName: businessName.trim(),
        industry: industry.trim(),
        serviceArea: splitList(serviceArea)
      });
      if (!prospect.prospect) throw new Error("NexTeam Admin did not return a Prospect record.");
      const id = encodeURIComponent(prospect.prospect.id);
      await postJson(`/api/platform/admin/prospects/${id}/intake`, {
        services: splitList(services),
        customerTypes: [],
        currentSystems: [],
        source: "MANUAL"
      });
      await postJson(`/api/platform/admin/prospects/${id}/blueprints`, {
        recommendedLayout: ["Office operations"],
        nexiResponsibilities: ["Provide tool-backed operational assistance"],
        recommendedModules: ["nexi", "crm"],
        reason: "Initial manual intake"
      });
      setStatus(`Onboarding plan saved for ${businessName.trim()}. It is ready for review and required subscription selection.`);
      setBusinessName("");
      setIndustry("");
      setServiceArea("");
      setServices("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "NexTeam Admin could not create the Prospect.");
    } finally {
      setWorking(false);
    }
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
        <button type="submit" disabled={working || !businessName.trim() || !industry.trim()}>{working ? "Saving intake…" : "Create Prospect and onboarding plan"}</button>
      </form>
      {status ? <p className="platform-prospect-intake__status">{status}</p> : null}
    </section>
  );
}
