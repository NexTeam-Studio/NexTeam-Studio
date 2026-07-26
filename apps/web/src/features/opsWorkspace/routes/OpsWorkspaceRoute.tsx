import React from "react";
import { useAuthSession } from "../../../shared/auth/AuthSessionProvider";
import { useOperatorContext } from "../../operatorContext/hooks/useOperatorContext";
import { NexiWorkspaceRoute } from "../../nexi/routes/NexiWorkspaceRoute";
import { SchedulingWorkspaceRoute } from "../../scheduling/routes/SchedulingWorkspaceRoute";
import "../styles/opsWorkspace.css";

export function OpsWorkspaceRoute(): React.ReactElement {
  const { user } = useAuthSession();
  const operatorContext = useOperatorContext(user);

  if (!operatorContext.tenantId) {
    return (
      <main className="ops-workspace">
        <p className="ui-eyebrow">Nexi access</p>
        <h1>Tenant access is not configured</h1>
        <p>Your Firebase account needs a tenantId custom claim before the operations workspace can load.</p>
      </main>
    );
  }

  return (
    <main className="ops-workspace">
      <div className="ops-workspace__grid">
        <NexiWorkspaceRoute tenantId={operatorContext.tenantId} />
        <SchedulingWorkspaceRoute tenantId={operatorContext.tenantId} />
      </div>
    </main>
  );
}
