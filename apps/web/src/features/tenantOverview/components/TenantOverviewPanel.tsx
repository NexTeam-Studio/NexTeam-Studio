import React from "react";
import { useMemo, useState } from "react";
import type { PlatformTenantRow } from "../../../shared/contracts/platform";

export function TenantOverviewPanel(props: {
  rows: PlatformTenantRow[];
  workingTenant: string;
  onRunBackup: (tenantId: string) => Promise<void>;
  onRunLifecycle: (tenantId: string, command: "first" | "cancel" | "resubscribe", cancellationId?: string) => Promise<{ cancellationId?: string } | undefined>;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [cancellations, setCancellations] = useState<Record<string, string>>({});
  const visibleRows = useMemo(() => props.rows.filter((row) => (state === "ALL" || (row.tenant.lifecycleState ?? "ACTIVE") === state) && `${row.tenant.name} ${row.tenant.id} ${row.plan.name}`.toLowerCase().includes(query.toLowerCase())), [props.rows, query, state]);
  async function firstConfirmation(tenantId: string): Promise<void> { if (!window.confirm("Record the first cancellation confirmation? This does not disable access.")) return; const result = await props.onRunLifecycle(tenantId, "first"); if (result?.cancellationId) setCancellations((current) => ({ ...current, [tenantId]: result.cancellationId })); }
  async function secondConfirmation(tenantId: string): Promise<void> { if (!window.confirm("Archive this tenant now? Access will be disabled. Tenant records are retained and can be restored by resubscription.")) return; await props.onRunLifecycle(tenantId, "cancel", cancellations[tenantId]); setCancellations((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== tenantId))); }
  return (
    <section className="tenant-overview" aria-label="Tenant overview">
      <div className="tenant-overview__filters"><label>Find tenant<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, ID, or plan" /></label><label>Lifecycle<select value={state} onChange={(event) => setState(event.target.value)}><option value="ALL">All states</option><option value="ACTIVE">Active</option><option value="DISABLED_ARCHIVED">Archived</option></select></label><span>{visibleRows.length} shown</span></div>
      {visibleRows.map((row) => (
        <article className="tenant-overview__row" key={row.tenant.id}>
          <div>
            <p className="ui-eyebrow">{row.tenant.id}</p>
            <h2>{row.tenant.name}</h2>
            <p>
              {row.plan.name} plan - {row.subscription?.status ?? "no subscription"} - $
              {row.cost.estimatedCostUsd.toFixed(4)} tracked
            </p>
            <p><strong>{row.tenant.lifecycleState === "DISABLED_ARCHIVED" ? "Archived — access disabled" : "Active"}</strong></p>
          </div>
          <div className="tenant-overview__adapter-pills">
            {row.adapterStatuses.map((adapter) => (
              <span
                className={
                  adapter.ok
                    ? "tenant-overview__pill tenant-overview__pill--ok"
                    : "tenant-overview__pill tenant-overview__pill--warn"
                }
                key={adapter.adapter}
              >
                {adapter.adapter}: {adapter.configured ? adapter.provider : "not set"}
              </span>
            ))}
          </div>
          <div className="tenant-overview__actions">
            <a
              href={`/api/platform/tenants/${encodeURIComponent(row.tenant.id)}/export`}
              target="_blank"
              rel="noreferrer"
            >
              Export
            </a>
            <button
              type="button"
              disabled={props.workingTenant === row.tenant.id}
              onClick={() => {
                void props.onRunBackup(row.tenant.id);
              }}
            >
              {props.workingTenant === row.tenant.id ? "Backing up..." : "Run backup"}
            </button>
            {row.tenant.lifecycleState === "DISABLED_ARCHIVED" ? <button type="button" disabled={props.workingTenant === row.tenant.id} onClick={() => { if (window.confirm("Resubscribe this tenant and restore its existing data and access?")) void props.onRunLifecycle(row.tenant.id, "resubscribe"); }}>Resubscribe</button> : cancellations[row.tenant.id] ? <button type="button" disabled={props.workingTenant === row.tenant.id} onClick={() => void secondConfirmation(row.tenant.id)}>Confirm archive</button> : <button type="button" disabled={props.workingTenant === row.tenant.id} onClick={() => void firstConfirmation(row.tenant.id)}>Cancel / archive…</button>}
          </div>
        </article>
      ))}
      {visibleRows.length === 0 ? <p>No tenants match the current filters.</p> : null}
    </section>
  );
}
