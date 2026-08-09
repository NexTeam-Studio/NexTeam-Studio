import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";

type Mode = "blueprints" | "subscriptions" | "onboarding";
type LifecycleRecord = {
  blueprint: { id: string; prospectId: string; recommendedModules: string[]; createdAt: string };
  prospect: { businessName: string; status: string; onboardingCurrentStep?: string; onboardingProgressPercent?: number; onboardingLastSavedAt?: string; onboardingLastUpdatedBy?: string } | null;
  assignment: { packageId: string; packageVersion: string; status: string; createdAt: string } | null;
  tenant: { id: string; name: string } | null;
  owner: { email?: string; displayName: string } | null;
  invite: { status: string } | null;
  revisions: Array<{ id: string; revisionNumber: number; approvalState: string; createdAt: string }>;
  blockers: Array<{ id: string; title: string; status: string }>;
  migrations: Array<{ id: string; status: string }>;
};

async function load(user: User): Promise<{ blueprints: LifecycleRecord[]; subscriptions: LifecycleRecord[]; onboarding: LifecycleRecord[] }> {
  const token = await user.getIdToken();
  const response = await fetch("/api/platform/admin/lifecycle", { headers: { authorization: `Bearer ${token}` } });
  const result = await response.json() as { error?: string; blueprints?: LifecycleRecord[]; subscriptions?: LifecycleRecord[]; onboarding?: LifecycleRecord[] };
  if (!response.ok) throw new Error(result.error || "NexCommand could not load lifecycle records.");
  return { blueprints: result.blueprints ?? [], subscriptions: result.subscriptions ?? [], onboarding: result.onboarding ?? [] };
}

export function PlatformLifecycleRecordsPanel({ user, mode }: { user: User | null; mode: Mode }): React.ReactElement {
  const [data, setData] = useState<{ blueprints: LifecycleRecord[]; subscriptions: LifecycleRecord[]; onboarding: LifecycleRecord[] }>({ blueprints: [], subscriptions: [], onboarding: [] });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (user) void load(user).then(setData).catch(() => setError("Data query needs attention. NexTeam has logged the issue.")); }, [user]);
  const records = data[mode].filter((record) => `${record.prospect?.businessName ?? ""} ${record.tenant?.name ?? ""} ${record.tenant?.id ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const title = mode === "blueprints" ? "Blueprints" : mode === "subscriptions" ? "Subscriptions" : "Onboarding";
  return <section className="nexcommand__panel" aria-labelledby={`lifecycle-${mode}`}>
    <p className="ui-eyebrow">Tenant Lifecycle</p><h2 id={`lifecycle-${mode}`}>{title}</h2>
    <p>{mode === "blueprints" ? "Saved onboarding Blueprints and immutable revision history." : mode === "subscriptions" ? "Tenant package assignments, not the package catalog." : "Active tenant onboarding records. Secure setup remains unavailable until activation."}</p>
    <label>Search <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tenant, Tenant ID, or Prospect" /></label>
    <div className="nexcommand__directory">
      {records.map((record) => <article key={record.blueprint.id}>
        <h3>{record.tenant?.name ?? record.prospect?.businessName ?? "Unlinked Prospect"}</h3>
        <dl className="nexcommand__facts">
          {mode === "blueprints" ? <><div><dt>Blueprint</dt><dd>{record.blueprint.id}</dd></div><div><dt>Revisions</dt><dd>{record.revisions.length} · {record.revisions.map((revision) => `v${revision.revisionNumber} ${revision.approvalState}`).join(", ") || "None"}</dd></div><div><dt>Tenant</dt><dd>{record.tenant ? `${record.tenant.name} (${record.tenant.id})` : "Not Activated"}</dd></div></> : null}
          {mode === "subscriptions" ? <><div><dt>Tenant ID</dt><dd>{record.tenant?.id ?? "Not Activated"}</dd></div><div><dt>Package</dt><dd>Pilot Onboarding Package · $0.00</dd></div><div><dt>Status</dt><dd>{record.assignment?.status ?? "Not Assigned"}</dd></div><div><dt>Package Version</dt><dd>{record.assignment?.packageVersion ?? "Not Available"}</dd></div><div><dt>Enabled Modules</dt><dd>{record.blueprint.recommendedModules.join(", ") || "Not Available"}</dd></div><div><dt>Activation</dt><dd>{record.tenant ? "Activated" : "Not Activated"}</dd></div></> : null}
          {mode === "onboarding" ? <><div><dt>Tenant ID</dt><dd>{record.tenant?.id ?? "Pending Activation"}</dd></div><div><dt>Owner</dt><dd>{record.owner?.email ?? "Not Assigned"}</dd></div><div><dt>Subscription</dt><dd>{record.assignment?.status ?? "Not Assigned"}</dd></div><div><dt>Progress</dt><dd>{record.prospect?.onboardingProgressPercent ?? 0}%</dd></div><div><dt>Current Step</dt><dd>{record.prospect?.onboardingCurrentStep ?? "Prospect Intake"}</dd></div><div><dt>Blockers</dt><dd>{record.blockers.length ? record.blockers.map((blocker) => blocker.title).join(", ") : "None"}</dd></div><div><dt>Migration Status</dt><dd>{record.migrations.length ? record.migrations.map((migration) => migration.status).join(", ") : "None"}</dd></div><div><dt>Invite Status</dt><dd>{record.invite?.status ?? "Not Sent"}</dd></div><div><dt>Last Saved</dt><dd>{record.prospect?.onboardingLastSavedAt ?? "Not Available"}</dd></div><div><dt>Last Updated By</dt><dd>{record.prospect?.onboardingLastUpdatedBy ?? "Not Available"}</dd></div><div><dt>Launch Status</dt><dd>{record.tenant ? "Secure Setup Pending" : "Not Activated"}</dd></div></> : null}
        </dl>
      </article>)}
      {!records.length ? <p>No matching {title.toLowerCase()} records were found.</p> : null}
    </div>{error ? <p className="nexcommand__notice">{error}</p> : null}
  </section>;
}
