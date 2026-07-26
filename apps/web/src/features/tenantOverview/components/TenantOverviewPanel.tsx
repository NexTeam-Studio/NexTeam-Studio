import React from "react";
import type { PlatformTenantRow } from "../../../shared/contracts/platform";

export function TenantOverviewPanel(props: {
  rows: PlatformTenantRow[];
  workingTenant: string;
  onRunBackup: (tenantId: string) => Promise<void>;
}): React.ReactElement {
  return (
    <section className="tenant-overview" aria-label="Tenant overview">
      {props.rows.map((row) => (
        <article className="tenant-overview__row" key={row.tenant.id}>
          <div>
            <p className="ui-eyebrow">{row.tenant.id}</p>
            <h2>{row.tenant.name}</h2>
            <p>
              {row.plan.name} plan - {row.subscription?.status ?? "no subscription"} - $
              {row.cost.estimatedCostUsd.toFixed(4)} tracked
            </p>
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
          </div>
        </article>
      ))}
    </section>
  );
}
