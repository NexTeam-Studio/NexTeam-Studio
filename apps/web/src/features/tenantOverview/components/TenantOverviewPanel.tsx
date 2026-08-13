import React, { useMemo, useState } from "react";
import type { PlatformTenantRow } from "../../../shared/contracts/platform";

const tenantLogos: Record<string, string> = {
  aquatrace: "/tenant-packs/aquatrace/assets/banner-logo.png",
  "owens-bluewater-wash": "/assets/brand/owens-bluewater-wash-logo-transparent.png"
};

export function TenantOverviewPanel(props: { rows: PlatformTenantRow[]; onViewDetails: (tenantId: string) => void }): React.ReactElement {
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => props.rows.filter((row) => `${row.tenant.name} ${row.tenant.id} ${row.plan.name}`.toLowerCase().includes(query.trim().toLowerCase())), [props.rows, query]);
  return <section className="tenant-overview" aria-label="Tenant roster">
    <div className="tenant-overview__filters"><label>Find Tenant<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or plan" /></label><span>{visibleRows.length} shown</span></div>
    {visibleRows.map((row) => <article className="tenant-overview__row" key={row.tenant.id}>
      <div className="tenant-overview__identity"><TenantLogo tenantId={row.tenant.id} tenantName={row.tenant.name} /><div><h2>{row.tenant.name}</h2><p>{row.plan.name} · {row.subscription?.status ?? "no subscription"}</p><p><strong>{row.tenant.lifecycleState === "DISABLED_ARCHIVED" ? "Archived" : "Active"}</strong></p></div></div>
      <div className="tenant-overview__adapter-pills">{row.modules.map((module) => <span className="tenant-overview__pill tenant-overview__pill--ok" key={module}>{module}</span>)}</div>
      <div className="tenant-overview__actions"><p>${row.cost.estimatedCostUsd.toFixed(2)} tracked</p><button className="tenant-action" type="button" onClick={() => props.onViewDetails(row.tenant.id)}>View Details</button></div>
    </article>)}
    {!visibleRows.length ? <p>No tenants match that search.</p> : null}
  </section>;
}

function TenantLogo({ tenantId, tenantName }: { tenantId: string; tenantName: string }): React.ReactElement {
  const [source, setSource] = useState(`/api/public/tenant-branding/logo?tenantId=${encodeURIComponent(tenantId)}`);
  const [failed, setFailed] = useState(false);
  const fallback = tenantLogos[tenantId];
  if (failed) return <span className="tenant-overview__logo"><b>{tenantName.split(/\s+/).map((word) => word[0]).join("").slice(0, 3)}</b></span>;
  return <span className="tenant-overview__logo"><img src={source} alt={`${tenantName} logo`} onError={() => fallback && source !== fallback ? setSource(fallback) : setFailed(true)} /></span>;
}
