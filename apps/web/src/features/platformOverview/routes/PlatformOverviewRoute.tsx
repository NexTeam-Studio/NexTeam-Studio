import React from "react";
import { useAuthSession } from "../../../shared/auth/AuthSessionProvider";
import { TenantOverviewPanel } from "../../tenantOverview/components/TenantOverviewPanel";
import { useTenantOverview } from "../../tenantOverview/hooks/useTenantOverview";
import "../../tenantOverview/styles/tenantOverview.css";
import { PlatformHeroPanel } from "../components/PlatformHeroPanel";
import { PlatformPlansPanel } from "../components/PlatformPlansPanel";
import { PlatformProspectIntakePanel } from "../components/PlatformProspectIntakePanel";
import { usePlatformPlans } from "../hooks/usePlatformPlans";
import "../styles/platformOverview.css";

function combineStatus(statuses: string[]): string {
  return statuses.filter(Boolean).join(" ");
}

export function PlatformOverviewRoute(): React.ReactElement {
  const { signOut, user } = useAuthSession();
  const { plans, status: planStatus } = usePlatformPlans(user);
  const {
    rows,
    runBackup,
    status: tenantStatus,
    workingTenant
  } = useTenantOverview(user);
  const status = combineStatus([planStatus, tenantStatus]);

  return (
    <div className="platform-overview">
      <PlatformHeroPanel
        signedInAs={user?.email ?? "Platform operator"}
        onSignOut={() => {
          void signOut();
        }}
      />
      <PlatformPlansPanel plans={plans} />
      <PlatformProspectIntakePanel />
      {status ? <p className="platform-overview__status">{status}</p> : null}
      <TenantOverviewPanel
        rows={rows}
        workingTenant={workingTenant}
        onRunBackup={runBackup}
      />
    </div>
  );
}
