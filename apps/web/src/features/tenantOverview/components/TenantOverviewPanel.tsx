import React, { useMemo, useState } from "react";
import type { PlatformTenantRow } from "../../../shared/contracts/platform";

const tenantLogos: Record<string, string> = {
  aquatrace: "/tenant-packs/aquatrace/assets/banner-logo.png",
  "owens-bluewater-wash": "/assets/brand/owens-bluewater-wash-logo-transparent.png"
};

export function TenantOverviewPanel(props: { rows: PlatformTenantRow[]; onViewDetails: (tenantId: string) => void }): React.ReactElement {
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => props.rows.filter((row) => `${row.tenant.name} ${row.tenant.id} ${row.subscriptionDisplay?.name ?? row.plan.name}`.toLowerCase().includes(query.trim().toLowerCase())), [props.rows, query]);
  return <section className="tenant-overview" aria-label="Tenant Roster">
    <div className="tenant-overview__filters"><label>Find Tenant<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or Subscription" /></label><span>{visibleRows.length} shown</span></div>
    {visibleRows.map((row) => {
      const subscription = row.subscriptionDisplay ?? { name: row.plan.name, status: row.subscription?.status ?? "no subscription", monthlyUsd: row.plan.monthlyUsd, annualUsd: row.plan.monthlyUsd * 12 };
      return <article className="tenant-overview__row tenant-overview__row--minimal" key={row.tenant.id}>
        <div className="tenant-overview__identity"><TenantLogo tenantId={row.tenant.id} tenantName={row.tenant.name} logoVersion={row.logoVersion} /><div><h2>{row.tenant.name}</h2><p>{subscription.name} · {subscription.status}</p><p><strong>{row.tenant.lifecycleState === "DISABLED_ARCHIVED" ? "Archived" : "Active"}</strong></p></div></div>
        <div className="tenant-overview__pricing"><p>${subscription.monthlyUsd.toFixed(2)} Monthly</p><p>${subscription.annualUsd.toFixed(2)} Annually</p></div>
        <div className="tenant-overview__actions"><button className="tenant-action" type="button" onClick={() => props.onViewDetails(row.tenant.id)}>View Details</button></div>
      </article>;
    })}
    {!visibleRows.length ? <p>No tenants match that search.</p> : null}
  </section>;
}

function TenantLogo({ tenantId, tenantName, logoVersion }: { tenantId: string; tenantName: string; logoVersion?: string }): React.ReactElement {
  const storedSource = `/api/public/tenant-branding/logo?tenantId=${encodeURIComponent(tenantId)}&v=${encodeURIComponent(logoVersion ?? "current")}`;
  const [source, setSource] = useState(storedSource);
  const [failed, setFailed] = useState(false);
  const fallback = tenantLogos[tenantId];
  React.useEffect(() => { setSource(storedSource); setFailed(false); }, [storedSource]);
  if (failed) return <span className="tenant-overview__logo"><b>{tenantName.split(/\s+/).map((word) => word[0]).join("").slice(0, 3)}</b></span>;
  return <span className="tenant-overview__logo"><img src={source} alt={`${tenantName} logo`} onError={() => fallback && source !== fallback ? setSource(fallback) : setFailed(true)} /></span>;
}
